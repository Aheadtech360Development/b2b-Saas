"""What a partner sees in the portal.

A partner is shown a referred shop's name, plan and state, and nothing else
about it: no owner, no email, no orders. Money is read straight from their
lines (see ledger.py for what the numbers mean).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.services.partners import ledger, program

PAGE_SIZE = 50


def link_for(code: str, src: str | None = None) -> str:
    origin = (get_settings().FRONTEND_URL or "").rstrip("/")
    return f"{origin}/?ref={code}" + (f"&src={src}" if src else "")


def _day(value: date | datetime | None) -> str:
    return f"{value:%b} {value.day}" if value else ""


async def partner_row(db: AsyncSession, partner_id: Any) -> dict | None:
    row = (await db.execute(text("""
        SELECT p.*, rp.key AS rate_plan_key, rp.name AS rate_plan_name, rp.rate_bps AS plan_rate_bps,
               EXISTS (SELECT 1 FROM partner_documents d WHERE d.partner_id = p.id AND d.kind = 'w9'
                        AND d.replaced_at IS NULL) AS has_w9
          FROM partners p JOIN partner_rate_plans rp ON rp.id = p.rate_plan_id
         WHERE p.id = CAST(:id AS uuid)
    """), {"id": str(partner_id)})).mappings().first()
    return dict(row) if row else None


def current_rate(p: dict) -> tuple[int, str]:
    return program.effective_rate(p["plan_rate_bps"], p.get("custom_rate_bps"),
                                  p.get("custom_rate_ends_on"), ledger.utc_today())


EMAIL_DEFAULTS = {"new_shop": True, "commission_earned": False}


def email_prefs(p: dict) -> dict[str, bool]:
    saved = p.get("email_prefs") or {}
    out = {k: bool(saved.get(k, v)) for k, v in EMAIL_DEFAULTS.items()}
    # Always sent: money paid out, and terms that change what they agreed to.
    out.update({"payout_recorded": True, "terms_changed": True})
    return out


def summary(p: dict, *, read_only: bool = False) -> dict[str, Any]:
    """The partner as the portal's header and profile know them."""
    rate, source = current_rate(p)
    return {
        "id": str(p["id"]), "name": p["name"], "email": p["email"],
        "business_name": p.get("business_name"), "website": p.get("website"),
        "code": p["code"], "link": link_for(p["code"]), "status": p["status"],
        "rate_bps": rate, "rate": program.rate_words(rate), "rate_from": source,
        "rate_plan": p.get("rate_plan_name"),
        "custom_rate_ends_on": p.get("custom_rate_ends_on") if source == "override" else None,
        "terms_version": p.get("terms_version"),
        "two_factor_enabled": bool(p.get("two_factor_enabled")),
        "payout_method": p.get("payout_method"), "payout_account": p.get("payout_account"),
        "has_w9": bool(p.get("has_w9")), "email_prefs": email_prefs(p),
        "joined": p.get("approved_at") or p.get("created_at"),
        "read_only": read_only,
    }


# ── Shops ─────────────────────────────────────────────────────────────────────

_SHOPS = """
    SELECT r.id, r.shop_tenant_id, COALESCE(t.name, r.shop_name) AS shop_name, t.plan,
           t.status AS tenant_status, s.status AS sub_status, s.trial_ends_at,
           r.status AS referral_status, r.source, r.src, r.attributed_at, r.ended_at
      FROM partner_referrals r
      LEFT JOIN tenants t ON t.id = r.shop_tenant_id
      LEFT JOIN tenant_subscriptions s ON s.tenant_id = r.shop_tenant_id
"""


def shop_state(row: dict) -> str:
    """A referred shop, in the design's words: active, trial, past_due, canceled
    (or excluded, when the super admin took it out of commission)."""
    if row.get("referral_status") == "excluded":
        return "excluded"
    if row.get("ended_at"):
        return "canceled"
    sub = row.get("sub_status")
    if sub == "active":
        return "active"
    if sub == "past_due":
        return "past_due"
    if sub in ("canceled", "unpaid", "incomplete_expired"):
        return "canceled"
    # No card yet: the shop is on its free trial, which the platform runs
    # itself (services/trial.py), so Stripe has not billed it.
    return "trial"


