"""Signing a partner in.

Separate from a shop's users in every way that matters: its own table, and
its own tokens. A partner token is of type "partner", which no shop, admin or
platform route accepts (they take "access" only), and a shop's token is
refused by every partner route. Built the way a shop's sign-in is: a short
token the page holds in memory, and an httpOnly cookie that renews it, which
script on the page can never read. The cookie lasts REFRESH_HOURS from the
last time it was used, so a session left alone that long ends: the design's
"Session ended" screen.

Changing a password, resetting it or being suspended bumps
`session_version`, which ends every session the partner had.
"""
from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from jose import JWTError, jwt

from app.core.config import get_settings

ACCESS = "partner"
REFRESH = "partner_refresh"
CHALLENGE = "partner_2fa"
STATEMENT = "partner_statement"

ACCESS_MINUTES = 30
REFRESH_HOURS = 8
VIEW_AS_MINUTES = 60
CHALLENGE_MINUTES = 5
STATEMENT_MINUTES = 15
LOCK_AFTER = 5
LOCK_MINUTES = 15
INVITE_DAYS = 7
RESET_MINUTES = 60

REFRESH_COOKIE = "pc_partner_refresh"
REFRESH_PATH = "/api/v1/partners/auth/refresh"


def now() -> datetime:
    return datetime.now(timezone.utc)


def _encode(claims: dict[str, Any], minutes: int) -> str:
    s = get_settings()
    issued = now()
    payload = {**claims, "iat": issued, "exp": issued + timedelta(minutes=minutes), "jti": str(uuid.uuid4())}
    return jwt.encode(payload, s.JWT_SECRET_KEY, algorithm=s.JWT_ALGORITHM)


def access_token(partner_id: Any, session_version: int, *, view_as: Any = None) -> str:
    """What the portal sends with every request. `view_as` is the super
    admin looking at the portal as this partner: read only, and short."""
    claims: dict[str, Any] = {"sub": str(partner_id), "type": ACCESS, "sv": int(session_version)}
    if view_as:
        claims["view_as"] = str(view_as)
        return _encode(claims, VIEW_AS_MINUTES)
    return _encode(claims, ACCESS_MINUTES)


def refresh_token(partner_id: Any, session_version: int) -> str:
    return _encode({"sub": str(partner_id), "type": REFRESH, "sv": int(session_version)}, REFRESH_HOURS * 60)


def challenge_token(partner_id: Any) -> str:
    """Issued after a right password when two-step sign-in is on. Grants nothing by itself."""
    return _encode({"sub": str(partner_id), "type": CHALLENGE}, CHALLENGE_MINUTES)


def statement_ticket(partner_id: Any) -> str:
    """Lets an ended partner download their final statement from the sign-in page, once."""
    return _encode({"sub": str(partner_id), "type": STATEMENT}, STATEMENT_MINUTES)


def read(token: str | None, kind: str) -> dict[str, Any] | None:
    """The token's claims if it is a good token of this kind, else None."""
    if not token:
        return None
    s = get_settings()
    try:
        claims = jwt.decode(token, s.JWT_SECRET_KEY, algorithms=[s.JWT_ALGORITHM])
    except JWTError:
        return None
    return claims if claims.get("type") == kind and claims.get("sub") else None


def digest(raw: str) -> str:
    return hashlib.sha256((raw or "").encode()).hexdigest()


def link_token() -> tuple[str, str]:
    """A one-time link token: (what goes in the email, what is stored)."""
    raw = secrets.token_urlsafe(32)
    return raw, digest(raw)


def password_problem(password: str) -> str | None:
    """Why a new password will not do, or None."""
    if len(password or "") < 8:
        return "Use at least 8 characters."
    if len(password) > 200:
        return "That password is too long."
    if password.isalpha() or password.isdigit():
        return "Mix letters with numbers or symbols."
    return None


def ip_hash(ip: str | None) -> str | None:
    """An address kept only as a salted hash, for terms acceptances and spam checks."""
    if not ip:
        return None
    return hashlib.sha256(f"{ip}|{get_settings().APP_SECRET_KEY}".encode()).hexdigest()
