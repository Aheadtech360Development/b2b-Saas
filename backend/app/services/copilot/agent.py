"""The copilot loop: send the conversation to the model, run the tools it asks
for, send the results back, repeat until it answers.

Two wire formats, one loop:
* Anthropic Messages API (Claude).
* OpenAI-style chat completions — OpenAI itself, and Google Gemini through its
  OpenAI-compatible endpoint.

Which one runs is a setting (COPILOT_PROVIDER), or picked from whichever key is
present, so switching models is an env change, not a code change. Tools are
written once in Anthropic's shape and translated for the other format.

Called over plain HTTPS with httpx — no SDKs to install on the server.

Guards:
* Tool calls run on the server against the brand's data; the model only ever
  sees their results. Prices and counts in a reply come from those results.
* Each brand has a daily question limit, so one brand cannot run up the bill.
* The loop is capped, so a model that keeps calling tools cannot spin forever.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from time import perf_counter

import httpx

from app.core.config import settings
from app.core.redis import redis_increment
from app.core.tenant_context import get_current_tenant_id
from app.services.copilot.audit import log_tool_call

logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 6
# Thinking counts towards it as well as the reply, so it is a ceiling with room
# for both; only what is produced is billed.
MAX_TOKENS = 8000
MAX_TOOL_RESULT_CHARS = 20_000

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"

# provider -> (base URL for chat completions, default model)
OPENAI_STYLE = {
    "gemini": ("https://generativelanguage.googleapis.com/v1beta/openai/", "gemini-3.8-flash"),
    # No default: OpenAI's model names change often; set COPILOT_MODEL.
    "openai": ("https://api.openai.com/v1/", ""),
}
ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5"
# The builder's customer assistant reads the room left on a sheet at every
# size, works out an overflow before it happens and fills in a nested plan —
# more than the small model does reliably.
ANTHROPIC_STUDIO_MODEL = "claude-sonnet-5-5"

# Models that take output_config.effort. It is how much they think, and so a
# good part of what they cost; Haiku 4.5 rejects the field, so it is sent only
# where it is understood.
EFFORT_MODELS = (
    "claude-fable-", "claude-mythos-", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7",
    "claude-opus-4-6", "claude-opus-4-5", "claude-sonnet-5", "claude-sonnet-4-6",
)
# Models with safety classifiers that can decline a request. With fallbacks
# "default" the API re-runs a declined request on Anthropic's choice of model,
# instead of handing a refusal back to a customer mid-order.
FALLBACK_MODELS = {"claude-sonnet-5-5", "claude-opus-5-5", "claude-opus-5", "claude-fable-5-1"}
FALLBACK_BETA = "server-side-fallback-2026-07-01"
REFUSED = "Sorry — I can't help with that one. Ask me about your sheet and I'll help you build it."


class CopilotUnavailable(Exception):
    """No API key configured — say so plainly rather than failing oddly."""


class CopilotLimitReached(Exception):
    """The brand has used today's questions."""


class CopilotError(Exception):
    """The model call failed; the message is safe to show.

    `detail` carries what the provider actually said. It goes to the owner's own
    admin chat, where a wrong model name or an exhausted quota is something they
    can fix — a bare "returned an error" leaves them guessing. It is never shown
    to a customer.
    """

    def __init__(self, message: str, detail: str = ""):
        super().__init__(message)
        self.detail = detail


@dataclass
class Provider:
    name: str        # anthropic | gemini | openai
    api_key: str
    model: str
    base_url: str = ""


