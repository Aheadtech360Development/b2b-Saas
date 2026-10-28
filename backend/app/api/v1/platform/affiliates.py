"""Platform API: the partner program's Affiliates tab.

Platform admins only: every path under /api/v1/platform/ is refused to
anybody else by the auth middleware. Reads are in
services/partners/admin_views.py and changes in services/partners/actions.py,
which log each one with its reason.
"""
from __future__ import annotations

import json
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services.partners import actions, admin_views, auth, docs, mail, portal, program, statements
from app.services.partners.actions import ActionError, Actor

router = APIRouter(prefix="/platform/affiliates", tags=["platform", "partners"])


async def _actor(request: Request, db: AsyncSession) -> Actor:
    uid = getattr(request.state, "user_id", None)
    row = None
    if uid:
        row = (await db.execute(text("""
            SELECT first_name, last_name, email FROM users WHERE id = CAST(:id AS uuid)
        """), {"id": str(uid)})).mappings().first()
    if not row:
        return Actor(name="Platform admin")
    name = f"{row['first_name'] or ''} {row['last_name'] or ''}".strip() or row["email"]
    return Actor(name=name, email=row["email"])


def _fail(exc: ActionError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail={"code": "ACTION", "message": str(exc)})


def _not_found(what: str) -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": f"No such {what}."})


async def _support(db: AsyncSession) -> str:
    """The program's support email for the emails a change sends (mail.py)."""
    return (await program.load(db))["support_email"]


def _csv(body: str, name: str) -> Response:
    return Response(body, media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})


# ── Overview ──────────────────────────────────────────────────────────────────

@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.overview(db)


@router.get("/badge")
async def badge(db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, int]:
    """The counts on the tab and its menu: applications waiting for a
    decision, referrals waiting for review, Stripe events that failed."""
    row = (await db.execute(text("""
        SELECT (SELECT COUNT(*) FROM partner_applications WHERE status IN ('waiting', 'info_requested')) AS a,
               (SELECT COUNT(*) FROM partner_referrals WHERE status = 'review') AS r,
               (SELECT COUNT(*) FROM partner_stripe_events WHERE result = 'failed') AS f
    """))).first()
    return {"applications": int(row[0] or 0), "review": int(row[1] or 0), "failed": int(row[2] or 0)}


# ── Applications ──────────────────────────────────────────────────────────────

