"""Everything that changes the program: approving people, rates and status,
referral decisions, the ledger and payouts.

Each action takes the person doing it and, where money or access moves, a
reason, and writes both to the activity log with what changed. A line's
amount is never edited: a correction is a new adjustment line, a void keeps
the line and marks it, and a payout locks the lines it pays.
"""
from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.partners import activity, auth, ledger, portal, program, referrals


class ActionError(ValueError):
    """Why an action cannot be done, in words the admin can act on."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class Actor:
    name: str
    email: str | None = None
    kind: str = "admin"


HOLD_REASONS = ("Under review", "Possible self referral", "Payment dispute", "Other")
METHODS = ("paypal", "wise", "bank")
STATUSES = ("active", "paused", "suspended", "terminated")


def _need(reason: str | None, what: str = "a reason") -> str:
    reason = (reason or "").strip()
    if not reason:
        raise ActionError(f"Give {what}. It is saved in the activity log.")
    return reason[:1000]


async def _log(db: AsyncSession, actor: Actor, action: str, *, partner_id: Any = None,
               subject_kind: str | None = None, subject_id: Any = None, reason: str | None = None,
               before: Any = None, after: Any = None) -> None:
    await activity.log(db, action=action, actor_kind=actor.kind, actor_name=actor.name,
                       actor_email=actor.email, partner_id=partner_id, subject_kind=subject_kind,
                       subject_id=subject_id, reason=reason, before=before, after=after)


async def _partner(db: AsyncSession, partner_id: Any, *, lock: bool = False) -> dict:
    row = (await db.execute(text(f"""
        SELECT * FROM partners WHERE id = CAST(:id AS uuid) {"FOR UPDATE" if lock else ""}
    """), {"id": str(partner_id)})).mappings().first()
    if not row:
        raise ActionError("No such affiliate.", 404)
    return dict(row)


# ── Codes ─────────────────────────────────────────────────────────────────────

async def code_taken(db: AsyncSession, code: str, *, except_partner: Any = None) -> bool:
    return bool((await db.execute(text("""
        SELECT 1 FROM partners WHERE upper(code) = :c AND (CAST(:p AS uuid) IS NULL OR id <> CAST(:p AS uuid))
    """), {"c": code.upper(), "p": str(except_partner) if except_partner else None})).first())


async def suggest_code(db: AsyncSession, name: str) -> str:
    """A code from the person's name that nobody has: "Ana Reyes" -> "ANAR"."""
    words = [re.sub(r"[^A-Za-z0-9]", "", w).upper() for w in (name or "").split()]
    words = [w for w in words if w] or ["PARTNER"]
    first, last = words[0], (words[-1] if len(words) > 1 else "")
    # A first name of four letters or more is the code (MARIA, LINH); a short
    # one takes two letters of each name (Ana Reyes: ANAR).
    candidates = [first[:12]] if len(first) >= 4 else []
    if last:
        candidates += [first[:2] + last[:2], (first + last[:1])[:12], (first + last)[:12]]
    candidates.append((first + "PARTNER")[:8])
    for c in candidates:
        if referrals.normalise_code(c) and not await code_taken(db, c):
            return c
    base = candidates[0][:10]
    for n in range(2, 1000):
        c = f"{base}{n}"
        if not await code_taken(db, c):
            return c
    return uuid.uuid4().hex[:8].upper()


async def _clean_code(db: AsyncSession, code: str | None, *, name: str, except_partner: Any = None) -> str:
    if not (code or "").strip():
        return await suggest_code(db, name)
    clean = referrals.normalise_code(code)
    if not clean:
        raise ActionError("A code is 3 to 20 letters and numbers.")
    if await code_taken(db, clean, except_partner=except_partner):
        raise ActionError(f"{clean} is already somebody's code.")
    return clean


async def _rate_plan(db: AsyncSession, rate_plan_id: Any) -> dict:
    if rate_plan_id:
        row = (await db.execute(text("SELECT * FROM partner_rate_plans WHERE id = CAST(:id AS uuid)"),
                                {"id": str(rate_plan_id)})).mappings().first()
        if row:
            return dict(row)
        raise ActionError("Choose a rate plan from the list.")
    plan = await program.default_rate_plan(db)
    if not plan:
        raise ActionError("There is no rate plan yet. Add one under Settings.")
    return plan


# ── Applications and new partners ─────────────────────────────────────────────

