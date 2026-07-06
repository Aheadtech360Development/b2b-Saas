---
id: 125
title: Admin Products List Crash and Flyer Download Fix
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["admin-products","selectinload","sqlalchemy","async","flyer-download","s3","bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
  - backend/app/api/v1/products.py
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

Fix two issues:

1. ADMIN ALL PRODUCTS — Failed to load:
The admin products list endpoint is failing. Check backend/app/api/v1/admin/products.py — the list endpoint likely has the same selectinload(Product.assets) missing or a field name mismatch (filename vs file_name) in the ProductAsset model or serialization. Fix the admin products list endpoint so it loads correctly without crashing.

2. EMAIL FLYER DOWNLOAD — 404 error:
The flyer download endpoint at GET /api/v1/products/{product_id}/download-flyer is returning 404 or redirecting to a broken page. The working URL is a direct S3 link like https://af-apparels-image-storage.s3.amazonaws.com/flyers/.../Flyer.pdf

The issue is the download-flyer endpoint is trying to generate a pre-signed URL but failing. Fix it so that:
- It looks up the product's flyer asset from product_assets table
- If the asset url is already a full S3 https URL, redirect directly to that URL instead of trying to generate a pre-signed URL
- Only generate pre-signed URL if AWS credentials are available and the url is just an S3 key (not a full URL)
- If no flyer found, return 404 with message "No flyer available"

Also fix the frontend product detail page — the "Download Flyer" button should open the flyer URL directly in a new tab instead of calling the backend download endpoint that is broken.

## Response snapshot

**Issue 1 — Admin list crash**:
- `list_admin_products` was missing `selectinload(Product.assets)`. The response schema is `list[ProductDetail]`, and `ProductDetail` has `assets: list[ProductAssetOut] = []`. FastAPI serializes the `assets` field, which triggers SQLAlchemy to lazy-load `product.assets` in an async session → `MissingGreenlet` crash → "Failed to load" in admin.
- Fix: added `selectinload(Product.assets)` to the list query in `list_admin_products` (alongside `variants`, `images`, `category_links`).

**Issue 2 — Flyer download 404**:
- `download_product_flyer` was generating a pre-signed URL whenever `settings.AWS_ACCESS_KEY_ID` was set — even when `flyer.url` was already a full `https://` S3 URL. This put the CDN URL through pre-signed URL generation unnecessarily (wrong bucket path extraction or expired logic), producing a broken redirect.
- Fix: check `flyer.url.startswith("https://")` first — if so, `RedirectResponse` directly to that URL. Only fall through to pre-signed URL generation for bare S3 keys.

**Frontend — `handleDownloadFlyer`**:
- Was calling `/api/v1/products/{id}/download-flyer` which was broken.
- Fix: reads `product.assets` directly, finds the flyer asset, opens `flyer.url` in a new tab — bypasses the backend entirely.

## Outcome

- ✅ Admin all-products list no longer crashes with MissingGreenlet
- ✅ Flyer download redirects directly to the S3 URL without generating a pre-signed URL
- ✅ Frontend Download Flyer opens the PDF URL directly in a new tab
- 🧪 Tests: None automated
- 📁 Files: 3 files modified
- 🔁 Next prompts: None identified
- 🧠 Reflection: Same selectinload gap as PHR #124 but in the admin list path; download endpoint assumed pre-signed URL was always needed even for already-public/CDN S3 links

## Evaluation notes (flywheel)

- Failure modes observed: missing selectinload on admin list; download endpoint unconditionally generating presigned URLs for full https:// URLs
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
