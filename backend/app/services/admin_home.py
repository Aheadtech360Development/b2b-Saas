"""The admin's Home page: what needs the shop today, in one answer.

Computed from the shop's own tables. Every number that points at the order
list is counted from a named queue (services/order_queues) and its button
opens that same queue, so the number and the rows behind it cannot disagree.
The rest (print jobs, returns, stock, suppliers) comes from the briefing the
copilot reads, so the two do not tell the shop different things.

Each part runs on its own: one that fails leaves its place empty rather than
taking the page with it.
"""
from __future__ import annotations

import json
import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_settings import scoped_key
from app.models.company import Company
from app.models.order import Order
from app.services import order_queues
from app.services.copilot.briefing import build_briefing

logger = logging.getLogger(__name__)

# What each thing to do is called once its count is in the tile beside it, and
# what its button says: (one, several, button for one, button for several).
# They are shown in the order they are written here: what a customer has paid
# for and is waiting on comes before the shop's own upkeep.
NEEDS: dict[str, tuple[str, str, str, str]] = {
    "to_ship": ("Paid order to ship", "Paid orders to ship", "Open order", "Open ship queue"),
    "print_jobs_review": ("Artwork waiting for review", "Artwork waiting for review", "Review artwork", "Review artwork"),
    "supplier_orders_failed": ("Order not placed with the supplier", "Orders not placed with the supplier", "Open suppliers", "Open suppliers"),
    "new": ("Order to confirm", "Orders to confirm", "Confirm order", "Confirm orders"),
    "pickups": ("Pickup order to hand over", "Pickup orders to hand over", "Open order", "Open pickups"),
    "returns_pending": ("Return to review", "Returns to review", "Review return", "Review returns"),
    "account_approvals": ("Wholesale account to approve", "Wholesale accounts to approve", "Review account", "Review accounts"),
    "unpaid": ("Unpaid order", "Unpaid orders", "Open order", "See unpaid orders"),
    "print_jobs_revision_stale": ("Revision with no reply", "Revisions with no reply", "Open print jobs", "Open print jobs"),
    "low_stock": ("Variant low on stock", "Variants low on stock", "Open inventory", "Open inventory"),
    "abandoned_carts": ("Abandoned cart this week", "Abandoned carts this week", "Open carts", "Open carts"),
    "supplier_sync_failed": ("Supplier sync did not finish", "Supplier sync did not finish", "Open suppliers", "Open suppliers"),
}
ORDER = {key: i for i, key in enumerate(NEEDS)}
# The briefing counts these three its own way (drafts included, late orders
# only); Home counts them from the queue its button opens.
FROM_QUEUES = ("ship_risk", "new_orders", "unpaid_orders")
LINKS = {"account_approvals": "/admin/customers/applications"}

# Left to right. All but the second are orders; the second is print jobs,
# because artwork is approved job by job on the Production screen.
PIPELINE = (("new", "New"), ("artwork", "Awaiting artwork"), ("production", "In production"),
            ("ready", "Ready to ship"), ("shipped", "Shipped"))


def _money(v: Any) -> float:
    return float(Decimal(str(v or 0)).quantize(Decimal("0.01")))


def _listed(names: list[str], total: int) -> str:
    """ "1043", "1043 and 1042", "1043, 1042 and 5 more". """
    if not names:
        return ""
    if total <= 1 or len(names) == 1:
        return names[0]
    if total == 2:
        return f"{names[0]} and {names[1]}"
    return f"{names[0]}, {names[1]} and {total - 2} more"


def _waited(hours: float) -> str:
    if hours < 1:
        return "less than an hour"
    if hours < 36:
        n = round(hours)
        return f"{n} hour{'s' if n != 1 else ''}"
    return f"{round(hours / 24)} days"


async def _order_need(db: AsyncSession, queue: str, severity: str, tail: str, tail_one: str | None = None) -> dict | None:
    """A row for a queue of orders: how many, the ones waiting longest by
    number, and the list that shows exactly them. One order is named and its
    button opens that order."""
    total = await order_queues.count(db, queue)
    if not total:
        return None
    first = await order_queues.oldest(db, queue, 2)
    if total == 1 and first:
        o, name = first[0]
        who = name or o.guest_name or o.guest_email or "a guest"
        return {"key": queue, "severity": severity, "count": 1,
                "detail": f"Order {o.order_number} from {who}, ${_money(o.total):,.2f}. {tail_one or tail}",
                "href": f"/admin/orders/{o.id}"}
    return {"key": queue, "severity": severity, "count": total,
            "detail": f"{_listed([o.order_number for o, _ in first], total)}. {tail}",
            "href": f"/admin/orders?queue={queue}"}


