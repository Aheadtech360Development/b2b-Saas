import uuid as _uuid

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

router = APIRouter(prefix="/reviews", tags=["reviews"])


@router.get("/recent")
async def list_recent_reviews(
    page_size: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    from app.models.product import Product, ProductReview
    from app.schemas.review import ProductReviewOut

    # Outer join so store reviews — every one imported from Google — are
    # included; they have no product. Ordered by when the review was written,
    # which for an import is Google's date, not the moment we fetched it.
    written = func.coalesce(ProductReview.reviewed_at, ProductReview.created_at)
    result = await db.execute(
        select(ProductReview, Product.name.label("product_name"), Product.slug.label("product_slug"))
        .outerjoin(Product, ProductReview.product_id == Product.id)
        .where(ProductReview.is_approved == True)  # noqa: E712
        .order_by(written.desc())
        .limit(page_size)
    )
    rows = result.all()

    reviews = []
    for row in rows:
        review_out = ProductReviewOut.model_validate(row.ProductReview)
        data = review_out.model_dump()
        data["product_name"] = row.product_name
        data["product_slug"] = row.product_slug
        reviews.append(data)

    count_result = await db.execute(
        select(func.count(ProductReview.id)).where(ProductReview.is_approved == True)  # noqa: E712
    )
    total = count_result.scalar_one()

    avg_result = await db.execute(
        select(func.avg(ProductReview.rating)).where(ProductReview.is_approved == True)  # noqa: E712
    )
    avg_rating = round(float(avg_result.scalar_one() or 0), 1)

    # The brand's Google standing, for the attribution and the rating badge.
    # Google's own average and count, not ours: the storefront must not
    # present a figure computed from a subset as if it were Google's.
    google = None
    try:
        from app.core.tenant_context import get_current_tenant_id
        from app.services import google_reviews as _g

        _tid = get_current_tenant_id()
        if _tid:
            _data = await _g.load(db, tenant_id=_tid)
            if _data.get("refresh_token") and _data.get("location"):
                google = {
                    "rating": _data.get("average_rating"),
                    "total": _data.get("total_reviews"),
                    "maps_url": _data.get("maps_url"),
                    "name": _data.get("location_name"),
                }
    except Exception:
        google = None

    return {"reviews": reviews, "total": total, "avg_rating": avg_rating, "google": google}


@router.post("/upload-image")
async def upload_review_image(file: UploadFile):
    """Upload a review image to S3. Returns the public URL."""
    from app.core.config import settings

    if not getattr(settings, "AWS_ACCESS_KEY_ID", None):
        raise HTTPException(status_code=400, detail="Image upload is not configured on this server.")

    import boto3

    allowed = {"image/jpeg", "image/png", "image/webp", "image/gif"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or GIF images are allowed.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB.")

    ext = (file.filename or "image.jpg").rsplit(".", 1)[-1].lower()
    key = f"reviews/{_uuid.uuid4()}.{ext}"

    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION,
    )
    s3.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=content,
        ContentType=file.content_type,
    )

    url = f"https://{settings.AWS_S3_BUCKET}.s3.{settings.AWS_S3_REGION}.amazonaws.com/{key}"
    return {"url": url}
