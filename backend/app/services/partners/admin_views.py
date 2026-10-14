"""What the super admin's Affiliates tab shows. Reads only; changes are in
actions.py. Unlike the portal, the super admin sees who owns a referred shop
and its Stripe customer: deciding a self referral needs both."""
from __future__ import annotations

import csv
import io
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.partners import ledger, portal, program

PAGE = 50


def _ago_days(at: datetime | None) -> int | None:
    return (datetime.now(timezone.utc) - at).days if at else None


def _month_start(today: date) -> date:
    return today.replace(day=1)


async def _all_lines(db: AsyncSession, where: str = "", params: dict | None = None) -> list[dict]:
    rows = (await db.execute(text(f"""
        SELECT l.id, l.partner_id, l.referral_id, l.kind, l.amount_cents, l.base_cents, l.rate_bps, l.status,
               l.hold_reason, l.status_note, l.payable_on, l.earned_at, l.batch_id, l.plan_key, l.created_at,
               l.stripe_invoice_id, l.created_by, l.livemode,
               COALESCE(t.name, r.shop_name) AS shop_name, p.name AS partner_name, po.paid_on
          FROM partner_commission_lines l
          JOIN partners p ON p.id = l.partner_id
          LEFT JOIN partner_referrals r ON r.id = l.referral_id
          LEFT JOIN tenants t ON t.id = l.shop_tenant_id
          LEFT JOIN partner_payouts po ON po.id = l.payout_id
         {where}
         ORDER BY l.earned_at DESC, l.created_at DESC
    """), params or {})).mappings().all()
    return [dict(r) for r in rows]


async def _w9_set(db: AsyncSession) -> set[str]:
    rows = (await db.execute(text(
        "SELECT DISTINCT partner_id FROM partner_documents WHERE kind = 'w9' AND replaced_at IS NULL"
    ))).scalars().all()
    return {str(r) for r in rows}


def _rate_text(p: dict) -> str:
    rate, source = program.effective_rate(p["plan_rate_bps"], p.get("custom_rate_bps"),
                                          p.get("custom_rate_ends_on"), ledger.utc_today())
    if source == "override":
        ends = p.get("custom_rate_ends_on")
        return f"Override {program.rate_words(rate)}" + (f" until {ends:%b} {ends.day}" if ends else "")
    return f"{p.get('rate_plan_name')} {program.rate_words(rate)}"