async def _needs(db: AsyncSession) -> tuple[list[dict], dict]:
    brief = await build_briefing(db)
    now = datetime.now(UTC)
    rows = [dict(it) for it in brief["items"] if it["key"] not in FROM_QUEUES]

    async def to_ship():
        total = await order_queues.count(db, "to_ship")
        late = await order_queues.count(db, "late") if total else 0
        tail = "No shipping label bought."
        if late and late == total:
            tail += " All placed more than three days ago."
        elif late:
            tail += f" {late} of them placed more than three days ago."
        return await _order_need(db, "to_ship", "urgent" if late else "attention", tail,
                                 "No shipping label bought." + (" Placed more than three days ago." if late else ""))

    async def new():
        return await _order_need(db, "new", "attention", "Still Pending.")

    async def pickups():
        return await _order_need(db, "pickups", "info", "Will Call. No shipping label needed.")

    async def unpaid():
        owed = (await db.execute(
            select(func.coalesce(func.sum(Order.total - func.coalesce(Order.amount_paid, 0)), 0))
            .where(*order_queues.conditions("unpaid"))
        )).scalar_one()
        return await _order_need(db, "unpaid", "attention",
                                 f"${_money(owed):,.2f} still to collect, delivered orders on terms included.",
                                 "Not paid in full yet.")

    for fn in (to_ship, new, pickups, unpaid):
        try:
            row = await fn()
            if row:
                rows.append(row)
        except Exception as exc:  # noqa: BLE001  (the other rows still stand)
            logger.warning("home: %s failed: %s", fn.__name__, exc)
            await db.rollback()

    # Artwork: which jobs, and how long the first customer has been waiting.
    for row in rows:
        if row["key"] != "print_jobs_review":
            continue
        try:
            from app.api.v1.gang_sheets import STATUS_IN_REVIEW, GangSheetOrder

            since = func.coalesce(GangSheetOrder.paid_at, GangSheetOrder.created_at)
            jobs = (await db.execute(
                select(GangSheetOrder).where(GangSheetOrder.status == STATUS_IN_REVIEW).order_by(since.asc()).limit(2)
            )).scalars().all()
            if not jobs:
                continue
            g = jobs[0]
            hours = (now - (g.paid_at or g.created_at)).total_seconds() / 3600
            row["severity"] = "urgent" if hours >= 24 else "attention"
            if row["count"] == 1:
                feet = float(g.sheet_height_in or 0) / 12
                length = f"{feet:g} ft" if feet >= 1 else f"{float(g.sheet_height_in or 0):g} in"
                what = "gang sheet" if g.sheet_size_id else "upload by size"
                row["detail"] = (f"{g.reference}, {what}, {length}, ${_money(g.subtotal):,.2f}. "
                                 f"Customer has waited {_waited(hours)}.")
            else:
                row["detail"] = (f"{_listed([j.reference for j in jobs], row['count'])}. Paid, and cannot print until "
                                 f"approved. The first has waited {_waited(hours)}.")
        except Exception as exc:  # noqa: BLE001  (the briefing's wording stands)
            logger.warning("home: naming the artwork failed: %s", exc)
            await db.rollback()

    out = []
    for it in rows:
        key, count = it["key"], int(it.get("count") or 0)
        title = it.get("title") or ""
        one, several, do_one, do_many = NEEDS.get(key, (title, title, "Open", "Open"))
        out.append({
            "key": key, "severity": it["severity"], "count": count,
            "label": one if count == 1 else several,
            "detail": it.get("detail") or "",
            "action": do_one if count == 1 else do_many,
            "href": LINKS.get(key, it.get("href") or "/admin/orders"),
        })
    out.sort(key=lambda r: ORDER.get(r["key"], len(ORDER)))
    return out, brief["pulse"]


async def _pipeline(db: AsyncSession) -> list[dict]:
    """Where the shop's work stands, left to right.

    An order that is still moving is in one of the four order stages, or, when
    it has been accepted and a print job on it is not approved yet, in none of
    them: its job is counted under "Awaiting artwork" instead.
    """
    artwork = 0
    try:
        from app.api.v1.gang_sheets import STATUS_IN_REVIEW, STATUS_REVISION, GangSheetOrder

        artwork = (await db.execute(
            select(func.count(GangSheetOrder.id)).where(GangSheetOrder.status.in_((STATUS_IN_REVIEW, STATUS_REVISION)))
        )).scalar_one() or 0
    except Exception as exc:  # noqa: BLE001
        logger.warning("home: artwork count failed: %s", exc)
        await db.rollback()
    out = []
    for key, label in PIPELINE:
        if key == "artwork":
            out.append({"key": key, "label": label, "count": int(artwork), "href": "/admin/production"})
        else:
            out.append({"key": key, "label": label, "count": await order_queues.count(db, key),
                        "href": f"/admin/orders?queue={key}"})
    return out