def resolve_provider(studio: bool = False) -> Provider | None:
    """The configured provider, or None when no key is set.

    An explicit COPILOT_PROVIDER wins. Otherwise the first key present is used,
    Claude first, so adding a key is all it takes to switch the copilot on.
    `studio` picks the model for the builder's customer assistant.
    """
    keys = {
        "anthropic": settings.ANTHROPIC_API_KEY,
        "gemini": settings.GEMINI_API_KEY,
        "openai": settings.OPENAI_API_KEY,
    }
    name = (settings.COPILOT_PROVIDER or "").strip().lower()
    if not name:
        name = next((n for n, k in keys.items() if k), "")
    if name not in keys or not keys[name]:
        return None
    if name == "anthropic":
        model = (settings.COPILOT_STUDIO_MODEL or ANTHROPIC_STUDIO_MODEL) if studio else ""
        return Provider(name, keys[name], model or settings.COPILOT_MODEL or ANTHROPIC_DEFAULT_MODEL)
    base, default_model = OPENAI_STYLE[name]
    model = (settings.COPILOT_STUDIO_MODEL if studio else "") or settings.COPILOT_MODEL or default_model
    if not model:
        return None
    return Provider(name, keys[name], model, base)


def copilot_configured() -> bool:
    return resolve_provider() is not None


async def _check_daily_limit(scope: str, subject: str = "", limit: int | None = None) -> None:
    """Count one question against the brand's day, or one person's when
    `subject` names them (a user id, or a guest's address)."""
    limit = settings.COPILOT_DAILY_LIMIT if limit is None else limit
    if limit <= 0:
        return
    tenant = get_current_tenant_id() or "platform"
    who = f":{subject}" if subject else ""
    key = f"copilot:{tenant}:{scope}{who}:{datetime.now(UTC):%Y%m%d}"
    try:
        used = await redis_increment(key, expire=26 * 3600)
    except Exception as exc:
        # Redis down should not take the copilot down with it.
        logger.warning("copilot limit check skipped: %s", exc)
        return
    if used > limit:
        raise CopilotLimitReached("Today's copilot limit has been reached. It resets tomorrow.")


def _clip(value) -> str:
    text = json.dumps(value, default=str, ensure_ascii=False)
    if len(text) > MAX_TOOL_RESULT_CHARS:
        text = text[:MAX_TOOL_RESULT_CHARS] + "…(truncated)"
    return text


def _provider_message(res: httpx.Response) -> str:
    """The provider's own explanation, dug out of whichever shape it used."""
    try:
        body = res.json()
    except ValueError:
        return res.text[:200].strip()
    err = body.get("error") if isinstance(body, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err.get("status") or err)[:300]
    if isinstance(err, str):
        return err[:300]
    return str(body)[:200]


def _raise_for_status(res: httpx.Response, p: Provider) -> None:
    if res.status_code == 200:
        return
    said = _provider_message(res)
    logger.warning("copilot %s (%s) API %s: %s", p.name, p.model, res.status_code, res.text[:500])
    detail = f"{p.name} ({p.model}) returned {res.status_code}: {said}"
    if res.status_code == 429:
        raise CopilotError("The AI service is busy or over its quota right now. Please try again shortly.", detail)
    if res.status_code in (401, 403):
        raise CopilotError("The AI service rejected the platform's API key.", detail)
    if res.status_code == 404:
        raise CopilotError(f"The model \"{p.model}\" wasn't found on {p.name}. Set COPILOT_MODEL to one this key can use.", detail)
    raise CopilotError("The AI service returned an error. Please try again.", detail)


async def _run_tool(name: str, args, handlers: dict, used: list[str], db, scope: str = "-") -> tuple[str, bool]:
    """Run one tool. Returns (result text, is_error)."""
    used.append(name)
    safe_args = args if isinstance(args, dict) else {}
    handler = handlers.get(name)
    if handler is None:
        log_tool_call(scope=scope, tool=name, args=safe_args, ms=0, ok=False, note="unknown")
        return f"Unknown tool {name}.", True
    started = perf_counter()
    try:
        out = _clip(await handler(safe_args))
        log_tool_call(scope=scope, tool=name, args=safe_args, ms=int((perf_counter() - started) * 1000), ok=True)
        return out, False
    except Exception as exc:
        log_tool_call(scope=scope, tool=name, args=safe_args,
                      ms=int((perf_counter() - started) * 1000), ok=False, note=type(exc).__name__)
        logger.exception("copilot tool %s failed", name)
        # A failed statement aborts the transaction; without this every later
        # lookup in the same answer fails too.
        if db is not None:
            try:
                await db.rollback()
            except Exception:
                pass
        return f"The lookup failed: {type(exc).__name__}.", True