async def _make_partner(db: AsyncSession, *, name: str, email: str, business: str | None,
                        website: str | None, rate_plan: dict, code: str, application_id: Any,
                        terms_version: int | None, actor: Actor) -> tuple[dict, str]:
    """A partner, with an invite token. Returns (partner, the token for the email)."""
    if (await db.execute(text("SELECT 1 FROM partners WHERE lower(email) = :e"),
                         {"e": email.lower()})).first():
        raise ActionError("That email already has a partner account.", 409)
    raw, digest = auth.link_token()
    row = (await db.execute(text("""
        INSERT INTO partners (application_id, email, name, business_name, website, code, rate_plan_id,
                              invite_token_hash, invite_expires_at, terms_version, approved_at, approved_by)
        VALUES (CAST(:app AS uuid), :email, :name, :business, :website, :code, :plan, :hash,
                now() + make_interval(days => :days), :terms, now(), :by)
        RETURNING *
    """), {"app": str(application_id) if application_id else None, "email": email.lower(),
           "name": name.strip()[:160], "business": (business or "").strip()[:200] or None,
           "website": (website or "").strip()[:300] or None, "code": code, "plan": rate_plan["id"],
           "hash": digest, "days": auth.INVITE_DAYS, "terms": terms_version, "by": actor.name})).mappings().first()
    return dict(row), raw


async def approve(db: AsyncSession, actor: Actor, application_id: Any, *, rate_plan_id: Any = None,
                  code: str | None = None) -> tuple[dict, str]:
    """Approve an application. Returns (partner, invite token)."""
    app = (await db.execute(text("""
        SELECT * FROM partner_applications WHERE id = CAST(:id AS uuid) FOR UPDATE
    """), {"id": str(application_id)})).mappings().first()
    if not app:
        raise ActionError("No such application.", 404)
    if app["status"] in ("approved", "rejected"):
        raise ActionError(f"This application was already {app['status']}.", 409)
    plan = await _rate_plan(db, rate_plan_id)
    clean = await _clean_code(db, code, name=app["name"])
    partner, token = await _make_partner(
        db, name=app["name"], email=app["email"], business=app["business_name"], website=app["website"],
        rate_plan=plan, code=clean, application_id=app["id"], terms_version=app["terms_version"], actor=actor)
    await db.execute(text("""
        UPDATE partner_applications SET status = 'approved', decided_by = :by, decided_at = now(),
               partner_id = :p, updated_at = now() WHERE id = :id
    """), {"by": actor.name, "p": partner["id"], "id": app["id"]})
    if app["terms_version"]:
        await db.execute(text("""
            UPDATE partner_terms_acceptances SET partner_id = :p WHERE application_id = :a AND partner_id IS NULL
        """), {"p": partner["id"], "a": app["id"]})
    await _log(db, actor, "application_approved", partner_id=partner["id"], subject_kind="application",
               subject_id=app["id"], before={"status": app["status"], "flags": app["flags"]},
               after={"rate_plan": plan["key"], "rate_bps": plan["rate_bps"], "code": clean})
    return partner, token


async def request_info(db: AsyncSession, actor: Actor, application_id: Any, question: str) -> dict:
    question = _need(question, "the question to ask")
    app = await _application(db, application_id)
    await db.execute(text("""
        UPDATE partner_applications SET status = 'info_requested', info_request = :q, updated_at = now()
         WHERE id = :id
    """), {"q": question, "id": app["id"]})
    await _log(db, actor, "info_requested", subject_kind="application", subject_id=app["id"],
               reason=question, before={"status": app["status"]}, after={"status": "info_requested"})
    return app


async def reject(db: AsyncSession, actor: Actor, application_id: Any, reason: str) -> dict:
    reason = _need(reason)
    app = await _application(db, application_id)
    await db.execute(text("""
        UPDATE partner_applications SET status = 'rejected', decided_by = :by, decided_at = now(),
               decision_reason = :r, updated_at = now() WHERE id = :id
    """), {"by": actor.name, "r": reason, "id": app["id"]})
    await _log(db, actor, "application_rejected", subject_kind="application", subject_id=app["id"],
               reason=reason, before={"status": app["status"]}, after={"status": "rejected"})
    return app


async def _application(db: AsyncSession, application_id: Any) -> dict:
    app = (await db.execute(text("""
        SELECT * FROM partner_applications WHERE id = CAST(:id AS uuid) FOR UPDATE
    """), {"id": str(application_id)})).mappings().first()
    if not app:
        raise ActionError("No such application.", 404)
    if app["status"] in ("approved", "rejected"):
        raise ActionError(f"This application was already {app['status']}.", 409)
    return dict(app)