async def _partners(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT p.*, rp.key AS rate_plan_key, rp.name AS rate_plan_name, rp.rate_bps AS plan_rate_bps
          FROM partners p JOIN partner_rate_plans rp ON rp.id = p.rate_plan_id
         ORDER BY p.created_at DESC
    """))).mappings().all()
    return [dict(r) for r in rows]


# ── Overview ──────────────────────────────────────────────────────────────────

async def overview(db: AsyncSession) -> dict[str, Any]:
    today = ledger.utc_today()
    settings = await program.load(db)
    # Waiting long is past the answer the program page and the email promise.
    days = settings["application_response_days"]
    apps = (await db.execute(text("""
        SELECT COUNT(*) FILTER (WHERE status IN ('waiting', 'info_requested')) AS open,
               COUNT(*) FILTER (WHERE status = 'waiting' AND created_at < now() - make_interval(days => :days)) AS old,
               MIN(created_at) FILTER (WHERE status = 'waiting') AS oldest
          FROM partner_applications
    """), {"days": days})).mappings().first()
    partners = await _partners(db)
    by_status = defaultdict(int)
    for p in partners:
        by_status[p["status"]] += 1
    shops = (await db.execute(text("""
        SELECT COUNT(*) FROM partner_referrals r JOIN tenant_subscriptions s ON s.tenant_id = r.shop_tenant_id
         WHERE r.status <> 'excluded' AND r.ended_at IS NULL AND s.status IN ('active', 'past_due')
    """))).scalar() or 0

    lines = await _all_lines(db)
    per = defaultdict(list)
    for ln in lines:
        per[str(ln["partner_id"])].append(ln)
    w9 = await _w9_set(db)
    this_year = await portal.paid_in_year(db, today.year)
    pending = payable = on_hold = 0
    ready_count, ready_sum, no_w9 = 0, 0, []
    final_count, final_sum = 0, 0
    for p in partners:
        b = ledger.balances(per.get(str(p["id"]), []), today)
        pending += b["pending"]
        on_hold += b["on_hold"]
        payable += b["payable"]
        state, _ = ledger.payout_readiness(partner_status=p["status"], payable=b["payable"],
                                           minimum=settings["minimum_payout_cents"], has_w9=str(p["id"]) in w9,
                                           paid_this_year=this_year.get(str(p["id"]), 0),
                                           w9_from=settings["w9_required_from_cents"])
        if state == "ready" and p["status"] == "terminated":
            final_count += 1
            final_sum += b["payable"]
        elif state == "ready":
            ready_count += 1
            ready_sum += b["payable"]
        elif state == "blocked":
            no_w9.append(p["name"])
    month = _month_start(today)
    paid = (await db.execute(text("""
        SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) FROM partner_payouts WHERE paid_on >= :m
    """), {"m": month})).first()
    review = (await db.execute(text("SELECT COUNT(*) FROM partner_referrals WHERE status = 'review'"))).scalar() or 0
    failed = (await db.execute(text("""
        SELECT COUNT(*) AS n, MAX(event_type) AS kind, MIN(attempts) AS tries FROM partner_stripe_events
         WHERE result = 'failed'
    """))).mappings().first()

    attention: list[dict[str, Any]] = []
    if apps["old"]:
        attention.append({"kind": "applications", "title": f"{apps['old']} application"
                          f"{'s' if apps['old'] != 1 else ''} waiting over {days} day{'s' if days != 1 else ''}",
                          "detail": f"Oldest has been waiting {_ago_days(apps['oldest'])} days.", "action": "review"})
    if ready_count:
        attention.append({"kind": "batch", "title": f"{ready_count} affiliate{'s are' if ready_count != 1 else ' is'} "
                          f"above the {ledger.money_short(settings['minimum_payout_cents'])} minimum",
                          "detail": f"{ledger.money(ready_sum)} payable. Ready for a batch.", "action": "create_batch"})
    if final_count:
        attention.append({"kind": "batch", "title": f"{final_count} ended partnership{'s have' if final_count != 1 else ' has'} "
                          "a final payout",
                          "detail": f"{ledger.money(final_sum)} earned and payable, paid whatever the minimum.",
                          "action": "create_batch"})
    for name in no_w9[:3]:
        attention.append({"kind": "w9", "title": f"{name} has no W-9 on file",
                          "detail": "Recording a payout is blocked until it is uploaded or overridden.", "action": "open"})
    if review:
        attention.append({"kind": "self_referral", "title": f"{review} referral{'s' if review != 1 else ''} "
                          "flagged for self referral",
                          "detail": "Owner email or domain matches the affiliate. Lines are held.", "action": "review"})
    from app.services.partners.commissions import MAX_ATTEMPTS

    if failed["n"]:
        attention.append({"kind": "stripe", "title": f"{failed['n']} Stripe event{'s' if failed['n'] != 1 else ''} "
                          "failed to process",
                          "detail": f"{failed['kind']}, {max(0, MAX_ATTEMPTS - int(failed['tries'] or 0))} retries left.",
                          "action": "open"})

    top = (await db.execute(text("""
        SELECT p.id, p.name, rp.name AS plan_name, rp.rate_bps, p.custom_rate_bps, p.custom_rate_ends_on,
               COALESCE(SUM(l.amount_cents), 0) AS earned,
               (SELECT COUNT(*) FROM partner_referrals r JOIN tenant_subscriptions s ON s.tenant_id = r.shop_tenant_id
                 WHERE r.partner_id = p.id AND r.ended_at IS NULL AND r.status <> 'excluded'
                   AND s.status IN ('active', 'past_due')) AS shops
          FROM partners p JOIN partner_rate_plans rp ON rp.id = p.rate_plan_id
          JOIN partner_commission_lines l ON l.partner_id = p.id
         WHERE l.kind = 'commission' AND l.status <> 'void' AND l.earned_at >= :m
         GROUP BY p.id, rp.name, rp.rate_bps ORDER BY earned DESC LIMIT 5
    """), {"m": month})).mappings().all()
    from app.services import stripe_mode

    # The Stripe mode the platform is in, as Stripe events opens on.
    stats = await stripe_stats(db, await stripe_mode.current(db) == stripe_mode.LIVE)
    return {
        "applications": {"open": apps["open"], "old": apps["old"], "days": days},
        "affiliates": {"active": by_status["active"], "paused": by_status["paused"],
                       "suspended": by_status["suspended"], "terminated": by_status["terminated"]},
        "active_shops": int(shops),
        "pending_cents": pending, "payable_cents": payable, "on_hold_cents": on_hold,
        "paid_month_cents": int(paid[1]), "paid_month_count": int(paid[0]),
        "attention": attention,
        "top": [{"id": str(t["id"]), "name": t["name"],
                 "rate": f"{t['plan_name']} {program.rate_words(t['rate_bps'])}", "shops": int(t["shops"]),
                 "earned_cents": int(t["earned"])} for t in top],
        "month": f"{today:%B}",
        "switches": {k: settings[k] for k in ("accepting_applications", "accepting_referrals", "earning",
                                              "auto_approve")},
        "stripe": stats,
    }


async def stripe_stats(db: AsyncSession, live: bool | None = None) -> dict[str, Any]:
    where = "" if live is None else "WHERE livemode = :live"
    row = (await db.execute(text(f"""
        SELECT MAX(received_at) AS last,
               COUNT(*) FILTER (WHERE received_at > now() - interval '24 hours' AND result <> 'replay_ignored') AS processed,
               COUNT(*) FILTER (WHERE received_at > now() - interval '24 hours' AND result = 'line_created') AS lines,
               COUNT(*) FILTER (WHERE received_at > now() - interval '24 hours' AND result = 'replay_ignored') AS replays,
               COUNT(*) FILTER (WHERE result = 'failed') AS failed,
               MIN(attempts) FILTER (WHERE result = 'failed') AS tries
          FROM partner_stripe_events {where}
    """), {"live": live} if live is not None else {})).mappings().first()
    from app.services.partners.commissions import MAX_ATTEMPTS

    return {"last_received": row["last"], "processed_24h": int(row["processed"] or 0),
            "lines_24h": int(row["lines"] or 0), "replays_24h": int(row["replays"] or 0),
            "failed": int(row["failed"] or 0),
            "retries_left": max(0, MAX_ATTEMPTS - int(row["tries"] or 0)) if row["failed"] else None}


# ── Applications ──────────────────────────────────────────────────────────────

APP_TABS = ("waiting", "info_requested", "approved", "rejected")


async def applications(db: AsyncSession, tab: str, flagged_only: bool, q: str | None) -> dict[str, Any]:
    tab = tab if tab in APP_TABS else "waiting"
    counts = dict((await db.execute(text(
        "SELECT status, COUNT(*) FROM partner_applications GROUP BY status"
    ))).all())
    params: dict[str, Any] = {"s": tab}
    where = "WHERE status = :s"
    if flagged_only:
        where += " AND jsonb_array_length(flags) > 0"
    if q:
        where += " AND (name ILIKE :q OR email ILIKE :q OR business_name ILIKE :q OR website ILIKE :q)"
        params["q"] = f"%{q.strip()}%"
    rows = (await db.execute(text(f"""
        SELECT id, name, email, business_name, website, promote_how, audience_size, flags, created_at, status
          FROM partner_applications {where} ORDER BY created_at
    """), params)).mappings().all()
    return {"tab": tab, "counts": {t: int(counts.get(t, 0)) for t in APP_TABS},
            "rows": [{**dict(r), "id": str(r["id"]), "waiting_days": _ago_days(r["created_at"])} for r in rows]}


async def application(db: AsyncSession, application_id: str) -> dict[str, Any] | None:
    row = (await db.execute(text("SELECT * FROM partner_applications WHERE id = CAST(:id AS uuid)"),
                            {"id": application_id})).mappings().first()
    if not row:
        return None
    app = dict(row)
    flags = list(app.get("flags") or [])
    notes = (await db.execute(text("""
        SELECT at, actor_name, reason FROM partner_activity
         WHERE subject_kind = 'application' AND subject_id = :id AND action = 'note' ORDER BY at DESC
    """), {"id": application_id})).mappings().all()
    plans = await program.rate_plans(db)
    settings = await program.load(db)
    from app.services.partners.actions import suggest_code

    return {
        **app, "id": str(app["id"]), "partner_id": str(app["partner_id"]) if app["partner_id"] else None,
        # Where an answer to a question lands: partner emails reply to it.
        "support_email": settings["support_email"] or None,
        "waiting_days": _ago_days(app["created_at"]),
        "checks": [
            {"ok": "duplicate_email" not in flags, "words": "Email not used by another affiliate"
             if "duplicate_email" not in flags else "Email already used by another affiliate or application"},
            {"ok": not ({"domain_match", "existing_customer"} & set(flags)),
             "words": "Domain matches an existing brand" if ({"domain_match", "existing_customer"} & set(flags))
             else "Domain does not match any brand"},
            {"ok": bool(app["terms_accepted_at"]), "words": "Terms accepted" if app["terms_accepted_at"]
             else "Terms not accepted"},
        ],
        "notes": [dict(n) for n in notes],
        "rate_plans": [{"id": str(p["id"]), "key": p["key"], "name": p["name"], "rate_bps": p["rate_bps"],
                        "rate": program.rate_words(p["rate_bps"]), "is_default": p["is_default"],
                        "examples": {k: ledger.commission_cents(program.plan_price_cents(k), p["rate_bps"])
                                     for k in ("starter", "wholesale", "scale")}} for p in plans],
        "suggested_code": await suggest_code(db, app["name"]) if app["status"] not in ("approved", "rejected") else None,
    }


# ── Affiliates ────────────────────────────────────────────────────────────────

async def affiliates(db: AsyncSession, status: str | None, rate_plan: str | None, w9_missing: bool,
                     q: str | None) -> dict[str, Any]:
    today = ledger.utc_today()
    settings = await program.load(db)
    partners = await _partners(db)
    w9 = await _w9_set(db)
    lines = await _all_lines(db)
    per = defaultdict(list)
    for ln in lines:
        per[str(ln["partner_id"])].append(ln)
    shop_counts = dict((await db.execute(text(
        "SELECT partner_id, COUNT(*) FROM partner_referrals GROUP BY partner_id"
    ))).all())
    this_year = await portal.paid_in_year(db, today.year)
    counts = defaultdict(int)
    rows = []
    for p in partners:
        counts[p["status"]] += 1
        pid = str(p["id"])
        if status and status != "all" and p["status"] != status:
            continue
        if rate_plan and rate_plan != "all" and p["rate_plan_key"] != rate_plan:
            continue
        if w9_missing and pid in w9:
            continue
        if q and q.lower() not in f"{p['name']} {p['email']} {p['code']} {p.get('business_name') or ''}".lower():
            continue
        b = ledger.balances(per.get(pid, []), today)
        state, _ = ledger.payout_readiness(partner_status=p["status"], payable=b["payable"],
                                           minimum=settings["minimum_payout_cents"], has_w9=pid in w9,
                                           paid_this_year=this_year.get(pid, 0),
                                           w9_from=settings["w9_required_from_cents"])
        note = None
        if b["on_hold"]:
            note = "On hold"
        elif state == "under_min" and b["payable"] > 0:
            note = "Under min"
        rows.append({"id": pid, "name": p["name"], "email": p["email"], "code": p["code"], "status": p["status"],
                     "rate": _rate_text(p), "rate_plan": p["rate_plan_key"],
                     "shops": int(shop_counts.get(p["id"], 0)), "payable_cents": b["payable"],
                     "on_hold_cents": b["on_hold"], "payable_note": note, "has_w9": pid in w9,
                     "invited": p["password_hash"] is None,
                     "joined": p.get("approved_at") or p["created_at"]})
    plans = await program.rate_plans(db)
    return {"rows": rows, "counts": {s: counts[s] for s in ("active", "paused", "suspended", "terminated")},
            "rate_plans": [{"key": x["key"], "name": x["name"]} for x in plans]}


async def affiliate(db: AsyncSession, partner_id: str) -> dict[str, Any] | None:
    p = await portal.partner_row(db, partner_id)
    if not p:
        return None
    money = await portal.money_summary(db, p)
    lines = money.pop("lines")
    shops = await portal.shops(db, p)
    terms = await program.latest_terms(db)
    rate, source = portal.current_rate(p)
    plans = await program.rate_plans(db)
    return {
        "id": str(p["id"]), "name": p["name"], "email": p["email"], "code": p["code"], "status": p["status"],
        "status_reason": p.get("status_reason"), "business_name": p.get("business_name"),
        "website": p.get("website"), "link": portal.link_for(p["code"]),
        "since": p.get("approved_at") or p["created_at"], "last_sign_in": p.get("last_login_at"),
        "invited": p["password_hash"] is None,
        "terms": {"accepted": p.get("terms_version"), "latest": terms["version"] if terms else None},
        "payout_method": p.get("payout_method"), "payout_account": p.get("payout_account"),
        "has_w9": bool(p.get("has_w9")), "two_factor": bool(p.get("two_factor_enabled")),
        "money": money,
        "shops": {"total": len(shops), "active": sum(1 for s in shops if s["state"] in ("active", "past_due")),
                  "trial": sum(1 for s in shops if s["state"] == "trial")},
        "rate": {"bps": rate, "words": program.rate_words(rate), "from": source,
                 "plan_id": str(p["rate_plan_id"]), "plan": p["rate_plan_name"],
                 "custom_bps": p.get("custom_rate_bps"), "custom_ends_on": p.get("custom_rate_ends_on")},
        "rate_plans": [{"id": str(x["id"]), "key": x["key"], "name": x["name"], "rate_bps": x["rate_bps"]}
                       for x in plans],
        "lines_count": len(lines),
    }


async def affiliate_shops(db: AsyncSession, partner_id: str) -> list[dict]:
    p = await portal.partner_row(db, partner_id)
    return await portal.shops(db, p) if p else []


async def affiliate_payouts(db: AsyncSession, partner_id: str) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT po.id, po.paid_on, po.amount_cents, po.method, po.reference, po.recorded_by, po.w9_override_reason,
               b.name AS batch, (SELECT COUNT(*) FROM partner_commission_lines l WHERE l.payout_id = po.id) AS lines
          FROM partner_payouts po LEFT JOIN partner_payout_batches b ON b.id = po.batch_id
         WHERE po.partner_id = CAST(:p AS uuid) ORDER BY po.paid_on DESC
    """), {"p": partner_id})).mappings().all()
    return [{**dict(r), "id": str(r["id"])} for r in rows]


