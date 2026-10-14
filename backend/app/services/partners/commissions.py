"""Commission from Stripe.

The platform's own billing events, a brand paying for its plan, read after
the webhook has settled the brand's billing and in a transaction of their
own. A problem here never undoes or fails what the webhook did for the shop:
it is recorded on Stripe events, retried on its own, and can be retried by
hand.

  invoice.paid                   a commission line, one per invoice, inside the referral's earning period
  invoice.payment_failed         noted; nothing earns until the invoice is paid
  charge.refunded                a minus line for the refunded share, inside the clawback window
  charge.dispute.created         a minus line for the disputed share, inside the clawback window
  customer.subscription.updated  a plan change, noted; the new base reaches the next invoice
  customer.subscription.deleted  the referral ends, and comes back if the shop pays again in time

Events from a brand's connected account (its customers' orders) carry
`account` and are never read here. Only events from the Stripe world the
platform is in earn: a test payment never becomes a live partner's money.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

import stripe
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.billing_plans import BILLING_PLANS
from app.services.partners import activity, ledger, program
from app.services.partners import db as pdb

logger = logging.getLogger(__name__)

HANDLED = frozenset({
    "invoice.paid",
    "invoice.payment_failed",
    "charge.refunded",
    "charge.dispute.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
})
# A failed event is retried on its own until it has been tried this many times.
MAX_ATTEMPTS = 4
OTHER_WORLD = "Event from the other Stripe mode; it earns nothing here"


@dataclass(frozen=True)
class Outcome:
    result: str              # line_created | replay_ignored | ignored | payment_failed
                             # | plan_updated | clawback_created | referral_ended
    detail: str
    shop_tenant_id: str | None = None
    partner_id: str | None = None


def _id(value: Any) -> str | None:
    if not value:
        return None
    return value if isinstance(value, str) else (value.get("id") if isinstance(value, dict) else None)


def _plain(obj: Any) -> Any:
    """A Stripe object as plain JSON data."""
    if isinstance(obj, stripe.StripeObject):
        return json.loads(str(obj))
    return obj


async def _stripe(db: AsyncSession):
    from app.services import stripe_mode

    stripe.api_key = await stripe_mode.secret_key(db)
    return stripe


async def _same_world(db: AsyncSession, event: dict) -> bool:
    from app.services import stripe_mode

    return bool(event.get("livemode")) == (await stripe_mode.current(db) == stripe_mode.LIVE)


def _paid_at(invoice: dict, event: dict) -> datetime:
    ts = (invoice.get("status_transitions") or {}).get("paid_at") or event.get("created")
    return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc)


def _happened_at(event: dict) -> datetime:
    """When Stripe says the event happened, not when it was read: a retried
    event is judged by the day of the refund, not of the retry."""
    ts = event.get("created")
    return datetime.fromtimestamp(int(ts), tz=timezone.utc) if ts else datetime.now(timezone.utc)


def _date_words(at: datetime) -> str:
    return f"{at:%b} {at.day}, {at.year}"


# ── Who an event is about ─────────────────────────────────────────────────────

async def _shop_for(db: AsyncSession, *, subscription_id: str | None, customer_id: str | None,
                    metadata: dict | None) -> str | None:
    """The brand a subscription, customer or metadata names."""
    if subscription_id:
        row = (await db.execute(text(
            "SELECT tenant_id FROM tenant_subscriptions WHERE stripe_subscription_id = :s"
        ), {"s": subscription_id})).first()
        if row:
            return str(row[0])
    if customer_id:
        row = (await db.execute(text(
            "SELECT tenant_id FROM tenant_subscriptions WHERE stripe_customer_id = :c"
        ), {"c": customer_id})).first()
        if row:
            return str(row[0])
    tid = (metadata or {}).get("tenant_id")
    if tid:
        try:
            uuid.UUID(str(tid))
        except ValueError:
            return None
        row = (await db.execute(text("SELECT id FROM tenants WHERE id = CAST(:t AS uuid)"), {"t": str(tid)})).first()
        if row:
            return str(row[0])
    return None


async def _referral(db: AsyncSession, tenant_id: str, *, lock: bool = False) -> dict | None:
    row = (await db.execute(text(f"""
        SELECT r.id, r.partner_id, r.status, r.flags, r.attributed_at, r.ended_at, r.earn_until, r.shop_name,
               p.status AS partner_status, p.name AS partner_name,
               p.custom_rate_bps, p.custom_rate_ends_on, p.terms_version AS partner_terms,
               rp.rate_bps AS plan_rate_bps
          FROM partner_referrals r
          JOIN partners p ON p.id = r.partner_id
          JOIN partner_rate_plans rp ON rp.id = p.rate_plan_id
         WHERE r.shop_tenant_id = CAST(:t AS uuid)
         {"FOR UPDATE OF r" if lock else ""}
    """), {"t": tenant_id})).mappings().first()
    return dict(row) if row else None


# ── Which lines are a plan ────────────────────────────────────────────────────

async def _plan_resolver(db: AsyncSession, lines: list[dict]):
    """A lookup from a line's price to the plan it is.

    By the price ids the platform saved (app_settings), else by the price's
    lookup key or its plan_key metadata, asked of Stripe once per price when
    the payload does not carry the price itself. An older price that a plan
    has since moved off still says which plan it was in its metadata.
    """
    rows = (await db.execute(text(
        "SELECT key, value FROM app_settings WHERE key LIKE 'stripe_price_%'"
    ))).all()
    known = {r[1]: r[0][len("stripe_price_"):] for r in rows if r[1]}
    by_lookup = {p["lookup_key"]: k for k, p in BILLING_PLANS.items()}
    resolved: dict[str, str | None] = {}
    for line in lines:
        pid, pobj = ledger.line_price(line)
        if not pid or pid in resolved:
            continue
        key = known.get(pid)
        if key is None and pobj:
            key = by_lookup.get(pobj.get("lookup_key")) or (pobj.get("metadata") or {}).get("plan_key")
        if key is None:
            try:
                s = await _stripe(db)
                price = _plain(s.Price.retrieve(pid))
                key = by_lookup.get(price.get("lookup_key")) or (price.get("metadata") or {}).get("plan_key")
            except Exception as exc:  # noqa: BLE001
                logger.warning("partner commission: could not read price %s: %s", pid, exc)
                key = None
        resolved[pid] = key if key in BILLING_PLANS else None
    return lambda pid, pobj: resolved.get(pid or "")


async def _lines_of(db: AsyncSession, invoice: dict) -> list[dict]:
    """Every line of the invoice. A webhook carries the first page only."""
    page = invoice.get("lines") or {}
    lines = list(page.get("data") or [])
    if page.get("has_more") and invoice.get("id"):
        s = await _stripe(db)
        lines = [_plain(x) for x in s.Invoice.list_lines(invoice["id"], limit=100).auto_paging_iter()]
    return lines


# ── invoice.paid ──────────────────────────────────────────────────────────────

async def _invoice_paid(db: AsyncSession, event: dict, same_world: bool) -> Outcome | None:
    inv = event["data"]["object"]
    shop = await _shop_for(db, subscription_id=ledger.subscription_id_of(inv),
                           customer_id=_id(inv.get("customer")),
                           metadata=ledger.subscription_metadata_of(inv))
    if not shop:
        return None
    ref = await _referral(db, shop, lock=True)
    if not ref:
        return None
    pid = str(ref["partner_id"])

    def ignored(why: str) -> Outcome:
        return Outcome("ignored", why, shop, pid)

    if not same_world:
        return ignored(OTHER_WORLD)
    settings = await program.load(db)
    if ref["status"] == "excluded":
        return ignored("Excluded from commission")
    if not settings["earning"]:
        return ignored("Earning is switched off")
    if ref["partner_status"] == "terminated":
        return ignored("Partner terminated")

    paid_at = _paid_at(inv, event)
    # The earning period the referral was made under, kept on it (program.earn_until).
    if ref["earn_until"] and paid_at > ref["earn_until"]:
        return ignored(f"Paid after the referral's earning period ended on {_date_words(ref['earn_until'])}")
    if ref["ended_at"]:
        away = (paid_at - ref["ended_at"]).days
        if away > settings["return_window_days"]:
            return ignored(f"Came back after {away} days, past the {settings['return_window_days']}-day window")
        await db.execute(text(
            "UPDATE partner_referrals SET ended_at = NULL, updated_at = now() WHERE id = :id"
        ), {"id": ref["id"]})
        await activity.log(db, action="shop_returned", actor_kind="stripe", partner_id=pid,
                           subject_kind="referral", subject_id=ref["id"],
                           after={"shop": ref["shop_name"], "days_away": away})

    lines = await _lines_of(db, inv)
    plan_for = await _plan_resolver(db, lines)
    earning = ledger.invoice_earning(inv, lines, plan_for, set(settings["commissionable_plans"]))
    if earning.base_cents <= 0:
        return ignored(earning.reason)

    rate, rate_source = program.effective_rate(
        ref["plan_rate_bps"], ref["custom_rate_bps"], ref["custom_rate_ends_on"], paid_at.date())
    amount = ledger.commission_cents(earning.base_cents, rate)

    status, hold = "open", None
    if ref["status"] == "review":
        status, hold = "held", "Possible self referral"
    elif ref["partner_status"] == "suspended":
        status, hold = "held", "Partner suspended"
    else:
        # New terms are accepted to keep earning on referrals made after them.
        # Earlier referrals keep earning on the terms they were made under.
        terms = await program.latest_terms(db)
        if terms and (ref["partner_terms"] or 0) < terms["version"] \
                and ref["attributed_at"] >= terms["published_at"]:
            status, hold = "held", "Terms not accepted"

    line_id = (await db.execute(text("""
        INSERT INTO partner_commission_lines
            (partner_id, referral_id, shop_tenant_id, kind, stripe_invoice_id, stripe_payment_ref,
             plan_key, base_cents, rate_bps, amount_cents, currency, status, hold_reason,
             earned_at, payable_on, livemode, created_by)
        VALUES (:p, :r, CAST(:t AS uuid), 'commission', :inv, :pay, :plan, :base, :rate, :amount,
                :cur, :status, :hold, :earned, :payable, :live, 'stripe')
        ON CONFLICT (stripe_invoice_id) WHERE kind = 'commission' DO NOTHING
        RETURNING id
    """), {
        "p": pid, "r": ref["id"], "t": shop, "inv": inv.get("id"),
        "pay": ledger.payment_ref_of(inv), "plan": earning.plan_key,
        "base": earning.base_cents, "rate": rate, "amount": amount,
        "cur": (inv.get("currency") or "usd")[:3], "status": status, "hold": hold,
        "earned": paid_at, "payable": paid_at.date() + timedelta(days=settings["hold_days"]),
        "live": bool(event.get("livemode")),
    })).scalar()
    if not line_id:
        return Outcome("replay_ignored", "Invoice already has a line", shop, pid)

    await activity.log(db, action="line_created", actor_kind="stripe", partner_id=pid,
                       subject_kind="line", subject_id=line_id, after={
                           "shop": ref["shop_name"], "invoice": inv.get("id"), "plan": earning.plan_key,
                           "base_cents": earning.base_cents, "rate_bps": rate, "rate_from": rate_source,
                           "amount_cents": amount, "status": status, "hold_reason": hold})
    detail = f"{program.plan_name(earning.plan_key)} base fee, one line"
    return Outcome("line_created", f"{detail}, held: {hold}" if hold else detail, shop, pid)


# ── Refunds and disputes ──────────────────────────────────────────────────────

_LINE_COLUMNS = """id, partner_id, referral_id, shop_tenant_id, stripe_invoice_id, plan_key,
                   base_cents, rate_bps, amount_cents, status, hold_reason, livemode, earned_at"""


async def _line_by_invoice(db: AsyncSession, invoice_id: str) -> dict | None:
    row = (await db.execute(text(f"""
        SELECT {_LINE_COLUMNS} FROM partner_commission_lines
         WHERE kind = 'commission' AND stripe_invoice_id = :i FOR UPDATE
    """), {"i": invoice_id})).mappings().first()
    return dict(row) if row else None


async def _invoice_for_payment(db: AsyncSession, payment_intent: str) -> str | None:
    """Which invoice a payment paid. Since Stripe's 2025 API a charge no
    longer says, and Invoice Payments is where the link lives."""
    try:
        s = await _stripe(db)
        found = _plain(s.InvoicePayment.list(
            payment={"type": "payment_intent", "payment_intent": payment_intent}, limit=1))
        data = found.get("data") or []
        return _id(data[0].get("invoice")) if data else None
    except Exception as exc:  # noqa: BLE001
        logger.warning("partner commission: no invoice found for %s: %s", payment_intent, exc)
        return None


async def _line_for_payment(db: AsyncSession, *, invoice_id: str | None, payment_intent: str | None,
                            charge_id: str | None, customer_id: str | None) -> dict | None:
    """The commission line a refunded or disputed payment earned, locked."""
    if customer_id:
        # Most platform refunds are not a referred shop's. Known for certain
        # from the customer, it costs nothing to stop here.
        shop = await _shop_for(db, subscription_id=None, customer_id=customer_id, metadata=None)
        if shop and not await _referral(db, shop):
            return None
    if invoice_id:
        line = await _line_by_invoice(db, invoice_id)
        if line:
            return line
    refs = [r for r in (payment_intent, charge_id) if r]
    if refs:
        row = (await db.execute(text(f"""
            SELECT {_LINE_COLUMNS} FROM partner_commission_lines
             WHERE kind = 'commission' AND stripe_payment_ref = ANY(CAST(:refs AS varchar[])) FOR UPDATE
        """), {"refs": refs})).mappings().first()
        if row:
            return dict(row)
    if payment_intent and not invoice_id:
        found = await _invoice_for_payment(db, payment_intent)
        if found:
            return await _line_by_invoice(db, found)
    return None


async def _take_back(db: AsyncSession, line: dict, *, reversed_total: int, paid: int,
                     source_ref: str, what: str, payment_ref: str | None,
                     same_world: bool, at: datetime) -> Outcome:
    shop = str(line["shop_tenant_id"]) if line["shop_tenant_id"] else None
    pid = str(line["partner_id"])
    if not same_world:
        return Outcome("ignored", OTHER_WORLD, shop, pid)
    if line["status"] == "void":
        return Outcome("ignored", "The line was already void", shop, pid)
    # Past the program's clawback window (0 is none) the commission stays earned.
    window = (await program.load(db))["clawback_window_days"]
    if window and at - line["earned_at"] > timedelta(days=window):
        return Outcome("ignored", f"{what} more than {window} days after the commission was earned, "
                                  "past the clawback window; nothing is taken back", shop, pid)
    taken = (await db.execute(text("""
        SELECT COALESCE(-SUM(amount_cents), 0), COALESCE(-SUM(base_cents), 0)
          FROM partner_commission_lines
         WHERE reverses_line_id = :id AND kind = 'clawback' AND status <> 'void'
    """), {"id": line["id"]})).first()
    amount, base = ledger.clawback_due(
        line_amount=int(line["amount_cents"]), line_base=int(line["base_cents"]),
        refunded=reversed_total, paid=paid, taken_amount=int(taken[0]), taken_base=int(taken[1]))
    if amount <= 0:
        return Outcome("ignored", "Already taken back", shop, pid)

    # A clawback of a line still on hold waits with it: taking money back for
    # a line that may never be paid would charge the partner twice.
    held = line["status"] == "held"
    now = datetime.now(timezone.utc)
    clawback_id = (await db.execute(text("""
        INSERT INTO partner_commission_lines
            (partner_id, referral_id, shop_tenant_id, kind, stripe_invoice_id, stripe_payment_ref,
             source_ref, plan_key, base_cents, rate_bps, amount_cents, status, hold_reason,
             earned_at, payable_on, reverses_line_id, livemode, created_by)
        VALUES (:p, :r, CAST(:t AS uuid), 'clawback', :inv, :pay, :src, :plan, :base, :rate,
                :amount, :status, :hold, :now, :today, :rev, :live, 'stripe')
        ON CONFLICT (source_ref) WHERE source_ref IS NOT NULL DO NOTHING
        RETURNING id
    """), {
        "p": pid, "r": line["referral_id"], "t": shop, "inv": line["stripe_invoice_id"],
        "pay": payment_ref, "src": source_ref, "plan": line["plan_key"], "base": -base,
        "rate": line["rate_bps"], "amount": -amount, "status": "held" if held else "open",
        "hold": line["hold_reason"] if held else None, "now": now, "today": now.date(),
        "rev": line["id"], "live": line["livemode"],
    })).scalar()
    if not clawback_id:
        return Outcome("replay_ignored", "Already taken back for this", shop, pid)
    await activity.log(db, action="clawback_created", actor_kind="stripe", partner_id=pid,
                       subject_kind="line", subject_id=clawback_id, after={
                           "reverses": str(line["id"]), "amount_cents": -amount, "base_cents": -base,
                           "why": what, "status": "held" if held else "open"})
    return Outcome("clawback_created", f"{what}: {ledger.money(-amount)}, nets against the next payout", shop, pid)


async def _charge_refunded(db: AsyncSession, event: dict, same_world: bool) -> Outcome | None:
    ch = event["data"]["object"]
    line = await _line_for_payment(db, invoice_id=_id(ch.get("invoice")),
                                   payment_intent=_id(ch.get("payment_intent")),
                                   charge_id=ch.get("id"), customer_id=_id(ch.get("customer")))
    if not line:
        return None
    refunded = int(ch.get("amount_refunded") or 0)
    return await _take_back(
        db, line, reversed_total=refunded, paid=int(ch.get("amount_captured") or ch.get("amount") or 0),
        source_ref=f"refund:{ch.get('id')}:{refunded}", what="Refund",
        payment_ref=_id(ch.get("payment_intent")) or ch.get("id"), same_world=same_world,
        at=_happened_at(event))


async def _dispute_created(db: AsyncSession, event: dict, same_world: bool) -> Outcome | None:
    d = event["data"]["object"]
    charge = d.get("charge") if isinstance(d.get("charge"), dict) else None
    charge_id = _id(d.get("charge"))
    pi = _id(d.get("payment_intent")) or _id((charge or {}).get("payment_intent"))
    line = await _line_for_payment(db, invoice_id=None, payment_intent=pi, charge_id=charge_id,
                                   customer_id=_id((charge or {}).get("customer")))
    if not line:
        return None
    if charge is None and charge_id:
        try:
            s = await _stripe(db)
            charge = _plain(s.Charge.retrieve(charge_id))
        except Exception as exc:  # noqa: BLE001
            logger.warning("partner commission: could not read charge %s: %s", charge_id, exc)
    disputed = int(d.get("amount") or 0)
    paid = int((charge or {}).get("amount_captured") or (charge or {}).get("amount") or disputed)
    refunded = int((charge or {}).get("amount_refunded") or 0)
    return await _take_back(
        db, line, reversed_total=min(paid, refunded + disputed), paid=paid,
        source_ref=f"dispute:{d.get('id')}", what="Dispute opened",
        payment_ref=pi or charge_id, same_world=same_world, at=_happened_at(event))


# ── Payment failures and subscription changes ────────────────────────────────

async def _payment_failed(db: AsyncSession, event: dict, same_world: bool) -> Outcome | None:
    inv = event["data"]["object"]
    shop = await _shop_for(db, subscription_id=ledger.subscription_id_of(inv),
                           customer_id=_id(inv.get("customer")),
                           metadata=ledger.subscription_metadata_of(inv))
    ref = await _referral(db, shop) if shop else None
    if not ref:
        return None
    if not same_world:
        return Outcome("ignored", OTHER_WORLD, shop, str(ref["partner_id"]))
    return Outcome("payment_failed", "Payment failed. Nothing earns until the invoice is paid.",
                   shop, str(ref["partner_id"]))


def _item_price(items: Any) -> dict | None:
    data = (items or {}).get("data") if isinstance(items, dict) else None
    first = (data or [None])[0] or {}
    price = first.get("price") or first.get("plan")
    if isinstance(price, str):
        return {"id": price}
    return price if isinstance(price, dict) else None


async def _subscription_changed(db: AsyncSession, event: dict, same_world: bool) -> Outcome | None:
    sub = event["data"]["object"]
    shop = await _shop_for(db, subscription_id=sub.get("id"), customer_id=_id(sub.get("customer")),
                           metadata=sub.get("metadata"))
    ref = await _referral(db, shop, lock=True) if shop else None
    if not ref:
        return None
    pid = str(ref["partner_id"])
    if not same_world:
        return Outcome("ignored", OTHER_WORLD, shop, pid)

    if event.get("type") == "customer.subscription.deleted" or sub.get("status") == "canceled":
        settings = await program.load(db)
        if ref["ended_at"] is None:
            await db.execute(text(
                "UPDATE partner_referrals SET ended_at = now(), updated_at = now() WHERE id = :id"
            ), {"id": ref["id"]})
            await activity.log(db, action="referral_ended", actor_kind="stripe", partner_id=pid,
                               subject_kind="referral", subject_id=ref["id"],
                               after={"shop": ref["shop_name"]})
        return Outcome("referral_ended",
                       f"Subscription ended. If the shop pays again within "
                       f"{settings['return_window_days']} days, it stays with {ref['partner_name']}.",
                       shop, pid)

    previous = (event.get("data") or {}).get("previous_attributes") or {}
    if "items" not in previous:
        return None
    old, new = _item_price(previous.get("items")), _item_price(sub.get("items"))
    if not old or not new or old.get("id") == new.get("id"):
        return None
    plan_for = await _plan_resolver(db, [{"price": old}, {"price": new}])
    before, after = plan_for(old.get("id"), old), plan_for(new.get("id"), new)
    if not before and not after:
        return None
    return Outcome("plan_updated",
                   f"{program.plan_name(before) or 'Other price'} to {program.plan_name(after) or 'other price'}, "
                   "new base from the next invoice", shop, pid)


_HANDLERS = {
    "invoice.paid": _invoice_paid,
    "invoice.payment_failed": _payment_failed,
    "charge.refunded": _charge_refunded,
    "charge.dispute.created": _dispute_created,
    "customer.subscription.updated": _subscription_changed,
    "customer.subscription.deleted": _subscription_changed,
}


async def _dispatch(db: AsyncSession, event: dict) -> Outcome | None:
    handler = _HANDLERS.get(event.get("type") or "")
    if handler is None:
        return None
    return await handler(db, event, await _same_world(db, event))


# ── Recording what happened ───────────────────────────────────────────────────

async def _record(db: AsyncSession, event: dict, outcome: Outcome) -> None:
    await db.execute(text("""
        INSERT INTO partner_stripe_events
            (stripe_event_id, event_type, livemode, shop_tenant_id, partner_id, result, detail)
        VALUES (:e, :t, :live, CAST(:shop AS uuid), CAST(:pid AS uuid), :result, :detail)
        ON CONFLICT (stripe_event_id) WHERE result <> 'replay_ignored' DO NOTHING
    """), {
        "e": event.get("id"), "t": event.get("type"), "live": bool(event.get("livemode")),
        "shop": outcome.shop_tenant_id, "pid": outcome.partner_id,
        "result": outcome.result, "detail": outcome.detail[:500],
    })


async def _record_failure(event: dict, exc: Exception) -> None:
    try:
        async with pdb.session() as db:
            await db.execute(text("""
                INSERT INTO partner_stripe_events
                    (stripe_event_id, event_type, livemode, result, detail, last_error, payload)
                VALUES (:e, :t, :live, 'failed', 'The handler failed. It retries on its own.',
                        :err, CAST(:payload AS jsonb))
                ON CONFLICT (stripe_event_id) WHERE result <> 'replay_ignored'
                DO UPDATE SET attempts = partner_stripe_events.attempts + 1,
                              last_error = EXCLUDED.last_error
            """), {
                "e": event.get("id"), "t": event.get("type"), "live": bool(event.get("livemode")),
                "err": f"{type(exc).__name__}: {exc}"[:500], "payload": json.dumps(event),
            })
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("partner commission: could not record the failure of %s", event.get("id"))


async def handle_event(event: dict) -> None:
    """Read one Stripe event for the program. Never raises."""
    if not isinstance(event, dict) or event.get("account") or event.get("type") not in HANDLED:
        return
    try:
        async with pdb.session() as db:
            try:
                outcome = await _dispatch(db, event)
                if outcome is not None:
                    await _record(db, event, outcome)
                await db.commit()
            except Exception as exc:  # noqa: BLE001
                await db.rollback()
                logger.exception("partner commission: %s %s failed", event.get("type"), event.get("id"))
                outcome, failure = None, exc
            else:
                failure = None
        if failure is not None:
            await _record_failure(event, failure)
        elif outcome is not None and outcome.result == "line_created":
            await _tell_earned(event, outcome)
    except Exception:  # noqa: BLE001
        logger.exception("partner commission: %s could not be read", event.get("id"))


async def _tell_earned(event: dict, outcome: Outcome) -> None:
    """The partner hears they earned, if they asked to. Best effort."""
    from app.services.partners import mail, portal

    try:
        inv_id = (event.get("data") or {}).get("object", {}).get("id")
        async with pdb.session() as db:
            p = await portal.partner_row(db, outcome.partner_id)
            support = (await program.load(db))["support_email"]
            line = (await db.execute(text("""
                SELECT l.amount_cents, l.payable_on, l.status, COALESCE(t.name, r.shop_name) AS shop
                  FROM partner_commission_lines l
                  LEFT JOIN partner_referrals r ON r.id = l.referral_id
                  LEFT JOIN tenants t ON t.id = l.shop_tenant_id
                 WHERE l.stripe_invoice_id = :i AND l.kind = 'commission'
            """), {"i": inv_id})).mappings().first()
        if not (p and line and p["password_hash"] and line["status"] == "open"
                and portal.email_prefs(p)["commission_earned"]):
            return
        due = line["payable_on"]
        await asyncio.to_thread(mail.commission_earned, p["name"], p["email"], line["shop"] or "A shop",
                                ledger.money(line["amount_cents"]), f"{due:%b} {due.day}", support=support)
    except Exception:  # noqa: BLE001
        logger.warning("partner commission: could not send the earned email", exc_info=True)


async def note_replay(event_id: str, event_type: str) -> None:
    """Stripe sent an event again that the webhook already handled. Shown on
    Stripe events when the program had something to do with it."""
    if event_type not in HANDLED:
        return
    try:
        async with pdb.session() as db:
            seen = (await db.execute(text("""
                SELECT event_type, livemode, shop_tenant_id, partner_id FROM partner_stripe_events
                 WHERE stripe_event_id = :e AND result <> 'replay_ignored' LIMIT 1
            """), {"e": event_id})).mappings().first()
            if not seen:
                return
            await db.execute(text("""
                INSERT INTO partner_stripe_events
                    (stripe_event_id, event_type, livemode, shop_tenant_id, partner_id, result, detail)
                VALUES (:e, :t, :live, :shop, :pid, 'replay_ignored', 'Sent again; already handled')
            """), {"e": event_id, "t": seen["event_type"], "live": seen["livemode"],
                   "shop": seen["shop_tenant_id"], "pid": seen["partner_id"]})
            await db.commit()
    except Exception:  # noqa: BLE001
        logger.exception("partner commission: could not note the replay of %s", event_id)


# ── Retrying ──────────────────────────────────────────────────────────────────

async def retry(event_row_id: int) -> dict[str, Any]:
    """Run a failed event again. Returns what happened."""
    async with pdb.session() as db:
        row = (await db.execute(text("""
            SELECT id, result, payload FROM partner_stripe_events WHERE id = :id FOR UPDATE
        """), {"id": event_row_id})).mappings().first()
        if not row:
            return {"ok": False, "detail": "No such event."}
        if row["result"] != "failed" or not row["payload"]:
            return {"ok": True, "result": row["result"], "detail": "Nothing to retry."}
        event = row["payload"] if isinstance(row["payload"], dict) else json.loads(row["payload"])
        try:
            outcome = await _dispatch(db, event) or Outcome("ignored", "Not a referred shop")
            await db.execute(text("""
                UPDATE partner_stripe_events
                   SET result = :result, detail = :detail, shop_tenant_id = CAST(:shop AS uuid),
                       partner_id = CAST(:pid AS uuid), attempts = attempts + 1,
                       last_error = NULL, payload = NULL, resolved_at = now()
                 WHERE id = :id
            """), {"result": outcome.result, "detail": outcome.detail[:500],
                   "shop": outcome.shop_tenant_id, "pid": outcome.partner_id, "id": event_row_id})
            await db.commit()
            return {"ok": True, "result": outcome.result, "detail": outcome.detail}
        except Exception as exc:  # noqa: BLE001
            await db.rollback()
            error = f"{type(exc).__name__}: {exc}"[:500]
    async with pdb.session() as db:
        await db.execute(text("""
            UPDATE partner_stripe_events SET attempts = attempts + 1, last_error = :err WHERE id = :id
        """), {"err": error, "id": event_row_id})
        await db.commit()
    return {"ok": False, "detail": error}


async def retry_due() -> int:
    """Retry the failed events that still have tries left. Returns how many ran."""
    async with pdb.session() as db:
        ids = (await db.execute(text("""
            SELECT id FROM partner_stripe_events
             WHERE result = 'failed' AND attempts < :max AND received_at > now() - interval '3 days'
             ORDER BY id LIMIT 50
        """), {"max": MAX_ATTEMPTS})).scalars().all()
    for event_row_id in ids:
        await retry(event_row_id)
    return len(ids)


RETRY_SECONDS = 15 * 60


async def retry_loop() -> None:
    """Runs in every web worker; a Redis lock lets one of them act per tick."""
    from app.core.redis import get_redis_pool

    await asyncio.sleep(90)
    while True:
        try:
            r = get_redis_pool()
            if await r.set("partners:retry", "1", nx=True, ex=RETRY_SECONDS - 30):
                await retry_due()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("partner commission retry tick failed")
        await asyncio.sleep(RETRY_SECONDS)