async def add_partner(db: AsyncSession, actor: Actor, *, name: str, email: str, rate_plan_id: Any,
                      code: str | None, reason: str) -> tuple[dict, str]:
    """Add somebody straight to the program, skipping the application."""
    reason = _need(reason)
    if len((name or "").strip()) < 2:
        raise ActionError("Give the affiliate's name.")
    plan = await _rate_plan(db, rate_plan_id)
    clean = await _clean_code(db, code, name=name)
    partner, token = await _make_partner(
        db, name=name, email=email, business=None, website=None, rate_plan=plan, code=clean,
        application_id=None, terms_version=None, actor=actor)
    await _log(db, actor, "affiliate_added", partner_id=partner["id"], subject_kind="partner",
               subject_id=partner["id"], reason=reason,
               after={"email": partner["email"], "rate_plan": plan["key"], "code": clean})
    return partner, token


async def new_invite(db: AsyncSession, actor: Actor, partner_id: Any) -> tuple[dict, str]:
    p = await _partner(db, partner_id, lock=True)
    raw, digest = auth.link_token()
    await db.execute(text("""
        UPDATE partners SET invite_token_hash = :h, invite_expires_at = now() + make_interval(days => :d),
               updated_at = now() WHERE id = :id
    """), {"h": digest, "d": auth.INVITE_DAYS, "id": p["id"]})
    await _log(db, actor, "invite_sent", partner_id=p["id"], subject_kind="partner", subject_id=p["id"])
    return p, raw


# ── Rate, code and status ─────────────────────────────────────────────────────

async def set_rate(db: AsyncSession, actor: Actor, partner_id: Any, *, rate_plan_id: Any,
                   custom_rate_bps: int | None, custom_rate_ends_on: date | None, reason: str) -> dict:
    reason = _need(reason)
    p = await _partner(db, partner_id, lock=True)
    plan = await _rate_plan(db, rate_plan_id)
    if custom_rate_bps is not None and not 0 <= int(custom_rate_bps) <= 10000:
        raise ActionError("An override rate is from 0% to 100%.")
    if custom_rate_bps is None:
        custom_rate_ends_on = None
    before = {"rate_plan_id": str(p["rate_plan_id"]), "custom_rate": p["custom_rate_bps"],
              "custom_rate_ends_on": p["custom_rate_ends_on"]}
    await db.execute(text("""
        UPDATE partners SET rate_plan_id = :plan, custom_rate_bps = :bps, custom_rate_ends_on = :ends,
               updated_at = now() WHERE id = :id
    """), {"plan": plan["id"], "bps": custom_rate_bps, "ends": custom_rate_ends_on, "id": p["id"]})
    after = {"rate_plan_id": str(plan["id"]), "custom_rate": custom_rate_bps,
             "custom_rate_ends_on": custom_rate_ends_on}
    await _log(db, actor, "rate_changed", partner_id=p["id"], subject_kind="partner", subject_id=p["id"],
               reason=reason, before=before, after=after)
    return after


async def set_code(db: AsyncSession, actor: Actor, partner_id: Any, code: str, reason: str) -> str:
    reason = _need(reason)
    p = await _partner(db, partner_id, lock=True)
    clean = await _clean_code(db, code, name=p["name"], except_partner=p["id"])
    await db.execute(text("UPDATE partners SET code = :c, updated_at = now() WHERE id = :id"),
                     {"c": clean, "id": p["id"]})
    await _log(db, actor, "code_changed", partner_id=p["id"], subject_kind="partner", subject_id=p["id"],
               reason=reason, before={"code": p["code"]}, after={"code": clean})
    return clean


