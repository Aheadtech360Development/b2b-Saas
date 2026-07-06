"""Image processing script: download Shopify CDN images, resize, upload to S3.

Usage:
    python scripts/process_images.py
    python scripts/process_images.py --dry-run
    python scripts/process_images.py --product-limit 50
"""
import argparse
import asyncio
import io
import sys
from pathlib import Path

import httpx
from PIL import Image

sys.path.insert(0, str(Path(__file__).parent.parent / "backend"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.product import Product, ProductImage


SIZES = [
    ("thumb", 150),
    ("medium", 400),
    ("large", 800),
]


def _upload_to_s3(key: str, data: bytes, content_type: str) -> str:
    import boto3
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_S3_REGION,
    )
    s3.put_object(
        Bucket=settings.AWS_S3_BUCKET,
        Key=key,
        Body=data,
        ContentType=content_type,
        ACL="public-read",
    )
    cdn = settings.CDN_BASE_URL or f"https://{settings.AWS_S3_BUCKET}.s3.amazonaws.com"
    return f"{cdn}/{key}"


async def process_product_images(db: AsyncSession, dry_run: bool = False, product_limit: int | None = None) -> dict:
    print(f"Processing product images{' (dry run)' if dry_run else ''}...")

    result = await db.execute(select(Product).where(Product.status == "active"))
    products = list(result.scalars().all())
    if product_limit:
        products = products[:product_limit]

    processed = 0
    skipped = 0
    errors = 0

    async with httpx.AsyncClient(timeout=30) as client:
        for product in products:
            for img in product.images:
                if not img.original_url:
                    skipped += 1
                    continue
                if img.url_large:  # already processed
                    skipped += 1
                    continue

                try:
                    if dry_run:
                        print(f"  [DRY] Would process: {img.original_url}")
                        processed += 1
                        continue

                    resp = await client.get(img.original_url)
                    resp.raise_for_status()
                    original = Image.open(io.BytesIO(resp.content)).convert("RGB")

                    urls: dict[str, str] = {}
                    for size_name, max_dim in SIZES:
                        thumb = original.copy()
                        thumb.thumbnail((max_dim, max_dim), Image.LANCZOS)

                        # Save as JPEG
                        buf = io.BytesIO()
                        thumb.save(buf, format="JPEG", quality=85, optimize=True)
                        key = f"products/{product.slug}/{img.id}_{size_name}.jpg"
                        urls[f"url_{size_name}"] = _upload_to_s3(key, buf.getvalue(), "image/jpeg")

                        # Save as WebP
                        buf_webp = io.BytesIO()
                        thumb.save(buf_webp, format="WEBP", quality=80)
                        key_webp = f"products/{product.slug}/{img.id}_{size_name}.webp"
                        _upload_to_s3(key_webp, buf_webp.getvalue(), "image/webp")

                    # Update image record
                    if "url_thumb" in urls:
                        img.url_thumbnail = urls["url_thumb"]
                    if "url_medium" in urls:
                        img.url_medium = urls["url_medium"]
                    if "url_large" in urls:
                        img.url_large = urls["url_large"]

                    processed += 1
                    print(f"  Processed: {product.slug}/{img.id}")

                except Exception as exc:
                    print(f"  ERROR: {img.original_url} — {exc}")
                    errors += 1

    if not dry_run:
        await db.commit()

    return {"processed": processed, "skipped": skipped, "errors": errors}


async def main() -> None:
    parser = argparse.ArgumentParser(description="Process and upload product images")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--product-limit", type=int, default=None)
    args = parser.parse_args()

    async with AsyncSessionLocal() as db:
        result = await process_product_images(db, dry_run=args.dry_run, product_limit=args.product_limit)

    print(f"\nImage processing complete:")
    print(f"  Processed : {result['processed']}")
    print(f"  Skipped   : {result['skipped']}")
    print(f"  Errors    : {result['errors']}")


if __name__ == "__main__":
    asyncio.run(main())