async def run_copilot(
    *,
    system: str,
    tools: list[dict],
    handlers: dict,
    messages: list[dict],
    scope: str,
    db=None,
    studio: bool = False,
    subject: str = "",
    subject_limit: int | None = None,
    context_note: str = "",
    stop_when=None,
) -> dict:
    """Answer the last user message. `messages` is plain text history
    ([{role, content}]); tool rounds happen here and are not returned.

    `studio` picks the builder assistant's model and effort. `context_note` is
    data that changes every question (the sheet as it is now): it goes with the
    last message rather than in `system`, so the system prompt and the earlier
    conversation stay byte-for-byte the same and are read from the prompt
    cache. `stop_when` is asked after each round of tool calls; when it says
    yes, the answer is the text written alongside those calls and no further
    request is made — a proposal needs no second call to say it is ready.
    """
    provider = resolve_provider(studio)
    if provider is None:
        raise CopilotUnavailable("The AI copilot isn't switched on for this platform yet.")
    # The person's own allowance first, so a visitor who has used theirs does not
    # also spend the brand's.
    if subject:
        await _check_daily_limit(scope, subject, subject_limit)
    await _check_daily_limit(scope)

    history = [{"role": m["role"], "content": m["content"]} for m in messages]
    used: list[str] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        try:
            if provider.name == "anthropic":
                effort = (settings.COPILOT_STUDIO_EFFORT if studio else settings.COPILOT_EFFORT).strip().lower()
                reply = await _anthropic(client, provider, system, tools, handlers, cached_history(history, context_note),
                                         used, db, scope, effort, stop_when)
            else:
                if context_note and history:
                    history[-1] = {**history[-1], "content": f"{history[-1]['content']}\n\n{context_note}"}
                reply = await _openai_style(client, provider, system, tools, handlers, history, used, db, scope, stop_when)
        except httpx.HTTPError as exc:
            logger.warning("copilot request failed: %s", exc)
            raise CopilotError("Couldn't reach the AI service. Please try again.") from exc

    if reply is None:
        reply = "That needed more lookups than I can do in one go. Try asking something narrower."
    return {"reply": reply or "I don't have an answer for that.", "tools_used": used, "provider": provider.name}


CACHE = {"type": "ephemeral"}


def cached_history(history: list[dict], context_note: str = "") -> list[dict]:
    """The conversation as sent to Claude, marked for the prompt cache.

    The turn before the newest question is the end of what the next request
    will repeat word for word, so the cache mark goes there: each question
    reads the whole earlier conversation from the cache and pays in full only
    for what is new. The note about the sheet as it is now rides on the newest
    question, after the mark, where changing it costs nothing that is cached.
    """
    out = [dict(m) for m in history]
    if len(out) >= 2:
        prev = out[-2]
        text = prev["content"] if isinstance(prev["content"], str) else None
        if text:
            out[-2] = {**prev, "content": [{"type": "text", "text": text, "cache_control": CACHE}]}
    if context_note and out:
        last = out[-1]
        blocks = [{"type": "text", "text": last["content"]}] if isinstance(last["content"], str) else list(last["content"])
        out[-1] = {**last, "content": [*blocks, {"type": "text", "text": context_note}]}
    return out