async def set_status(db: AsyncSession, actor: Actor, partner_id: Any, status: str, reason: str, *,
                     forfeit: bool = False) -> dict:
    """Pause, suspend, end or reactivate a partnership.

    Paused: the link stops tracking new shops; everything else carries on,
    payouts included. Suspended: no sign-in, every unpaid line is held until
    the account is active again. Ended: no new lines; what was earned is paid,
    unless the partnership ended for breaking the terms (`forfeit`), when
    lines still inside their hold are voided.
    """
    if status not in STATUSES:
        raise ActionError("Choose active, paused, suspended or terminated.")
    reason = _need(reason)
    p = await _partner(db, partner_id, lock=True)
    if p["status"] == "terminated":
        raise ActionError("This partnership has ended and cannot be changed.", 409)
    if p["status"] == status:
        raise ActionError(f"The account is already {status}.", 409)
    today = ledger.utc_today()
    changed = 0
    if status == "suspended":
        changed = (await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'held', hold_reason = 'Partner suspended'
             WHERE partner_id = :p AND status = 'open' AND batch_id IS NULL
        """), {"p": p["id"]})).rowcount
    elif p["status"] == "suspended":
        changed = (await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'open', hold_reason = NULL
             WHERE partner_id = :p AND status = 'held' AND hold_reason = 'Partner suspended'
        """), {"p": p["id"]})).rowcount
    if status == "terminated":
        # From suspended, the held lines were released just above; a forfeit
        # then takes what is still inside its hold.
        if forfeit:
            changed += (await db.execute(text("""
                UPDATE partner_commission_lines
                   SET status = 'void', status_note = 'Forfeited: partnership ended for breaking the terms'
                 WHERE partner_id = :p AND batch_id IS NULL
                   AND (status = 'held' OR (status = 'open' AND kind <> 'clawback' AND payable_on > :today))
            """), {"p": p["id"], "today": today})).rowcount
    ending = status == "terminated"
    await db.execute(text("""
        UPDATE partners SET status = :s, status_reason = :r, updated_at = now(),
               session_version = session_version + :bump,
               ended_at = CASE WHEN :ending THEN now() ELSE ended_at END,
               forfeit_pending = CASE WHEN :ending THEN :forfeit ELSE forfeit_pending END
         WHERE id = :id
    """), {"s": status, "r": reason, "bump": 1 if status in ("suspended", "terminated") else 0,
           "ending": ending, "forfeit": bool(forfeit) and ending, "id": p["id"]})
    await _log(db, actor, f"status_{status}", partner_id=p["id"], subject_kind="partner", subject_id=p["id"],
               reason=reason, before={"status": p["status"]},
               after={"status": status, "lines_changed": changed, "forfeit": bool(forfeit)})
    return {"status": status, "lines_changed": changed}


# ── Referrals ─────────────────────────────────────────────────────────────────

async def _referral(db: AsyncSession, referral_id: Any) -> dict:
    row = (await db.execute(text("""
        SELECT * FROM partner_referrals WHERE id = CAST(:id AS uuid) FOR UPDATE
    """), {"id": str(referral_id)})).mappings().first()
    if not row:
        raise ActionError("No such referral.", 404)
    return dict(row)


async def referral_decision(db: AsyncSession, actor: Actor, referral_id: Any, decision: str, reason: str,
                            *, new_partner_id: Any = None) -> dict:
    """exclude: stays attributed, earns nothing, its unpaid lines are voided.
    reassign: future lines go to another partner; earned lines stay where they are.
    clear: not a self referral after all; held lines are released.
    note: a note on the record, nothing else changes."""
    reason = _need(reason)
    r = await _referral(db, referral_id)
    before = {"partner_id": str(r["partner_id"]), "status": r["status"], "flags": r["flags"]}
    after: dict[str, Any]
    if decision == "exclude":
        voided = (await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'void', status_note = 'Referral excluded'
             WHERE referral_id = :r AND status IN ('open', 'held') AND batch_id IS NULL
        """), {"r": r["id"]})).rowcount
        await db.execute(text("""
            UPDATE partner_referrals SET status = 'excluded', decided_by = :by, decided_at = now(),
                   decision_reason = :reason, updated_at = now() WHERE id = :id
        """), {"by": actor.name, "reason": reason, "id": r["id"]})
        after = {"status": "excluded", "lines_voided": voided}
    elif decision == "reassign":
        target = await _partner(db, new_partner_id)
        if target["id"] == r["partner_id"]:
            raise ActionError("The shop is already with that affiliate.")
        if target["status"] == "terminated":
            raise ActionError("That partnership has ended.")
        await db.execute(text("""
            UPDATE partner_referrals SET partner_id = :p, decided_by = :by, decided_at = now(),
                   decision_reason = :reason, updated_at = now() WHERE id = :id
        """), {"p": target["id"], "by": actor.name, "reason": reason, "id": r["id"]})
        after = {"partner_id": str(target["id"]), "partner": target["name"]}
        await _log(db, actor, "referral_received", partner_id=target["id"], subject_kind="referral",
                   subject_id=r["id"], reason=reason, before=before, after=after)
    elif decision == "clear":
        released = (await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'open', hold_reason = NULL
             WHERE referral_id = :r AND status = 'held' AND hold_reason = 'Possible self referral'
        """), {"r": r["id"]})).rowcount
        await db.execute(text("""
            UPDATE partner_referrals SET status = 'active', flags = '[]'::jsonb, decided_by = :by,
                   decided_at = now(), decision_reason = :reason, updated_at = now() WHERE id = :id
        """), {"by": actor.name, "reason": reason, "id": r["id"]})
        after = {"status": "active", "lines_released": released}
    elif decision == "note":
        after = {}
    else:
        raise ActionError("Choose exclude, reassign, clear or note.")
    await _log(db, actor, f"referral_{decision}", partner_id=r["partner_id"], subject_kind="referral",
               subject_id=r["id"], reason=reason, before=before, after=after)
    return after


