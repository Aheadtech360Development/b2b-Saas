"""The copilot loop: send the conversation to Claude, run the tools it asks for,
send the results back, repeat until it answers.

Called over plain HTTPS with httpx rather than the SDK — one small request shape,
no new dependency to install on the server.

Guards:
* Tool calls run on the server against the brand's data; the model only ever
  sees their results. Prices and counts in a reply come from those results.
* Each brand has a daily question limit, so one brand cannot run up the bill.
* The loop is capped, so a model that keeps calling tools cannot spin forever.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

import httpx

from app.core.config import settings
from app.core.redis import redis_increment
from app.core.tenant_context import get_current_tenant_id

logger = logging.getLogger(__name__)

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"
MAX_TOOL_ROUNDS = 6
MAX_TOKENS = 1500
MAX_TOOL_RESULT_CHARS = 20_000


class CopilotUnavailable(Exception):
    """No API key configured — say so plainly rather than failing oddly."""


class CopilotLimitReached(Exception):
    """The brand has used today's questions."""


class CopilotError(Exception):
    """The model call failed; the message is safe to show."""


async def _check_daily_limit(scope: str) -> None:
    limit = settings.COPILOT_DAILY_LIMIT
    if limit <= 0:
        return
    tenant = get_current_tenant_id() or "platform"
    key = f"copilot:{tenant}:{scope}:{datetime.now(UTC):%Y%m%d}"
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


async def run_copilot(
    *,
    system: str,
    tools: list[dict],
    handlers: dict,
    messages: list[dict],
    scope: str,
    db=None,
) -> dict:
    """Answer the last user message. `messages` is plain text history
    ([{role, content}]); tool rounds happen here and are not returned."""
    if not settings.ANTHROPIC_API_KEY:
        raise CopilotUnavailable("The AI copilot isn't switched on for this platform yet.")
    await _check_daily_limit(scope)

    convo: list[dict] = [{"role": m["role"], "content": m["content"]} for m in messages]
    used_tools: list[str] = []
    headers = {
        "x-api-key": settings.ANTHROPIC_API_KEY,
        "anthropic-version": API_VERSION,
        "content-type": "application/json",
    }

    async with httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=10.0)) as client:
        for _ in range(MAX_TOOL_ROUNDS + 1):
            try:
                res = await client.post(API_URL, headers=headers, json={
                    "model": settings.COPILOT_MODEL,
                    "max_tokens": MAX_TOKENS,
                    "system": system,
                    "tools": tools,
                    "messages": convo,
                })
            except httpx.HTTPError as exc:
                logger.warning("copilot request failed: %s", exc)
                raise CopilotError("Couldn't reach the AI service. Please try again.") from exc

            if res.status_code != 200:
                logger.warning("copilot API %s: %s", res.status_code, res.text[:500])
                if res.status_code == 429:
                    raise CopilotError("The AI service is busy right now. Please try again in a minute.")
                if res.status_code in (401, 403):
                    raise CopilotError("The AI service rejected the platform's API key.")
                raise CopilotError("The AI service returned an error. Please try again.")

            body = res.json()
            content = body.get("content") or []
            # The assistant turn goes back verbatim — including any thinking
            # blocks — or the next request is rejected.
            convo.append({"role": "assistant", "content": content})

            calls = [b for b in content if b.get("type") == "tool_use"]
            if body.get("stop_reason") != "tool_use" or not calls:
                text = "\n\n".join(b.get("text", "") for b in content if b.get("type") == "text").strip()
                return {"reply": text or "I don't have an answer for that.", "tools_used": used_tools}

            results = []
            for call in calls:
                name = call.get("name")
                used_tools.append(name)
                handler = handlers.get(name)
                if handler is None:
                    results.append({"type": "tool_result", "tool_use_id": call["id"],
                                    "content": f"Unknown tool {name}.", "is_error": True})
                    continue
                try:
                    output = await handler(call.get("input") or {})
                    results.append({"type": "tool_result", "tool_use_id": call["id"], "content": _clip(output)})
                except Exception as exc:
                    logger.exception("copilot tool %s failed", name)
                    # A failed statement aborts the transaction; without this every
                    # later lookup in the same answer fails too.
                    if db is not None:
                        try:
                            await db.rollback()
                        except Exception:
                            pass
                    results.append({"type": "tool_result", "tool_use_id": call["id"],
                                    "content": f"The lookup failed: {type(exc).__name__}.", "is_error": True})
            convo.append({"role": "user", "content": results})

    return {
        "reply": "That needed more lookups than I can do in one go. Try asking something narrower.",
        "tools_used": used_tools,
    }
