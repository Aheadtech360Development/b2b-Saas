"""
Media Library — per-brand file manager (like Shopify Files / WordPress Media).

Each brand uploads to its own ImageKit folder (/tenants/{slug}/…), browses its
files, copies URLs, and deletes. Fully tenant-isolated.
"""
from fastapi import APIRouter, File, HTTPException, Request, UploadFile

from app.services import imagekit_service

router = APIRouter(prefix="/admin/media", tags=["admin", "media"])


def _slug(request: Request) -> str | None:
    return getattr(request.state, "tenant_slug", None)


@router.get("")
async def list_media(request: Request) -> dict:
    """List the current brand's uploaded media."""
    if not imagekit_service.is_configured():
        return {"configured": False, "items": []}
    items = await imagekit_service.list_files(_slug(request))
    return {"configured": True, "items": items}


@router.post("")
async def upload_media(request: Request, file: UploadFile = File(...)) -> dict:
    """Upload a file to the current brand's media library."""
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=400, detail="Media storage is not configured. Add ImageKit keys to .env.")
    content = await file.read()
    result = await imagekit_service.upload_bytes(content, file.filename or "file", tenant_id=_slug(request))
    return result


@router.delete("/{file_id}", status_code=204)
async def delete_media(file_id: str, request: Request) -> None:
    """Delete a file from the current brand's media library."""
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=400, detail="Media storage is not configured.")
    await imagekit_service.delete_file(file_id)
