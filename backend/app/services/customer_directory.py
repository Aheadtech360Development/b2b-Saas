"""Everyone who buys from a shop, in one list: accounts and guests.

A shop's customers are of three kinds, told apart by what the data already
says (there is no column for it):

- an ACCOUNT is a company: the buyer signed up, was approved for wholesale, was
  added by the shop, or activated the account a guest checkout made for them.
  It is Retail when its owner signs in as a retail buyer and Wholesale
  otherwise, the rule sign-in itself applies (auth_service), so the list calls
  a buyer what the shop actually treats them as;
- a GUEST is an address that bought without an account. Their orders carry the
  address and no company. Activating the account moves those orders onto it
  (auth.activate_account), and the guest becomes that Retail account.

The totals are counted from the orders: every order counts in "orders", and
the money spent leaves out cancelled and refunded ones.

The list used to read /admin/companies, which belongs to the wholesale toolset:
on a plan without it the whole customer list was locked, retail buyers
included, and guests were never in it at all.
"""
from __future__ import annotations

import json
import uuid
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

KINDS = ("retail", "wholesale", "guest")
STATUSES = ("active", "pending", "suspended", "rejected", "guest")
# How the list may be sorted, and the SQL each means. Only these reach the query.
SORTS: dict[str, str] = {
    "newest": "joined DESC NULLS LAST",
    "oldest": "joined ASC NULLS LAST",
    "spent": "spent DESC",
    "orders": "orders DESC",
    "recent": "last_order DESC NULLS LAST",
    "name": "lower(name) ASC",
}
GUEST_PREFIX = "guest:"
# What "spent" leaves out.
NOT_SPENT = "('cancelled', 'refunded')"

# Every customer of one shop as one row. :t is the shop. Accounts first, then
# one row per guest address, the name the address last ordered under.
_PEOPLE = f"""
WITH spend AS (
    SELECT company_id,
           count(*) AS orders,
           COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS spent,
           max(created_at) AS last_order
    FROM orders
    WHERE tenant_id = CAST(:t AS uuid) AND company_id IS NOT NULL
    GROUP BY company_id
),
head AS (
    SELECT DISTINCT ON (cu.company_id)
           cu.company_id, u.email, u.first_name, u.last_name, u.account_type
    FROM company_users cu JOIN users u ON u.id = cu.user_id
    WHERE cu.tenant_id = CAST(:t AS uuid)
    ORDER BY cu.company_id, (cu.role = 'owner') DESC, cu.is_active DESC, cu.created_at
),
logins AS (
    SELECT cu.company_id, count(*) AS n
    FROM company_users cu JOIN users u ON u.id = cu.user_id
    WHERE cu.tenant_id = CAST(:t AS uuid) AND cu.is_active AND u.is_active
    GROUP BY cu.company_id
),
people AS (
    SELECT CAST(c.id AS text) AS id,
           CASE WHEN h.account_type = 'retail' THEN 'retail' ELSE 'wholesale' END AS kind,
           c.name AS name,
           NULLIF(trim(concat_ws(' ', h.first_name, h.last_name)), '') AS contact,
           COALESCE(NULLIF(h.email, ''), c.company_email) AS email,
           CAST(c.status AS text) AS status,
           COALESCE(l.n, 0) AS logins,
           COALESCE(s.orders, 0) AS orders,
           COALESCE(s.spent, 0) AS spent,
           c.created_at AS joined,
           s.last_order AS last_order
    FROM companies c
    LEFT JOIN head h ON h.company_id = c.id
    LEFT JOIN logins l ON l.company_id = c.id
    LEFT JOIN spend s ON s.company_id = c.id
    WHERE c.tenant_id = CAST(:t AS uuid)
  UNION ALL
    SELECT '{GUEST_PREFIX}' || lower(trim(guest_email)) AS id,
           'guest' AS kind,
           COALESCE((array_agg(trim(guest_name) ORDER BY created_at DESC)
                     FILTER (WHERE NULLIF(trim(guest_name), '') IS NOT NULL))[1],
                    lower(trim(guest_email))) AS name,
           NULL AS contact,
           lower(trim(guest_email)) AS email,
           'guest' AS status,
           0 AS logins,
           count(*) AS orders,
           COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS spent,
           min(created_at) AS joined,
           max(created_at) AS last_order
    FROM orders
    WHERE tenant_id = CAST(:t AS uuid) AND company_id IS NULL
      AND NULLIF(trim(guest_email), '') IS NOT NULL
    GROUP BY lower(trim(guest_email))
)
"""