async def add_referral(db: AsyncSession, actor: Actor, partner_id: Any, shop_tenant_id: Any, reason: str) -> dict:
    """Give a shop to a partner by hand, when the link or code was missed."""
    reason = _need(reason)
    p = await _partner(db, partner_id)
    shop = (await db.execute(text("""
        SELECT t.id, t.name, t.email FROM tenants t WHERE t.id = CAST(:t AS uuid)
    """), {"t": str(shop_tenant_id)})).mappings().first()
    if not shop:
        raise ActionError("No such shop.", 404)
    if (await db.execute(text("SELECT 1 FROM partner_referrals WHERE shop_tenant_id = :t"),
                         {"t": shop["id"]})).first():
        raise ActionError("That shop is already referred. Reassign it instead.", 409)
    flags = ["added_by_admin"] + referrals.self_referral_flags(shop["email"] or "", p["email"], p["website"])
    # Earns from today for the program's earning period, like a sign-up made now.
    now = datetime.now(timezone.utc)
    until = program.earn_until(now, (await program.load(db))["earning_months"])
    rid = (await db.execute(text("""
        INSERT INTO partner_referrals (partner_id, shop_tenant_id, shop_name, owner_email, source, status, flags,
                                       decided_by, decided_at, decision_reason, attributed_at, earn_until)
        VALUES (:p, :t, :name, :email, 'manual', 'active', CAST(:flags AS jsonb), :by, now(), :reason, :at, :until)
        RETURNING id
    """), {"p": p["id"], "t": shop["id"], "name": shop["name"], "email": (shop["email"] or "").lower(),
           "flags": json.dumps(flags), "by": actor.name, "reason": reason, "at": now, "until": until})).scalar()
    await _log(db, actor, "referral_added", partner_id=p["id"], subject_kind="referral", subject_id=rid,
               reason=reason, after={"shop": shop["name"], "flags": flags})
    return {"id": str(rid), "flags": flags}


# ── Ledger ────────────────────────────────────────────────────────────────────

async def _lines_for(db: AsyncSession, ids: list[Any]) -> list[dict]:
    if not ids:
        raise ActionError("Select at least one line.")
    rows = (await db.execute(text("""
        SELECT id, partner_id, kind, status, amount_cents, batch_id, hold_reason
          FROM partner_commission_lines WHERE id = ANY(CAST(:ids AS uuid[])) FOR UPDATE
    """), {"ids": [str(i) for i in ids]})).mappings().all()
    if len(rows) != len(set(map(str, ids))):
        raise ActionError("Some of those lines no longer exist.", 404)
    return [dict(r) for r in rows]


async def hold_lines(db: AsyncSession, actor: Actor, ids: list[Any], hold_reason: str, note: str | None) -> int:
    if hold_reason not in HOLD_REASONS:
        raise ActionError("Choose a hold reason from the list.")
    if hold_reason == "Other":
        note = _need(note, "a note saying why")
    lines = await _lines_for(db, ids)
    movable = [ln for ln in lines if ln["status"] == "open" and not ln["batch_id"]]
    for ln in movable:
        await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'held', hold_reason = :r, status_note = :n WHERE id = :id
        """), {"r": hold_reason, "n": (note or "").strip() or None, "id": ln["id"]})
        await _log(db, actor, "line_held", partner_id=ln["partner_id"], subject_kind="line", subject_id=ln["id"],
                   reason=f"{hold_reason}{': ' + note if note else ''}", before={"status": "open"},
                   after={"status": "held", "hold_reason": hold_reason})
    return len(movable)


async def release_lines(db: AsyncSession, actor: Actor, ids: list[Any], note: str) -> int:
    note = _need(note)
    lines = await _lines_for(db, ids)
    held = [ln for ln in lines if ln["status"] == "held"]
    for ln in held:
        await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'open', hold_reason = NULL, status_note = :n WHERE id = :id
        """), {"n": note, "id": ln["id"]})
        await _log(db, actor, "line_released", partner_id=ln["partner_id"], subject_kind="line", subject_id=ln["id"],
                   reason=note, before={"status": "held", "hold_reason": ln["hold_reason"]}, after={"status": "open"})
    return len(held)