def _shop(row: dict, rate_bps: int) -> dict[str, Any]:
    state = shop_state(row)
    trial_ends = row.get("trial_ends_at")
    monthly = None
    if state in ("active", "past_due") and row.get("plan"):
        monthly = ledger.commission_cents(program.plan_price_cents(row["plan"]), rate_bps)
    return {
        "id": str(row["id"]), "shop_name": row["shop_name"], "plan": row.get("plan"),
        "plan_name": program.plan_name(row.get("plan")), "state": state,
        "trial_ended": bool(state == "trial" and trial_ends and trial_ends < datetime.now(timezone.utc)),
        "signed_up": row["attributed_at"], "monthly_cents": monthly,
        "in_review": row.get("referral_status") == "review",
    }


async def shops(db: AsyncSession, p: dict) -> list[dict]:
    rows = (await db.execute(text(_SHOPS + " WHERE r.partner_id = :p ORDER BY r.attributed_at DESC"),
                             {"p": str(p["id"])})).mappings().all()
    rate, _ = current_rate(p)
    return [_shop(dict(r), rate) for r in rows]


async def shop_detail(db: AsyncSession, p: dict, referral_id: str) -> dict | None:
    row = (await db.execute(text(_SHOPS + " WHERE r.partner_id = :p AND r.id = CAST(:r AS uuid)"),
                            {"p": str(p["id"]), "r": referral_id})).mappings().first()
    if not row:
        return None
    row = dict(row)
    rate, _ = current_rate(p)
    out = _shop(row, rate)
    lines = (await db.execute(text("""
        SELECT kind, amount_cents, status, earned_at, plan_key FROM partner_commission_lines
         WHERE referral_id = :r ORDER BY earned_at
    """), {"r": row["id"]})).mappings().all()
    events = (await db.execute(text("""
        SELECT result, detail, received_at FROM partner_stripe_events
         WHERE partner_id = :p AND shop_tenant_id = :t
           AND result IN ('payment_failed', 'plan_updated', 'referral_ended')
         ORDER BY received_at
    """), {"p": str(p["id"]), "t": row["shop_tenant_id"]})).mappings().all()

    timeline: list[dict[str, Any]] = [{"at": row["attributed_at"], "kind": "signed_up",
                                       "words": "Signed up with your " + ("code" if row["source"] == "code" else "link")}]
    first = True
    for ln in lines:
        if ln["kind"] == "commission":
            timeline.append({"at": ln["earned_at"], "kind": "paid", "amount_cents": ln["amount_cents"],
                             "words": ("First paid invoice" if first else "Invoice paid")
                             + f", {program.plan_name(ln['plan_key'])}"})
            first = False
        elif ln["kind"] == "clawback":
            timeline.append({"at": ln["earned_at"], "kind": "clawback", "amount_cents": ln["amount_cents"],
                             "words": "Refund or dispute, taken back from a later payout"})
    words = {"payment_failed": "Payment failed. Commission paused until it is paid.",
             "plan_updated": None, "referral_ended": "Subscription ended"}
    for e in events:
        timeline.append({"at": e["received_at"], "kind": e["result"],
                         "words": words.get(e["result"]) or e["detail"]})
    timeline.sort(key=lambda x: x["at"])
    out.update({
        "source": "Your code" if row["source"] == "code" else "Your link",
        "campaign": row.get("src"),
        "earned_cents": sum(int(ln["amount_cents"]) for ln in lines if ln["status"] != "void"),
        "timeline": timeline,
    })
    return out


# ── Money ─────────────────────────────────────────────────────────────────────

