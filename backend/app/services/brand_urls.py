"""Where a brand actually lives on the web.

Every link we send somebody — back from a payment, to track an order, to
finish a cart — has to land on *their* shop. There is one setting for the
front end, and it is the platform's address, so a link built from it puts a
brand's customer on the platform's page instead of the shop they bought from.

A shop is reached, in order of preference:
  1. its own domain, once it has one
  2. its address on the platform, `<slug>.<platform domain>`
  3. the platform's address with `?tenant=<slug>`, which is what a host
     without wildcard subdomains has to fall back to
"""
from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings


def _platform_origin() -> str:
    return (get_settings().FRONTEND_URL or "").rstrip("/")


def build(slug: str, custom_domain: str | None, path: str = "/") -> str:
    """The address of one shop, without going near the database."""
    origin = _platform_origin()
    scheme = "https" if origin.startswith("https") else "http"
    path = path if path.startswith("/") else f"/{path}"

    if custom_domain:
        from app.services.tenant_hosts import normalise

        host = normalise(custom_domain)
        if host:
            return f"{scheme}://{host}{path}"

    platform = (get_settings().PLATFORM_DOMAIN or "").strip().lower()
    # "localhost" is the development default, and `slug.localhost` is not a
    # place a link can be sent to.
    if platform and platform not in {"localhost", ""} and slug:
        return f"{scheme}://{slug}.{platform}{path}"

    if not slug:
        return f"{origin}{path}"
    joiner = "&" if "?" in path else "?"
    return f"{origin}{path}{joiner}tenant={slug}"


async def for_tenant(db: AsyncSession, tenant_id: Any, path: str = "/") -> str:
    """The address of the shop this id belongs to."""
    row = (await db.execute(
        text("SELECT slug, custom_domain FROM tenants WHERE id = CAST(:t AS uuid)"),
        {"t": str(tenant_id)},
    )).first()
    if not row:
        return f"{_platform_origin()}{path}"
    return build(row[0], row[1], path)


async def for_slug(db: AsyncSession, slug: str, path: str = "/") -> str:
    row = (await db.execute(
        text("SELECT custom_domain FROM tenants WHERE slug = :s"), {"s": slug}
    )).first()
    return build(slug, row[0] if row else None, path)