@router.get("/applications")
async def applications(tab: str = "waiting", flagged: bool = False, q: str | None = None,
                       db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.applications(db, tab, flagged, q)


@router.get("/applications/{application_id}")
async def application(application_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    found = await admin_views.application(db, application_id)
    if not found:
        raise _not_found("application")
    return found


class ApproveIn(BaseModel):
    rate_plan_id: str | None = None
    code: str | None = Field(default=None, max_length=40)
    send_invite: bool = True


@router.post("/applications/{application_id}/approve")
async def approve(application_id: str, payload: ApproveIn, request: Request, background: BackgroundTasks,
                  db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        partner, token = await actions.approve(db, await _actor(request, db), application_id,
                                               rate_plan_id=payload.rate_plan_id, code=payload.code)
    except ActionError as exc:
        raise _fail(exc) from exc
    if payload.send_invite:
        plan = (await db.execute(text("SELECT rate_bps FROM partner_rate_plans WHERE id = :id"),
                                 {"id": partner["rate_plan_id"]})).scalar()
        background.add_task(mail.invite, partner["name"], partner["email"],
                            mail.portal_url(f"/partners/invite?token={token}"), partner["code"],
                            program.rate_words(plan) if plan is not None else None, support=await _support(db))
    return {"ok": True, "partner_id": str(partner["id"]), "code": partner["code"]}


class QuestionIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)


@router.post("/applications/{application_id}/request-info")
async def request_info(application_id: str, payload: QuestionIn, request: Request, background: BackgroundTasks,
                       db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        app = await actions.request_info(db, await _actor(request, db), application_id, payload.question)
    except ActionError as exc:
        raise _fail(exc) from exc
    background.add_task(mail.info_requested, app["name"], app["email"], payload.question, support=await _support(db))
    return {"ok": True}


class RejectIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)
    notify: bool = True


@router.post("/applications/{application_id}/reject")
async def reject(application_id: str, payload: RejectIn, request: Request, background: BackgroundTasks,
                 db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        app = await actions.reject(db, await _actor(request, db), application_id, payload.reason)
    except ActionError as exc:
        raise _fail(exc) from exc
    if payload.notify:
        background.add_task(mail.application_declined, app["name"], app["email"], support=await _support(db))
    return {"ok": True}


class NoteIn(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


@router.post("/{subject_kind}/{subject_id}/notes")
async def add_note(subject_kind: Literal["applications", "affiliates", "referrals"], subject_id: str,
                   payload: NoteIn, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    """An internal note. Only admins see it; it lives in the activity log."""
    actor = await _actor(request, db)
    kind = {"applications": "application", "affiliates": "partner", "referrals": "referral"}[subject_kind]
    partner_id = subject_id if kind == "partner" else None
    if kind == "referral":
        partner_id = (await db.execute(text("SELECT partner_id FROM partner_referrals WHERE id = CAST(:id AS uuid)"),
                                       {"id": subject_id})).scalar()
    from app.services.partners import activity

    await activity.log(db, action="note", actor_kind="admin", actor_name=actor.name, actor_email=actor.email,
                       partner_id=partner_id, subject_kind=kind, subject_id=subject_id, reason=payload.note.strip())
    return {"ok": True}


# ── Affiliates ────────────────────────────────────────────────────────────────

@router.get("/affiliates")
async def affiliates(status: str | None = None, rate_plan: str | None = None, w9_missing: bool = False,
                     q: str | None = None, shop_plan: str | None = None,
                     db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.affiliates(db, status, rate_plan, w9_missing, q, shop_plan)


@router.get("/affiliates.csv")
async def affiliates_csv(db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    import csv
    import io

    data = await admin_views.affiliates(db, None, None, False, None)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Name", "Email", "Code", "Status", "Rate", "Referred shops", "Payable", "W-9", "Joined"])
    for r in data["rows"]:
        w.writerow([r["name"], r["email"], r["code"], r["status"], r["rate"], r["shops"],
                    f"{r['payable_cents'] / 100:.2f}", "yes" if r["has_w9"] else "no", r["joined"].date().isoformat()])
    return _csv(out.getvalue(), "affiliates.csv")


class AddAffiliateIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    email: str = Field(min_length=3, max_length=255)
    rate_plan_id: str | None = None
    code: str | None = Field(default=None, max_length=40)
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/affiliates")
async def add_affiliate(payload: AddAffiliateIn, request: Request, background: BackgroundTasks,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    from pydantic import TypeAdapter
    from pydantic import EmailStr

    try:
        email = TypeAdapter(EmailStr).validate_python(payload.email.strip())
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, detail={"code": "EMAIL", "message": "That email does not look right."}) from exc
    try:
        partner, token = await actions.add_partner(db, await _actor(request, db), name=payload.name, email=email,
                                                   rate_plan_id=payload.rate_plan_id, code=payload.code,
                                                   reason=payload.reason)
    except ActionError as exc:
        raise _fail(exc) from exc
    plan = (await db.execute(text("SELECT rate_bps FROM partner_rate_plans WHERE id = :id"),
                             {"id": partner["rate_plan_id"]})).scalar()
    background.add_task(mail.invite, partner["name"], partner["email"],
                        mail.portal_url(f"/partners/invite?token={token}"), partner["code"],
                        program.rate_words(plan) if plan is not None else None, support=await _support(db))
    return {"ok": True, "partner_id": str(partner["id"]), "code": partner["code"]}


@router.get("/affiliates/{partner_id}")
async def affiliate(partner_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    found = await admin_views.affiliate(db, partner_id)
    if not found:
        raise _not_found("affiliate")
    return found


@router.get("/affiliates/{partner_id}/referrals")
async def affiliate_referrals(partner_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.affiliate_shops(db, partner_id)


@router.get("/affiliates/{partner_id}/payouts")
async def affiliate_payouts(partner_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.affiliate_payouts(db, partner_id)


@router.get("/affiliates/{partner_id}/documents")
async def affiliate_documents(partner_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.affiliate_documents(db, partner_id)


@router.get("/affiliates/{partner_id}/documents/{document_id}")
async def affiliate_document(partner_id: str, document_id: str, request: Request,
                             db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    """A W-9, decrypted for the admin who asked. Every download is logged."""
    row = (await db.execute(text("""
        SELECT id, filename, mime, data FROM partner_documents
         WHERE id = CAST(:d AS uuid) AND partner_id = CAST(:p AS uuid)
    """), {"d": document_id, "p": partner_id})).mappings().first()
    if not row:
        raise _not_found("document")
    try:
        data = docs.unseal(row["data"])
    except docs.DocumentError as exc:
        raise HTTPException(409, detail={"code": "KEY", "message": str(exc)}) from exc
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="w9_viewed", actor_kind="admin", actor_name=actor.name, actor_email=actor.email,
                       partner_id=partner_id, subject_kind="document", subject_id=row["id"])
    return Response(data, media_type=row["mime"],
                    headers={"Content-Disposition": f'attachment; filename="{row["filename"] or "w9"}"',
                             "Cache-Control": "no-store"})


@router.get("/affiliates/{partner_id}/activity")
async def affiliate_activity(partner_id: str, page: int = Query(1, ge=1),
                             db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.activity_view(db, partner_id, None, page)


class RateIn(BaseModel):
    rate_plan_id: str
    custom_rate_bps: int | None = Field(default=None, ge=0, le=10000)
    custom_rate_ends_on: date | None = None
    reason: str = Field(min_length=1, max_length=1000)


@router.put("/affiliates/{partner_id}/rate")
async def set_rate(partner_id: str, payload: RateIn, request: Request,
                   db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return await actions.set_rate(db, await _actor(request, db), partner_id, rate_plan_id=payload.rate_plan_id,
                                      custom_rate_bps=payload.custom_rate_bps,
                                      custom_rate_ends_on=payload.custom_rate_ends_on, reason=payload.reason)
    except ActionError as exc:
        raise _fail(exc) from exc


class CodeIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    reason: str = Field(min_length=1, max_length=1000)


@router.put("/affiliates/{partner_id}/code")
async def set_code(partner_id: str, payload: CodeIn, request: Request,
                   db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return {"code": await actions.set_code(db, await _actor(request, db), partner_id, payload.code, payload.reason)}
    except ActionError as exc:
        raise _fail(exc) from exc


class StatusIn(BaseModel):
    status: Literal["active", "paused", "suspended", "terminated"]
    reason: str = Field(min_length=1, max_length=1000)
    forfeit: bool = False
    notify: bool = True


@router.post("/affiliates/{partner_id}/status")
async def set_status(partner_id: str, payload: StatusIn, request: Request, background: BackgroundTasks,
                     db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        out = await actions.set_status(db, await _actor(request, db), partner_id, payload.status, payload.reason,
                                       forfeit=payload.forfeit)
    except ActionError as exc:
        raise _fail(exc) from exc
    if payload.notify:
        p = (await db.execute(text("SELECT name, email FROM partners WHERE id = CAST(:id AS uuid)"),
                              {"id": partner_id})).mappings().first()
        background.add_task(mail.status_changed, p["name"], p["email"], payload.status, support=await _support(db))
    return out


@router.post("/affiliates/{partner_id}/invite")
async def resend_invite(partner_id: str, request: Request, background: BackgroundTasks,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        p, token = await actions.new_invite(db, await _actor(request, db), partner_id)
    except ActionError as exc:
        raise _fail(exc) from exc
    if p["password_hash"]:
        raise HTTPException(409, detail={"code": "ACTIVE", "message": "This affiliate already set a password."})
    background.add_task(mail.invite, p["name"], p["email"], mail.portal_url(f"/partners/invite?token={token}"),
                        p["code"], None, support=await _support(db))
    return {"ok": True}


@router.post("/affiliates/{partner_id}/view-as")
async def view_as(partner_id: str, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    """A read-only partner session, so the admin sees exactly what the affiliate sees."""
    p = await portal.partner_row(db, partner_id)
    if not p:
        raise _not_found("affiliate")
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="viewed_as_affiliate", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, partner_id=p["id"], subject_kind="partner", subject_id=p["id"])
    token = auth.access_token(p["id"], p["session_version"], view_as=getattr(request.state, "user_id", None) or "admin")
    return {"access_token": token, "url": mail.portal_url(f"/partners/view#token={token}")}


# ── Referrals ─────────────────────────────────────────────────────────────────

@router.get("/referrals")
async def referral_list(tab: str = "all", partner_id: str | None = None, plan: str | None = None,
                        source: str | None = None, q: str | None = None,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.referral_list(db, tab, partner_id, plan, source, q)


@router.get("/referrals.csv")
async def referrals_csv(db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    import csv
    import io

    data = await admin_views.referral_list(db, "all", None, None, None, None)
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Shop", "Affiliate", "Plan", "Status", "Source", "Attributed", "Flags"])
    for r in data["rows"]:
        w.writerow([r["shop_name"], r["partner_name"], r["plan_name"], r["state"], r["source"],
                    r["attributed_at"].date().isoformat(), " ".join(r["flags"])])
    return _csv(out.getvalue(), "referrals.csv")


@router.get("/referrals/{referral_id}")
async def referral(referral_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    found = await admin_views.referral(db, referral_id)
    if not found:
        raise _not_found("referral")
    return found


class DecisionIn(BaseModel):
    decision: Literal["exclude", "reassign", "clear", "note"]
    reason: str = Field(min_length=1, max_length=1000)
    new_partner_id: str | None = None


@router.post("/referrals/{referral_id}/decision")
async def referral_decision(referral_id: str, payload: DecisionIn, request: Request,
                            db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return await actions.referral_decision(db, await _actor(request, db), referral_id, payload.decision,
                                               payload.reason, new_partner_id=payload.new_partner_id)
    except ActionError as exc:
        raise _fail(exc) from exc


class ManualReferralIn(BaseModel):
    partner_id: str
    shop_tenant_id: str
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/referrals")
async def add_referral(payload: ManualReferralIn, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return await actions.add_referral(db, await _actor(request, db), payload.partner_id, payload.shop_tenant_id,
                                          payload.reason)
    except ActionError as exc:
        raise _fail(exc) from exc


@router.get("/shops")
async def shops(q: str = Query(min_length=2, max_length=80), db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    """Shops to choose from when adding a referral by hand."""
    rows = (await db.execute(text("""
        SELECT t.id, t.name, t.slug, t.plan,
               EXISTS (SELECT 1 FROM partner_referrals r WHERE r.shop_tenant_id = t.id) AS referred
          FROM tenants t WHERE t.name ILIKE :q OR t.slug ILIKE :q ORDER BY t.name LIMIT 20
    """), {"q": f"%{q.strip()}%"})).mappings().all()
    return [{**dict(r), "id": str(r["id"])} for r in rows]


# ── Ledger ────────────────────────────────────────────────────────────────────

@router.get("/ledger")
async def ledger_view(state: str | None = None, partner_id: str | None = None, months: int = Query(6, ge=0, le=120),
                      q: str | None = None, page: int = Query(1, ge=1), plan: str | None = None,
                      db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.ledger_view(db, state, partner_id, months, q, page, plan)


@router.get("/ledger.csv")
async def ledger_csv(db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    return _csv(await admin_views.ledger_csv(db), "ledger.csv")


class LinesIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=500)
    note: str | None = Field(default=None, max_length=1000)
    reason: str | None = Field(default=None, max_length=60)


@router.post("/ledger/{what}")
async def ledger_action(what: Literal["hold", "release", "void"], payload: LinesIn, request: Request,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    actor = await _actor(request, db)
    try:
        if what == "hold":
            n = await actions.hold_lines(db, actor, payload.ids, payload.reason or "", payload.note)
        elif what == "release":
            n = await actions.release_lines(db, actor, payload.ids, payload.note or "")
        else:
            n = await actions.void_lines(db, actor, payload.ids, payload.note or "")
    except ActionError as exc:
        raise _fail(exc) from exc
    return {"ok": True, "changed": n}


class AdjustmentIn(BaseModel):
    partner_id: str
    amount_cents: int
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/adjustments")
async def adjustment(payload: AdjustmentIn, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        line_id = await actions.add_adjustment(db, await _actor(request, db), payload.partner_id,
                                               payload.amount_cents, payload.reason)
    except ActionError as exc:
        raise _fail(exc) from exc
    return {"ok": True, "line_id": line_id}


# ── Payouts ───────────────────────────────────────────────────────────────────

@router.get("/payouts/payables")
async def payables(db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.payables(db)


@router.get("/payouts/batches")
async def batches(db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.batches(db)


@router.get("/payouts/history")
async def history(db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.paid_history(db)


@router.get("/payouts/yearly")
async def yearly(db: AsyncSession = Depends(get_db, scope="function")) -> list[dict]:
    return await admin_views.yearly_totals(db)


@router.get("/payouts.csv")
async def payouts_csv(db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    import csv
    import io

    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Paid on", "Affiliate", "Amount", "Method", "Reference", "Lines", "Batch", "Recorded by"])
    for r in await admin_views.paid_history(db):
        w.writerow([r["paid_on"].isoformat(), r["partner_name"], f"{r['amount_cents'] / 100:.2f}", r["method"],
                    r["reference"] or "", r["lines"], r["batch"] or "", r["recorded_by"] or ""])
    return _csv(out.getvalue(), "payouts.csv")


class BatchIn(BaseModel):
    partner_ids: list[str] = Field(min_length=1, max_length=500)
    name: str | None = Field(default=None, max_length=40)
    note: str | None = Field(default=None, max_length=1000)
    w9_overrides: dict[str, str] = Field(default_factory=dict)


@router.post("/payouts/batches")
async def create_batch(payload: BatchIn, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return await actions.create_batch(db, await _actor(request, db), payload.partner_ids, name=payload.name,
                                          note=payload.note, w9_overrides=payload.w9_overrides)
    except ActionError as exc:
        raise _fail(exc) from exc


class ReasonIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/payouts/batches/{batch_id}/cancel")
async def cancel_batch(batch_id: str, payload: ReasonIn, request: Request,
                       db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        return {"ok": True, "lines_freed": await actions.cancel_batch(db, await _actor(request, db), batch_id,
                                                                      payload.reason)}
    except ActionError as exc:
        raise _fail(exc) from exc


class RecordIn(BaseModel):
    partner_id: str
    paid_on: date
    method: Literal["paypal", "wise", "bank"]
    reference: str | None = Field(default=None, max_length=200)
    w9_override_reason: str | None = Field(default=None, max_length=1000)


@router.post("/payouts/batches/{batch_id}/record")
async def record_payout(batch_id: str, payload: RecordIn, request: Request, background: BackgroundTasks,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        out = await actions.record_payout(db, await _actor(request, db), batch_id, payload.partner_id,
                                          paid_on=payload.paid_on, method=payload.method, reference=payload.reference,
                                          w9_override_reason=payload.w9_override_reason)
    except ActionError as exc:
        raise _fail(exc) from exc
    p = out.pop("partner")
    full = await portal.partner_row(db, p["id"])
    from app.api.v1.partners_portal import payout_statement_pdf
    from app.services.partners.ledger import money

    pdf = await payout_statement_pdf(db, full, out["id"])
    method = {"paypal": "PayPal", "wise": "Wise", "bank": "Bank transfer"}[payload.method]
    background.add_task(mail.payout_recorded, p["name"], p["email"], money(out["amount_cents"]),
                        f"{payload.paid_on:%b} {payload.paid_on.day}, {payload.paid_on.year}", method,
                        payload.reference, pdf, f"statement-{payload.paid_on.isoformat()}.pdf",
                        support=await _support(db))
    await db.execute(text("UPDATE partner_payouts SET statement_sent_at = now() WHERE id = CAST(:id AS uuid)"),
                     {"id": out["id"]})
    return {"ok": True, **out}


# ── Program settings, rates, terms and assets ─────────────────────────────────

@router.get("/settings")
async def settings_view(db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    from app.core.billing_plans import PLAN_ORDER

    terms = await program.latest_terms(db)
    assets = (await db.execute(text("""
        SELECT id, title, width, height, mime, size_bytes, created_at FROM partner_assets ORDER BY sort, created_at
    """))).mappings().all()
    return {"settings": await program.load(db),
            "rate_plans": [{**p, "id": str(p["id"]), "rate": program.rate_words(p["rate_bps"])}
                           for p in await program.rate_plans(db)],
            "plans": [{"key": k, "name": program.plan_name(k), "price_cents": program.plan_price_cents(k)}
                      for k in PLAN_ORDER],
            "terms": terms, "assets": [{**dict(a), "id": str(a["id"])} for a in assets]}


@router.put("/settings")
async def save_settings(payload: dict, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    reason = str(payload.pop("reason", "") or "").strip() or None
    try:
        before, after = await program.save(db, payload)
    except program.SettingError as exc:
        raise HTTPException(400, detail={"code": "SETTING", "message": str(exc)}) from exc
    actor = await _actor(request, db)
    from app.services.partners import activity

    changed = {k: after[k] for k in payload if before.get(k) != after.get(k)}
    if changed:
        await activity.log(db, action="settings_changed", actor_kind="admin", actor_name=actor.name,
                           actor_email=actor.email, subject_kind="settings", subject_id="program", reason=reason,
                           before={k: before.get(k) for k in changed}, after=changed)
    return {"ok": True, "settings": after}


class RatePlanIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    rate_bps: int = Field(ge=0, le=10000)
    is_public: bool = False
    reason: str = Field(min_length=1, max_length=1000)


@router.put("/rate-plans/{plan_id}")
async def update_rate_plan(plan_id: str, payload: RatePlanIn, request: Request,
                           db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    before = (await db.execute(text("SELECT * FROM partner_rate_plans WHERE id = CAST(:id AS uuid)"),
                               {"id": plan_id})).mappings().first()
    if not before:
        raise _not_found("rate plan")
    if payload.is_public:
        await db.execute(text("UPDATE partner_rate_plans SET is_public = false WHERE id <> CAST(:id AS uuid)"),
                         {"id": plan_id})
    await db.execute(text("""
        UPDATE partner_rate_plans SET name = :n, rate_bps = :r, is_public = :pub, updated_at = now()
         WHERE id = CAST(:id AS uuid)
    """), {"n": payload.name.strip(), "r": payload.rate_bps, "pub": payload.is_public, "id": plan_id})
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="rate_plan_changed", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, subject_kind="rate_plan", subject_id=plan_id, reason=payload.reason,
                       before={"name": before["name"], "rate_bps": before["rate_bps"], "is_public": before["is_public"]},
                       after={"name": payload.name, "rate_bps": payload.rate_bps, "is_public": payload.is_public})
    return {"ok": True}


class NewRatePlanIn(RatePlanIn):
    key: str = Field(min_length=2, max_length=40, pattern=r"^[a-z0-9_-]+$")


@router.post("/rate-plans")
async def add_rate_plan(payload: NewRatePlanIn, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    if (await db.execute(text("SELECT 1 FROM partner_rate_plans WHERE key = :k"), {"k": payload.key})).first():
        raise HTTPException(409, detail={"code": "TAKEN", "message": "There is already a rate plan with that key."})
    plan_id = (await db.execute(text("""
        INSERT INTO partner_rate_plans (key, name, rate_bps, is_public) VALUES (:k, :n, :r, false) RETURNING id
    """), {"k": payload.key, "n": payload.name.strip(), "r": payload.rate_bps})).scalar()
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="rate_plan_added", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, subject_kind="rate_plan", subject_id=plan_id, reason=payload.reason,
                       after={"key": payload.key, "name": payload.name, "rate_bps": payload.rate_bps})
    return {"ok": True, "id": str(plan_id)}


@router.post("/rate-plans/{plan_id}/default")
async def make_default_rate_plan(plan_id: str, payload: ReasonIn, request: Request,
                                 db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    """The plan an affiliate is approved on unless the admin picks another,
    auto approve included. One plan at a time: the old default and the new
    one change in the same statement, in the request's one transaction."""
    plan = (await db.execute(text("SELECT id, name, is_default FROM partner_rate_plans WHERE id = CAST(:id AS uuid)"),
                             {"id": plan_id})).mappings().first()
    if not plan:
        raise _not_found("rate plan")
    if plan["is_default"]:
        return {"ok": True}
    was = (await db.execute(text("SELECT name FROM partner_rate_plans WHERE is_default LIMIT 1"))).scalar()
    await db.execute(text("""
        UPDATE partner_rate_plans SET is_default = (id = CAST(:id AS uuid)), updated_at = now()
         WHERE is_default OR id = CAST(:id AS uuid)
    """), {"id": plan_id})
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="rate_plan_changed", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, subject_kind="rate_plan", subject_id=plan_id, reason=payload.reason,
                       before={"default": was}, after={"default": plan["name"]})
    return {"ok": True}


class TermsIn(BaseModel):
    clauses: list[dict] = Field(min_length=1, max_length=40)
    changes: str = Field(min_length=1, max_length=4000)
    notify: bool = True


@router.post("/terms")
async def publish_terms(payload: TermsIn, request: Request, background: BackgroundTasks,
                        db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    try:
        version = await actions.publish_terms(db, await _actor(request, db), payload.clauses, payload.changes)
    except ActionError as exc:
        raise _fail(exc) from exc
    if payload.notify:
        people = (await db.execute(text("""
            SELECT name, email FROM partners WHERE status IN ('active', 'paused') AND password_hash IS NOT NULL
        """))).mappings().all()
        support = await _support(db)
        for person in people:
            background.add_task(mail.terms_changed, person["name"], person["email"], version, payload.changes,
                                support=support)
    return {"ok": True, "version": version}


@router.get("/terms/{version}.pdf")
async def terms_pdf(version: int, db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    row = (await db.execute(text("SELECT version, clauses, published_at FROM partner_terms_versions WHERE version = :v"),
                            {"v": version})).mappings().first()
    if not row:
        raise _not_found("version")
    return Response(statements.terms_pdf(row["version"], row["clauses"], row["published_at"]),
                    media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="partner-terms-v{version}.pdf"'})


_ASSET_KINDS = {b"\x89PNG": "image/png", b"\xff\xd8\xff": "image/jpeg", b"GIF8": "image/gif"}


@router.post("/assets")
async def add_asset(request: Request, title: str = Form(..., min_length=2, max_length=120),
                    file: UploadFile = File(...), db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    """A banner partners can download. Kept in the database, not the image
    library, which is the live shops' own."""
    data = await file.read(3 * 1024 * 1024 + 1)
    if len(data) > 3 * 1024 * 1024:
        raise HTTPException(400, detail={"code": "SIZE", "message": "Keep a banner under 3 MB."})
    mime = next((m for sig, m in _ASSET_KINDS.items() if data.startswith(sig)), None)
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        mime = "image/webp"
    if not mime:
        raise HTTPException(400, detail={"code": "TYPE", "message": "Upload a PNG, JPG, GIF or WebP."})
    width = height = None
    try:
        from PIL import Image
        import io

        with Image.open(io.BytesIO(data)) as im:
            width, height = im.size
    except Exception:  # noqa: BLE001
        pass
    asset_id = (await db.execute(text("""
        INSERT INTO partner_assets (title, width, height, mime, size_bytes, data, sort, created_by)
        VALUES (:t, :w, :h, :m, :s, :d, (SELECT COALESCE(MAX(sort), 0) + 1 FROM partner_assets), :by) RETURNING id
    """), {"t": title.strip(), "w": width, "h": height, "m": mime, "s": len(data), "d": data,
           "by": (await _actor(request, db)).name})).scalar()
    return {"ok": True, "id": str(asset_id), "width": width, "height": height}


@router.delete("/assets/{asset_id}")
async def delete_asset(asset_id: str, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    gone = (await db.execute(text("DELETE FROM partner_assets WHERE id = CAST(:id AS uuid) RETURNING title"),
                             {"id": asset_id})).scalar()
    if not gone:
        raise _not_found("banner")
    actor = await _actor(request, db)
    from app.services.partners import activity

    await activity.log(db, action="asset_removed", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, subject_kind="asset", subject_id=asset_id, before={"title": gone})
    return {"ok": True}


@router.get("/assets/{asset_id}")
async def asset(asset_id: str, db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    row = (await db.execute(text("SELECT mime, data FROM partner_assets WHERE id = CAST(:id AS uuid)"),
                            {"id": asset_id})).mappings().first()
    if not row:
        raise _not_found("banner")
    return Response(bytes(row["data"]), media_type=row["mime"])


# ── Activity log and Stripe events ────────────────────────────────────────────

@router.get("/activity")
async def activity_log(partner_id: str | None = None, q: str | None = None, page: int = Query(1, ge=1),
                       actor: Literal["admin", "system", "partner"] | None = None,
                       days: int = Query(0, ge=0, le=3650),
                       db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    return await admin_views.activity_view(db, partner_id, q, page, actor, days)


@router.get("/activity.csv")
async def activity_csv(db: AsyncSession = Depends(get_db, scope="function")) -> Response:
    import csv
    import io

    rows = (await db.execute(text("""
        SELECT a.at, a.actor_kind, a.actor_name, a.actor_email, a.action, a.subject_kind, a.subject_id,
               p.name AS partner_name, a.reason, a.before, a.after
          FROM partner_activity a LEFT JOIN partners p ON p.id = a.partner_id ORDER BY a.at DESC, a.id DESC
    """))).mappings().all()
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["When", "By", "Kind", "Action", "Affiliate", "Record", "Reason", "Before", "After"])
    for r in rows:
        w.writerow([r["at"].isoformat(), r["actor_email"] or r["actor_name"] or "", r["actor_kind"], r["action"],
                    r["partner_name"] or "", f"{r['subject_kind'] or ''} {r['subject_id'] or ''}".strip(),
                    r["reason"] or "", json.dumps(r["before"]) if r["before"] is not None else "",
                    json.dumps(r["after"]) if r["after"] is not None else ""])
    return _csv(out.getvalue(), "partner-activity.csv")


@router.get("/stripe-events")
async def stripe_events(mode: Literal["live", "test"] | None = None, result: str | None = None, q: str | None = None,
                        page: int = Query(1, ge=1), db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    """Opens on the Stripe mode the platform is in, unless asked for the other."""
    if mode is None:
        from app.services import stripe_mode

        mode = "live" if await stripe_mode.current(db) == stripe_mode.LIVE else "test"
    return {**await admin_views.stripe_events(db, mode == "live", result, q, page), "mode": mode}


@router.post("/stripe-events/{event_row_id}/retry")
async def retry_event(event_row_id: int, request: Request, db: AsyncSession = Depends(get_db, scope="function")) -> dict[str, Any]:
    from app.services.partners import activity, commissions

    out = await commissions.retry(event_row_id)
    actor = await _actor(request, db)
    await activity.log(db, action="stripe_event_retried", actor_kind="admin", actor_name=actor.name,
                       actor_email=actor.email, subject_kind="stripe_event", subject_id=event_row_id,
                       after={"result": out.get("result"), "ok": out.get("ok")})
    return out
