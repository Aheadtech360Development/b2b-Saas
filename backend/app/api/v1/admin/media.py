"""
Media Library — per-brand file manager (like Shopify Files / WordPress Media).

Each brand uploads to its own ImageKit folder (/tenants/{slug}/…), browses its
files, copies URLs, and deletes. Fully tenant-isolated: the folder key is derived
from the authenticated JWT tenant (never the client-supplied X-Tenant-Slug
header), and deletes are refused for files outside the brand's own folder.
"""
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.tenant_media import resolve_media_folder_key
from app.services import imagekit_service

router = APIRouter(prefix="/admin/media", tags=["admin", "media"])


@router.get("")
async def list_media(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """List the current brand's uploaded media."""
    if not imagekit_service.is_configured():
        return {"configured": False, "items": []}
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        return {"configured": True, "items": []}
    items = await imagekit_service.list_files(folder)
    return {"configured": True, "items": items}


@router.post("")
async def upload_media(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)) -> dict:
    """Upload a file to the current brand's media library."""
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=400, detail="Media storage is not configured. Add ImageKit keys to .env.")
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        raise HTTPException(status_code=403, detail="No brand context for this upload.")
    content = await file.read()
    result = await imagekit_service.upload_bytes(content, file.filename or "file", tenant_id=folder)
    return result


@router.delete("/{file_id}", status_code=204)
async def delete_media(file_id: str, request: Request, db: AsyncSession = Depends(get_db)) -> None:
    """Delete a file from the current brand's media library (own folder only)."""
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=400, detail="Media storage is not configured.")
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        raise HTTPException(status_code=403, detail="No brand context.")
    try:
        await imagekit_service.delete_file(file_id, expected_tenant=folder)
    except PermissionError:
        # Don't reveal whether the file exists in another brand's folder.
        raise HTTPException(status_code=404, detail="File not found.")
