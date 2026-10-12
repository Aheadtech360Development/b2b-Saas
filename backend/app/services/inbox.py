"""The Inbox: what a shop's storefront forms sent in (contact_submissions).

A form keeps what the visitor typed under the form's own labels ("Name",
"Your email", "Company name"…), so who wrote and what they said are read out
of those labels here, the same way for every form. A message from the
storefront's "Get a quote" form is a quote request.

A message is new until somebody answers it (a reply sent from the Inbox, or
marked by hand: answered_at) and stays in the Inbox until it is archived
(archived_at). Where the address belongs to a customer, the message says so.
"""
from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

BOXES = ("all", "messages", "quotes", "archived")

# The labels a form may give each part, in the order they are tried.
_NAME = ("name", "full name", "your name", "contact name")
_FIRST, _LAST = ("first name", "firstname"), ("last name", "lastname", "surname")
_EMAIL = ("email", "e-mail", "email address", "your email", "work email")
_PHONE = ("phone", "phone number", "telephone", "mobile", "cell")
_COMPANY = ("company", "company name", "business", "business name", "organization", "organisation")
_MESSAGE = ("message", "your message", "details", "project details", "comments", "comment",
            "notes", "description", "what do you need", "how can we help")


# The storefront's own forms send their fields by name (ThemeWrittenPage); the
# quote form's other fields, said the way a person reads them.
_LABELS = {"product": "What to print", "quantity": "How many", "deadline": "Needed by", "subject": "Subject"}


def _norm(key: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", "", (key or "").strip().lower().replace("_", " ")).strip()


def is_quote(form_name: str | None, page_slug: str | None) -> bool:
    return "quote" in f"{form_name or ''} {page_slug or ''}".lower()


def sender(data: dict[str, Any]) -> dict[str, Any]:
    """Who wrote and what they said, out of a form's own labels. What is left
    over is kept as the other fields, in the order the form gave them."""
    by_key = {_norm(k): (k, str(v).strip()) for k, v in (data or {}).items() if str(v).strip()}
    used: set[str] = set()

    def pick(names) -> str | None:
        for n in names:
            if n in by_key:
                used.add(n)
                return by_key[n][1]
        return None

    name = pick(_NAME)
    if not name:
        first, last = pick(_FIRST), pick(_LAST)
        name = " ".join(x for x in (first, last) if x) or None
    email = pick(_EMAIL)
    if not email:
        # A form that called it something else: the first value that is an address.
        for n, (_, v) in by_key.items():
            if n not in used and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v):
                used.add(n)
                email = v
                break
    phone, company, message = pick(_PHONE), pick(_COMPANY), pick(_MESSAGE)
    others = [{"label": _LABELS.get(n, by_key[n][0]), "value": by_key[n][1]} for n in by_key if n not in used]
    return {
        "name": name,
        "email": email.lower() if email else None,
        "phone": phone,
        "company": company,
        "message": message,
        "fields": others,
    }


def _iso(v) -> str | None:
    return v.isoformat() if v is not None else None


def row(m) -> dict[str, Any]:
    data = m["data"]
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            data = {}
    data = data or {}
    who = sender(data)
    quote = is_quote(m["form_name"], m["page_slug"])
    return {
        "id": str(m["id"]),
        "kind": "quote" if quote else "message",
        "form_name": m["form_name"] or ("Quote request" if quote else "Contact form"),
        "page_slug": m["page_slug"],
        "from": who,
        "data": data,
        "is_read": bool(m["is_read"]),
        "answered_at": _iso(m.get("answered_at")),
        "archived_at": _iso(m.get("archived_at")),
        "created_at": _iso(m["created_at"]),
        "customer": None,
    }


_COLS = "id, page_slug, form_name, data, is_read, answered_at, archived_at, created_at"
_QUOTE_SQL = "(lower(COALESCE(form_name, '') || ' ' || COALESCE(page_slug, '')) LIKE '%quote%')"


def _box_sql(box: str) -> str:
    if box == "archived":
        return "archived_at IS NOT NULL"
    if box == "quotes":
        return f"archived_at IS NULL AND {_QUOTE_SQL}"
    if box == "messages":
        return f"archived_at IS NULL AND NOT {_QUOTE_SQL}"
    return "archived_at IS NULL"