async def void_lines(db: AsyncSession, actor: Actor, ids: list[Any], note: str) -> int:
    """A void is permanent and the line forfeits. Its clawbacks go with it:
    taking back money for a line that will never be paid would charge twice."""
    note = _need(note)
    lines = await _lines_for(db, ids)
    voidable = [ln for ln in lines if ln["status"] in ("open", "held") and not ln["batch_id"]]
    for ln in voidable:
        await db.execute(text("""
            UPDATE partner_commission_lines SET status = 'void', status_note = :n
             WHERE (id = :id OR reverses_line_id = :id) AND status IN ('open', 'held') AND batch_id IS NULL
        """), {"n": note, "id": ln["id"]})
        await _log(db, actor, "line_voided", partner_id=ln["partner_id"], subject_kind="line", subject_id=ln["id"],
                   reason=note, before={"status": ln["status"], "amount_cents": ln["amount_cents"]},
                   after={"status": "void"})
    return len(voidable)


async def add_adjustment(db: AsyncSession, actor: Actor, partner_id: Any, amount_cents: int, reason: str) -> str:
    """A new line, plus or minus, payable now. Existing lines are never edited."""
    reason = _need(reason)
    if not amount_cents:
        raise ActionError("Give an amount other than zero.")
    if abs(int(amount_cents)) > 10_000_000:
        raise ActionError("That adjustment is larger than the program allows at once.")
    p = await _partner(db, partner_id)
    if p["status"] == "terminated" and amount_cents > 0:
        raise ActionError("This partnership has ended.")
    today = ledger.utc_today()
    lid = (await db.execute(text("""
        INSERT INTO partner_commission_lines (partner_id, kind, base_cents, rate_bps, amount_cents, status,
                                              status_note, earned_at, payable_on, created_by)
        VALUES (:p, 'adjustment', 0, 0, :amount, 'open', :note, now(), :today, :by) RETURNING id
    """), {"p": p["id"], "amount": int(amount_cents), "note": reason, "today": today, "by": actor.name})).scalar()
    await _log(db, actor, "adjustment_added", partner_id=p["id"], subject_kind="line", subject_id=lid,
               reason=reason, after={"amount_cents": int(amount_cents)})
    return str(lid)


# ── Payouts ───────────────────────────────────────────────────────────────────

async def _payable(db: AsyncSession, partner_id: Any) -> list[dict]:
    rows = (await db.execute(text("""
        SELECT id, amount_cents FROM partner_commission_lines
         WHERE partner_id = :p AND status = 'open' AND batch_id IS NULL AND payable_on <= :today
         FOR UPDATE
    """), {"p": str(partner_id), "today": ledger.utc_today()})).mappings().all()
    return [dict(r) for r in rows]


