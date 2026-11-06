"""
Media Library — per-brand file manager (like Shopify Files / WordPress Media).

Each brand uploads to its own ImageKit folder (/tenants/{slug}/…), browses its
files, copies URLs, and deletes. Fully tenant-isolated: the folder key is derived
from the authenticated JWT tenant (never the client-supplied X-Tenant-Slug
header), and deletes are refused for files outside the brand's own folder.
"""
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.tenant_media import resolve_media_folder_key
from app.services import imagekit_service

router = APIRouter(prefix="/admin/media", tags=["admin", "media"])


@router.get("")
async def list_media(request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """List the current brand's uploaded media."""
    videos = {"videos": imagekit_service.can_take_videos(), "video_max_mb": settings.MEDIA_VIDEO_MAX_MB}
    if not imagekit_service.is_configured():
        return {"configured": False, "items": [], **videos}
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        return {"configured": True, "items": [], **videos}
    items = await imagekit_service.list_files(folder)
    return {"configured": True, "items": items, **videos}


class VideoUploadIn(BaseModel):
    file_name: str = Field(..., min_length=1, max_length=255)
    size: int = Field(..., ge=1)
    mime: str = Field("", max_length=100)


@router.post("/video-upload")
async def video_upload(data: VideoUploadIn, request: Request, db: AsyncSession = Depends(get_db)) -> dict:
    """Permission for the browser to send one video straight to ImageKit, into
    this brand's own folder.

    A video is too big to pass through this server the way a picture does (it
    would be held whole in memory); ImageKit checks the token, so the folder,
    the size limit and "a video" cannot be changed on the way.
    """
    if not imagekit_service.can_take_videos():
        raise HTTPException(status_code=400, detail="Video uploads are not set up on this platform yet.")
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        raise HTTPException(status_code=403, detail="No brand context for this upload.")
    if data.mime and not data.mime.startswith("video/"):
        raise HTTPException(status_code=400, detail="This is for videos. Pictures upload as before.")
    max_mb = settings.MEDIA_VIDEO_MAX_MB
    if data.size > max_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"Videos can be up to {max_mb} MB. This one is "
                                                    f"{data.size / 1024 / 1024:.0f} MB.")
    return imagekit_service.video_upload_token(folder, data.file_name, max_mb * 1024 * 1024)


@router.post("")
async def upload_media(request: Request, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)) -> dict:
    """Upload a file to the current brand's media library."""
    if not imagekit_service.is_configured():
        raise HTTPException(status_code=400, detail="Media storage is not configured. Add ImageKit keys to .env.")
    folder = await resolve_media_folder_key(request, db)
    if not folder:
        raise HTTPException(status_code=403, detail="No brand context for this upload.")
    if (file.content_type or "").startswith("video/"):
        # Read whole here, a video would fill the server's memory: it goes up
        # from the browser instead (POST /video-upload).
        raise HTTPException(status_code=400, detail="Videos upload from the Media library page.")
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
