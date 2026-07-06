"""
ImageKit media storage — upload files to ImageKit and get back a CDN URL.

Uses ImageKit's REST upload API (HTTP Basic auth: private key as username).
Files are stored under a per-tenant folder so each brand's media is isolated:
    /tenants/{tenant_id}/...

Docs: https://docs.imagekit.io/api-reference/upload-file-api/server-side-file-upload
"""
from __future__ import annotations

import base64
import uuid
from typing import Any

import httpx

from app.core.config import settings

_UPLOAD_URL = "https://upload.imagekit.io/api/v1/files/upload"
_LIST_URL = "https://api.imagekit.io/v1/files"


def is_configured() -> bool:
    return bool(settings.IMAGEKIT_PRIVATE_KEY and settings.IMAGEKIT_URL_ENDPOINT)


def _folder_for(tenant_id: str | uuid.UUID | None) -> str:
    return f"/tenants/{tenant_id}" if tenant_id else "/shared"


async def upload_bytes(
    content: bytes,
    file_name: str,
    tenant_id: str | uuid.UUID | None = None,
) -> dict[str, Any]:
    """
    Upload raw bytes to ImageKit under the tenant's folder.
    Returns { url, file_id, thumbnail_url, name, file_path }.
    """
    data = {
        "file": base64.b64encode(content).decode(),  # base64 payload
        "fileName": file_name,
        "folder": _folder_for(tenant_id),
        "useUniqueFileName": "true",
    }
    async with httpx.AsyncClient(timeout=60) as client:
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
            "created_at": it.get("createdAt"),
        }
        for it in items
        if isinstance(it, dict)
    ]


async def delete_file(file_id: str) -> None:
    """Delete a file from ImageKit by its fileId."""
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.delete(f"{_LIST_URL}/{file_id}", auth=(settings.IMAGEKIT_PRIVATE_KEY, ""))
    resp.raise_for_status()
