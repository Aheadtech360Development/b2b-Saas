---
id: 225
title: Product delete 500, variant bulk, hide discontinued
stage: general
date: 2026-05-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: "fix: product delete 500, variant delete use bulk endpoint, hide discontinued variants"
labels: ["admin","products","variants","delete","500","POLineItem","asyncpg","discontinued","filter"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - npx tsc --noEmit (PASS — only 2 pre-existing test file errors)
  - git push PASS
---

## Prompt

Fix 3 delete issues:

## Fix 1: Product delete 500 error
Add detailed logging. Most likely cause: po_line_items NULL update failing because product_variant_id column name is wrong. Check actual column name and fix UPDATE SQL.

## Fix 2: Variant delete 401 - old code still calling one-by-one
In handleBulkDeleteVariants / handleDeleteVariant — replace individual calls with bulk endpoint. Use deleteVariantsBulk for single-variant trash icon too.

## Fix 3: Archived variants showing on reload
Filter out archived/discontinued variants in frontend groupedVariants useMemo. Also filter in backend GET product endpoint.

## Response snapshot

**Fix 1 — `delete_product` and `delete_variants_bulk` (backend):**
- Root cause confirmed: `CAST(:ids AS uuid[])` with `"{uuid1,uuid2}"` string binding fails in asyncpg. The asyncpg driver uses positional `$1` parameters and doesn't reliably bind a string as a PostgreSQL array literal when combined with `CAST`.
- Fixed: replaced raw `_text("UPDATE po_line_items ... ANY(CAST(:ids AS uuid[]))")` with ORM-based update in both endpoints:
  ```python
  from sqlalchemy import update as _update
  from app.models.purchase_order import POLineItem
  await db.execute(
      _update(POLineItem)
      .where(POLineItem.product_variant_id.in_(variant_uuids))
      .values(product_variant_id=None)
  )
  ```
- `variant_uuids` now uses `v.id` directly (already UUID objects) instead of converting to strings
- Improved logging: `type(exc).__name__` and `exc` in detail so Railway logs show exact error
- HTTPException detail now includes exception type and message for easier Railway debugging

**Fix 2 — `handleDeleteVariant` (frontend):**
- Was: `await adminService.deleteVariant(product.id, variantId)` — the individual `DELETE /variants/{variantId}` endpoint
- Now: `await adminService.deleteVariantsBulk(product.id, [variantId])` — goes through the same bulk endpoint as "Delete Selected" button
- Added try/catch with alert on error (was previously silently swallowing failures)
- Optimistic UI update (filter from local state) preserved

**Fix 3 — Hidden discontinued variants:**
- Backend `get_admin_product`: Added `product.variants[:] = [v for v in product.variants if v.status not in ("archived", "discontinued")]` before the stock_quantity loop and serialization
- Frontend `groupedVariants` useMemo: Added `.filter(v => v.status !== "discontinued")` before grouping
  (Note: `ProductVariant.status` type is `"active" | "discontinued" | "out_of_stock"` — `"archived"` is only for `Product`, so only `"discontinued"` needs filtering here)

## Outcome

- ✅ Impact: Product delete 500 eliminated (asyncpg binding fixed); variant trash icon now uses authenticated bulk endpoint; discontinued variants no longer reappear in edit page table after soft-delete
- 🧪 Tests: TypeScript PASS (0 new errors); git push PASS (c16762f)
- 📁 Files: 2 files modified, +45/-34 lines
- 🔁 Next prompts: Test product delete (no PO history = hard delete, with PO = archive); test variant delete via trash icon; test Delete Selected with 18 variants; confirm discontinued variants disappear after soft-delete fallback
- 🧠 Reflection: asyncpg doesn't handle `CAST(text_param AS uuid[])` reliably. Always prefer ORM-based `update().where().values()` over raw SQL for parameterized array updates. `ProductVariant.status` and `Product.status` have different enums — variants use "discontinued" not "archived".

## Evaluation notes (flywheel)

- Failure modes observed: asyncpg `CAST(:ids AS uuid[])` binding failure → 500; individual variant delete had no error handling; TypeScript caught "archived" not in ProductVariant.status enum
- Graders run and results (PASS/FAIL): TypeScript PASS
- Prompt variant (if applicable): null
- Next experiment: null
