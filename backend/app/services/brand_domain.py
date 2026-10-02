"""A brand bringing its own domain.

Until a shop has one it lives at `<slug>.printcopilot.co`. Most shops buy a
domain eventually — from Namecheap, from GoDaddy — and want the whole site to
answer there instead. Everything on our side already works that way: the
request is matched to a brand by host, so the shop, its theme, its checkout
and the links in its emails all follow the address it is reached at.

What was missing was a way for the shop to say so. Only the platform console
could set it, which meant the brand had to ask us and wait.

Two things happen, in this order, and neither is optional:

  1. The shop points its DNS here.
  2. The platform adds that hostname to the deployment, so a certificate is
     issued for it.

Step 2 is ours, and until it is done the address answers with somebody else's
certificate or nothing at all. So a domain is saved in a "pending" state and
only becomes the shop's address once it actually resolves to us — checked,
not assumed.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.tenant_hosts import normalise

logger = logging.getLogger(__name__)

# What a shop is told to put in its DNS. A CNAME for a subdomain like
# shop.example.com, and an A record for a bare example.com, because a CNAME
# cannot sit at the root of a zone.
CNAME_TARGET = "cname.vercel-dns.com"
APEX_IP = "76.76.21.21"

_BAD_SUFFIXES = (".local", ".test", ".invalid", ".localhost")


def is_apex(host: str) -> bool:
    """Whether this is the root of a zone (example.com) or under it."""
    return host.count(".") <= 1


def records_for(host: str) -> list[dict[str, str]]:
    """The DNS a shop has to add, in the words its registrar uses."""
    if is_apex(host):
        return [
            {"type": "A", "host": "@", "value": APEX_IP,
             "note": "The root of your domain. A CNAME cannot sit here, so it is an A record."},
            {"type": "CNAME", "host": "www", "value": CNAME_TARGET,
             "note": "So www.<your domain> reaches the same shop."},
        ]
    sub = host.split(".")[0]
    return [
        {"type": "CNAME", "host": sub, "value": CNAME_TARGET,
         "note": f"Only the {sub} part goes in the Host field — your registrar adds the rest."},
    ]


def check(host: str) -> tuple[bool, str]:
    """Whether this is a hostname we can serve, and why not when it isn't."""
    cleaned = normalise(host)
    if not cleaned or "." not in cleaned:
        return False, "That does not look like a domain. It should read like shop.yourbrand.com."
    if any(cleaned.endswith(s) for s in _BAD_SUFFIXES):
        return False, "That is not a public domain, so it cannot be reached from the internet."
    platform = (get_settings().PLATFORM_DOMAIN or "").strip().lower()
    if platform and (cleaned == platform or cleaned.endswith("." + platform)):
        return False, (
            f"That is an address on {platform}, which your shop already has. "
            "This is for a domain you bought yourself."
        )
    return True, ""


async def live(host: str) -> tuple[bool, str]:
    """Whether the address actually reaches this shop yet.

    Asked rather than assumed. DNS takes a while to spread and the certificate
    is issued only once we have added the hostname, so a shop that has just
    saved a domain is told where it stands instead of being switched over to
    an address that answers with an error.
    """
    url = f"https://{host}/api/version"
    try:
        async with httpx.AsyncClient(timeout=6.0, follow_redirects=True) as client:
            response = await client.get(url)
    except httpx.ConnectError:
        return False, "Nothing answers there yet. DNS can take up to an hour to spread."
    except Exception as exc:  # certificate not issued, timeout, anything else
        name = type(exc).__name__
        if "SSL" in name or "Certificate" in name:
            return False, "The address resolves but has no certificate yet. We issue it once your DNS is in place."
        return False, f"Could not reach it yet ({name})."
    if response.status_code >= 400:
        return False, f"It answers, but with an error ({response.status_code})."
    return True, "Live."


async def get(db: AsyncSession, tenant_id: object) -> dict[str, Any]:
    """Where this shop stands on its own domain.

    Reads the record and nothing else. Whether the address is answering yet
    is a separate question with a separate button: it costs a request over
    the internet, and a settings screen that waits on one — and fails when
    it times out — is a settings screen nobody can open.
    """
    row = (await db.execute(text(
        "SELECT slug, custom_domain FROM tenants WHERE id = CAST(:t AS uuid)"
    ), {"t": str(tenant_id)})).first()
    if not row:
        return {"domain": None, "records": [], "status": "none", "message": ""}

    slug, domain = row[0], row[1]
    platform = (get_settings().PLATFORM_DOMAIN or "").strip().lower()
    return {
        "domain": domain,
        "platform_address": f"{slug}.{platform}" if platform else None,
        "records": records_for(domain) if domain else [],
        "status": "pending" if domain else "none",
        "message": "",
    }


async def verify(db: AsyncSession, tenant_id: object) -> dict[str, Any]:
    """Ask the address itself whether it is working yet."""
    out = await get(db, tenant_id)
    if not out["domain"]:
        return out
    ok, why = await live(out["domain"])
    out["status"] = "live" if ok else "pending"
    out["message"] = why
    return out


async def save(db: AsyncSession, tenant_id: object, host: str | None) -> dict[str, Any]:
    """Claim a domain for this shop, or give it up.

    Saving it does not switch the shop over on its own — the shop is reached
    at whatever address resolves to it, and this is the record that says the
    address belongs here. Clearing it sends the shop back to its address on
    the platform, which never stopped working.
    """
    if not host or not host.strip():
        await db.execute(text(
            "UPDATE tenants SET custom_domain = NULL, updated_at = now() "
            "WHERE id = CAST(:t AS uuid)"
        ), {"t": str(tenant_id)})
        await db.commit()
        from app.services import tenant_hosts

        tenant_hosts.forget()
        # The browser's side of the same question: until this is dropped, the
        # new domain resolves to the shop and is still refused by CORS.
        from app.middleware.brand_cors import forget as forget_cors

        forget_cors()
        return await get(db, tenant_id)

    cleaned = normalise(host)
    ok, why = check(cleaned)
    if not ok:
        raise ValueError(why)

    taken = (await db.execute(text(
        "SELECT slug FROM tenants WHERE lower(custom_domain) = :d "
        "AND id <> CAST(:t AS uuid)"
    ), {"d": cleaned, "t": str(tenant_id)})).first()
    if taken:
        raise ValueError("Another shop on this platform is already using that domain.")

    await db.execute(text(
        "UPDATE tenants SET custom_domain = :d, updated_at = now() "
        "WHERE id = CAST(:t AS uuid)"
    ), {"d": cleaned, "t": str(tenant_id)})
    await db.commit()

    from app.services import tenant_hosts

    tenant_hosts.forget()
    logger.info("Shop %s claimed the domain %s — add it to the deployment", tenant_id, cleaned)
    return await get(db, tenant_id)
