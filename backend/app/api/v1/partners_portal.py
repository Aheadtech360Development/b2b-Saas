"""The partner portal: everything a signed-in partner sees and changes.

Every route needs a partner token (services/partners/auth.py). A super admin
using "View as affiliate" holds a read-only one: reads work, changes are
refused.
"""
from __future__ import annotations

import io
import json
from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, Query, Request, Response, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rate_limit import client_ip, enforce_rate_limit
from app.core.security import hash_password, verify_password
from app.services.partners import activity, actions, auth, docs, mail, portal, program, statements
from app.services.partners.db import get_partner_db

router = APIRouter(prefix="/partners/me", tags=["partners"])


def _refuse(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


async def current_partner(request: Request, db: AsyncSession = Depends(get_partner_db)) -> dict:
    header = request.headers.get("Authorization", "")
    claims = auth.read(header[7:] if header.startswith("Bearer ") else None, auth.ACCESS)
    if not claims:
        raise _refuse(401, "SESSION_ENDED", "You were signed out. Sign in again.")
    p = await portal.partner_row(db, claims["sub"])
    if not p or int(p["session_version"]) != int(claims.get("sv", -1)):
        raise _refuse(401, "SESSION_ENDED", "You were signed out. Sign in again.")
    view_as = claims.get("view_as")
    if not view_as and p["status"] in ("suspended", "terminated"):
        raise _refuse(403, p["status"].upper(), "This account cannot use the portal.")
    p["read_only"] = bool(view_as)
    return p


async def writable(p: dict = Depends(current_partner)) -> dict:
    if p["read_only"]:
        raise _refuse(403, "VIEW_ONLY", "You are viewing this portal as the affiliate. Nothing can be changed here.")
    return p


def _who(p: dict) -> dict[str, Any]:
    return {"actor_kind": "partner", "actor_name": p["name"], "actor_email": p["email"], "partner_id": p["id"]}


# ── Reading ───────────────────────────────────────────────────────────────────

@router.get("")
async def me(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    from app.services.email_service import platform_inbox

    settings = await program.load(db)
    terms = await program.latest_terms(db)
    return {**portal.summary(p, read_only=p["read_only"]),
            "support_email": settings["support_email"] or platform_inbox(),
            "terms_latest": terms["version"] if terms else None,
            "accepting_referrals": settings["accepting_referrals"]}


@router.get("/dashboard")
async def dashboard(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    return await portal.dashboard(db, p)


@router.get("/link")
async def link(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    return await portal.link_page(db, p)


@router.get("/qr.{kind}")
async def qr(kind: Literal["svg", "png"], src: str | None = None,
             p: dict = Depends(current_partner)) -> Response:
    """The partner's link as a QR code, for flyers, packaging and trade show tables."""
    import segno

    from app.services.partners.referrals import clean_src

    code = segno.make(portal.link_for(p["code"], clean_src(src)), error="m")
    buf = io.BytesIO()
    if kind == "svg":
        code.save(buf, kind="svg", scale=10, border=2, dark="#111318")
        media = "image/svg+xml"
    else:
        code.save(buf, kind="png", scale=16, border=2, dark="#111318")
        media = "image/png"
    return Response(buf.getvalue(), media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="printcopilot-{p["code"].lower()}.{kind}"'})


@router.get("/assets/{asset_id}")
async def asset(asset_id: str, p: dict = Depends(current_partner),
                db: AsyncSession = Depends(get_partner_db)) -> Response:
    row = (await db.execute(text("""
        SELECT title, mime, data FROM partner_assets WHERE id = CAST(:id AS uuid)
    """), {"id": asset_id})).mappings().first()
    if not row:
        raise _refuse(404, "NOT_FOUND", "That banner is no longer there.")
    ext = {"image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp"}.get(row["mime"], "img")
    name = "".join(ch if ch.isalnum() else "-" for ch in row["title"].lower()).strip("-") or "banner"
    return Response(bytes(row["data"]), media_type=row["mime"],
                    headers={"Content-Disposition": f'attachment; filename="{name}.{ext}"'})


@router.get("/referrals")
async def referrals(state: str | None = None, p: dict = Depends(current_partner),
                    db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    rows = await portal.shops(db, p)
    counts: dict[str, int] = {"all": len(rows)}
    for r in rows:
        counts[r["state"]] = counts.get(r["state"], 0) + 1
    if state and state != "all":
        rows = [r for r in rows if r["state"] == state]
    return {"rows": rows, "counts": counts}


@router.get("/referrals/{referral_id}")
async def referral(referral_id: str, p: dict = Depends(current_partner),
                   db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    found = await portal.shop_detail(db, p, referral_id)
    if not found:
        raise _refuse(404, "NOT_FOUND", "That shop is not one of your referrals.")
    return found


@router.get("/earnings")
async def earnings(state: str | None = None, page: int = Query(1, ge=1), p: dict = Depends(current_partner),
                   db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    return await portal.earnings(db, p, state, page)


@router.get("/earnings.csv")
async def earnings_csv(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> Response:
    return Response(await portal.earnings_csv(db, p), media_type="text/csv",
                    headers={"Content-Disposition": 'attachment; filename="earnings.csv"'})


@router.get("/payouts")
async def payouts(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    return await portal.payouts_page(db, p)


@router.get("/payouts/{payout_id}/statement.pdf")
async def statement(payout_id: str, p: dict = Depends(current_partner),
                    db: AsyncSession = Depends(get_partner_db)) -> Response:
    pdf = await payout_statement_pdf(db, p, payout_id)
    if pdf is None:
        raise _refuse(404, "NOT_FOUND", "No such payout.")
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="statement-{payout_id[:8]}.pdf"'})


async def payout_statement_pdf(db: AsyncSession, p: dict, payout_id: str) -> bytes | None:
    payout = (await db.execute(text("""
        SELECT id, paid_on, amount_cents, method, reference FROM partner_payouts
         WHERE id = CAST(:id AS uuid) AND partner_id = :p
    """), {"id": payout_id, "p": p["id"]})).mappings().first()
    if not payout:
        return None
    lines = [ln for ln in await portal.all_lines(db, p["id"]) if ln.get("paid_on")]
    paid = (await db.execute(text("SELECT id FROM partner_commission_lines WHERE payout_id = :po"),
                             {"po": payout["id"]})).scalars().all()
    paid_ids = {str(i) for i in paid}
    return statements.payout_statement(p, dict(payout), [ln for ln in lines if str(ln["id"]) in paid_ids])


@router.get("/terms")
async def terms(p: dict = Depends(current_partner), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    latest = await program.latest_terms(db)
    history = (await db.execute(text("""
        SELECT v.version, v.published_at, v.changes, a.accepted_at
          FROM partner_terms_versions v
          LEFT JOIN LATERAL (SELECT accepted_at FROM partner_terms_acceptances x
                              WHERE x.partner_id = :p AND x.version = v.version
                              ORDER BY accepted_at LIMIT 1) a ON true
         ORDER BY v.version DESC
    """), {"p": p["id"]})).mappings().all()
    return {"latest": latest, "accepted_version": p.get("terms_version"),
            "needs_acceptance": bool(latest and (p.get("terms_version") or 0) < latest["version"]),
            "history": [dict(h) for h in history]}


@router.get("/terms/{version}.pdf")
async def terms_pdf(version: int, p: dict = Depends(current_partner),
                    db: AsyncSession = Depends(get_partner_db)) -> Response:
    row = (await db.execute(text("""
        SELECT version, clauses, published_at FROM partner_terms_versions WHERE version = :v
    """), {"v": version})).mappings().first()
    if not row:
        raise _refuse(404, "NOT_FOUND", "No such version of the terms.")
    pdf = statements.terms_pdf(row["version"], row["clauses"], row["published_at"])
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="partner-terms-v{version}.pdf"'})


# ── Changing ──────────────────────────────────────────────────────────────────

class AcceptIn(BaseModel):
    version: int


@router.post("/terms/accept")
async def accept(payload: AcceptIn, request: Request, p: dict = Depends(writable),
                 db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    try:
        released = await actions.accept_terms(db, p, payload.version, ip=client_ip(request),
                                              user_agent=request.headers.get("user-agent"))
    except actions.ActionError as exc:
        raise _refuse(exc.status, "TERMS", str(exc)) from exc
    return {"ok": True, "lines_released": released}


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    business_name: str | None = Field(default=None, max_length=200)
    website: str | None = Field(default=None, max_length=300)


@router.put("/profile")
async def profile(payload: ProfileIn, p: dict = Depends(writable),
                  db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    before = {"name": p["name"], "business_name": p.get("business_name"), "website": p.get("website")}
    after = {"name": payload.name.strip(), "business_name": (payload.business_name or "").strip() or None,
             "website": (payload.website or "").strip() or None}
    await db.execute(text("""
        UPDATE partners SET name = :name, business_name = :business_name, website = :website,
               updated_at = now() WHERE id = :id
    """), {**after, "id": p["id"]})
    await activity.log(db, action="profile_changed", subject_kind="partner", subject_id=p["id"],
                       before=before, after=after, **_who(p))
    return {"ok": True, **after}


class PayoutIn(BaseModel):
    method: Literal["paypal", "wise", "bank"]
    account: str = Field(min_length=3, max_length=255)


@router.put("/payout")
async def payout_details(payload: PayoutIn, p: dict = Depends(writable),
                         db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    account = payload.account.strip()
    if payload.method in ("paypal", "wise") and "@" not in account:
        raise _refuse(400, "PAYOUT", f"Give the email your {'PayPal' if payload.method == 'paypal' else 'Wise'} "
                      "account uses.")
    await db.execute(text("""
        UPDATE partners SET payout_method = :m, payout_account = :a, updated_at = now() WHERE id = :id
    """), {"m": payload.method, "a": account, "id": p["id"]})
    await activity.log(db, action="payout_details_changed", subject_kind="partner", subject_id=p["id"],
                       before={"method": p.get("payout_method"), "account": p.get("payout_account")},
                       after={"method": payload.method, "account": account}, **_who(p))
    return {"ok": True, "method": payload.method, "account": account}


@router.post("/w9")
async def upload_w9(request: Request, file: UploadFile = File(...), p: dict = Depends(writable),
                    db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_w9", limit=10, window=3600, extra=str(p["id"]))
    data = await file.read(docs.MAX_BYTES + 1)
    try:
        mime = docs.check(data)
    except docs.DocumentError as exc:
        raise _refuse(400, "W9", str(exc)) from exc
    await db.execute(text("""
        UPDATE partner_documents SET replaced_at = now()
         WHERE partner_id = :p AND kind = 'w9' AND replaced_at IS NULL
    """), {"p": p["id"]})
    name = (file.filename or f"w9.{docs.KINDS[mime]}")[-200:]
    doc_id = (await db.execute(text("""
        INSERT INTO partner_documents (partner_id, kind, filename, mime, size_bytes, sha256, data)
        VALUES (:p, 'w9', :name, :mime, :size, :sha, :data) RETURNING id
    """), {"p": p["id"], "name": name, "mime": mime, "size": len(data), "sha": docs.sha256(data),
           "data": docs.seal(data)})).scalar()
    await activity.log(db, action="w9_uploaded", subject_kind="document", subject_id=doc_id,
                       after={"filename": name, "size_bytes": len(data)}, **_who(p))
    return {"ok": True, "has_w9": True, "filename": name}


class PasswordIn(BaseModel):
    current: str = Field(max_length=200)
    new: str = Field(max_length=200)


@router.post("/password")
async def change_password(payload: PasswordIn, request: Request, response: Response, p: dict = Depends(writable),
                          db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_password", limit=10, window=3600, extra=str(p["id"]))
    if not p.get("password_hash") or not verify_password(payload.current, p["password_hash"]):
        raise _refuse(400, "WRONG", "Your current password is not right.")
    problem = auth.password_problem(payload.new)
    if problem:
        raise _refuse(400, "WEAK_PASSWORD", problem)
    await db.execute(text("""
        UPDATE partners SET password_hash = :pw, session_version = session_version + 1, updated_at = now()
         WHERE id = :id
    """), {"pw": hash_password(payload.new), "id": p["id"]})
    await activity.log(db, action="password_changed", subject_kind="partner", subject_id=p["id"], **_who(p))
    from app.api.v1.partners_auth import _signed_in

    # Every other session ends with the old password; this one carries on.
    return await _signed_in(db, response, p["id"])


@router.post("/2fa/setup")
async def two_factor_setup(p: dict = Depends(writable), db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    from app.services import two_factor_service as tfa

    if p.get("two_factor_enabled"):
        raise _refuse(409, "ON", "Two-step sign-in is already on.")
    secret = tfa.new_secret()
    await db.execute(text("UPDATE partners SET two_factor_secret = :s WHERE id = :id"), {"s": secret, "id": p["id"]})
    return {"secret": secret, "otpauth_uri": tfa.provisioning_uri(secret, p["email"], f"{mail.platform_name()} Partners")}


class CodeIn(BaseModel):
    code: str = Field(max_length=20)


@router.post("/2fa/enable")
async def two_factor_enable(payload: CodeIn, p: dict = Depends(writable),
                            db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    from app.services import two_factor_service as tfa

    if not p.get("two_factor_secret"):
        raise _refuse(400, "SETUP", "Start the setup first.")
    if not tfa.verify_totp(p["two_factor_secret"], payload.code):
        raise _refuse(400, "WRONG_CODE", "That code is not right. Use the newest one from your app.")
    plain, hashed = tfa.generate_backup_codes()
    await db.execute(text("""
        UPDATE partners SET two_factor_enabled = true, two_factor_backup_codes = CAST(:c AS jsonb) WHERE id = :id
    """), {"c": json.dumps(hashed), "id": p["id"]})
    await activity.log(db, action="two_factor_on", subject_kind="partner", subject_id=p["id"], **_who(p))
    return {"ok": True, "backup_codes": plain}


class DisableIn(BaseModel):
    password: str = Field(max_length=200)
    code: str = Field(max_length=20)


@router.post("/2fa/disable")
async def two_factor_disable(payload: DisableIn, p: dict = Depends(writable),
                             db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    from app.services import two_factor_service as tfa

    if not verify_password(payload.password, p.get("password_hash") or ""):
        raise _refuse(400, "WRONG", "Your password is not right.")
    ok, _ = tfa.verify_totp_or_backup(p.get("two_factor_secret") or "", list(p.get("two_factor_backup_codes") or []),
                                      payload.code)
    if p.get("two_factor_enabled") and not ok:
        raise _refuse(400, "WRONG_CODE", "That code is not right.")
    await db.execute(text("""
        UPDATE partners SET two_factor_enabled = false, two_factor_secret = NULL,
               two_factor_backup_codes = '[]'::jsonb WHERE id = :id
    """), {"id": p["id"]})
    await activity.log(db, action="two_factor_off", subject_kind="partner", subject_id=p["id"], **_who(p))
    return {"ok": True}


class EmailsIn(BaseModel):
    new_shop: bool
    commission_earned: bool


@router.put("/emails")
async def emails(payload: EmailsIn, p: dict = Depends(writable),
                 db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    prefs = {"new_shop": payload.new_shop, "commission_earned": payload.commission_earned}
    await db.execute(text("UPDATE partners SET email_prefs = CAST(:e AS jsonb) WHERE id = :id"),
                     {"e": json.dumps(prefs), "id": p["id"]})
    return {"ok": True, "email_prefs": portal.email_prefs({"email_prefs": prefs})}


class LeaveIn(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)


@router.post("/leave")
async def leave(payload: LeaveIn, background: BackgroundTasks, p: dict = Depends(writable),
                db: AsyncSession = Depends(get_partner_db)) -> dict[str, Any]:
    """The partner ends the partnership. What they earned is paid as usual."""
    actor = actions.Actor(name=p["name"], email=p["email"], kind="partner")
    await actions.set_status(db, actor, p["id"], "terminated", payload.reason, forfeit=False)
    background.add_task(mail.status_changed, p["name"], p["email"], "terminated")
    return {"ok": True, "statement": auth.statement_ticket(p["id"])}
