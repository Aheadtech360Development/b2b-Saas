"""A busy or down model is said in our own words, in every chat.

Gemini's free model often answers 503 "This model is currently experiencing
high demand", and the chats showed what the provider said in red. Now any
answer that means "busy for now" (rate limit or quota, the provider's server
errors, its overload, no answer in time) becomes BUSY, sent in the app's error
shape with the code AI_BUSY, the owner's chat included; the provider's words
stay in the log. An overloaded provider is asked once more first. Other
failures keep their own messages. No database or network.
"""
import copy

import httpx
import pytest

from app.api.v1 import copilot as copilot_api
from app.core.config import settings
from app.services.copilot import agent

GEMINI = agent.Provider("gemini", "k", "gemini-3.8-flash", "https://gemini.test/")
HIGH_DEMAND = ("This model is currently experiencing high demand. Spikes in demand are "
               "usually temporary. Please try again later.")


def gemini_error(status: int, message: str, code: str = "UNAVAILABLE") -> httpx.Response:
    # Gemini's OpenAI-compatible endpoint wraps its error in a list.
    return httpx.Response(status, json=[{"error": {"code": status, "message": message, "status": code}}])


class _Client:
    """Answers each request with the next response given, and counts them."""

    def __init__(self, *answers):
        self.answers, self.sent = list(answers), []

    async def post(self, url, headers=None, json=None):
        self.sent.append(copy.deepcopy(json))
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer


@pytest.fixture(autouse=True)
def no_wait(monkeypatch):
    monkeypatch.setattr(agent, "RETRY_AFTER_S", 0)


# ── What counts as busy ─────────────────────────────────────────────────────

