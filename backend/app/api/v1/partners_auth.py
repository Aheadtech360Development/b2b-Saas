"""A partner signing in: password, two-step code, renewal, reset, and the
invite that sets the first password. See services/partners/auth.py for how
these tokens stay apart from a shop's."""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.rate_limit import client_ip, enforce_rate_limit
from app.core.security import hash_password, verify_password
from app.services.partners import activity, auth, mail, portal, program
from app.services.partners.db import get_partner_db

router = APIRouter(prefix="/partners/auth", tags=["partners"])

# A real bcrypt hash, so a sign-in for an email nobody has takes as long as one
# for a real account and says nothing about which emails exist.
_DUMMY_HASH = hash_password("not-a-real-password-0")


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=200)


class TwoFactorIn(BaseModel):
    challenge: str = Field(max_length=2000)
    code: str = Field(max_length=20)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)


class InviteIn(BaseModel):
    token: str = Field(max_length=200)
    password: str = Field(max_length=200)
    accept_terms: bool = False


def _refuse(status: int, code: str, message: str, **extra: Any) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message, **extra})


async def _support(db: AsyncSession) -> str | None:
    from app.services.email_service import platform_inbox

    return (await program.load(db))["support_email"] or platform_inbox()


def _set_refresh(response: Response, partner: dict) -> None:
    response.set_cookie(
        key=auth.REFRESH_COOKIE,
        value=auth.refresh_token(partner["id"], partner["session_version"]),
        max_age=auth.REFRESH_HOURS * 3600,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
        path=auth.REFRESH_PATH,
        domain=settings.COOKIE_DOMAIN or None,
    )


async def _signed_in(db: AsyncSession, response: Response, partner_id: Any) -> dict[str, Any]:
    await db.execute(text("""
        UPDATE partners SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id = :id
    """), {"id": partner_id})
    p = await portal.partner_row(db, partner_id)
    _set_refresh(response, p)
    return {"access_token": auth.access_token(p["id"], p["session_version"]), "partner": portal.summary(p)}


async def _blocked(db: AsyncSession, p: dict) -> HTTPException | None:
    """Why this partner cannot sign in, as the design's sign-in states say it."""
    if p["status"] == "suspended":
        return _refuse(403, "SUSPENDED", "This account is suspended. You cannot sign in and commission is on "
                       "hold while we review it.", support=await _support(db))
    if p["status"] == "terminated":
        return _refuse(403, "TERMINATED", "This partnership has ended. Commission you earned is paid out. If the "
                       "partnership ended for breaking the terms, pending commission is forfeited.",
                       statement=auth.statement_ticket(p["id"]), support=await _support(db))
    return None