async def counts(db: AsyncSession, tenant_id) -> dict[str, int]:
    """The tabs' numbers, and how many in the Inbox nobody has read."""
    m = (await db.execute(text(f"""
        SELECT count(*) FILTER (WHERE archived_at IS NULL) AS all_,
               count(*) FILTER (WHERE archived_at IS NULL AND NOT {_QUOTE_SQL}) AS messages,
               count(*) FILTER (WHERE archived_at IS NULL AND {_QUOTE_SQL}) AS quotes,
               count(*) FILTER (WHERE archived_at IS NOT NULL) AS archived,
               count(*) FILTER (WHERE archived_at IS NULL AND NOT is_read) AS unread,
               count(*) FILTER (WHERE archived_at IS NULL AND answered_at IS NULL) AS waiting
        FROM contact_submissions WHERE tenant_id = CAST(:t AS uuid)
    """), {"t": str(tenant_id)})).mappings().first()
    return {"all": int(m["all_"] or 0), "messages": int(m["messages"] or 0), "quotes": int(m["quotes"] or 0),
            "archived": int(m["archived"] or 0), "unread": int(m["unread"] or 0), "waiting": int(m["waiting"] or 0)}


async def _customers(db: AsyncSession, tenant_id, emails: set[str]) -> dict[str, dict]:
    """{address: the customer it belongs to}: an account first, then a guest
    who ordered under it."""
    if not emails:
        return {}
    out: dict[str, dict] = {}
    for email, cid, name in (await db.execute(text("""
        SELECT DISTINCT ON (lower(u.email)) lower(u.email), CAST(c.id AS text), c.name
        FROM users u JOIN company_users cu ON cu.user_id = u.id JOIN companies c ON c.id = cu.company_id
        WHERE u.tenant_id = CAST(:t AS uuid) AND c.tenant_id = CAST(:t AS uuid) AND lower(u.email) = ANY(:e)
        ORDER BY lower(u.email), cu.is_active DESC, cu.created_at
    """), {"t": str(tenant_id), "e": list(emails)})).all():
        out[email] = {"kind": "account", "id": cid, "name": name}
    rest = [e for e in emails if e not in out]
    if rest:
        for email, n in (await db.execute(text("""
            SELECT lower(trim(guest_email)), count(*) FROM orders
            WHERE tenant_id = CAST(:t AS uuid) AND company_id IS NULL AND lower(trim(guest_email)) = ANY(:e)
            GROUP BY 1
        """), {"t": str(tenant_id), "e": rest})).all():
            out[email] = {"kind": "guest", "email": email, "orders": int(n)}
    return out


async def listing(db: AsyncSession, tenant_id, box: str = "all", limit: int = 200) -> dict[str, Any]:
    box = box if box in BOXES else "all"
    rows = [row(m) for m in (await db.execute(text(
        f"SELECT {_COLS} FROM contact_submissions WHERE tenant_id = CAST(:t AS uuid) AND {_box_sql(box)} "
        "ORDER BY created_at DESC LIMIT :n"), {"t": str(tenant_id), "n": max(1, min(limit, 500))})).mappings().all()]
    found = await _customers(db, tenant_id, {r["from"]["email"] for r in rows if r["from"]["email"]})
    for r in rows:
        r["customer"] = found.get(r["from"]["email"] or "")
    c = await counts(db, tenant_id)
    return {"items": rows, "counts": c, "unread": c["unread"], "box": box}


async def one(db: AsyncSession, tenant_id, submission_id) -> dict[str, Any] | None:
    m = (await db.execute(text(
        f"SELECT {_COLS} FROM contact_submissions WHERE tenant_id = CAST(:t AS uuid) AND id = CAST(:i AS uuid)"),
        {"t": str(tenant_id), "i": str(submission_id)})).mappings().first()
    if m is None:
        return None
    r = row(m)
    if r["from"]["email"]:
        r["customer"] = (await _customers(db, tenant_id, {r["from"]["email"]})).get(r["from"]["email"])
    return r


def reply_html(body: str) -> str:
    """What the admin typed, as mail: their words, escaped, paragraph by paragraph."""
    from html import escape

    paras = [p.strip() for p in re.split(r"\n\s*\n", body or "") if p.strip()]
    return "".join(f"<p style='font-size:14px;line-height:1.6;color:#222;margin:0 0 12px'>{escape(p).replace(chr(10), '<br>')}</p>"
                   for p in paras)