async def affiliate_documents(db: AsyncSession, partner_id: str) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT id, kind, filename, mime, size_bytes, uploaded_at, replaced_at FROM partner_documents
         WHERE partner_id = CAST(:p AS uuid) ORDER BY uploaded_at DESC
    """), {"p": partner_id})).mappings().all()
    return [{**dict(r), "id": str(r["id"])} for r in rows]


# ── Referrals ─────────────────────────────────────────────────────────────────

_REF = """
    SELECT r.id, r.partner_id, p.name AS partner_name, r.shop_tenant_id,
           COALESCE(t.name, r.shop_name) AS shop_name, t.plan, t.email AS shop_email, r.owner_email,
           s.status AS sub_status, s.trial_ends_at, s.stripe_customer_id, r.status AS referral_status,
           r.source, r.code_used, r.src, r.flags, r.attributed_at, r.ended_at, r.earn_until,
           r.decided_by, r.decision_reason
      FROM partner_referrals r
      JOIN partners p ON p.id = r.partner_id
      LEFT JOIN tenants t ON t.id = r.shop_tenant_id
      LEFT JOIN tenant_subscriptions s ON s.tenant_id = r.shop_tenant_id
"""


def _ref_row(r: dict) -> dict[str, Any]:
    flags = list(r.get("flags") or [])
    return {"id": str(r["id"]), "shop_name": r["shop_name"], "shop_tenant_id": str(r["shop_tenant_id"]),
            "partner_id": str(r["partner_id"]), "partner_name": r["partner_name"], "plan": r.get("plan"),
            "plan_name": program.plan_name(r.get("plan")), "state": portal.shop_state(r),
            "source": r["source"], "attributed_at": r["attributed_at"], "earn_until": r.get("earn_until"),
            "flags": flags, "review": r["referral_status"] == "review", "excluded": r["referral_status"] == "excluded"}


async def referral_list(db: AsyncSession, tab: str, partner_id: str | None, plan: str | None,
                        source: str | None, q: str | None) -> dict[str, Any]:
    rows = [dict(r) for r in (await db.execute(text(_REF + " ORDER BY r.attributed_at DESC"))).mappings().all()]
    counts = {"all": len(rows), "review": sum(1 for r in rows if r["referral_status"] == "review"),
              "excluded": sum(1 for r in rows if r["referral_status"] == "excluded"),
              "manual": sum(1 for r in rows if r["source"] == "manual")}
    if tab == "review":
        rows = [r for r in rows if r["referral_status"] == "review"]
    elif tab == "excluded":
        rows = [r for r in rows if r["referral_status"] == "excluded"]
    elif tab == "manual":
        rows = [r for r in rows if r["source"] == "manual"]
    if partner_id:
        rows = [r for r in rows if str(r["partner_id"]) == partner_id]
    if plan:
        rows = [r for r in rows if r.get("plan") == plan]
    if source:
        rows = [r for r in rows if r["source"] == source]
    if q:
        needle = q.lower()
        rows = [r for r in rows if needle in f"{r['shop_name']} {r['partner_name']}".lower()]
    out = [_ref_row(r) for r in rows]
    # Flagged shops first, then the newest.
    out.sort(key=lambda x: (not x["flags"] or x["excluded"], ), reverse=False)
    return {"rows": out, "counts": counts}


def _mask(value: str | None) -> str | None:
    if not value or len(value) < 10:
        return value
    return f"{value[:6]}...{value[-3:]}"


async def referral(db: AsyncSession, referral_id: str) -> dict[str, Any] | None:
    row = (await db.execute(text(_REF + " WHERE r.id = CAST(:id AS uuid)"), {"id": referral_id})).mappings().first()
    if not row:
        return None
    r = dict(row)
    held = (await db.execute(text("""
        SELECT COUNT(*), COALESCE(SUM(amount_cents), 0) FROM partner_commission_lines
         WHERE referral_id = :r AND status = 'held'
    """), {"r": r["id"]})).first()
    flags = list(r.get("flags") or [])
    message = None
    if "self_referral" in flags:
        message = f"The owner email matches {r['partner_name']}. Commission lines are held until you decide."
    elif "domain_match" in flags:
        message = f"The owner's domain matches {r['partner_name']}'s. Commission lines are held until you decide."
    source = {"code": f"Code {r['code_used'] or ''}".strip(), "cookie": "Cookie", "manual": "Manual"}[r["source"]]
    return {**_ref_row(r), "owner_email": r.get("owner_email") or r.get("shop_email"),
            "source_words": source + (f", tag {r['src']}" if r.get("src") else ""),
            "stripe_customer": _mask(r.get("stripe_customer_id")),
            "held_lines": int(held[0]), "held_cents": int(held[1]), "message": message,
            "decided_by": r.get("decided_by"), "decision_reason": r.get("decision_reason")}


# ── Ledger ────────────────────────────────────────────────────────────────────

LEDGER_STATES = ("pending", "payable", "on_hold", "paid", "void", "clawback")


async def ledger_view(db: AsyncSession, state: str | None, partner_id: str | None, months: int,
                      q: str | None, page: int) -> dict[str, Any]:
    today = ledger.utc_today()
    where, params = "", {}
    if months:
        where = "WHERE l.earned_at >= :since"
        params["since"] = datetime.now(timezone.utc) - timedelta(days=31 * months)
    lines = await _all_lines(db, where, params)
    totals = {"pending": 0, "payable": 0, "on_hold": 0, "clawbacks": 0}
    views, counts = [], defaultdict(int)
    for ln in lines:
        v = portal.line_view(ln, today)
        v.update({"partner_id": str(ln["partner_id"]), "partner_name": ln["partner_name"],
                  "payable_on": ln["payable_on"], "hold_reason": ln.get("hold_reason"),
                  "note": ln.get("status_note"), "invoice": ln.get("stripe_invoice_id"),
                  "in_batch": bool(ln.get("batch_id")), "created_by": ln.get("created_by")})
        if v["state"] == "pending":
            totals["pending"] += ln["amount_cents"]
        elif v["state"] == "payable" and not ln.get("batch_id"):
            totals["payable"] += ln["amount_cents"]
        elif v["state"] == "on_hold":
            totals["on_hold"] += ln["amount_cents"]
        elif v["state"] == "clawback" and not ln.get("batch_id"):
            totals["clawbacks"] += ln["amount_cents"]
        counts[v["state"]] += 1
        views.append(v)
    if state and state != "all":
        views = [v for v in views if v["state"] == state]
    if partner_id:
        views = [v for v in views if v["partner_id"] == partner_id]
    if q:
        needle = q.lower()
        views = [v for v in views if needle in f"{v['shop_name']} {v['invoice'] or ''} {v['partner_name']}".lower()]
    page = max(1, page)
    return {"totals": totals, "counts": dict(counts), "total": len(views), "page": page,
            "pages": max(1, -(-len(views) // PAGE)), "rows": views[(page - 1) * PAGE: page * PAGE]}


async def ledger_csv(db: AsyncSession) -> str:
    today = ledger.utc_today()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Earned", "Affiliate", "Shop", "Kind", "Base", "Rate", "Amount", "Status", "Payable on",
                "Invoice", "Note"])
    for ln in await _all_lines(db):
        v = portal.line_view(ln, today)
        w.writerow([ln["earned_at"].date().isoformat(), ln["partner_name"], v["shop_name"], ln["kind"],
                    f"{ln['base_cents'] / 100:.2f}", v["rate"], f"{ln['amount_cents'] / 100:.2f}", v["state"],
                    ln["payable_on"].isoformat(), ln.get("stripe_invoice_id") or "",
                    ln.get("hold_reason") or ln.get("status_note") or ""])
    return out.getvalue()


# ── Payouts ───────────────────────────────────────────────────────────────────

async def payables(db: AsyncSession) -> dict[str, Any]:
    today = ledger.utc_today()
    settings = await program.load(db)
    partners = {str(p["id"]): p for p in await _partners(db)}
    w9 = await _w9_set(db)
    this_year = await portal.paid_in_year(db, today.year)
    per = defaultdict(list)
    for ln in await _all_lines(db, "WHERE l.status IN ('open', 'held')"):
        per[str(ln["partner_id"])].append(ln)
    rows, total, held_total = [], 0, 0
    for pid, lines in per.items():
        p = partners[pid]
        b = ledger.balances(lines, today)
        open_lines = [ln for ln in lines if ln["status"] == "open" and not ln["batch_id"] and ln["payable_on"] <= today]
        if not open_lines and not b["on_hold"]:
            continue
        state, words = ledger.payout_readiness(partner_status=p["status"], payable=b["payable"],
                                               minimum=settings["minimum_payout_cents"], has_w9=pid in w9,
                                               paid_this_year=this_year.get(pid, 0),
                                               w9_from=settings["w9_required_from_cents"])
        if p["status"] == "suspended":
            amount = b["on_hold"]
        else:
            amount = b["payable"]
        rows.append({"partner_id": pid, "name": p["name"], "payable_cents": amount,
                     "lines": len(open_lines) if p["status"] != "suspended" else
                     sum(1 for ln in lines if ln["status"] == "held"),
                     "clawback_cents": b["clawbacks"], "method": p.get("payout_method"), "has_w9": pid in w9,
                     "ready": state, "ready_words": words, "paused": p["status"] == "paused",
                     "final": p["status"] == "terminated"})
        if state == "ready":
            total += b["payable"]
        held_total += b["on_hold"]
    rows.sort(key=lambda r: (r["ready"] != "ready", -r["payable_cents"]))
    return {"rows": rows, "ready_total_cents": total, "on_hold_cents": held_total,
            "payable_total_cents": sum(r["payable_cents"] for r in rows if r["ready"] != "held"),
            "minimum_cents": settings["minimum_payout_cents"],
            "w9_required_from_cents": settings["w9_required_from_cents"],
            "form_1099_threshold_cents": settings["form_1099_threshold_cents"]}


async def batches(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT b.*, (SELECT COALESCE(SUM(l.amount_cents), 0) FROM partner_commission_lines l
                      WHERE l.batch_id = b.id) AS total,
               (SELECT COUNT(DISTINCT l.partner_id) FROM partner_commission_lines l WHERE l.batch_id = b.id) AS partners,
               (SELECT COUNT(*) FROM partner_payouts po WHERE po.batch_id = b.id) AS recorded
          FROM partner_payout_batches b ORDER BY b.created_at DESC
    """))).mappings().all()
    out = []
    w9_from = (await program.load(db))["w9_required_from_cents"]
    this_year = await portal.paid_in_year(db, ledger.utc_today().year)
    for b in rows:
        item = {**dict(b), "id": str(b["id"]), "total_cents": int(b["total"])}
        if b["status"] == "open":
            waiting = (await db.execute(text("""
                SELECT l.partner_id, p.name, p.payout_method, SUM(l.amount_cents) AS amount_cents, COUNT(*) AS lines,
                       EXISTS (SELECT 1 FROM partner_documents d WHERE d.partner_id = l.partner_id AND d.kind = 'w9'
                                AND d.replaced_at IS NULL) AS has_w9
                  FROM partner_commission_lines l JOIN partners p ON p.id = l.partner_id
                 WHERE l.batch_id = :b AND l.status = 'open' GROUP BY l.partner_id, p.name, p.payout_method
            """), {"b": b["id"]})).mappings().all()
            # Recording asks for a W-9, or an override, only when the payout needs one.
            item["waiting"] = [dict(x) | {"partner_id": str(x["partner_id"]), "w9_needed": ledger.w9_needed(
                paid_this_year=this_year.get(str(x["partner_id"]), 0), payout=int(x["amount_cents"]),
                required_from=w9_from)} for x in waiting]
        out.append(item)
    return out


