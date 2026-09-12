"""Per-brand third-party settings — suppliers, shipping carriers, email.

Suppliers and carriers are accounts each brand connects for itself: its
catalogue comes from its own S&S credentials and its labels are bought on its
own carrier account, so the postage bills to it and not to us.

Email is deliberately the other way round. Every brand's mail leaves through the
platform's single Resend account, because that account owns the verified sending
domain; what a brand sets here is its identity on the message and the address
its own alerts go to.

Storage follows the pattern already used for shipping: one tenant-namespaced
settings key holding a JSON blob, so adding a provider needs no migration.

Adding a provider is a registry entry, nothing more — the admin UI renders its
form from `fields` and the connect endpoint validates through `verify`. That is
the whole point: a new carrier or supplier should never need new screens.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable, Awaitable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import get_setting, set_setting

logger = logging.getLogger(__name__)

_KEY = "integrations"

# Field kinds the admin form knows how to render.
#   text     → plain input
#   secret   → masked input, never sent back to the browser once saved
#   select   → one of `options`
FIELD_KINDS = ("text", "secret", "select")


class Field(dict):
    """One credential the provider needs from the brand."""

    def __init__(self, name: str, label: str, kind: str = "text",
                 help_text: str | None = None, required: bool = True,
                 options: list[str] | None = None, placeholder: str | None = None):
        super().__init__(
            name=name, label=label, kind=kind, help=help_text,
            required=required, options=options or [], placeholder=placeholder or "",
        )


class Provider(dict):
    """A connectable third party."""

    def __init__(self, key: str, name: str, category: str, blurb: str,
                 fields: list[Field], docs_url: str = "", logo: str = ""):
        super().__init__(
            key=key, name=name, category=category, blurb=blurb,
            fields=fields, docs_url=docs_url, logo=logo,
        )


# ── Registry ──────────────────────────────────────────────────────────────────
# Categories: "supplier" (product catalogues) and "carrier" (shipping).
PROVIDERS: dict[str, Provider] = {
    "ss_activewear": Provider(
        key="ss_activewear",
        name="S&S Activewear",
        category="supplier",
        blurb="Import styles, colours, sizes, live inventory and pricing from your own S&S account.",
        docs_url="https://api.ssactivewear.com/",
        logo="📦",
        fields=[
            Field("account_number", "Account number", "text",
                  "Your S&S customer number — shown in the S&S portal under My Account.",
                  placeholder="123456"),
            Field("api_key", "API key", "secret",
                  "Create one in the S&S portal under Account → API Access."),
        ],
    ),
    # Mail always leaves through the platform's own Resend account — a brand is
    # never asked for a key, and the sender stays on our verified domain because
    # that is the only domain this account can send from. What IS per-brand is
    # the identity on the message and where the brand's own alerts go.
    "resend": Provider(
        key="resend",
        name="Email notifications",
        category="email",
        blurb="Your store's name on the emails your customers receive, and where your own alerts are sent.",
        logo="✉️",
        fields=[
            Field("notify_email", "Send my alerts to", "text",
                  "New orders, wholesale applications, contact messages and low stock come here.",
                  required=False, placeholder="you@yourbrand.com"),
            Field("from_name", "Sender name", "text",
                  "Shown as the sender on customer emails. Defaults to your store name.",
                  required=False),
            Field("reply_to", "Reply-to address", "text",
                  "Where a customer's reply lands. Defaults to your alerts address.",
                  required=False, placeholder="support@yourbrand.com"),
        ],
    ),
    "ups": Provider(
        key="ups",
        name="UPS",
        category="carrier",
        blurb="Live UPS rates and labels billed to your own UPS account.",
        docs_url="https://developer.ups.com/",
        logo="🟤",
        fields=[
            Field("client_id", "Client ID", "text",
                  "From your app in the UPS Developer Portal."),
            Field("client_secret", "Client secret", "secret"),
            Field("account_number", "UPS account number", "text",
                  "The six-character shipper number postage is billed to.",
                  placeholder="A1B2C3"),
            Field("environment", "Environment", "select", options=["production", "test"],
                  required=False),
        ],
    ),
    "fedex": Provider(
        key="fedex",
        name="FedEx",
        category="carrier",
        blurb="Live FedEx rates and labels billed to your own FedEx account.",
        docs_url="https://developer.fedex.com/",
        logo="🟣",
        fields=[
            Field("api_key", "API key", "text", "Your FedEx project's API key."),
            Field("secret_key", "Secret key", "secret"),
            Field("account_number", "FedEx account number", "text", placeholder="123456789"),
            Field("environment", "Environment", "select", options=["production", "test"],
                  required=False),
        ],
    ),
    "usps": Provider(
        key="usps",
        name="USPS",
        category="carrier",
        blurb="Live USPS rates and labels through your own USPS Business account.",
        docs_url="https://developer.usps.com/",
        logo="🦅",
        fields=[
            Field("client_id", "Consumer key", "text",
                  "From developer.usps.com — your app's consumer key."),
            Field("client_secret", "Consumer secret", "secret"),
            # Rates need only the key pair. Labels are paid for through the
            # Enterprise Payment account, and USPS identifies it by all three of
            # these together — so they're optional to connect, required to print.
            Field("account_number", "EPS account number", "text",
                  "Needed to buy labels. From your Business Customer Gateway account.", required=False),
            Field("crid", "CRID", "text",
                  "Customer Registration ID — needed to buy labels.", required=False),
            Field("mid", "MID", "text",
                  "Mailer ID — needed to buy labels.", required=False),
            Field("environment", "Environment", "select", options=["production", "test"],
                  required=False),
        ],
    ),
}

# Which fields are secret, per provider — used to mask on read.
_SECRETS = {
    p_key: {f["name"] for f in p["fields"] if f["kind"] == "secret"}
    for p_key, p in PROVIDERS.items()
}


# ── Storage ───────────────────────────────────────────────────────────────────
async def _load_all(db: AsyncSession, tenant_id) -> dict[str, dict]:
    raw = await get_setting(db, _KEY, tenant_id=tenant_id)
    if not raw:
        return {}
    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
        return data if isinstance(data, dict) else {}
    except Exception:
        logger.warning("integrations blob for tenant %s is not valid JSON", tenant_id)
        return {}


async def get_connection(db: AsyncSession, provider: str, tenant_id=None) -> dict | None:
    """This brand's stored credentials for a provider, secrets included.

    For server-side use only — never return this to a browser.
    """
    return (await _load_all(db, tenant_id)).get(provider)


async def save_connection(db: AsyncSession, provider: str, values: dict, tenant_id=None) -> dict:
    """Store credentials, keeping any secret the admin left blank.

    A blank secret means "unchanged" — the UI never receives the saved value
    back, so re-saving the form must not wipe it.
    """
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider '{provider}'")

    everything = await _load_all(db, tenant_id)
    existing = everything.get(provider) or {}

    merged = {**existing}
    for field in PROVIDERS[provider]["fields"]:
        name = field["name"]
        new = values.get(name)
        if new in (None, "") and field["kind"] == "secret" and existing.get(name):
            continue                      # left blank → keep what's stored
        if new is not None:
            merged[name] = str(new).strip()

    missing = [
        f["label"] for f in PROVIDERS[provider]["fields"]
        if f["required"] and not merged.get(f["name"])
    ]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")

    merged["connected_at"] = existing.get("connected_at") or datetime.now(timezone.utc).isoformat()
    merged["updated_at"] = datetime.now(timezone.utc).isoformat()

    everything[provider] = merged
    await set_setting(db, _KEY, json.dumps(everything), tenant_id=tenant_id)
    return merged


async def delete_connection(db: AsyncSession, provider: str, tenant_id=None) -> bool:
    everything = await _load_all(db, tenant_id)
    if provider not in everything:
        return False
    everything.pop(provider)
    await set_setting(db, _KEY, json.dumps(everything), tenant_id=tenant_id)
    return True


def mask(provider: str, stored: dict | None) -> dict:
    """A connection as the browser may see it — secrets reduced to a hint."""
    if not stored:
        return {"connected": False}
    secret_names = _SECRETS.get(provider, set())
    out: dict[str, Any] = {"connected": True}
    for k, v in stored.items():
        if k in secret_names:
            s = str(v or "")
            out[k] = ""                                   # never echo the secret
            out[f"{k}_hint"] = f"••••{s[-4:]}" if len(s) >= 4 else "••••"
            out[f"{k}_set"] = bool(s)
        else:
            out[k] = v
    return out


async def list_connections(db: AsyncSession, tenant_id=None, category: str | None = None) -> list[dict]:
    """Every provider, each carrying this brand's connection state (masked)."""
    stored = await _load_all(db, tenant_id)
    rows = []
    for key, provider in PROVIDERS.items():
        if category and provider["category"] != category:
            continue
        rows.append({**provider, "connection": mask(key, stored.get(key))})
    return rows


