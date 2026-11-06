"""
ImageKit media storage — upload files to ImageKit and get back a CDN URL.

Uses ImageKit's REST upload API (HTTP Basic auth: private key as username).
Files are stored under a per-tenant folder so each brand's media is isolated:
    /tenants/{tenant_id}/...

Docs: https://docs.imagekit.io/api-reference/upload-file-api/server-side-file-upload
"""
from __future__ import annotations

import base64
import logging
import re
import time
import uuid
from typing import Any

import httpx
from jose import jwt

from app.core.config import settings

logger = logging.getLogger(__name__)

_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"
# Secure client-side upload (V2): the browser sends the file itself, with a
# token signed here that pins every upload parameter.
_UPLOAD_V2_URL = "https://upload.imagekit.io/api/v2/files/upload"
_LIST_URL = "https://api.imagekit.io/v1/files"
# ImageKit refuses a token that lives longer than an hour; a big video on a
# slow line takes a while, so it gets all of it.
_TOKEN_SECONDS = 3600


def is_configured() -> bool:
    return bool(settings.IMAGEKIT_PRIVATE_KEY and settings.IMAGEKIT_URL_ENDPOINT)


def _folder_for(tenant_id: str | uuid.UUID | None) -> str:
    return f"/tenants/{tenant_id}" if tenant_id else "/shared"


async def upload_bytes(
    content: bytes,
    file_name: str,
    tenant_id: str | uuid.UUID | None = None,
    subfolder: str | None = None,
) -> dict[str, Any]:
    """
    Upload raw bytes to ImageKit under the tenant's folder, or a folder inside
    it (`subfolder`, e.g. "tshirt-designs/TS-AB-2611-0001").
    Returns { url, file_id, thumbnail_url, name, file_path }.
    """
    folder = _folder_for(tenant_id)
    if subfolder:
        folder = f"{folder.rstrip('/')}/{subfolder.strip('/')}"
    data = {
        "file": base64.b64encode(content).decode(),  # base64 payload
        "fileName": file_name,
        "folder": folder,
        "useUniqueFileName": "true",
    }
    # A minute, and five seconds more for every MB: a print file of 20 MB
    # goes up as 27 MB of base64, which a minute did not always carry.
    async with httpx.AsyncClient(timeout=60 + 5 * (len(content) >> 20)) as client:
        resp = await client.post(
            _UPLOAD_URL,
            data=data,
            auth=(settings.IMAGEKIT_PRIVATE_KEY, ""),  # private key as basic-auth user
        )
    resp.raise_for_status()
    j = resp.json()
    return {
        "url": j.get("url"),
        "file_id": j.get("fileId"),
        "thumbnail_url": j.get("thumbnailUrl"),
        "name": j.get("name"),
        "file_path": j.get("filePath"),
        "size": j.get("size"),
        "file_type": j.get("fileType"),
    }


UPLOAD_AGAIN = "The file couldn't be saved just now. Please upload it again."


async def upload_or_refuse(
    content: bytes,
    file_name: str,
    tenant_id: str | uuid.UUID | None = None,
    subfolder: str | None = None,
) -> dict[str, Any]:
    """upload_bytes, tried twice. When ImageKit still will not take the file,
    the person is told to upload it again (ServiceUnavailableError, 503).

    It is never kept on this server's own disk instead: a deploy empties that
    disk, so the file looked saved and was gone the next day (a buyer's print
    file, Innterflow, 2026-11-06). Only a setup with no ImageKit at all (a
    developer's own machine) keeps files on its disk, and that is the caller's
    `is_configured()` branch, not this.
    """
    from app.core.exceptions import ServiceUnavailableError

    for attempt in (1, 2):
        try:
            return await upload_bytes(content, file_name, tenant_id=tenant_id, subfolder=subfolder)
        except Exception as exc:  # noqa: BLE001 (any failure: try once more, then refuse)
            logger.warning("ImageKit upload of %s failed (try %s of 2): %s", file_name, attempt, exc)
    raise ServiceUnavailableError(UPLOAD_AGAIN)


