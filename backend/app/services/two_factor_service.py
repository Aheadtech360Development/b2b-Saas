"""TOTP two-factor helpers — secret/QR provisioning, code + backup verification.

Backup codes are stored hashed (SHA-256 of the normalized code); the plaintext is
shown to the user exactly once at enrolment. TOTP verification allows a ±1 step
window to tolerate small clock skew.
"""
from __future__ import annotations

import hashlib
import secrets

import pyotp


def _norm(code: str) -> str:
    return (code or "").strip().replace("-", "").replace(" ", "").lower()


def _hash(code: str) -> str:
    return hashlib.sha256(_norm(code).encode()).hexdigest()


def new_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, account: str, issuer: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(name=account, issuer_name=issuer or "AT360")


def generate_backup_codes(n: int = 10) -> tuple[list[str], list[str]]:
    """Return (plaintext_codes_for_display, hashed_codes_for_storage)."""
    plain, hashed = [], []
    for _ in range(n):
        raw = secrets.token_hex(4)  # 8 hex chars
        code = f"{raw[:4]}-{raw[4:]}"
        plain.append(code)
        hashed.append(_hash(code))
    return plain, hashed


def verify_totp(secret: str, code: str) -> bool:
    return pyotp.TOTP(secret).verify((code or "").strip().replace(" ", ""), valid_window=1)


def verify_totp_or_backup(secret: str, backup_hashes: list, code: str) -> tuple[bool, list | None]:
    """Verify as TOTP first, then as an unused backup code. Returns
    (ok, remaining_backup_hashes). `remaining` is non-None only when a backup code
    was consumed, so the caller persists the shortened list."""
    if verify_totp(secret, code):
        return True, None
    h = _hash(code)
    codes = backup_hashes or []
    if h in codes:
        return True, [x for x in codes if x != h]
    return False, None