@pytest.mark.parametrize("res", [
    gemini_error(503, HIGH_DEMAND),
    gemini_error(503, "The model is overloaded. Please try again later."),
    gemini_error(429, "You exceeded your current quota, please check your plan and billing details.",
                 "RESOURCE_EXHAUSTED"),
    gemini_error(500, "An internal error has occurred.", "INTERNAL"),
    gemini_error(504, "Deadline exceeded.", "DEADLINE_EXCEEDED"),
    httpx.Response(502, text="<html>Bad Gateway</html>"),
    httpx.Response(529, json={"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}),
    httpx.Response(429, json={"error": {"type": "rate_limit_error", "message": "Rate limit reached"}}),
    # The words alone, under another status.
    gemini_error(400, "The model is overloaded. Please try again later.", "INVALID_ARGUMENT"),
])
def test_a_busy_or_down_model_is_said_in_our_own_words(res):
    with pytest.raises(agent.CopilotBusy) as busy:
        agent._raise_for_status(res, GEMINI)
    assert str(busy.value) == agent.BUSY
    # What the provider said is kept for the log, not lost.
    assert str(res.status_code) in busy.value.detail


def test_the_providers_words_are_read_out_of_geminis_list():
    assert agent._provider_message(gemini_error(503, HIGH_DEMAND)) == HIGH_DEMAND


@pytest.mark.parametrize("res, says", [
    (gemini_error(400, "API key not valid. Please pass a valid API key.", "INVALID_ARGUMENT"), "returned an error"),
    (gemini_error(401, "Request had invalid authentication credentials.", "UNAUTHENTICATED"), "API key"),
    (gemini_error(403, "Permission denied.", "PERMISSION_DENIED"), "API key"),
    (gemini_error(404, "models/gemini-9 is not found.", "NOT_FOUND"), "wasn't found"),
])
def test_other_failures_keep_their_own_message(res, says):
    with pytest.raises(agent.CopilotError) as failed:
        agent._raise_for_status(res, GEMINI)
    assert not isinstance(failed.value, agent.CopilotBusy)
    assert says in str(failed.value)


# ── Asking once more ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_an_overloaded_model_is_asked_once_more_and_answers():
    client = _Client(gemini_error(503, HIGH_DEMAND),
                     httpx.Response(200, json={"choices": [{"message": {"content": "Sales were up."}}]}))
    reply = await agent._openai_style(client, GEMINI, "sys", [], {}, [{"role": "user", "content": "Sales?"}], [], None)
    assert reply == "Sales were up."
    # The same request twice: nothing ran in between.
    assert len(client.sent) == 2 and client.sent[0] == client.sent[1]


@pytest.mark.asyncio
async def test_still_overloaded_the_second_time_is_busy():
    client = _Client(httpx.Response(529, json={"error": {"type": "overloaded_error", "message": "Overloaded"}}),
                     httpx.Response(529, json={"error": {"type": "overloaded_error", "message": "Overloaded"}}))
    p = agent.Provider("anthropic", "k", "claude-sonnet-5-5")
    with pytest.raises(agent.CopilotBusy):
        await agent._anthropic(client, p, "sys", [], {}, [{"role": "user", "content": "x"}], [], None)
    assert len(client.sent) == 2


@pytest.mark.asyncio
async def test_a_rate_limit_is_not_asked_again_on_the_spot():
    client = _Client(gemini_error(429, "Quota exceeded.", "RESOURCE_EXHAUSTED"))
    with pytest.raises(agent.CopilotBusy):
        await agent._openai_style(client, GEMINI, "sys", [], {}, [{"role": "user", "content": "x"}], [], None)
    assert len(client.sent) == 1


@pytest.mark.asyncio
async def test_no_answer_in_time_is_busy(monkeypatch):
    monkeypatch.setattr(settings, "GEMINI_API_KEY", "k")
    monkeypatch.setattr(settings, "COPILOT_PROVIDER", "gemini")
    monkeypatch.setattr(settings, "COPILOT_MODEL", "gemini-3.8-flash")
    monkeypatch.setattr(settings, "COPILOT_DAILY_LIMIT", 0)

    async def timed_out(*a, **k):
        raise httpx.ReadTimeout("no answer")

    monkeypatch.setattr(agent, "_openai_style", timed_out)
    with pytest.raises(agent.CopilotBusy) as busy:
        await agent.run_copilot(system="s", tools=[], handlers={}, messages=[{"role": "user", "content": "x"}],
                                scope="owner")
    assert str(busy.value) == agent.BUSY


# ── What the chats are sent ─────────────────────────────────────────────────

def test_the_chats_get_a_busy_model_in_the_apps_error_shape_without_the_providers_words():
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.core.exceptions import AppException
    from app.main import app_exception_handler

    mini = FastAPI()
    mini.add_exception_handler(AppException, app_exception_handler)
    failures = {
        "busy": agent.CopilotBusy(agent.BUSY, f"gemini (gemini-3.8-flash) returned 503: {HIGH_DEMAND}"),
        "key": agent.CopilotError("The AI service rejected the platform's API key.", "gemini returned 401: bad key"),
        "off": agent.CopilotUnavailable("The AI copilot isn't switched on for this platform yet."),
        "limit": agent.CopilotLimitReached("Today's copilot limit has been reached. It resets tomorrow."),
    }

    @mini.get("/{what}")
    async def ask(what: str, verbose: bool = True):
        try:
            raise failures[what]
        except (agent.CopilotUnavailable, agent.CopilotLimitReached, agent.CopilotError) as exc:
            copilot_api._raise_for(exc, verbose=verbose)

    client = TestClient(mini)
    for verbose in ("true", "false"):  # the owner's chat, and a buyer's
        res = client.get(f"/busy?verbose={verbose}")
        assert res.status_code == 502
        assert res.json() == {"error": {"code": "AI_BUSY", "message": agent.BUSY, "details": []}}

    # Unchanged: a bad key still tells the owner what the provider said; a
    # switched-off assistant and a used-up day keep their own answers.
    key = client.get("/key").json()["detail"]
    assert "rejected the platform's API key" in key and "bad key" in key
    assert client.get("/off").status_code == 503
    assert client.get("/limit").status_code == 429


@pytest.mark.asyncio
async def test_the_builders_assistant_answers_busy_in_our_words(monkeypatch):
    from types import SimpleNamespace

    async def busy_run(**kw):
        raise agent.CopilotBusy(agent.BUSY, "gemini returned 503: high demand")

    monkeypatch.setattr(copilot_api, "run_copilot", busy_run)
    payload = copilot_api.StudioChatIn(messages=[{"role": "user", "content": "8 logos"}])
    request = SimpleNamespace(state=SimpleNamespace(), headers={"x-forwarded-for": "1.2.3.4"}, client=None)
    with pytest.raises(copilot_api.AIBusy) as busy:
        await copilot_api.studio_assistant(payload, request, db=None, __=None)
    assert busy.value.status_code == 502 and busy.value.error_code == "AI_BUSY"
    assert busy.value.message == agent.BUSY
