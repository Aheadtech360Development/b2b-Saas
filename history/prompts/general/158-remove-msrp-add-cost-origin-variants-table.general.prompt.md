---
id: 158
title: Remove MSRP, Add Cost Per Item and Country of Origin to Variants Table
stage: general
date: 2026-05-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Update product variants section in admin — remove MSRP(Retail) column, add Cost Per Item and Country of Origin fields
labels: ["admin", "products", "variants", "ui", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/a9b8c7d6e5f4_add_cost_and_origin_to_variants.py
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/api/v1/admin/products.py
  - frontend/src/types/product.types.ts
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - none
---

## Prompt

Update product variants section in admin — remove MSRP(Retail) column, add Cost Per Item and Country of Origin fields.

DO NOT remove msrp from database — only hide from UI (msrp is still used in guest pricing logic).

Backend:
- New migration adding cost_per_item (Numeric 10,2) and country_of_origin (String 100) to product_variants
- ProductVariant model: keep msrp field (commented note: kept for guest pricing), add cost_per_item and country_of_origin
- VariantOut schema: keep msrp commented out, add cost_per_item and country_of_origin
- VariantCreate schema: same pattern
- Admin products API: add cost_per_item to numeric_float set

Frontend:
- product.types.ts: keep msrp (with comment), add cost_per_item and country_of_origin to ProductVariant
- Edit page: replace MSRP bulk apply with cost/origin, update table header from "MSRP (Retail)" to "Cost / Item" + "Country of Origin", replace MSRP cell with two new cells

## Response snapshot

Applied all changes across the full stack:

1. **Migration** `a9b8c7d6e5f4_add_cost_and_origin_to_variants.py` — adds `cost_per_item` (Numeric 10,2) and `country_of_origin` (String 100) columns to `product_variants` table.

2. **Model** (`backend/app/models/product.py`) — `msrp` kept with comment "kept for guest pricing logic; hidden from admin UI"; `cost_per_item` and `country_of_origin` added.

3. **Schema** (`backend/app/schemas/product.py`) — `msrp` commented out in `VariantOut` and `VariantCreate`; `cost_per_item` and `country_of_origin` added to both.

4. **Admin API** (`backend/app/api/v1/admin/products.py`) — `cost_per_item` added to `numeric_float` set so it is coerced on PATCH.

5. **Frontend types** (`frontend/src/types/product.types.ts`) — `msrp` kept with comment; `cost_per_item` and `country_of_origin` added.

6. **Edit page** (`frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx`):
   - `bulkApply` state: `msrp → cost`; added `origin`
   - `applyToAllVariants` / `applyToSelectedVariants`: use `cost_per_item` / `country_of_origin`
   - Bulk edit bar: replaced MSRP input with Cost $ and Country inputs
   - Table header: `["Size","SKU","Price","Compare Price","Cost / Item","Country of Origin","Stock",""]`
   - MSRP `<td>` replaced with two cells — numeric cost input and text country input

## Outcome

- ✅ Impact: MSRP column removed from admin variants table; Cost Per Item and Country of Origin columns added and fully wired through DB, API, and UI. MSRP column preserved in DB/model for guest pricing path.
- 🧪 Tests: none run
- 📁 Files: 6 files modified
- 🔁 Next prompts: run alembic upgrade head to apply migration
- 🧠 Reflection: Constraint to keep msrp in DB was respected throughout — model retains the field, only admin-facing schema and UI drop it.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): verify migration applies cleanly against local DB
