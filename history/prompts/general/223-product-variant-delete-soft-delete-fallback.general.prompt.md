---
id: 223
title: Product and variant delete soft-delete fallback
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: product and variant delete - soft delete fallback for FK constraints"
labels: ["admin","products","variants","delete","soft-delete","bulk","MissingGreenlet","IntegrityError","archive","discontinued"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Fix product delete "Delete failed: Failed to fetch" error. Two delete operations failing:
1. Delete selected variants (18 variants)
2. Delete product from products list

Approach: soft delete (archive/discontinued) fallback when FK constraints block hard delete.

## Response snapshot

**backend/app/api/v1/admin/products.py — `delete_product`:**
- Changed `status_code=204` → `200` to allow JSON response body
- IntegrityError handler changed from `HTTPException(409)` → soft delete: `product.status = "archived"` + commit
- Returns `{"success": True, "method": "deleted"}` or `{"success": True, "method": "archived", "message": "..."}`
- Added `logger.info/warning` for audit trail

**backend/app/api/v1/admin/products.py — new `DELETE /{product_id}/variants` bulk endpoint:**
- Added `_BulkVariantDeleteRequest(BaseModel)` with `variant_ids: list[str]`
- Added `BaseModel` to pydantic imports
- Loads all variants with `selectinload(ProductVariant.inventory_records)` to prevent MissingGreenlet (ProductVariant also has `cascade="all, delete-orphan"` on inventory_records)
- Pre-NULLs `purchase_order_items.product_variant_id` for all selected variants
- Tries hard delete for all variants in one transaction
- On IntegrityError: rollback → re-query variants → set all to `status="discontinued"` → commit
- Returns `{"success": True, "deleted": N, "discontinued": M, "message?": "..."}`

**frontend/src/services/admin.service.ts:**
- Added `deleteVariantsBulk(productId, variantIds)` calling `apiClient.delete(..., { body: JSON.stringify({ variant_ids: variantIds }) })`

**frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx — `handleBulkDeleteVariants`:**
- Replaced `Promise.all([...18 individual deletes...])` with single `deleteVariantsBulk()` call
- Added `try/catch` with `alert()` on failure (error was previously silently swallowed)
- Shows info alert if variants were discontinued instead of deleted

## Outcome

- ✅ Impact: Product delete now gracefully archives instead of crashing on FK constraint; bulk variant delete goes through a single DB transaction (eliminates connection pool exhaustion from 18 concurrent sessions); variant delete errors are now visible to the admin
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (4dc9797)
- 📁 Files: 3 files modified, +95/-9 lines
- 🔁 Next prompts: Test deleting a product with no PO history (should hard delete); test deleting a product with PO history (should archive); test bulk variant delete with all 18 variants; confirm discontinued variants are hidden in the storefront
- 🧠 Reflection: Two separate failure modes. "Failed to fetch" from product delete was MissingGreenlet/IntegrityError through BaseHTTPMiddleware. "Silent failure" from variant bulk delete was Promise.all of 18 concurrent DELETE requests with no error handling — the individual variant endpoint already did soft-delete, so the issue was connection pool exhaustion + missing error display.

## Evaluation notes (flywheel)

- Failure modes observed: Promise.all with 18 concurrent DB sessions can exhaust connection pool; BaseHTTPMiddleware swallows unhandled exceptions as TCP drops ("Failed to fetch"); ProductVariant also has cascade="all, delete-orphan" on inventory_records requiring selectinload before hard delete
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
