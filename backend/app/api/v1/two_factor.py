"""Two-factor authentication (TOTP) — enrolment + login verification.

Management (setup / enable / disable / status) lives under /2fa and requires a
logged-in user. The login-completion step lives under /auth/2fa/verify and is
public — it's reached with a short-lived challenge token, not a session.
"""
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import verify_password
from app.models.user import User
from app.services import two_factor_service as tfa
from app.services.tenant_auth_service import TenantAuthService

# ── Management (authenticated) ────────────────────────────────────────────────
router = APIRouter(prefix="/2fa", tags=["2fa"])
# ── Login verification (public, reached with a challenge token) ───────────────
public_router = APIRouter(prefix="/auth/2fa", tags=["2fa"])

REFRESH_COOKIE = "refresh_token"
REFRESH_MAX_AGE = 7 * 86400


class CodeIn(BaseModel):
    code: str


class DisableIn(BaseModel):
    password: str
    code: str


class VerifyIn(BaseModel):
    challenge_token: str
    code: str


async def _current_user(request: Request, db: AsyncSession) -> User:
    user_id = getattr(request.state, "user_id", None)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/status")
async def status_2fa(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    user = await _current_user(request, db)
    return {"enabled": bool(user.two_factor_enabled)}


@router.post("/setup")
async def setup_2fa(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Generate a fresh secret (pending until confirmed) and return the QR
    provisioning URI + secret for the authenticator app."""
    user = await _current_user(request, db)
    if user.two_factor_enabled:
        raise HTTPException(status_code=409, detail="Two-factor is already enabled.")
    secret = tfa.new_secret()
    user.two_factor_secret = secret
    await db.flush()
    issuer = getattr(request.state, "tenant_slug", None) or "AT360"
    return {"secret": secret, "otpauth_uri": tfa.provisioning_uri(secret, user.email, issuer)}


@router.post("/enable")
async def enable_2fa(payload: CodeIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Confirm the code from the app, enable 2FA, and return one-time backup codes."""
    user = await _current_user(request, db)
    if not user.two_factor_secret:
        raise HTTPException(status_code=400, detail="Start setup first.")
    if not tfa.verify_totp(user.two_factor_secret, payload.code):
        raise HTTPException(status_code=400, detail="Incorrect code. Check your authenticator and try again.")
    plain, hashed = tfa.generate_backup_codes()
    user.two_factor_enabled = True
    user.two_factor_backup_codes = hashed
    await db.flush()
    return {"enabled": True, "backup_codes": plain}


@router.post("/disable")
async def disable_2fa(payload: DisableIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    user = await _current_user(request, db)
    if not verify_password(payload.password, user.hashed_password or ""):
        raise HTTPException(status_code=400, detail="Incorrect password.")
    if user.two_factor_enabled and user.two_factor_secret and not tfa.verify_totp_or_backup(
        user.two_factor_secret, user.two_factor_backup_codes or [], payload.code
    )[0]:
        raise HTTPException(status_code=400, detail="Incorrect code.")
    user.two_factor_enabled = False
    user.two_factor_secret = None
    user.two_factor_backup_codes = None
    await db.flush()
    return {"enabled": False}


@public_router.post("/verify")
async def verify_2fa(payload: VerifyIn, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    """Exchange a login challenge + code for real tokens."""
    await enforce_rate_limit(request, "2fa_verify", limit=6, window=300)
    svc = TenantAuthService(db)
    login_resp, refresh_token = await svc.verify_2fa_and_login(payload.challenge_token, payload.code)
    if refresh_token:
        response.set_cookie(
            key=REFRESH_COOKIE, value=refresh_token, max_age=REFRESH_MAX_AGE, httponly=True,
            secure=settings.COOKIE_SECURE, samesite=settings.COOKIE_SAMESITE,  # type: ignore[arg-type]
            path="/api/v1/auth/refresh", domain=settings.COOKIE_DOMAIN,
        )
    return login_resp
