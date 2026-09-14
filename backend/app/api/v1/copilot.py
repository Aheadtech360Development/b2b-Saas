"""AI Copilot endpoints — Phase 1.

  GET  /admin/copilot/briefing   today's priority list (computed; works without AI)
  POST /admin/copilot/chat       the owner asks about their store
  POST /copilot/support          a signed-in customer asks about their own orders

The client keeps the conversation as plain text and sends it back each turn.
Tool rounds happen server-side and are never part of what the client can send,
so a crafted request cannot inject a fake tool result.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_context import get_current_brand_name
from app.middleware.auth_middleware import require_admin
from app.services.copilot.agent import (
    CopilotError, CopilotLimitReached, CopilotUnavailable, copilot_configured, run_copilot,
)
from app.services.copilot.actions import (
    ACTIONS, INDEX as ACTION_INDEX, ActionError, preview_action, run_action,
)
from app.services.copilot.briefing import build_briefing
from app.services.copilot.tools import (
    CUSTOMER_TOOLS, OWNER_TOOLS, customer_handlers, owner_handlers,
)

admin_router = APIRouter(prefix="/admin/copilot", tags=["admin-copilot"])
public_router = APIRouter(prefix="/copilot", tags=["copilot"])

MAX_TURNS = 20
MAX_CHARS = 4000


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_CHARS)


class ActIn(BaseModel):
    """What the admin clicked. The action and its target are named here, not
    carried over from the chat, so what runs is what was shown on the button."""
    action: str
    params: dict[str, str] = {}


class ChatIn(BaseModel):
    messages: list[ChatTurn] = Field(min_length=1)

    @field_validator("messages")
    @classmethod
    def _shape(cls, v: list[ChatTurn]) -> list[ChatTurn]:
        v = v[-MAX_TURNS:]
        # The API needs the conversation to start with the user and end on them.
        while v and v[0].role != "user":
            v = v[1:]
        if not v or v[-1].role != "user":
            raise ValueError("The last message must be the user's question.")
        return v


PROPOSE_TOOL = {
    "name": "propose_action",
    "description": (
        "Offer to make a change to the store. You cannot make changes yourself: this checks the "
        "target exists and is in a state the change makes sense from, and turns it into a button "
        "the admin clicks to confirm. Call it when the admin asks for one of these, then tell them "
        "in one line what you have prepared — do not claim it is done.\n\nActions:\n" + ACTION_INDEX
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": list(ACTIONS)},
            "params": {
                "type": "object",
                "description": "The action's inputs, e.g. {\"order_number\": \"1043\"} or {\"reference\": \"GS-202609-0003\", \"note\": \"Logo is low resolution\"}.",
                "additionalProperties": {"type": "string"},
            },
        },
        "required": ["action", "params"],
    },
}


def _brand() -> str:
    return get_current_brand_name() or "this store"


def _today() -> str:
    return datetime.now(UTC).strftime("%A %d %B %Y")


def _owner_system() -> str:
    return f"""You are the AI copilot inside the admin of {_brand()}, a custom apparel and print business (DTF transfers, gang sheets, blanks, wholesale and retail orders) running on the AT360 platform. You are talking to the owner or their staff. Today is {_today()} (UTC).

