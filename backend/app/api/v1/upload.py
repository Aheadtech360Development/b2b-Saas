"""Generic file upload endpoint — images and PDFs."""
import io
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.tenant_media import resolve_media_folder_key

router = APIRouter(prefix="/upload")

_ALLOWED_IMAGE = {"image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"}
_ALLOWED_PDF = {"application/pdf"}

# Artwork for a gang sheet is the biggest thing anyone legitimately sends here.
_MAX_UPLOAD_BYTES = 64 * 1024 * 1024  # 64 MB

# Print-ready artwork formats accepted by the gang sheet builder. These are
# design source files, not web images — browsers cannot render AI/PSD/EPS, so
# they are stored and handed to the supplier as-is rather than previewed.
_ARTWORK_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".webp", ".gif",
    ".pdf", ".svg", ".ai", ".eps", ".psd", ".tif", ".tiff",
}
_ARTWORK_MAX_BYTES = 50 * 1024 * 1024  # 50 MB — design files are large


@router.post("")
async def upload_file(file: UploadFile = File(...), request: Request = None, db: AsyncSession = Depends(get_db)):  # type: ignore[assignment]
    """Upload an image or PDF. Returns { url, file_name, type }."""
    from app.core.config import get_settings

    # Open endpoint (guest storefront uploads use it too) → rate-limit per IP.
    await enforce_rate_limit(request, scope="upload", limit=60, window=60)

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

    # Read with a ceiling. This endpoint is open — a storefront guest uploads
    # artwork through it — and it read whatever arrived straight into memory,
    # so one caller could hand the process a file as large as they liked, sixty
    # times a minute, and the rate limit would be satisfied the whole time.
    content = b""
    while True:
        chunk = await file.read(1 << 20)  # 1 MiB at a time
        if not chunk:
            break
        content += chunk
        if len(content) > _MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"That file is larger than {_MAX_UPLOAD_BYTES // (1 << 20)} MB.",
            )
    if not content:
        raise HTTPException(status_code=400, detail="That file is empty.")
    asset_id = str(uuid.uuid4())
    original_name = file.filename or ("file.pdf" if is_pdf else "image.jpg")

    # ── Prefer ImageKit when configured (media CDN + per-tenant folders) ──────
    from app.services import imagekit_service
    if imagekit_service.is_configured():
        # Folder from the authenticated tenant (or a validated storefront slug),
        # never the raw client header — so uploads can't target another brand.
        folder = await resolve_media_folder_key(request, db) if request is not None else None
        try:
            result = await imagekit_service.upload_bytes(content, original_name, tenant_id=folder)
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
async def upload_artwork(file: UploadFile = File(...), request: Request = None, db: AsyncSession = Depends(get_db)):  # type: ignore[assignment]
    """Upload a print-ready artwork file for the gang sheet builder.

    Kept separate from the generic upload so design formats (AI, PSD, EPS…) are
    accepted here without loosening what the storefront's image uploads allow.
    Files are stored verbatim — no re-encoding — because re-compressing print
    artwork would destroy it.
    """
    await enforce_rate_limit(request, scope="upload_artwork", limit=60, window=60)

    name = (file.filename or "").strip()
    ext = os.path.splitext(name.lower())[1]
    if ext not in _ARTWORK_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported artwork type. Allowed: {', '.join(sorted(_ARTWORK_EXTENSIONS))}",
        )

    # Checked while reading, not after. The limit was right and arrived too
    # late: the whole file was already in memory before its size was looked at,
    # so a file far past the limit still had to be held before being refused —
    # on an endpoint open to anyone.
    content = b""
    while True:
        chunk = await file.read(1 << 20)
        if not chunk:
            break
        content += chunk
        if len(content) > _ARTWORK_MAX_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"File is too large (max {_ARTWORK_MAX_BYTES // (1024 * 1024)} MB)",
            )
    if not content:
        raise HTTPException(status_code=400, detail="File is empty")

    from app.services import imagekit_service

    if imagekit_service.is_configured():
        folder = await resolve_media_folder_key(request, db) if request is not None else None
        try:
            result = await imagekit_service.upload_bytes(content, name, tenant_id=folder)
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


