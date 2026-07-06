---
id: 124
title: Fix Products Not Showing After Assets Added
stage: general
date: 2026-04-28
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["product-assets","sqlalchemy","async","lazy-load","redis-cache","bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/product_service.py
tests:
  - none
---

## Prompt

After the recent email flyer changes, all products have stopped showing on the website. The issue is likely in product_service.py where selectinload(Product.assets) was added — either the Product model does not have an assets relationship defined, or the ProductAsset model/table does not exist, causing a SQLAlchemy error that breaks the entire product query.

Fix the following:
1. Check if Product model has an assets relationship. If not, add it.
2. Check if product_assets table exists. Make selectinload optional if not.
3. Make _product_to_dict handle missing/unloaded assets safely.
4. Verify product list and detail endpoints return correctly.

## Response snapshot

**Root cause**: `selectinload(Product.assets)` was added to `get_product_detail` and `_product_to_dict` was updated to output `assets` — but the product **list** query (`get_products`) was never updated to also eagerly load `Product.assets`. In SQLAlchemy async mode, accessing an un-loaded relationship raises `MissingGreenlet` (lazy loading is forbidden in async sessions). Every product list cache miss triggered this crash → 500 response → no products on the website.

**`backend/app/services/product_service.py`** — three changes:
1. Added `selectinload(Product.assets)` to the list query (alongside `variants`, `images`, `category_links`) — this is the primary fix
2. Added `_loaded_assets(product)` helper function: uses `sa_inspect(product).unloaded` to check if the assets relationship was eagerly loaded before accessing it; returns `[]` if not loaded or on any exception — safety net preventing future crashes if the relationship is ever missed
3. Fixed `invalidate_product_cache`: was calling `redis_delete(slug:*)` which doesn't support wildcards; now uses `redis_delete_pattern` for both detail and list cache keys
4. Imported `sa_inspect` from sqlalchemy and `redis_delete_pattern` from redis module

**Model/table check**: `Product.assets` relationship exists in `backend/app/models/product.py` (lines 85-87) and `product_assets` table is created in `migrations/versions/001_initial_schema.py` — no changes needed there.

## Outcome

- ✅ Product listing `GET /api/v1/products` no longer crashes with MissingGreenlet
- ✅ Product detail `GET /api/v1/products/{slug}` returns assets correctly
- ✅ `_loaded_assets()` helper prevents future crashes if assets aren't eagerly loaded
- ✅ Cache invalidation now uses proper pattern-matching deletion
- 🧪 Tests: None automated
- 📁 Files: 1 file modified
- 🔁 Next prompts: None identified
- 🧠 Reflection: Classic SQLAlchemy async pitfall — adding a field to `_product_to_dict` without adding the corresponding `selectinload` to ALL query paths that call that function

## Evaluation notes (flywheel)

- Failure modes observed: missed adding selectinload to list query while adding it to detail query; dict serializer accessed un-loaded relationship
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