async def paid_history(db: AsyncSession) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT po.id, po.paid_on, po.amount_cents, po.method, po.reference, po.recorded_by, po.w9_override_reason,
               p.id AS partner_id, p.name AS partner_name, b.name AS batch,
               (SELECT COUNT(*) FROM partner_commission_lines l WHERE l.payout_id = po.id) AS lines
          FROM partner_payouts po JOIN partners p ON p.id = po.partner_id
          LEFT JOIN partner_payout_batches b ON b.id = po.batch_id
         ORDER BY po.paid_on DESC, po.recorded_at DESC
    """))).mappings().all()
    return [{**dict(r), "id": str(r["id"]), "partner_id": str(r["partner_id"])} for r in rows]


async def yearly_totals(db: AsyncSession) -> list[dict]:
    """Paid per affiliate per calendar year, by the day each payout was paid:
    the figure an accountant needs for each partner's 1099. A partner paid
    the program's 1099 amount or more in a year is marked (none while it is 0)."""
    threshold = (await program.load(db))["form_1099_threshold_cents"]
    rows = (await db.execute(text("""
        SELECT EXTRACT(YEAR FROM po.paid_on)::int AS year, p.id, p.name, p.email,
               SUM(po.amount_cents) AS cents, COUNT(*) AS payouts,
               EXISTS (SELECT 1 FROM partner_documents d WHERE d.partner_id = p.id AND d.kind = 'w9'
                        AND d.replaced_at IS NULL) AS has_w9
          FROM partner_payouts po JOIN partners p ON p.id = po.partner_id
         GROUP BY year, p.id, p.name, p.email ORDER BY year DESC, cents DESC
    """))).mappings().all()
    return [{**dict(r), "id": str(r["id"]), "cents": int(r["cents"]),
             "form_1099": bool(threshold) and int(r["cents"]) >= threshold} for r in rows]


