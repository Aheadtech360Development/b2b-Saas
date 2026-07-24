"""Generic file upload endpoint — images and PDFs."""
import io
import os
import uuid

from fastapi import APIRouter, File, HTTPException, Request, UploadFile

router = APIRouter(prefix="/upload")

_ALLOWED_IMAGE = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
_ALLOWED_PDF = {"application/pdf"}

# Print-ready artwork formats accepted by the gang sheet builder. These are
# design source files, not web images — browsers cannot render AI/PSD/EPS, so
# they are stored and handed to the supplier as-is rather than previewed.
_ARTWORK_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".pdf", ".svg", ".ai", ".eps", ".psd", ".tif", ".tiff",
}
_ARTWORK_MAX_BYTES = 50 * 1024 * 1024  # 50 MB — design files are large


@router.post("")
async def upload_file(file: UploadFile = File(...), request: Request = None):  # type: ignore[assignment]
    """Upload an image or PDF. Returns { url, file_name, type }."""
    from app.core.config import get_settings

    settings = get_settings()
    use_s3 = bool(settings.AWS_ACCESS_KEY_ID and settings.AWS_SECRET_ACCESS_KEY)

    content_type = file.content_type or ""
    is_image = content_type in _ALLOWED_IMAGE
    is_pdf = content_type in _ALLOWED_PDF

    if not is_image and not is_pdf:
        # Fallback: detect by extension
        fname = (file.filename or "").lower()
        if fname.endswith(".pdf"):
            is_pdf = True
        elif any(fname.endswith(ext) for ext in (".jpg", ".jpeg", ".png", ".webp", ".gif")):
            is_image = True
        else:
            raise HTTPException(status_code=400, detail="Only images and PDFs are allowed")

    content = await file.read()
    asset_id = str(uuid.uuid4())
    original_name = file.filename or ("file.pdf" if is_pdf else "image.jpg")

    # ── Prefer ImageKit when configured (media CDN + per-tenant folders) ──────
    from app.services import imagekit_service
    if imagekit_service.is_configured():
        slug = getattr(request.state, "tenant_slug", None) if request is not None else None
        try:
            result = await imagekit_service.upload_bytes(content, original_name, tenant_id=slug)
            return {"url": result["url"], "file_name": result.get("name") or original_name, "type": "pdf" if is_pdf else "image"}
        except Exception as exc:  # noqa: BLE001 — fall back to local/S3 on ImageKit error
            import logging
            logging.getLogger(__name__).warning("ImageKit upload failed, falling back: %s", exc)

    if is_pdf:
        if use_s3:
            import boto3
            s3 = boto3.client(
                "s3",
                aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
                aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
                region_name=settings.AWS_S3_REGION,
            )
            bucket = settings.AWS_S3_BUCKET
            cdn = settings.CDN_BASE_URL.rstrip("/") if settings.CDN_BASE_URL else f"https://{bucket}.s3.amazonaws.com"
            key = f"uploads/{asset_id}/{original_name}"
            s3.put_object(Bucket=bucket, Key=key, Body=content, ContentType="application/pdf")
            url = f"{cdn}/{key}"
        else:
            local_dir = f"/app/media/uploads/{asset_id}"
            os.makedirs(local_dir, exist_ok=True)
            local_path = f"{local_dir}/{original_name}"
            with open(local_path, "wb") as fout:
                fout.write(content)
            url = f"/media/uploads/{asset_id}/{original_name}"
        return {"url": url, "file_name": original_name, "type": "pdf"}

    # Image: resize and convert to JPEG/WebP
    from PIL import Image as PILImage

    img = PILImage.open(io.BytesIO(content)).convert("RGB")
    img.thumbnail((800, 800), PILImage.LANCZOS)
    base_name = original_name.rsplit(".", 1)[0]

    if use_s3:
        import boto3
        s3 = boto3.client(
            "s3",
            aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
            aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
            region_name=settings.AWS_S3_REGION,
        )
        bucket = settings.AWS_S3_BUCKET
        cdn = settings.CDN_BASE_URL.rstrip("/") if settings.CDN_BASE_URL else f"https://{bucket}.s3.amazonaws.com"
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=85, optimize=True)
        key = f"uploads/{asset_id}/{base_name}.jpg"
        s3.put_object(Bucket=bucket, Key=key, Body=buf.getvalue(), ContentType="image/jpeg")
        url = f"{cdn}/{key}"
    else:
        local_dir = f"/app/media/uploads/{asset_id}"
        os.makedirs(local_dir, exist_ok=True)
        out_path = f"{local_dir}/{base_name}.jpg"
        img.save(out_path, "JPEG", quality=85, optimize=True)
        url = f"/media/uploads/{asset_id}/{base_name}.jpg"

    return {"url": url, "file_name": f"{base_name}.jpg", "type": "image"}


@router.post("/artwork")
async def upload_artwork(file: UploadFile = File(...), request: Request = None):  # type: ignore[assignment]
    """Upload a print-ready artwork file for the gang sheet builder.

    Kept separate from the generic upload so design formats (AI, PSD, EPS…) are
    accepted here without loosening what the storefront's image uploads allow.
    Files are stored verbatim — no re-encoding — because re-compressing print
    artwork would destroy it.
    """
    name = (file.filename or "").strip()
    ext = os.path.splitext(name.lower())[1]
    if ext not in _ARTWORK_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported artwork type. Allowed: {', '.join(sorted(_ARTWORK_EXTENSIONS))}",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")
    if len(content) > _ARTWORK_MAX_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large (max {_ARTWORK_MAX_BYTES // (1024 * 1024)} MB)",
        )

    from app.services import imagekit_service

    if imagekit_service.is_configured():
        slug = getattr(request.state, "tenant_slug", None) if request is not None else None
        try:
            result = await imagekit_service.upload_bytes(content, name, tenant_id=slug)
            return {
                "url": result["url"],
                "file_name": result.get("name") or name,
                "type": ext.lstrip("."),
                "size": len(content),
            }
        except Exception as exc:  # noqa: BLE001 — fall back to local storage
            import logging

            logging.getLogger(__name__).warning("ImageKit artwork upload failed: %s", exc)

    asset_id = str(uuid.uuid4())
    local_dir = f"/app/media/artwork/{asset_id}"
    os.makedirs(local_dir, exist_ok=True)
    safe_name = os.path.basename(name) or f"artwork{ext}"
    with open(f"{local_dir}/{safe_name}", "wb") as fh:
        fh.write(content)
    return {
        "url": f"/media/artwork/{asset_id}/{safe_name}",
        "file_name": safe_name,
        "type": ext.lstrip("."),
        "size": len(content),
    }