# ── Verification ──────────────────────────────────────────────────────────────
# A provider proves its credentials with a cheap, read-only call, so "Connect"
# can only succeed when the brand's account actually works.
_VERIFIERS: dict[str, Callable[[dict], Awaitable[dict]]] = {}


def verifier(provider: str):
    def _wrap(fn):
        _VERIFIERS[provider] = fn
        return fn
    return _wrap


async def verify(provider: str, values: dict) -> dict:
    """Test a connection. Returns {ok, message, detail?}."""
    fn = _VERIFIERS.get(provider)
    if fn is None:
        return {"ok": True, "message": "Saved (no live test available for this provider)."}
    try:
        return await fn(values)
    except Exception as exc:                     # never leak a stack trace to the admin
        logger.warning("verify %s failed: %s", provider, exc)
        return {"ok": False, "message": str(exc)[:300]}


@verifier("ss_activewear")
async def _verify_ss(values: dict) -> dict:
    """One cheap catalogue read proves the account number and key are good."""
    from app.services.ss_activewear_service import SSActivewearService

    svc = SSActivewearService(values.get("account_number"), values.get("api_key"))
    try:
        rows = await svc.fetch_categories()
        return {
            "ok": True,
            "message": f"Connected to S&S — {len(rows)} categories available.",
        }
    except Exception as exc:
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status in (401, 403):
            return {"ok": False, "message": "S&S rejected these credentials. Check the account number and API key."}
        return {"ok": False, "message": f"Could not reach S&S: {str(exc)[:200]}"}
    finally:
        await svc.close()


@verifier("resend")
async def _verify_resend(values: dict) -> dict:
    """Nothing to authenticate — this is the brand's own settings, not a key."""
    to = (values.get("notify_email") or "").strip()
    if to and "@" not in to:
        return {"ok": False, "message": f"'{to}' doesn't look like an email address."}
    reply = (values.get("reply_to") or "").strip()
    if reply and "@" not in reply:
        return {"ok": False, "message": f"'{reply}' doesn't look like an email address."}
    return {
        "ok": True,
        "message": f"Alerts will go to {to}." if to
                   else "Saved. Add an address to receive your own order and application alerts.",
    }


@verifier("ups")
async def _verify_ups(values: dict) -> dict:
    from app.services.carriers import ups
    return await ups.verify(values)


@verifier("fedex")
async def _verify_fedex(values: dict) -> dict:
    from app.services.carriers import fedex
    return await fedex.verify(values)


@verifier("usps")
async def _verify_usps(values: dict) -> dict:
    from app.services.carriers import usps
    return await usps.verify(values)