async def all_lines(db: AsyncSession, partner_id: Any) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT l.id, l.kind, l.amount_cents, l.base_cents, l.rate_bps, l.status, l.hold_reason,
               l.payable_on, l.earned_at, l.batch_id, l.plan_key, l.created_at,
               COALESCE(t.name, r.shop_name) AS shop_name, po.paid_on
          FROM partner_commission_lines l
          LEFT JOIN partner_referrals r ON r.id = l.referral_id
          LEFT JOIN tenants t ON t.id = l.shop_tenant_id
          LEFT JOIN partner_payouts po ON po.id = l.payout_id
         WHERE l.partner_id = :p
         ORDER BY l.earned_at DESC, l.created_at DESC
    """), {"p": str(partner_id)})).mappings().all()
    return [dict(r) for r in rows]


def line_view(ln: dict, today: date) -> dict[str, Any]:
    state = ledger.line_state(ln["kind"], ln["status"], ln["payable_on"], today)
    if state == "pending":
        detail = f"Payable {_day(ln['payable_on'])}"
    elif state == "payable":
        detail = "In the next batch" if not ln.get("batch_id") else "In a batch being paid"
    elif state == "clawback":
        detail = "Nets against next payout"
    elif state == "on_hold":
        detail = "On hold, under review"
    elif state == "paid":
        detail = f"Paid {_day(ln.get('paid_on'))}" if ln.get("paid_on") else "Paid"
    else:
        detail = "Void"
    shop = ln.get("shop_name") or ("Adjustment" if ln["kind"] == "adjustment" else "")
    return {
        "id": str(ln["id"]), "kind": ln["kind"], "earned_at": ln["earned_at"], "shop_name": shop,
        "plan": ln.get("plan_key"), "plan_name": program.plan_name(ln.get("plan_key")) if ln.get("plan_key") else "",
        "base_cents": ln["base_cents"], "rate": program.rate_words(ln["rate_bps"]) if ln["rate_bps"] else "",
        "amount_cents": ln["amount_cents"], "state": state, "detail": detail,
    }


async def earnings(db: AsyncSession, p: dict, state: str | None, page: int) -> dict[str, Any]:
    today = ledger.utc_today()
    views = [line_view(ln, today) for ln in await all_lines(db, p["id"])]
    counts: dict[str, int] = {}
    for v in views:
        counts[v["state"]] = counts.get(v["state"], 0) + 1
    if state and state != "all":
        views = [v for v in views if v["state"] == state]
    page = max(1, page)
    return {"lines": views[(page - 1) * PAGE_SIZE: page * PAGE_SIZE], "total": len(views),
            "page": page, "pages": max(1, -(-len(views) // PAGE_SIZE)), "counts": counts}


async def earnings_csv(db: AsyncSession, p: dict) -> str:
    import csv
    import io

    today = ledger.utc_today()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Date", "Shop", "Plan", "Base fee", "Rate", "Amount", "Status", "Detail"])
    for ln in await all_lines(db, p["id"]):
        v = line_view(ln, today)
        w.writerow([v["earned_at"].date().isoformat(), v["shop_name"], v["plan_name"],
                    f"{v['base_cents'] / 100:.2f}", v["rate"], f"{v['amount_cents'] / 100:.2f}",
                    v["state"].replace("_", " "), v["detail"]])
    return out.getvalue()


async def money_summary(db: AsyncSession, p: dict) -> dict[str, Any]:
    today = ledger.utc_today()
    lines = await all_lines(db, p["id"])
    b = ledger.balances(lines, today)
    paid = (await db.execute(text("""
        SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) FROM partner_payouts WHERE partner_id = :p
    """), {"p": str(p["id"])})).first()
    settings = await program.load(db)
    readiness = ledger.payout_readiness(partner_status=p["status"], payable=b["payable"],
                                        minimum=settings["minimum_payout_cents"], has_w9=bool(p.get("has_w9")))
    return {"balances": b, "paid_count": int(paid[0]), "paid_cents": int(paid[1]),
            "minimum_cents": settings["minimum_payout_cents"], "hold_days": settings["hold_days"],
            "readiness": {"state": readiness[0], "words": readiness[1]}, "lines": lines}


async def dashboard(db: AsyncSession, p: dict) -> dict[str, Any]:
    money = await money_summary(db, p)
    lines = money.pop("lines")
    shop_list = await shops(db, p)
    today = ledger.utc_today()

    # Six months of commission earned, oldest first, by the month it was earned.
    months: list[dict[str, Any]] = []
    y, m = today.year, today.month
    for _ in range(6):
        months.append({"year": y, "month": m, "label": date(y, m, 1).strftime("%b"), "cents": 0})
        y, m = (y, m - 1) if m > 1 else (y - 1, 12)
    months.reverse()
    index = {(x["year"], x["month"]): x for x in months}
    for ln in lines:
        if ln["kind"] == "commission" and ln["status"] != "void":
            slot = index.get((ln["earned_at"].year, ln["earned_at"].month))
            if slot:
                slot["cents"] += int(ln["amount_cents"])

    # What happened lately, from the lines, the shops and the payouts.
    recent: list[dict[str, Any]] = []
    for ln in lines[:12]:
        if ln["kind"] == "commission":
            words = f"{ln['shop_name']} paid its {program.plan_name(ln['plan_key'])} plan"
        elif ln["kind"] == "clawback":
            words = f"Refund on {ln['shop_name']}, taken back"
        else:
            words = "Adjustment"
        recent.append({"at": ln["created_at"], "words": words, "amount_cents": ln["amount_cents"]})
    for s in shop_list[:8]:
        recent.append({"at": s["signed_up"], "words": f"{s['shop_name']} signed up", "amount_cents": None})
    payouts = (await db.execute(text("""
        SELECT recorded_at, amount_cents FROM partner_payouts WHERE partner_id = :p
         ORDER BY recorded_at DESC LIMIT 4
    """), {"p": str(p["id"])})).mappings().all()
    for po in payouts:
        recent.append({"at": po["recorded_at"], "words": "Payout recorded", "amount_cents": po["amount_cents"]})
    recent.sort(key=lambda x: x["at"], reverse=True)

    terms = await program.latest_terms(db)
    settings = await program.load(db)
    return {
        **money,
        "active_shops": sum(1 for s in shop_list if s["state"] in ("active", "past_due")),
        "shops_total": len(shop_list),
        "chart": months, "recent": recent[:8],
        "terms": {"latest": terms["version"] if terms else None,
                  "published_at": terms["published_at"] if terms else None,
                  "needs_acceptance": bool(terms and (p.get("terms_version") or 0) < terms["version"])},
        "cookie_days": settings["cookie_days"],
        "support_email": settings["support_email"] or None,
    }


async def link_page(db: AsyncSession, p: dict) -> dict[str, Any]:
    settings = await program.load(db)
    since = datetime.now(timezone.utc) - timedelta(days=30)
    clicks = (await db.execute(text(
        "SELECT COUNT(*) FROM partner_clicks WHERE partner_id = :p AND at > :s"
    ), {"p": str(p["id"]), "s": since})).scalar() or 0
    signups = (await db.execute(text(
        "SELECT COUNT(*) FROM partner_referrals WHERE partner_id = :p AND attributed_at > :s"
    ), {"p": str(p["id"]), "s": since})).scalar() or 0
    banners = (await db.execute(text(
        "SELECT id, title, width, height, mime FROM partner_assets ORDER BY sort, created_at"
    ))).mappings().all()
    return {
        "link": link_for(p["code"]), "code": p["code"],
        "link_active": p["status"] == "active" and settings["accepting_referrals"],
        "clicks_30": int(clicks), "signups_30": int(signups),
        "conversion": round(signups / clicks * 100, 1) if clicks else None,
        "cookie_days": settings["cookie_days"], "captions": settings["captions"],
        "banners": [{**dict(b), "id": str(b["id"])} for b in banners],
    }


async def payouts_page(db: AsyncSession, p: dict) -> dict[str, Any]:
    money = await money_summary(db, p)
    money.pop("lines")
    history = (await db.execute(text("""
        SELECT po.id, po.paid_on, po.amount_cents, po.method, po.reference,
               (SELECT COUNT(*) FROM partner_commission_lines l WHERE l.payout_id = po.id) AS lines
          FROM partner_payouts po WHERE po.partner_id = :p ORDER BY po.paid_on DESC, po.recorded_at DESC
    """), {"p": str(p["id"])})).mappings().all()
    years: dict[int, int] = {}
    for h in history:
        years[h["paid_on"].year] = years.get(h["paid_on"].year, 0) + int(h["amount_cents"])
    return {
        **money,
        "method": p.get("payout_method"), "account": p.get("payout_account"), "has_w9": bool(p.get("has_w9")),
        "history": [{**dict(h), "id": str(h["id"])} for h in history],
        "yearly": [{"year": y, "cents": c} for y, c in sorted(years.items(), reverse=True)],
    }
