---
id: 206
title: PO Line Items — Product Search, Variant Selector, New Color/Size
stage: general
date: 2026-05-22
surface: agent
model: claude-sonnet-4-6
feature: purchase-orders
branch: main
user: development.aheadtech360@gmail.com
command: feat: PO line items - product search suggestions, variant selector, new color/size option
labels: ["purchase-orders","frontend","variant-selector","product-search","typescript"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/purchase-orders/create/page.tsx
tests:
  - npm run build (TypeScript compilation)
---

## Prompt

Fix Purchase Order line items - product search and variant selection.

Fix 1: Product search suggestions not showing — search via apiClient.get("/api/v1/admin/products/?q=...") showing product-name dropdown.

Fix 2: After selecting a product, show variant selector table — COLOR | SIZE | CURRENT STOCK | QTY ORDERED | UNIT COST ($). Sizes sorted: XS → S → M → L → XL → 2XL → 3XL → 4XL → 5XL. "Apply cost to all" button.

Fix 3: Add New Color/Size option — "+ Add New Variant (New Color or Size)" adds a manually-editable row.

Fix 4: New Product tab — product name, sku prefix, manual variant rows.

git add frontend/ / git commit -m 'feat: PO line items - product search suggestions, variant selector, new color/size option' / git push

## Response snapshot

Complete rewrite of `frontend/src/app/(admin)/admin/purchase-orders/create/page.tsx` Step 2 with new `ProductBlock`/`VariantRow` data model:

- `ProductBlockEditor` sub-component extracted
- Product search via `apiClient.get("/api/v1/admin/products/?q=...")` showing product-name dropdown
- On select: `apiClient.get("/api/v1/admin/products/{slug}")` fetches full variant list sorted by SIZE_ORDER
- Variant table: COLOR | SIZE | CURRENT STOCK | QTY ORDERED | UNIT COST per row
- "Apply cost to all" button sets all variant costs at once
- "+ Add New Variant (New Color or Size)" adds manually-editable row with `is_new_variant: true`
- "New Product" mode with product name, sku prefix, all-manual variant rows
- `buildLineItems()` produces API payload distinguishing existing vs new variants

Committed and pushed: ec481d8

## Outcome

- ✅ Impact: PO create page Step 2 fully functional with product search dropdown, variant selector table, and new variant/product modes
- 🧪 Tests: TypeScript build passes (no type errors)
- 📁 Files: 1 file rewritten (444 insertions, 154 deletions)
- 🔁 Next prompts: Test end-to-end PO creation flow; verify receive items page works after creating a PO
- 🧠 Reflection: ProductBlock/VariantRow model cleanly separates product-level and variant-level state; SIZE_ORDER sort provides consistent UX

## Evaluation notes (flywheel)

- Failure modes observed: none in this session
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): null
- Next experiment: Add inline validation showing remaining stock per variant against qty ordered