@router.post("/login")
async def login(payload: LoginIn, request: Request, response: Response,
                db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_login", limit=10, window=900, extra=payload.email)
    await enforce_rate_limit(request, "partner_login_ip", limit=30, window=900)
    p = (await db.execute(text("SELECT * FROM partners WHERE lower(email) = :e"),
                          {"e": payload.email.lower()})).mappings().first()
    if not p or not p["password_hash"]:
        verify_password(payload.password, _DUMMY_HASH)
        raise _refuse(401, "WRONG", "That email and password do not match.")
    if p["locked_until"] and p["locked_until"] > auth.now():
        minutes = max(1, int((p["locked_until"] - auth.now()).total_seconds() // 60) + 1)
        raise _refuse(423, "LOCKED", f"Too many tries. Try again in {minutes} minutes, or reset your password.")
    if not verify_password(payload.password, p["password_hash"]):
        failed = int(p["failed_logins"]) + 1
        if failed >= auth.LOCK_AFTER:
            await db.execute(text("""
                UPDATE partners SET failed_logins = 0, locked_until = :until WHERE id = :id
            """), {"until": auth.now() + timedelta(minutes=auth.LOCK_MINUTES), "id": p["id"]})
            await db.commit()
            raise _refuse(423, "LOCKED", f"Too many tries. Try again in {auth.LOCK_MINUTES} minutes, "
                          "or reset your password.")
        await db.execute(text("UPDATE partners SET failed_logins = :n WHERE id = :id"),
                         {"n": failed, "id": p["id"]})
        await db.commit()
        raise _refuse(401, "WRONG", "That email and password do not match.")
    blocked = await _blocked(db, dict(p))
    if blocked:
        raise blocked
    if p["two_factor_enabled"]:
        return {"two_factor_required": True, "challenge": auth.challenge_token(p["id"])}
    return await _signed_in(db, response, p["id"])


@router.post("/2fa")
async def two_factor(payload: TwoFactorIn, request: Request, response: Response,
                     db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_2fa", limit=10, window=900)
    from app.services import two_factor_service

    claims = auth.read(payload.challenge, auth.CHALLENGE)
    if not claims:
        raise _refuse(401, "SESSION_ENDED", "That took too long. Sign in again.")
    p = (await db.execute(text("SELECT * FROM partners WHERE id = CAST(:id AS uuid)"),
                          {"id": claims["sub"]})).mappings().first()
    if not p or not p["two_factor_enabled"] or not p["two_factor_secret"]:
        raise _refuse(401, "SESSION_ENDED", "Sign in again.")
    blocked = await _blocked(db, dict(p))
    if blocked:
        raise blocked
    ok, remaining = two_factor_service.verify_totp_or_backup(
        p["two_factor_secret"], list(p["two_factor_backup_codes"] or []), payload.code)
    if not ok:
        raise _refuse(401, "WRONG_CODE", "That code is not right. Use the newest one from your app.")
    if remaining is not None:
        import json

        await db.execute(text("UPDATE partners SET two_factor_backup_codes = CAST(:c AS jsonb) WHERE id = :id"),
                         {"c": json.dumps(remaining), "id": p["id"]})
    return await _signed_in(db, response, p["id"])


@router.post("/refresh")
async def refresh(request: Request, response: Response,
                  db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    from app.core.redis import redis_exists

    claims = auth.read(request.cookies.get(auth.REFRESH_COOKIE), auth.REFRESH)
    ended = _refuse(401, "SESSION_ENDED", "You were signed out. For your security the session ended after a "
                    "period without activity.")
    if not claims:
        raise ended
    try:
        if await redis_exists(f"blacklist:{claims.get('jti')}"):
            raise ended
    except HTTPException:
        raise
    except Exception:  # noqa: BLE001
        pass  # no cache to ask: the session version below still ends stolen sessions
    p = await portal.partner_row(db, claims["sub"])
    if not p or int(p["session_version"]) != int(claims.get("sv", -1)):
        raise ended
    blocked = await _blocked(db, p)
    if blocked:
        raise blocked
    _set_refresh(response, p)
    return {"access_token": auth.access_token(p["id"], p["session_version"]), "partner": portal.summary(p)}


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict[str, bool]:
    from app.core.redis import redis_set

    claims = auth.read(request.cookies.get(auth.REFRESH_COOKIE), auth.REFRESH)
    if claims and claims.get("jti"):
        try:
            await redis_set(f"blacklist:{claims['jti']}", "1", expire=auth.REFRESH_HOURS * 3600)
        except Exception:  # noqa: BLE001
            pass
    response.delete_cookie(auth.REFRESH_COOKIE, path=auth.REFRESH_PATH, domain=settings.COOKIE_DOMAIN or None)
    return {"ok": True}


@router.post("/forgot")
async def forgot(payload: ForgotIn, request: Request, background: BackgroundTasks,
                 db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_forgot", limit=5, window=3600, extra=payload.email)
    await enforce_rate_limit(request, "partner_forgot_ip", limit=20, window=3600)
    p = (await db.execute(text("SELECT id, name, email, status, password_hash FROM partners WHERE lower(email) = :e"),
                          {"e": payload.email.lower()})).mappings().first()
    if p and p["status"] in ("active", "paused") and p["password_hash"]:
        raw, digest = auth.link_token()
        await db.execute(text("""
            UPDATE partners SET reset_token_hash = :h,
                   reset_expires_at = now() + make_interval(mins => :m) WHERE id = :id
        """), {"h": digest, "m": auth.RESET_MINUTES, "id": p["id"]})
        background.add_task(mail.password_reset, p["name"], p["email"],
                            mail.portal_url(f"/partners/reset?token={raw}"))
    return {"ok": True, "message": "If that email has a partner account, a link to reset the password is on its way."}


@router.post("/reset")
async def reset(payload: ResetIn, request: Request, db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_reset", limit=10, window=3600)
    problem = auth.password_problem(payload.password)
    if problem:
        raise _refuse(400, "WEAK_PASSWORD", problem)
    p = (await db.execute(text("""
        SELECT id, name, email FROM partners WHERE reset_token_hash = :h AND reset_expires_at > now()
    """), {"h": auth.digest(payload.token)})).mappings().first()
    if not p:
        raise _refuse(400, "LINK_EXPIRED", "This link has expired or was already used. Ask for a new one.")
    await db.execute(text("""
        UPDATE partners SET password_hash = :pw, reset_token_hash = NULL, reset_expires_at = NULL,
               session_version = session_version + 1, failed_logins = 0, locked_until = NULL,
               updated_at = now() WHERE id = :id
    """), {"pw": hash_password(payload.password), "id": p["id"]})
    await activity.log(db, action="password_reset", actor_kind="partner", actor_name=p["name"],
                       actor_email=p["email"], partner_id=p["id"], subject_kind="partner", subject_id=p["id"])
    return {"ok": True, "message": "Your password is changed. Sign in with it now."}


@router.get("/invite")
async def invite_info(token: str, db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    p = (await db.execute(text("""
        SELECT id, name, email, code FROM partners WHERE invite_token_hash = :h AND invite_expires_at > now()
    """), {"h": auth.digest(token)})).mappings().first()
    if not p:
        raise _refuse(400, "LINK_EXPIRED", "This invite has expired or was already used. Ask us for a new one.")
    terms = await program.latest_terms(db)
    return {"name": p["name"], "email": p["email"], "code": p["code"],
            "terms": {"version": terms["version"], "clauses": terms["clauses"]} if terms else None}


@router.post("/invite")
async def accept_invite(payload: InviteIn, request: Request, response: Response,
                        db: AsyncSession = Depends(get_partner_db, scope="function")) -> dict[str, Any]:
    await enforce_rate_limit(request, "partner_invite", limit=10, window=3600)
    if not payload.accept_terms:
        raise _refuse(400, "TERMS", "Accept the partner terms to continue.")
    problem = auth.password_problem(payload.password)
    if problem:
        raise _refuse(400, "WEAK_PASSWORD", problem)
    p = (await db.execute(text("""
        SELECT * FROM partners WHERE invite_token_hash = :h AND invite_expires_at > now() FOR UPDATE
    """), {"h": auth.digest(payload.token)})).mappings().first()
    if not p:
        raise _refuse(400, "LINK_EXPIRED", "This invite has expired or was already used. Ask us for a new one.")
    blocked = await _blocked(db, dict(p))
    if blocked:
        raise blocked
    await db.execute(text("""
        UPDATE partners SET password_hash = :pw, invite_token_hash = NULL, invite_expires_at = NULL,
               session_version = session_version + 1, updated_at = now() WHERE id = :id
    """), {"pw": hash_password(payload.password), "id": p["id"]})
    terms = await program.latest_terms(db)
    if terms and (p["terms_version"] or 0) < terms["version"]:
        from app.services.partners.actions import accept_terms

        await accept_terms(db, dict(p), terms["version"], ip=client_ip(request),
                           user_agent=request.headers.get("user-agent"))
    await activity.log(db, action="invite_accepted", actor_kind="partner", actor_name=p["name"],
                       actor_email=p["email"], partner_id=p["id"], subject_kind="partner", subject_id=p["id"])
    return await _signed_in(db, response, p["id"])


@router.get("/final-statement")
async def final_statement(ticket: str, db: AsyncSession = Depends(get_partner_db, scope="function")) -> Response:
    """The final statement an ended partner can download from the sign-in page."""
    claims = auth.read(ticket, auth.STATEMENT)
    if not claims:
        raise _refuse(401, "SESSION_ENDED", "That link has expired. Sign in again to get a new one.")
    from app.services.partners import statements
    from app.services.partners.portal import all_lines

    p = await portal.partner_row(db, claims["sub"])
    if not p or p["status"] != "terminated":
        raise _refuse(404, "NOT_FOUND", "There is no final statement for this account.")
    lines = await all_lines(db, p["id"])
    payouts = (await db.execute(text("""
        SELECT paid_on, amount_cents, method, reference FROM partner_payouts WHERE partner_id = :p ORDER BY paid_on
    """), {"p": p["id"]})).mappings().all()
    pdf = statements.final_statement(p, lines, [dict(x) for x in payouts])
    return Response(pdf, media_type="application/pdf",
                    headers={"Content-Disposition": 'attachment; filename="final-statement.pdf"'})