# ── Activity and Stripe events ────────────────────────────────────────────────

async def activity_view(db: AsyncSession, partner_id: str | None, q: str | None, page: int,
                        actor: str | None = None, days: int = 0) -> dict[str, Any]:
    where, params = [], {}
    if partner_id:
        where.append("partner_id = CAST(:p AS uuid)")
        params["p"] = partner_id
    if actor == "system":
        where.append("actor_kind IN ('system', 'stripe')")
    elif actor in ("admin", "partner"):
        where.append("actor_kind = :actor")
        params["actor"] = actor
    if days:
        where.append("at > now() - make_interval(days => :days)")
        params["days"] = int(days)
    if q:
        where.append("(action ILIKE :q OR actor_name ILIKE :q OR reason ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    sql_where = ("WHERE " + " AND ".join(where)) if where else ""
    total = (await db.execute(text(f"SELECT COUNT(*) FROM partner_activity {sql_where}"), params)).scalar() or 0
    page = max(1, page)
    # The filters name columns only partner_activity has (partners has none of
    # them), so they read the same with the join.
    rows = (await db.execute(text(f"""
        SELECT a.*, p.name AS partner_name FROM partner_activity a
          LEFT JOIN partners p ON p.id = a.partner_id
         {sql_where.replace("partner_id =", "a.partner_id =")}
         ORDER BY a.at DESC, a.id DESC LIMIT :lim OFFSET :off
    """), {**params, "lim": PAGE, "off": (page - 1) * PAGE})).mappings().all()
    return {"rows": [{**dict(r), "partner_id": str(r["partner_id"]) if r["partner_id"] else None} for r in rows],
            "total": int(total), "page": page, "pages": max(1, -(-int(total) // PAGE))}


async def stripe_events(db: AsyncSession, live: bool, result: str | None, q: str | None, page: int) -> dict[str, Any]:
    where, params = ["e.livemode = :live"], {"live": live}
    if result == "line_created":
        where.append("e.result = 'line_created'")
    elif result == "ignored":
        where.append("e.result IN ('ignored', 'replay_ignored')")
    elif result == "failed":
        where.append("e.result = 'failed'")
    if q:
        where.append("(e.stripe_event_id ILIKE :q OR t.name ILIKE :q OR e.event_type ILIKE :q)")
        params["q"] = f"%{q.strip()}%"
    sql_where = "WHERE " + " AND ".join(where)
    total = (await db.execute(text(f"""
        SELECT COUNT(*) FROM partner_stripe_events e LEFT JOIN tenants t ON t.id = e.shop_tenant_id {sql_where}
    """), params)).scalar() or 0
    page = max(1, page)
    rows = (await db.execute(text(f"""
        SELECT e.id, e.stripe_event_id, e.event_type, e.received_at, e.result, e.detail, e.attempts,
               e.last_error, e.resolved_at, t.name AS shop_name
          FROM partner_stripe_events e LEFT JOIN tenants t ON t.id = e.shop_tenant_id
         {sql_where} ORDER BY e.received_at DESC, e.id DESC LIMIT :lim OFFSET :off
    """), {**params, "lim": PAGE, "off": (page - 1) * PAGE})).mappings().all()
    from app.services.partners.commissions import MAX_ATTEMPTS

    return {"stats": await stripe_stats(db, live),
            "rows": [{**dict(r), "retries_left": max(0, MAX_ATTEMPTS - int(r["attempts"]))
                      if r["result"] == "failed" else None} for r in rows],
            "total": int(total), "page": page, "pages": max(1, -(-int(total) // PAGE))}
