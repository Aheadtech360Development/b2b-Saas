"""The short code that points the mobile app at one shop.

One app serves every brand, so before it can show anything it has to know
whose shop it is. A brand gives its buyers a six-character code — on the
invoice, on a card, in a QR square — and that is the whole of the setup.

Not the brand's slug. A slug can be guessed from the company name, and a
trade catalogue with trade prices in it should not open for anyone who can
spell "interflow". This is short enough to read out over the phone and long
enough that guessing is not worth anybody's afternoon.
"""
from __future__ import annotations

import secrets

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# No I, L, O, 0 or 1: these are read off paper and said out loud, and those
# five are the ones people get wrong.
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
LENGTH = 6

# 31^6 — about 887 million. With the lookup rate-limited, guessing one is not
# a way in.
_ATTEMPTS = 12


def _mint() -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def normalise(code: str | None) -> str:
    """What somebody typed, as a code.

    People add spaces and hyphens, type in lower case, and reach for O and I
    where the code has 0 and 1 — except this alphabet has neither, so those
    keystrokes can only have meant the letters. Nothing here is a guess: it
    only undoes the ways the same code gets written down.
    """
    raw = (code or "").strip().upper()
    return "".join(c for c in raw if c in ALPHABET)[:LENGTH]


async def for_tenant(db: AsyncSession, tenant_id: object) -> str | None:
    """This brand's code, minting one the first time it is asked for."""
    row = (await db.execute(
        text("SELECT shop_code FROM tenants WHERE id = CAST(:t AS uuid)"),
        {"t": str(tenant_id)},
    )).first()
    if not row:
        return None
    if row[0]:
        return row[0]
    return await rotate(db, tenant_id)


async def rotate(db: AsyncSession, tenant_id: object) -> str | None:
    """Give this brand a new code, retiring whatever it had.

    Used when a code has been handed to the wrong people. Every buyer who
    typed the old one keeps working — the app remembers the shop, not the
    code — so rotating only closes the door to anyone who has not been in yet.
    """
    for _ in range(_ATTEMPTS):
        code = _mint()
        try:
            updated = (await db.execute(text("""
                UPDATE tenants SET shop_code = :c, updated_at = now()
                WHERE id = CAST(:t AS uuid)
                RETURNING shop_code
            """), {"c": code, "t": str(tenant_id)})).first()
            await db.commit()
            return updated[0] if updated else None
        except Exception:
            # Taken by another brand between the mint and the write. Try again
            # — the odds of a second collision are not worth reasoning about.
            await db.rollback()
    return None


async def resolve(db: AsyncSession, code: str) -> dict | None:
    """The shop a code belongs to, or nothing.

    Answers the same way for a code that does not exist and one whose shop is
    closed: a lookup that distinguishes them is a way of asking which codes
    are real.
    """
    cleaned = normalise(code)
    if len(cleaned) != LENGTH:
        return None

    # Unscoped, necessarily. Working out which shop a code belongs to is the
    # step *before* there is a shop in context, so row-level security has no
    # tenant to match on — scoped, the branding join came back empty and every
    # shop was handed back in the platform's own colours.
    from app.core.database import AsyncSessionLocal
    from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

    previous = is_scoping_bypassed()
    set_bypass_scoping(True)
    try:
        async with AsyncSessionLocal() as lookup:
            row = (await lookup.execute(text("""
                SELECT t.id, t.slug, t.name, t.custom_domain, b.store_name,
                       b.logo_url, b.primary_color
                FROM tenants t
                LEFT JOIN tenant_branding b ON b.tenant_id = t.id
                WHERE t.shop_code = :c AND t.status = 'active'
            """), {"c": cleaned})).mappings().first()
            row = dict(row) if row else None
    finally:
        set_bypass_scoping(previous)
    if not row:
        return None

    from app.services import brand_urls, entitlements

    try:
        wholesale = "wholesale_accounts" in await entitlements.for_tenant(db, row["id"])
    except Exception:
        wholesale = False

    return {
        "slug": row["slug"],
        "name": row["store_name"] or row["name"],
        "logo_url": row["logo_url"],
        "primary_color": row["primary_color"] or "#111318",
        "url": brand_urls.build(row["slug"], row["custom_domain"], "/"),
        # The app asks a buyer to sign in at a wholesale shop and lets them
        # straight in at a retail one.
        "wholesale_signup": wholesale,
    }
