"""A database session for the partner program.

Partners belong to the platform, and what a partner is shown (the shops they
brought in, by name and plan) spans shops. Row-level security would show such
a request nothing, so these sessions bypass it, the way the platform's console
and a shop's own sign-up do. The bypass is not a licence to read a shop's
data: every query in this package names exactly what it reads, and a partner
is never given more than a shop's name, plan and status.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping


@asynccontextmanager
async def session() -> AsyncGenerator[AsyncSession, None]:
    """A bypassing session. The caller commits."""
    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as s:
            yield s
    finally:
        set_bypass_scoping(previous)


async def get_partner_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: the session above, committed when the request succeeds."""
    async with session() as s:
        try:
            yield s
            await s.commit()
        except Exception:
            await s.rollback()
            raise