def anthropic_request(p: Provider, system, tools, convo, effort: str = "") -> tuple[dict, dict]:
    """Headers and body for one Messages API call.

    The system prompt carries a cache mark: tools come before it, so the two
    are read from the cache together on every request after the first, at a
    tenth of the price. A prompt too short to cache simply isn't, at no cost.
    """
    headers = {"x-api-key": p.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"}
    body = {
        "model": p.model, "max_tokens": MAX_TOKENS,
        "system": [{"type": "text", "text": system, "cache_control": CACHE}],
        "messages": convo,
    }
    if tools:
        body["tools"] = tools
    if effort and p.model.startswith(EFFORT_MODELS):
        body["output_config"] = {"effort": effort}
    if p.model in FALLBACK_MODELS:
        headers["anthropic-beta"] = FALLBACK_BETA
        body["fallbacks"] = "default"
    return headers, body


def echoable(content: list[dict]) -> list[dict]:
    """The assistant turn as it goes back on the next request.

    Sent back as it came — thinking blocks included, or the next request is
    rejected — except across a fallback: the declined model's thinking and tool
    calls before the last switch point are not echoed, and the switch marker
    itself is only an audit note.
    """
    last = max((i for i, b in enumerate(content) if b.get("type") == "fallback"), default=-1)
    if last < 0:
        return content
    drop = {"thinking", "redacted_thinking", "tool_use"}
    return [b for b in content[:last] if b.get("type") not in drop] + content[last + 1:]


async def _anthropic(client, p: Provider, system, tools, handlers, convo, used, db, scope="-", effort: str = "",
                     stop_when=None) -> str | None:
    for _ in range(MAX_TOOL_ROUNDS + 1):
        headers, body_in = anthropic_request(p, system, tools, convo, effort)
        res = await client.post(ANTHROPIC_URL, headers=headers, json=body_in)
        _raise_for_status(res, p)
        body = res.json()
        stop = body.get("stop_reason")
        if stop == "refusal":
            # Declined, even after any fallback. Said plainly, not as an error.
            logger.info("copilot refusal (%s): %s", p.model, (body.get("stop_details") or {}).get("category"))
            return REFUSED
        content = echoable(body.get("content") or [])
        convo.append({"role": "assistant", "content": content})

        calls = [b for b in content if b.get("type") == "tool_use"]
        said = "\n\n".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
        if stop != "tool_use" or not calls:
            if not said and stop == "max_tokens":
                return "That took more working out than I can do in one go. Try asking something narrower."
            return said

        results = []
        for call in calls:
            text, is_error = await _run_tool(call.get("name"), call.get("input") or {}, handlers, used, db, scope)
            block = {"type": "tool_result", "tool_use_id": call["id"], "content": text}
            if is_error:
                block["is_error"] = True
            results.append(block)
        if stop_when is not None and stop_when():
            return said
        convo.append({"role": "user", "content": results})
    return None


async def _openai_style(client, p: Provider, system, tools, handlers, history, used, db, scope="-",
                        stop_when=None) -> str | None:
    headers = {"Authorization": f"Bearer {p.api_key}", "content-type": "application/json"}
    if p.name == "gemini":
        # Keys made in AI Studio are now "auth keys", which Google's own examples
        # send as x-goog-api-key; the OpenAI-compatible path documents Bearer.
        # Sending both means either kind of key is accepted.
        headers["x-goog-api-key"] = p.api_key
    fn_tools = [{
        "type": "function",
        "function": {"name": t["name"], "description": t["description"], "parameters": t["input_schema"]},
    } for t in tools]
    convo: list[dict] = [{"role": "system", "content": system}, *history]

    for _ in range(MAX_TOOL_ROUNDS + 1):
        body_in = {
            "model": p.model, "messages": convo,
            # OpenAI's newer models refuse max_tokens; Gemini's endpoint takes it.
            ("max_completion_tokens" if p.name == "openai" else "max_tokens"): MAX_TOKENS,
        }
        if fn_tools:
            body_in["tools"] = fn_tools
        res = await client.post(p.base_url + "chat/completions", headers=headers, json=body_in)
        _raise_for_status(res, p)
        choice = (res.json().get("choices") or [{}])[0]
        message = choice.get("message") or {}
        calls = message.get("tool_calls") or []
        # Sent back as received: Gemini attaches a thought signature to its tool
        # calls and refuses the follow-up if it is dropped.
        convo.append({k: v for k, v in message.items() if v is not None} | {"role": "assistant"})

        if not calls:
            return (message.get("content") or "").strip()

        for call in calls:
            fn = call.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except json.JSONDecodeError:
                args = {}
            text, _ = await _run_tool(fn.get("name"), args, handlers, used, db, scope)
            convo.append({"role": "tool", "tool_call_id": call.get("id"), "content": text})
        if stop_when is not None and stop_when():
            return (message.get("content") or "").strip()
    return None