def can_take_videos() -> bool:
    """Videos go from the browser straight to ImageKit, which needs the public key too."""
    return is_configured() and bool(settings.IMAGEKIT_PUBLIC_KEY)


def safe_file_name(name: str, fallback: str = "video.mp4") -> str:
    """A name ImageKit keeps as it is: letters, digits, dot, dash, underscore."""
    base = re.sub(r"[^A-Za-z0-9._-]+", "-", (name or "").rsplit("/", 1)[-1].rsplit("\\", 1)[-1])
    base = re.sub(r"-{2,}", "-", base).strip(".-_")[:100]
    return base if "." in base and not base.startswith(".") else fallback


def video_upload_token(tenant_id: str | uuid.UUID, file_name: str, max_bytes: int,
                       now: int | None = None) -> dict[str, Any]:
    """Permission for one browser upload of one video into the tenant's folder.

    The token is signed with the private key and carries every upload
    parameter, so ImageKit refuses the upload if the browser changes any of
    them: another brand's folder, a bigger file, something that is not a
    video. It can be used once.
    """
    fields = {
        "fileName": safe_file_name(file_name),
        "folder": _folder_for(tenant_id),
        "useUniqueFileName": "true",
        "checks": f'"file.size" <= {int(max_bytes)} AND "file.mime" : "video"',
    }
    iat = int(now if now is not None else time.time())
    token = jwt.encode({**fields, "iat": iat, "exp": iat + _TOKEN_SECONDS}, settings.IMAGEKIT_PRIVATE_KEY,
                       algorithm="HS256", headers={"kid": settings.IMAGEKIT_PUBLIC_KEY})
    return {"upload_url": _UPLOAD_V2_URL, "token": token, "fields": fields}


async def list_files(tenant_id: str | uuid.UUID | None, limit: int = 100) -> list[dict[str, Any]]:
    """List files in the tenant's folder (most recent first)."""
    params = {
        "path": _folder_for(tenant_id),
        "limit": str(limit),
        "sort": "DESC_CREATED",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(_LIST_URL, params=params, auth=(settings.IMAGEKIT_PRIVATE_KEY, ""))
    resp.raise_for_status()
    items = resp.json()
    return [
        {
            "file_id": it.get("fileId"),
            "url": it.get("url"),
            "thumbnail_url": it.get("thumbnail"),
            "name": it.get("name"),
            "size": it.get("size"),
            "file_type": it.get("fileType"),
            # "video/mp4" for a video: the library shows it as one, and the
            # picture pickers leave it out.
            "mime": it.get("mime"),
            "created_at": it.get("createdAt"),
        }
        for it in items
        if isinstance(it, dict)
    ]


async def _file_path(file_id: str) -> str | None:
    """Return a file's stored path (e.g. /tenants/acme/x.png), or None if absent."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(f"{_LIST_URL}/{file_id}/details", auth=(settings.IMAGEKIT_PRIVATE_KEY, ""))
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json().get("filePath")


async def delete_file(file_id: str, expected_tenant: str | uuid.UUID | None = None) -> None:
    """Delete a file from ImageKit by its fileId.

    When `expected_tenant` is given, the file must live in that tenant's folder
    or the delete is refused (PermissionError) — so a brand can never delete
    another brand's media by guessing/enumerating a fileId.
    """
    if expected_tenant is not None:
        path = await _file_path(file_id)
        prefix = _folder_for(expected_tenant).rstrip("/") + "/"
        if not path or not path.startswith(prefix):
            raise PermissionError("File does not belong to this tenant")
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(f"{_LIST_URL}/{file_id}", auth=(settings.IMAGEKIT_PRIVATE_KEY, ""))
    resp.raise_for_status()