@router.post("/cutout-ticket")
async def cutout_ticket(request: Request, db: AsyncSession = Depends(get_db)):
    """A ticket for removing an image's background.

    The work is done on Cloudflare and the browser sends the image there
    itself, so what this hands out is permission, not a result: a signed
    ticket, good for a few minutes, that the image tools Worker will accept.

    Open to guests, like the artwork upload beside it — somebody building a
    sheet before they have an account still needs their background removed.
    The platform pays for each removal, so it is limited twice: per caller, so
    nobody can sit and drain it, and per shop per day.
    """
    from app.core.config import get_settings
    from app.core.redis import redis_increment
    from app.services import image_tools

    await enforce_rate_limit(request, scope="cutout", limit=20, window=600)

    if not image_tools.is_configured():
        # The builders hear this as "do it in the browser instead".
        raise HTTPException(status_code=503, detail="Background removal is not set up.")

    shop = await resolve_media_folder_key(request, db)
    if not shop:
        raise HTTPException(status_code=400, detail="Unknown shop.")

    import datetime
    import logging

    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    try:
        used = await redis_increment(f"cutout:{shop}:{day}", expire=2 * 86400)
    except Exception as exc:  # noqa: BLE001 — a Redis hiccup must not switch the tool off
        logging.getLogger(__name__).warning("cutout daily count skipped (redis error): %s", exc)
        used = 0
    if used > get_settings().IMAGE_TOOLS_DAILY_CAP:
        raise HTTPException(status_code=429, detail="This shop has reached today's limit for background removal.")

    return image_tools.cutout_ticket(shop)


@router.post("/upscale")
async def upscale_image(file: UploadFile = File(...), request: Request = None, db: AsyncSession = Depends(get_db)):  # type: ignore[assignment]
    """Upscale a small or blurry design with AI, and hand it back as a PNG.

    Open to guests, like the artwork upload: the image editor is used before
    anybody has an account. Each one costs the platform, and takes ImageKit ten
    seconds or more, so it is limited harder than background removal — per
    caller, and per shop per day.
    """
    import datetime
    import logging

    from fastapi.responses import Response

    from app.core.config import get_settings
    from app.core.redis import redis_increment
    from app.services import image_upscale

    await enforce_rate_limit(request, scope="upscale", limit=8, window=600)

    shop = await resolve_media_folder_key(request, db) if request is not None else None
    if not shop:
        raise HTTPException(status_code=400, detail="Unknown shop.")

    content = b""
    while True:
        chunk = await file.read(1 << 20)
        if not chunk:
            break
        content += chunk
        if len(content) > image_upscale.MAX_INPUT_BYTES:
            raise HTTPException(status_code=413, detail="That file is too large to upscale.")
    if not content:
        raise HTTPException(status_code=400, detail="That file is empty.")

    day = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    try:
        used = await redis_increment(f"upscale:{shop}:{day}", expire=2 * 86400)
    except Exception as exc:  # noqa: BLE001 — a Redis hiccup must not switch the tool off
        logging.getLogger(__name__).warning("upscale daily count skipped (redis error): %s", exc)
        used = 0
    if used > get_settings().IMAGE_TOOLS_UPSCALE_DAILY_CAP:
        raise HTTPException(status_code=429, detail="This shop has reached today's limit for AI upscaling.")

    try:
        png = await image_upscale.upscale(content, shop)
    except image_upscale.UpscaleError as exc:
        raise HTTPException(status_code=exc.status, detail=str(exc)) from exc
    except Exception as exc:  # noqa: BLE001 — ImageKit being away is not the buyer's problem to decode
        logging.getLogger(__name__).warning("upscale failed: %s", exc)
        raise HTTPException(status_code=502, detail="AI upscale is not available just now. Your image is unchanged.") from exc
    return Response(content=png, media_type="image/png", headers={"cache-control": "no-store"})