async def _sales(db: AsyncSession) -> dict[str, dict]:
    """Sales the way Reports counts them: every order not cancelled or refunded."""
    now = datetime.now(UTC)
    out: dict[str, dict] = {}
    for key, since in (("7d", now - timedelta(days=7)), ("30d", now - timedelta(days=30)), ("all", None)):
        stmt = select(func.count(Order.id), func.coalesce(func.sum(Order.total), 0)).where(
            Order.status.notin_(("cancelled", "refunded")), order_queues.real())
        if since is not None:
            stmt = stmt.where(Order.created_at >= since)
        count, total = (await db.execute(stmt)).one()
        count, total = int(count or 0), _money(total)
        out[key] = {"total": total, "orders": count, "average": _money(total / count) if count else 0.0}
    return out


async def sales_for(db: AsyncSession, tenant_id: Any, range_key: str, *, date_from: str | None = None,
                    date_to: str | None = None, utc_offset: int = 0) -> dict:
    """Home's Sales for any stretch of days on the viewer's clock: the money
    and orders as Reports counts them, beside the shop's visits (sessions) and
    how many of those placed an order (conversion rate, services/visits).
    ValueError for a custom range that is not two dates."""
    from app.services import visits
    from app.services.report_view import _totals as report_totals
    from app.services.report_view import span as report_span

    s = report_span(range_key, date_from=date_from, date_to=date_to, offset_minutes=utc_offset)
    money = await report_totals(db, tenant_id, s)
    try:
        async with db.begin_nested():
            seen = await visits.stats(db, tenant_id, s.start, s.end)
    except Exception as exc:  # noqa: BLE001  (the money still shows)
        logger.warning("home: visits failed: %s", exc)
        seen = {"sessions": None, "converted": None, "conversion_rate": None, "counted_since": None}
    return {
        "range": range_key,
        "from": None if range_key == "all" else s.first.isoformat(),
        "to": s.last.isoformat(),
        "total": money["revenue"], "orders": money["orders"], "average": money["average"],
        "sessions": seen["sessions"], "converted_sessions": seen["converted"],
        "conversion_rate": seen["conversion_rate"], "counted_since": seen["counted_since"],
    }


async def _recent_orders(db: AsyncSession, limit: int = 5) -> list[dict]:
    rows = (await db.execute(
        select(Order, Company.name).outerjoin(Company, Order.company_id == Company.id)
        .where(order_queues.real()).order_by(Order.created_at.desc()).limit(limit)
    )).all()
    return [{
        "id": str(o.id), "order_number": o.order_number,
        "customer": name or o.guest_name or o.guest_email or "Guest",
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "total": _money(o.total), "status": o.status, "payment_status": o.payment_status,
    } for o, name in rows]


async def carrier_names(db: AsyncSession, tenant_id: Any) -> list[str]:
    """The carriers this shop can buy a label from: its own UPS, FedEx or USPS
    accounts, or Shippo. Empty when there is none, which is when rates cannot
    load and a label cannot be bought."""
    from app.services import integrations_service as integrations

    found = await integrations.list_connections(db, tenant_id=tenant_id, category="carrier")
    names = [str(p.get("name") or p.get("provider")) for p in found if (p.get("connection") or {}).get("connected")]
    if names:
        return names
    own_key = (await db.execute(text("SELECT value FROM settings WHERE key = :k"),
                                {"k": scoped_key("shippo_api_key", tenant_id)})).scalar()
    return ["Shippo"] if own_key else []


