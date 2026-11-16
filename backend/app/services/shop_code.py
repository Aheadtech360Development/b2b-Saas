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
        have = await entitlements.for_tenant(db, row["id"])
    except Exception:
        have = set()
    wholesale = "wholesale_accounts" in have

    return {
        "slug": row["slug"],
        "name": row["store_name"] or row["name"],
        "logo_url": row["logo_url"],
        "primary_color": row["primary_color"] or "#111318",
        "url": brand_urls.build(row["slug"], row["custom_domain"], "/"),
        # The app asks a buyer to sign in at a wholesale shop and lets them
        # straight in at a retail one.
        "wholesale_signup": wholesale,
        # The branded buyer app is sold on Scale. A shop without it has no
        # place in the app, and the lookup says so rather than letting a buyer
        # apply to a shop they could never order from there.
        "buyer_app": "mobile_app" in have,
    }


def app_links() -> dict[str, str | None]:
    """Where to get the PrintCoPilot app, once it is in the stores."""
    from app.core.config import get_settings

    s = get_settings()
    return {
        "app_store_url": (s.MOBILE_APP_STORE_URL or "").strip() or None,
        "play_store_url": (s.MOBILE_PLAY_STORE_URL or "").strip() or None,
    }


def get_app_link(code: str) -> str:
    """printcopilot.co's page for this code: what the QR square opens."""
    from app.core.config import get_settings

    origin = (get_settings().FRONTEND_URL or "").rstrip("/")
    return f"{origin}/get-app?code={code}"


def card(code: str | None) -> dict:
    """Everything the console's Buyer app page shows for a code."""
    if not code:
        return {"code": None, "link": None, "qr_svg": None, "qr_png": None, **app_links()}
    import segno

    link = get_app_link(code)
    qr = segno.make(link, error="m")
    return {
        "code": code,
        "link": link,
        "qr_svg": qr.svg_data_uri(scale=6, border=2, dark="#0C1E35"),
        "qr_png": qr.png_data_uri(scale=16, border=3, dark="#0C1E35"),
        **app_links(),
    }