async def create_batch(db: AsyncSession, actor: Actor, partner_ids: list[Any], *, name: str | None,
                       note: str | None, w9_overrides: dict[str, str] | None = None) -> dict:
    """Lock the payable lines of these partners until the payout is recorded or the batch cancelled.

    An ended partnership is paid what it earned: its payable lines go in as
    a final payout, whatever the minimum (ledger.payout_readiness).
    """
    if not partner_ids:
        raise ActionError("Select at least one affiliate.")
    settings = await program.load(db)
    overrides = {str(k): (v or "").strip() for k, v in (w9_overrides or {}).items()}
    today = ledger.utc_today()
    name = (name or "").strip()[:40] or f"B-{today:%Y-%m}"
    if (await db.execute(text("SELECT 1 FROM partner_payout_batches WHERE name = :n"), {"n": name})).first():
        n = 2
        while (await db.execute(text("SELECT 1 FROM partner_payout_batches WHERE name = :n"),
                                {"n": f"{name}-{n}"})).first():
            n += 1
        name = f"{name}-{n}"
    bid = (await db.execute(text("""
        INSERT INTO partner_payout_batches (name, note, created_by) VALUES (:n, :note, :by) RETURNING id
    """), {"n": name, "note": (note or "").strip() or None, "by": actor.name})).scalar()
    included, total, locked = [], 0, 0
    for pid in dict.fromkeys(map(str, partner_ids)):
        p = await _partner(db, pid)
        has_w9 = bool((await db.execute(text("""
            SELECT 1 FROM partner_documents WHERE partner_id = :p AND kind = 'w9' AND replaced_at IS NULL
        """), {"p": p["id"]})).first())
        this_year = (await portal.paid_in_year(db, today.year, p["id"])).get(str(p["id"]), 0)
        lines = await _payable(db, p["id"])
        amount = sum(int(ln["amount_cents"]) for ln in lines)
        state, words = ledger.payout_readiness(partner_status=p["status"], payable=amount,
                                               minimum=settings["minimum_payout_cents"], has_w9=has_w9,
                                               paid_this_year=this_year, w9_from=settings["w9_required_from_cents"])
        # An override only stands in for a W-9 this payout needs.
        override = overrides.get(str(p["id"])) if state == "blocked" else None
        if override:
            state = "ready"
        if state != "ready":
            raise ActionError(f"{p['name']} cannot be paid in this batch: {words}.", 409)
        await db.execute(text("""
            UPDATE partner_commission_lines SET batch_id = :b WHERE id = ANY(CAST(:ids AS uuid[]))
        """), {"b": bid, "ids": [str(ln["id"]) for ln in lines]})
        included.append({"partner_id": str(p["id"]), "name": p["name"], "amount_cents": amount,
                         "lines": len(lines), "w9_override": override})
        total += amount
        locked += len(lines)
        # On the affiliate's own Activity tab too, not only the batch's.
        await _log(db, actor, "batch_included", partner_id=p["id"], subject_kind="batch", subject_id=bid,
                   after={"batch": name, "amount_cents": amount, "lines": len(lines),
                          "w9_override": included[-1]["w9_override"]})
    await _log(db, actor, "batch_created", subject_kind="batch", subject_id=bid, reason=note,
               after={"name": name, "partners": included, "total_cents": total, "lines": locked})
    return {"id": str(bid), "name": name, "total_cents": total, "lines": locked, "partners": included}


async def cancel_batch(db: AsyncSession, actor: Actor, batch_id: Any, reason: str) -> int:
    reason = _need(reason)
    b = (await db.execute(text("SELECT * FROM partner_payout_batches WHERE id = CAST(:id AS uuid) FOR UPDATE"),
                          {"id": str(batch_id)})).mappings().first()
    if not b:
        raise ActionError("No such batch.", 404)
    if b["status"] != "open":
        raise ActionError("Only an open batch can be cancelled.", 409)
    freed = (await db.execute(text("""
        UPDATE partner_commission_lines SET batch_id = NULL WHERE batch_id = :b AND status = 'open'
    """), {"b": b["id"]})).rowcount
    await db.execute(text("""
        UPDATE partner_payout_batches SET status = CASE WHEN EXISTS (
                   SELECT 1 FROM partner_payouts WHERE batch_id = :b) THEN 'paid' ELSE 'cancelled' END,
               closed_at = now() WHERE id = :b
    """), {"b": b["id"]})
    await _log(db, actor, "batch_cancelled", subject_kind="batch", subject_id=b["id"], reason=reason,
               after={"lines_freed": freed})
    return freed