async def _checklist(db: AsyncSession, tenant_id: Any, user_id: Any) -> list[dict]:
    """What a shop sets up once before it takes real orders. Each step is read
    from where that thing is actually kept, so "Done" means it is done."""
    steps: list[dict] = []

    async def step(key: str, title: str, href: str, check) -> None:
        done, detail = False, ""
        try:
            done, detail = await check()
        except Exception as exc:  # noqa: BLE001  (shown as not done rather than hidden)
            logger.warning("home: checklist %s failed: %s", key, exc)
            await db.rollback()
        steps.append({"key": key, "title": title, "detail": detail, "done": bool(done), "href": href})

    async def setting(key: str) -> Any:
        raw = (await db.execute(text("SELECT value FROM settings WHERE key = :k"),
                                {"k": scoped_key(key, tenant_id)})).scalar()
        try:
            return json.loads(raw) if isinstance(raw, str) and raw[:1] in "{[" else raw
        except Exception:  # noqa: BLE001
            return raw

    async def payouts():
        from app.services.connect_service import ConnectService

        s = await ConnectService(db).get_status(str(tenant_id))
        charges, paid_out = bool(s.get("charges_enabled")), bool(s.get("payouts_enabled"))
        if charges and paid_out:
            return True, "Stripe charges and payouts are on"
        if charges:
            return False, "Charges are on, payouts are not yet"
        return False, "Stripe is not connected, so cards cannot be taken"

    async def carrier():
        names = await carrier_names(db, tenant_id)
        if names:
            return True, ", ".join(names) + " connected"
        return False, "UPS, FedEx and USPS are not connected"

    async def email():
        from app.services import integrations_service as integrations

        cfg = await integrations.get_connection(db, "resend", tenant_id=tenant_id) or {}
        address = str(cfg.get("notify_email") or "").strip()
        return (True, f"Replies and alerts go to {address}") if address else (False, "No shop email set")

    async def domain():
        from app.services import brand_domain

        d = await brand_domain.get(db, tenant_id)
        host = d.get("domain")
        # Whether its DNS has caught up is a live lookup, made by the page.
        return False, (f"{host}: waiting for DNS" if host else "Using the address the platform gave you")

    async def taxes():
        mode = await setting("tax_mode")
        if isinstance(mode, str) and mode.strip():
            words = {"auto": "Looked up for each address", "manual": "Your own rates", "none": "No tax charged"}
            return True, words.get(mode.strip(), mode.strip())
        return False, "Not chosen yet"

    async def ship_from():
        s = await setting("ship_from")
        street = str((s or {}).get("street1") or "").strip() if isinstance(s, dict) else ""
        return (True, street) if street else (False, "Rates and labels need where parcels leave from")

    async def two_factor():
        on = (await db.execute(text("SELECT two_factor_enabled FROM users WHERE id = :u"), {"u": str(user_id)})).scalar()
        return bool(on), ("On for your sign-in" if on else "")

    # A shop that signed up through the setup steps and left them part way:
    # the way back to them ("You can finish later from Home"). A shop set up
    # before the steps existed has no progress saved and is never asked.
    try:
        from app.services import onboarding

        if await onboarding.unfinished(db, tenant_id):
            steps.append({
                "key": "setup", "title": "Finish setting up your store",
                "detail": "Your business, logo, products, payments and shipping, in five short steps.",
                "done": False, "href": "/onboarding",
            })
    except Exception as exc:  # noqa: BLE001  (Home still opens without it)
        logger.warning("home: setup step failed: %s", exc)
        await db.rollback()

    await step("payouts", "Connect payouts", "/admin/billing", payouts)
    await step("carrier", "Connect a shipping carrier", "/admin/standard-shipping", carrier)
    await step("email", "Connect email notifications", "/admin/settings", email)
    await step("domain", "Verify your domain", "/admin/settings", domain)
    await step("taxes", "Set up taxes", "/admin/settings/taxes", taxes)
    await step("ship_from", "Add your ship-from address", "/admin/standard-shipping", ship_from)
    await step("two_factor", "Turn on two-factor sign-in", "/admin/settings/security", two_factor)
    return steps


async def build_home(db: AsyncSession, tenant_id: Any, user_id: Any) -> dict:
    out: dict[str, Any] = {"generated_at": datetime.now(UTC).isoformat()}

    async def part(name: str, fn, empty) -> None:
        try:
            out[name] = await fn()
        except Exception as exc:  # noqa: BLE001
            logger.warning("home: %s failed: %s", name, exc)
            out[name] = empty
            try:
                await db.rollback()
            except Exception:  # noqa: BLE001
                pass

    try:
        out["needs"], out["pulse"] = await _needs(db)
    except Exception as exc:  # noqa: BLE001
        logger.warning("home: needs failed: %s", exc)
        out["needs"], out["pulse"] = [], {}
        await db.rollback()
    await part("pipeline", lambda: _pipeline(db), [])
    await part("sales", lambda: _sales(db), {})
    await part("recent_orders", lambda: _recent_orders(db), [])
    await part("checklist", lambda: _checklist(db, tenant_id, user_id), [])
    return out
