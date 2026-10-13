"""W-9s, kept encrypted.

A W-9 carries a person's tax number. It is stored in the database encrypted
with a key that lives only in the environment (PARTNER_DOCS_KEY), never on
the image library: its links are public, and it is the live shops' own
library. Only the super admin can download one, and every download is in the
activity log. Without a key of its own, the key is derived from the app's
secret, so a machine with neither stores nothing readable to anyone else; on
the live platform PARTNER_DOCS_KEY should be set, so rotating the app secret
never makes the W-9s on file unreadable.
"""
from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import get_settings

MAX_BYTES = 5 * 1024 * 1024
KINDS = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}


class DocumentError(ValueError):
    """A file that cannot be kept, in words the partner can act on."""


def _fernet() -> Fernet:
    s = get_settings()
    key = (getattr(s, "PARTNER_DOCS_KEY", "") or "").strip()
    if key:
        return Fernet(key.encode())
    derived = hashlib.sha256(f"partner-docs|{s.APP_SECRET_KEY}".encode()).digest()
    return Fernet(base64.urlsafe_b64encode(derived))


def sniff(data: bytes) -> str | None:
    """What the file really is, from its first bytes rather than its name."""
    if data.startswith(b"%PDF"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def check(data: bytes) -> str:
    """The file's type, or a DocumentError saying why it will not do."""
    if not data:
        raise DocumentError("The file is empty.")
    if len(data) > MAX_BYTES:
        raise DocumentError("Keep the file under 5 MB.")
    mime = sniff(data)
    if mime is None:
        raise DocumentError("Upload the W-9 as a PDF, PNG or JPG.")
    return mime


def seal(data: bytes) -> bytes:
    return _fernet().encrypt(data)


def unseal(sealed: bytes) -> bytes:
    try:
        return _fernet().decrypt(bytes(sealed))
    except InvalidToken as exc:
        raise DocumentError("This file was stored with a different key and cannot be read.") from exc


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()