async def record_payout(db: AsyncSession, actor: Actor, batch_id: Any, partner_id: Any, *, paid_on: date,
                        method: str, reference: str | None, w9_override_reason: str | None) -> dict:
    """Record a payout made outside the system. Its lines are marked paid."""
    if method not in METHODS:
        raise ActionError("Choose PayPal, Wise or bank transfer.")
    if paid_on > ledger.utc_today() + timedelta(days=1):
        raise ActionError("A payout cannot be recorded for a future date.")
    b = (await db.execute(text("SELECT * FROM partner_payout_batches WHERE id = CAST(:id AS uuid) FOR UPDATE"),
                          {"id": str(batch_id)})).mappings().first()
    if not b or b["status"] != "open":
        raise ActionError("That batch is not open.", 409)
    p = await _partner(db, partner_id)
    lines = (await db.execute(text("""
        SELECT id, amount_cents FROM partner_commission_lines
         WHERE batch_id = :b AND partner_id = :p AND status = 'open' FOR UPDATE
    """), {"b": b["id"], "p": p["id"]})).mappings().all()
    if not lines:
        raise ActionError("This affiliate has nothing waiting in that batch.", 409)
    has_w9 = bool((await db.execute(text("""
        SELECT 1 FROM partner_documents WHERE partner_id = :p AND kind = 'w9' AND replaced_at IS NULL
    """), {"p": p["id"]})).first())
    override = (w9_override_reason or "").strip() or None
    amount = sum(int(ln["amount_cents"]) for ln in lines)
    # The year the payout is paid in decides, this payout included.
    settings = await program.load(db)
    this_year = (await portal.paid_in_year(db, paid_on.year, p["id"])).get(str(p["id"]), 0)
    needs_w9 = not has_w9 and ledger.w9_needed(paid_this_year=this_year, payout=amount,
                                               required_from=settings["w9_required_from_cents"])
    if needs_w9 and not override:
        raise ActionError(f"{p['name']} has no W-9. Upload it, or override with a reason.", 409)
    pay_id = (await db.execute(text("""
        INSERT INTO partner_payouts (batch_id, partner_id, amount_cents, method, reference, paid_on,
                                     recorded_by, w9_override_reason)
        VALUES (:b, :p, :amount, :method, :ref, :paid_on, :by, :override) RETURNING id
    """), {"b": b["id"], "p": p["id"], "amount": amount, "method": method,
           "ref": (reference or "").strip()[:200] or None, "paid_on": paid_on, "by": actor.name,
           "override": override if needs_w9 else None})).scalar()
    await db.execute(text("""
        UPDATE partner_commission_lines SET status = 'paid', payout_id = :po WHERE id = ANY(CAST(:ids AS uuid[]))
    """), {"po": pay_id, "ids": [str(ln["id"]) for ln in lines]})
    remaining = (await db.execute(text("""
        SELECT 1 FROM partner_commission_lines WHERE batch_id = :b AND status = 'open' LIMIT 1
    """), {"b": b["id"]})).first()
    if not remaining:
        await db.execute(text("UPDATE partner_payout_batches SET status = 'paid', closed_at = now() WHERE id = :b"),
                         {"b": b["id"]})
    await _log(db, actor, "payout_recorded", partner_id=p["id"], subject_kind="payout", subject_id=pay_id,
               reason=override if needs_w9 else None,
               after={"batch": b["name"], "amount_cents": amount, "method": method, "paid_on": paid_on,
                      "lines": len(lines), "w9_override": bool(override and needs_w9)})
    return {"id": str(pay_id), "amount_cents": amount, "lines": len(lines), "partner": p}


# ── Terms ─────────────────────────────────────────────────────────────────────

async def publish_terms(db: AsyncSession, actor: Actor, clauses: list[dict], changes: str) -> int:
    changes = _need(changes, "a summary of what changed")
    clean = [{"title": str(c.get("title") or "").strip()[:120], "text": str(c.get("text") or "").strip()[:4000]}
             for c in clauses if isinstance(c, dict) and str(c.get("text") or "").strip()]
    if not clean:
        raise ActionError("The terms need at least one clause.")
    latest = await program.latest_terms(db)
    version = (latest["version"] if latest else 0) + 1
    await db.execute(text("""
        INSERT INTO partner_terms_versions (version, clauses, changes, published_by)
        VALUES (:v, CAST(:c AS jsonb), :ch, :by)
    """), {"v": version, "c": json.dumps(clean), "ch": changes, "by": actor.name})
    await _log(db, actor, "terms_published", subject_kind="terms", subject_id=version, reason=changes,
               after={"version": version, "clauses": len(clean)})
    return version


async def accept_terms(db: AsyncSession, partner: dict, version: int, *, ip: str | None,
                       user_agent: str | None) -> int:
    """A partner accepts the newest terms. Lines held only for that are released."""
    latest = await program.latest_terms(db)
    if not latest or int(version) != latest["version"]:
        raise ActionError("Those are not the newest terms. Reload the page.", 409)
    await db.execute(text("""
        INSERT INTO partner_terms_acceptances (partner_id, version, ip_hash, user_agent)
        VALUES (:p, :v, :ip, :ua)
    """), {"p": partner["id"], "v": latest["version"], "ip": auth.ip_hash(ip), "ua": (user_agent or "")[:300]})
    await db.execute(text("UPDATE partners SET terms_version = :v, updated_at = now() WHERE id = :p"),
                     {"v": latest["version"], "p": partner["id"]})
    released = (await db.execute(text("""
        UPDATE partner_commission_lines SET status = 'open', hold_reason = NULL
         WHERE partner_id = :p AND status = 'held' AND hold_reason = 'Terms not accepted'
    """), {"p": partner["id"]})).rowcount
    await activity.log(db, action="terms_accepted", actor_kind="partner", actor_name=partner["name"],
                       actor_email=partner["email"], partner_id=partner["id"], subject_kind="terms",
                       subject_id=latest["version"], after={"version": latest["version"], "lines_released": released})
    return released