How you work:
- Every number, name, order and status you state must come from a tool result in this conversation. Never estimate, round up a guess, or fill in a figure you did not look up. If a tool can't answer it, say what you can't see.
- You can only read. You cannot change orders, approve jobs, send emails or edit anything. When something needs doing, say exactly where in the admin to do it (Orders, Gang Sheets, Customers, Inventory, Returns, Abandoned Carts).
- You don't have website traffic, advertising data or worked-out margins. Cost price is recorded per variant when the brand fills it in, but no tool totals it, so don't quote margins.
- You cannot change anything yourself. To make a change, call propose_action — it prepares a button for the admin to confirm. Having proposed, say in one line what is ready to confirm; never say you have done it, and never claim a change happened without the admin clicking.
- For any "how do I" or "where do I" question about running the store, call how_to first and answer from what it returns. Never describe a menu path, screen or button from memory — if how_to has no topic for it, say you don't have a guide for that rather than inventing one.
- Lead with what needs action first. Be brief and concrete: short lines, counts and amounts, order numbers with #.
- Make things openable. Tool results carry an admin_link for the screen that opens that order, product or customer; when you name one, write it as a Markdown link using that exact link, e.g. [#1043](/admin/orders/1043). Use only links a tool gave you — never build or guess one — and don't paste a bare URL as the visible text.
- Listing several things reads best as a short bulleted list, one line each, each with its link.
- Reply in the language the user writes in. If they write Roman Urdu, answer in Roman Urdu; if English, English."""


def _customer_system() -> str:
    return f"""You are the order support assistant for {_brand()}, a custom apparel and print shop. You are talking to a signed-in customer about their own orders. Today is {_today()} (UTC).

How you work:
- Only discuss this customer's own orders and print jobs, using the tools. Every status, date, amount and tracking number must come from a tool result. Never guess a delivery date the data doesn't show.
- You cannot cancel, refund, change an order, change artwork or promise anything. For those, tell them to contact the store, and for a print job needing a revision, to use "Update & resubmit" under My Print Jobs in their account.
- Explain statuses in plain words: "in review" means the print team is checking the artwork; "revision requested" means they need the customer to fix something (quote the team's note if there is one); "production" means it is being printed.
- If they ask about something other than their orders, say briefly that you can help with orders, shipping and print jobs.
- Tool results carry a link for the page that shows that order or print job. When you mention one, write it as a Markdown link using that exact link, e.g. [#1043](/account/orders/1043). Never build or guess a link.
- Be warm and short. Reply in the language the customer writes in, including Roman Urdu."""


def _raise_for(exc: Exception, *, verbose: bool = False):
    """`verbose` adds what the provider said — for the owner's admin chat, where
    the fix (a model name, a quota, a key) is theirs to make. Never for buyers."""
    if isinstance(exc, CopilotUnavailable):
        raise HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, CopilotLimitReached):
        raise HTTPException(status_code=429, detail=str(exc))
    said = getattr(exc, "detail", "") if verbose else ""
    raise HTTPException(status_code=502, detail=f"{exc} ({said})" if said else str(exc))


@admin_router.get("/briefing")
async def briefing(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    data = await build_briefing(db)
    data["ai_enabled"] = copilot_configured()
    return data


@admin_router.post("/chat")
async def owner_chat(
    payload: ChatIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    # Whatever the model proposes lands here, and travels back to the admin as a
    # button. Only the last proposal survives: one question, one thing to confirm.
    proposed: dict = {}

    async def propose(args: dict):
        action = str(args.get("action") or "")
        params = {k: str(v) for k, v in (args.get("params") or {}).items() if v is not None}
        try:
            preview = await preview_action(db, action, params)
        except ActionError as exc:
            # Back to the model as a normal result: it can ask for what's missing.
            return {"ok": False, "problem": str(exc)}
        proposed.clear()
        proposed.update({"action": action, "params": params, **preview})
        return {"ok": True, "prepared": preview["summary"],
                "next": "Tell the admin what is ready and that they need to confirm it."}

    handlers = owner_handlers(db)
    handlers["propose_action"] = propose
    try:
        result = await run_copilot(
            system=_owner_system(), tools=[*OWNER_TOOLS, PROPOSE_TOOL], handlers=handlers,
            messages=[m.model_dump() for m in payload.messages], scope="owner", db=db,
        )
    except (CopilotUnavailable, CopilotLimitReached, CopilotError) as exc:
        _raise_for(exc, verbose=True)
    if proposed:
        result["action"] = proposed
    return result


@admin_router.post("/act")
async def owner_act(
    payload: ActIn, request: Request, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    """Run one prepared action. This is the only place the copilot's suggestions
    turn into changes, and it is reached by an admin clicking Confirm."""
    try:
        done = await run_action(db, payload.action, dict(payload.params),
                                getattr(request.state, "user_id", None))
    except ActionError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    await db.commit()
    return {"done": done}


@public_router.post("/support")
async def customer_support(payload: ChatIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    user_id = getattr(request.state, "user_id", None)
    company_id = getattr(request.state, "company_id", None)
    if not user_id and not company_id:
        raise HTTPException(status_code=401, detail="Sign in to ask about your orders.")
    try:
        return await run_copilot(
            system=_customer_system(), tools=CUSTOMER_TOOLS,
            handlers=customer_handlers(db, user_id=user_id, company_id=company_id),
            messages=[m.model_dump() for m in payload.messages], scope="support", db=db,
        )
    except (CopilotUnavailable, CopilotLimitReached, CopilotError) as exc:
        _raise_for(exc)
