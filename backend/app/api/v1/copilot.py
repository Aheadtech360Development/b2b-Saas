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


def _brand() -> str:
    return get_current_brand_name() or "this store"


def _today() -> str:
    return datetime.now(UTC).strftime("%A %d %B %Y")


def _owner_system() -> str:
    return f"""You are the AI copilot inside the admin of {_brand()}, a custom apparel and print business (DTF transfers, gang sheets, blanks, wholesale and retail orders) running on the AT360 platform. You are talking to the owner or their staff. Today is {_today()} (UTC).

How you work:
- Every number, name, order and status you state must come from a tool result in this conversation. Never estimate, round up a guess, or fill in a figure you did not look up. If a tool can't answer it, say what you can't see.
- You can only read. You cannot change orders, approve jobs, send emails or edit anything. When something needs doing, say exactly where in the admin to do it (Orders, Gang Sheets, Customers, Inventory, Returns, Abandoned Carts).
- You don't have product costs, margins, website traffic or advertising data. Say so rather than guessing if asked.
- Lead with what needs action first. Be brief and concrete: short lines, counts and amounts, order numbers with #.
- Reply in the language the user writes in. If they write Roman Urdu, answer in Roman Urdu; if English, English."""


def _customer_system() -> str:
    return f"""You are the order support assistant for {_brand()}, a custom apparel and print shop. You are talking to a signed-in customer about their own orders. Today is {_today()} (UTC).

How you work:
- Only discuss this customer's own orders and print jobs, using the tools. Every status, date, amount and tracking number must come from a tool result. Never guess a delivery date the data doesn't show.
- You cannot cancel, refund, change an order, change artwork or promise anything. For those, tell them to contact the store, and for a print job needing a revision, to use "Update & resubmit" under My Print Jobs in their account.
- Explain statuses in plain words: "in review" means the print team is checking the artwork; "revision requested" means they need the customer to fix something (quote the team's note if there is one); "production" means it is being printed.
- If they ask about something other than their orders, say briefly that you can help with orders, shipping and print jobs.
- Be warm and short. Reply in the language the customer writes in, including Roman Urdu."""


def _raise_for(exc: Exception):
    if isinstance(exc, CopilotUnavailable):
        raise HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, CopilotLimitReached):
        raise HTTPException(status_code=429, detail=str(exc))
    raise HTTPException(status_code=502, detail=str(exc))


@admin_router.get("/briefing")
async def briefing(_: None = Depends(require_admin), db: AsyncSession = Depends(get_db)) -> dict:
    data = await build_briefing(db)
    data["ai_enabled"] = copilot_configured()
    return data


@admin_router.post("/chat")
async def owner_chat(
    payload: ChatIn, _: None = Depends(require_admin), db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        return await run_copilot(
            system=_owner_system(), tools=OWNER_TOOLS, handlers=owner_handlers(db),
            messages=[m.model_dump() for m in payload.messages], scope="owner", db=db,
        )
    except (CopilotUnavailable, CopilotLimitReached, CopilotError) as exc:
        _raise_for(exc)


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