_WHERE = """
WHERE (:kind = '' OR kind = :kind)
  AND (:status = '' OR status = :status)
  AND (:q = '' OR name ILIKE :like OR email ILIKE :like OR contact ILIKE :like)
"""


def guest_key(email: str) -> str:
    """The id a guest is known by in the list and in the profile's address."""
    return GUEST_PREFIX + (email or "").strip().lower()


def parse_key(key: str) -> tuple[str, Any]:
    """('account', UUID) or ('guest', email) for a customer's id; ValueError
    for anything else."""
    key = (key or "").strip()
    if key.lower().startswith(GUEST_PREFIX):
        email = key[len(GUEST_PREFIX):].strip().lower()
        if "@" not in email:
            raise ValueError("not a customer")
        return "guest", email
    return "account", uuid.UUID(key)


def _filters(q: str | None, kind: str | None, status: str | None) -> dict:
    q = (q or "").strip()
    kind = (kind or "").strip().lower()
    status = (status or "").strip().lower()
    return {
        "q": q,
        "like": f"%{q}%",
        "kind": kind if kind in KINDS else "",
        "status": status if status in STATUSES else "",
    }


def _money(v) -> float:
    """Cents, rounded the way money is (half up), not the way floats are."""
    from decimal import ROUND_HALF_UP, Decimal

    return float(Decimal(str(v or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _iso(v) -> str | None:
    return v.isoformat() if v is not None else None


def _row(m) -> dict:
    return {
        "id": m["id"],
        "kind": m["kind"],
        "name": m["name"],
        "contact": m["contact"],
        "email": m["email"],
        "status": m["status"],
        "logins": int(m["logins"] or 0),
        "orders": int(m["orders"] or 0),
        "spent": _money(m["spent"]),
        "joined": _iso(m["joined"]),
        "last_order": _iso(m["last_order"]),
    }


async def counts(db: AsyncSession, tenant_id) -> dict:
    """How many of each kind, and the orders the totals come from: the tabs'
    numbers, the same rows the list shows."""
    by_kind = {k: 0 for k in KINDS}
    for kind, n in (await db.execute(
        text(_PEOPLE + "SELECT kind, count(*) FROM people GROUP BY kind"), {"t": str(tenant_id)}
    )).all():
        by_kind[kind] = int(n)
    orders = (await db.execute(
        text("SELECT count(*) FROM orders WHERE tenant_id = CAST(:t AS uuid)"), {"t": str(tenant_id)}
    )).scalar() or 0
    return {"all": sum(by_kind.values()), **by_kind, "orders": int(orders)}


async def directory(db: AsyncSession, tenant_id, *, q: str | None = None, kind: str | None = None,
                    status: str | None = None, sort: str | None = None,
                    page: int = 1, page_size: int = 50) -> dict:
    """One page of the list, with the tabs' counts."""
    params = {"t": str(tenant_id), **_filters(q, kind, status)}
    order = SORTS.get((sort or "").strip().lower(), SORTS["newest"])
    page, page_size = max(1, int(page)), max(1, min(int(page_size), 500))
    rows = (await db.execute(
        text(_PEOPLE + "SELECT *, count(*) OVER () AS matched FROM people" + _WHERE
             + f" ORDER BY {order}, id LIMIT :limit OFFSET :offset"),
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    )).mappings().all()
    matched = int(rows[0]["matched"]) if rows else 0
    if not rows and page > 1:
        # A page past the end still says how many there are.
        matched = int((await db.execute(
            text(_PEOPLE + "SELECT count(*) FROM people" + _WHERE), params)).scalar() or 0)
    return {
        "items": [_row(r) for r in rows],
        "total": matched,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-matched // page_size)),
        "counts": await counts(db, tenant_id),
    }


async def everyone(db: AsyncSession, tenant_id, *, q=None, kind=None, status=None, sort=None) -> list[dict]:
    """Every row the filters keep, for the export."""
    params = {"t": str(tenant_id), **_filters(q, kind, status)}
    order = SORTS.get((sort or "").strip().lower(), SORTS["newest"])
    rows = (await db.execute(
        text(_PEOPLE + "SELECT * FROM people" + _WHERE + f" ORDER BY {order}, id"), params,
    )).mappings().all()
    return [_row(r) for r in rows]


# ── One customer ──────────────────────────────────────────────────────────────

_ORDER_COLS = "CAST(id AS text) AS id, order_number, created_at, total, CAST(status AS text) AS status, CAST(payment_status AS text) AS payment_status"


def _order_out(m) -> dict:
    return {
        "id": m["id"],
        "order_number": m["order_number"],
        "created_at": _iso(m["created_at"]),
        "total": _money(m["total"]),
        "status": m["status"],
        "payment_status": m["payment_status"],
    }


def _stats(m) -> dict:
    counted = int(m["counted"] or 0)
    spent = _money(m["spent"])
    return {
        "orders": int(m["orders"] or 0),
        "spent": spent,
        "average": round(spent / counted, 2) if counted else 0.0,
        "last_order": _iso(m["last_order"]),
    }


_STATS_COLS = f"""count(*) AS orders,
    COALESCE(sum(total) FILTER (WHERE status NOT IN {NOT_SPENT}), 0) AS spent,
    count(*) FILTER (WHERE status NOT IN {NOT_SPENT}) AS counted,
    max(created_at) AS last_order"""


def _whose(kind: str) -> str:
    """The orders of one customer: a company's, or a guest address's."""
    if kind == "guest":
        return "tenant_id = CAST(:t AS uuid) AND company_id IS NULL AND lower(trim(guest_email)) = :who"
    return "tenant_id = CAST(:t AS uuid) AND company_id = CAST(:who AS uuid)"


async def orders_of(db: AsyncSession, tenant_id, key: str, *, page: int = 1, page_size: int = 25) -> dict:
    kind, who = parse_key(key)
    params = {"t": str(tenant_id), "who": str(who)}
    page, page_size = max(1, int(page)), max(1, min(int(page_size), 100))
    total = int((await db.execute(
        text(f"SELECT count(*) FROM orders WHERE {_whose(kind)}"), params)).scalar() or 0)
    rows = (await db.execute(text(
        f"SELECT {_ORDER_COLS} FROM orders WHERE {_whose(kind)} "
        "ORDER BY created_at DESC LIMIT :limit OFFSET :offset"),
        {**params, "limit": page_size, "offset": (page - 1) * page_size},
    )).mappings().all()
    return {"items": [_order_out(r) for r in rows], "total": total, "page": page,
            "page_size": page_size, "pages": max(1, -(-total // page_size))}


async def _recent_and_stats(db, tenant_id, kind, who) -> tuple[list[dict], dict]:
    params = {"t": str(tenant_id), "who": str(who)}
    stats = (await db.execute(
        text(f"SELECT {_STATS_COLS} FROM orders WHERE {_whose(kind)}"), params)).mappings().first()
    recent = (await db.execute(text(
        f"SELECT {_ORDER_COLS} FROM orders WHERE {_whose(kind)} ORDER BY created_at DESC LIMIT 5"),
        params)).mappings().all()
    return [_order_out(r) for r in recent], _stats(stats)


ACCOUNT_FIELDS = (
    "trading_name", "tax_id", "tax_id_expiry", "business_type", "secondary_business", "website",
    "company_email", "phone", "fax", "address_line1", "address_line2", "city", "state_province",
    "postal_code", "country", "how_heard", "num_employees", "num_sales_reps",
    "estimated_annual_volume", "ppac_number", "ppai_number", "asi_number",
)


async def account_profile(db: AsyncSession, tenant_id, company_id) -> dict | None:
    """An account: who it is, what it has bought, who signs in for it, its
    notes and the terms it buys on."""
    from sqlalchemy import select

    from app.models.company import Company

    c = (await db.execute(select(Company).where(Company.id == company_id))).scalar_one_or_none()
    if c is None or (tenant_id and str(getattr(c, "tenant_id", "")) != str(tenant_id)):
        return None
    logins = [dict(m) for m in (await db.execute(text("""
        SELECT CAST(u.id AS text) AS user_id, u.first_name, u.last_name, u.email, u.phone,
               u.account_type, CAST(cu.role AS text) AS role,
               (cu.is_active AND u.is_active) AS active,
               (u.hashed_password IS NOT NULL) AS has_password,
               u.last_login, cu.created_at AS added
        FROM company_users cu JOIN users u ON u.id = cu.user_id
        WHERE cu.company_id = CAST(:c AS uuid) AND cu.tenant_id = CAST(:t AS uuid)
        ORDER BY (cu.role = 'owner') DESC, cu.created_at
    """), {"c": str(company_id), "t": str(tenant_id)})).mappings().all()]
    head = logins[0] if logins else None
    recent, stats = await _recent_and_stats(db, tenant_id, "account", company_id)

    tiers = {}
    for table, key in (("pricing_tiers", c.pricing_tier_id), ("shipping_tiers", c.shipping_tier_id)):
        if key:
            name = (await db.execute(
                text(f"SELECT name FROM {table} WHERE id = CAST(:i AS uuid)"), {"i": str(key)})).scalar()
            tiers[table] = {"id": str(key), "name": name}

    return {
        "id": str(c.id),
        "kind": "retail" if head and head["account_type"] == "retail" else "wholesale",
        "name": c.name,
        "status": str(c.status),
        "joined": _iso(c.created_at),
        "contact": ({"name": " ".join(x for x in (head["first_name"], head["last_name"]) if x).strip() or None,
                     "email": head["email"], "phone": head["phone"]} if head else None),
        "email": (head["email"] if head else None) or c.company_email,
        "details": {f: getattr(c, f, None) for f in ACCOUNT_FIELDS},
        "stats": stats,
        "recent_orders": recent,
        "logins": [{
            "user_id": m["user_id"],
            "name": " ".join(x for x in (m["first_name"], m["last_name"]) if x).strip() or None,
            "email": m["email"],
            "role": m["role"],
            "active": bool(m["active"]),
            # Invited and not yet in: no password set.
            "invited": not m["has_password"],
            "last_login": _iso(m["last_login"]),
            "added": _iso(m["added"]),
        } for m in logins],
        "notes": c.admin_notes,
        "tags": list(c.tags or []),
        "terms": {
            "pricing_tier": tiers.get("pricing_tiers"),
            "shipping_tier": tiers.get("shipping_tiers"),
            "shipping_override_amount": (float(c.shipping_override_amount)
                                         if c.shipping_override_amount is not None else None),
            "tax_exempt": bool(c.tax_exempt),
            "net30_enabled": bool(c.net30_enabled),
        },
    }


async def guest_profile(db: AsyncSession, tenant_id, email: str) -> dict | None:
    """A guest: the address, what it ordered under it, and whether the account
    their checkout made is still waiting to be activated."""
    email = (email or "").strip().lower()
    params = {"t": str(tenant_id), "who": email}
    last = (await db.execute(text(f"""
        SELECT guest_name, guest_phone, shipping_address_snapshot, created_at
        FROM orders WHERE {_whose('guest')} ORDER BY created_at DESC LIMIT 1
    """), params)).mappings().first()
    if last is None:
        return None
    first = (await db.execute(text(f"""
        SELECT min(created_at) FROM orders WHERE {_whose('guest')}"""), params)).scalar()
    name = (await db.execute(text(f"""
        SELECT trim(guest_name) FROM orders WHERE {_whose('guest')} AND NULLIF(trim(guest_name), '') IS NOT NULL
        ORDER BY created_at DESC LIMIT 1"""), params)).scalar()
    try:
        address = json.loads(last["shipping_address_snapshot"] or "{}") or {}
    except (ValueError, TypeError):
        address = {}
    waiting = (await db.execute(text("""
        SELECT is_active, activation_token IS NOT NULL AS sent
        FROM users WHERE tenant_id = CAST(:t AS uuid) AND lower(email) = :who
        ORDER BY created_at LIMIT 1"""), params)).mappings().first()
    recent, stats = await _recent_and_stats(db, tenant_id, "guest", email)
    return {
        "id": guest_key(email),
        "kind": "guest",
        "name": name or email,
        "status": "guest",
        "joined": _iso(first),
        "email": email,
        "contact": {"name": name, "email": email, "phone": last["guest_phone"]},
        "address": {k: address.get(k) for k in ("line1", "line2", "city", "state", "postal_code", "country")
                    if address.get(k)} or None,
        "stats": stats,
        "recent_orders": recent,
        "logins": [],
        # The account a guest checkout opens for them, not activated yet.
        "account_waiting": bool(waiting and not waiting["is_active"] and waiting["sent"]),
    }
