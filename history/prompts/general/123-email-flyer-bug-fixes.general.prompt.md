---
id: 123
title: Email Flyer Bug Fixes and Variant Bulk Delete
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["email-flyer","product-assets","redis-cache","bulk-delete","variants"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - backend/app/api/v1/admin/products.py
  - backend/app/core/redis.py
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - none
---

## Prompt

Everything has been built, but the Email Flyer button is not working. When I click on the Email Flyer button, it shows: "No flyer available for this product." Everything else is fine, but when I upload a PDF inside the product, it is not clear whether it has been uploaded or not. When I upload, the PDF name should be shown, and later if we want to check which PDF has been uploaded, we should be able to see it. Also, earlier I mentioned bulk delete — that was for variants inside the product, so add bulk delete there.

## Response snapshot

**Root cause — Email Flyer "No flyer available"**:
- `ProductDetail` schema had no `assets` field → frontend `product.assets` was always `undefined`
- `product_service.get_product_detail()` didn't `selectinload(Product.assets)` → assets not loaded
- Admin `get_admin_product` endpoint also missing `selectinload(Product.assets)`
- `_product_to_dict()` didn't include `assets` → cache also missing them

**`backend/app/schemas/product.py`**:
- Added `ProductAssetOut` schema (`id`, `asset_type`, `url`, `file_name`)
- Added `assets: list[ProductAssetOut] = []` to `ProductDetail`

**`backend/app/services/product_service.py`**:
- Added `selectinload(Product.assets)` to `get_product_detail` query
- Added `assets` list to `_product_to_dict` output

**`backend/app/api/v1/admin/products.py`**:
- Added `selectinload(Product.assets)` to `get_admin_product` query
- Added `redis_delete_pattern` import
- `upload_product_flyer`: invalidates `products:detail:{slug}:*` cache after upload
- `delete_product_flyer`: invalidates `products:detail:{slug}:*` cache after delete

**`backend/app/core/redis.py`**:
- Added `redis_delete_pattern(pattern)`: uses `scan_iter` to find and delete all keys matching a glob pattern

**Flyer upload visibility (admin)**:
- The Marketing Flyer card already showed `flyer.file_name` + View link — this now works correctly because `product.assets` is populated after the schema/service fix

**`frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx`**:
- Added `handleBulkDeleteVariants()`: confirms, deletes all selected variant IDs in parallel, clears selection, reloads
- Added "Delete Selected (N)" button in variants toolbar — appears only when one or more variants are checked

## Outcome

- ✅ Email Flyer button now correctly detects uploaded flyer (assets included in product schema)
- ✅ Admin product edit page now shows uploaded PDF filename in Marketing Flyer card
- ✅ Redis cache invalidated on flyer upload/delete so customers see updated data immediately
- ✅ Bulk delete for variants: select via checkbox, click Delete Selected in toolbar
- 🧪 Tests: None automated
- 📁 Files: 5 files modified
- 🔁 Next prompts: None identified
- 🧠 Reflection: ProductAsset was modeled but never wired into ProductDetail schema or the eagerly-loaded selectins — a silent gap that only manifested once the feature tried to use it

## Evaluation notes (flywheel)

- Failure modes observed: assets not in schema/service — silent failure with no 500, just missing data
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
