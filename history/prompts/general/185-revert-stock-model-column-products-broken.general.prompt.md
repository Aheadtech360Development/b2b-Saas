---
id: 185
title: Revert Stock Model Column — Products Broken Fix
stage: general
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: URGENT — products not showing after recent changes, revert model changes and fix immediately
labels: ["product","model","revert","stock","urgent","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/api/v1/admin/products.py
  - backend/app/schemas/product.py
tests:
  - none
---

## Prompt

URGENT: Products not showing on website after recent changes. Revert any model changes and fix immediately.

## Response snapshot

**Root cause (immediate):**
PHR #184 added `stock: Mapped[int] = mapped_column(Integer, nullable=False, ...)` to `ProductVariant` WITHOUT running the SQL migration first. SQLAlchemy generates `SELECT product_variants.stock ...` in every variant query. The `stock` column does not exist in the DB → PostgreSQL error on every product list/detail call → blank product pages.

**The user's Step 2 suggestion (add `stock_quantity` as nullable column) would NOT fix this** — `stock_quantity` is also not a real DB column. The only correct fix is to remove the unmigrated column mapping.

**Fix — full revert of PHR #184 model changes:**
- `backend/app/models/product.py`: Removed `stock: Mapped[int] = mapped_column(...)` from `ProductVariant`
- `backend/app/api/v1/admin/products.py`:
  - `add_variant`: Removed `stock=payload.stock if payload.stock is not None else 0`; restored `variant.stock_quantity = 0`
  - `create_variants_batch`: Removed `stock=int(v.get("stock", 0))`
- `backend/app/schemas/product.py`: Removed `stock: int = 0` from `VariantCreate`

`git diff HEAD~1 backend/app/models/product.py` → clean after revert.

**Frontend null check:** Already handled by `isOutOfStock()` helper added in PHR #183 — no further frontend changes needed.

## Outcome

- ✅ Impact: Model reverted to pre-PHR-184 state; product queries no longer include non-existent `stock` column; products return to normal
- 🧪 Tests: Manual — reload products page; verify products list and detail pages load
- 📁 Files: 3 files reverted
- 🔁 Next prompts: To properly add stock column, run the SQL migration FIRST, then re-apply PHR #184 model changes
- 🧠 Reflection: Never add a NOT NULL mapped column to SQLAlchemy model without running the DB migration first. Order must be: (1) run migration SQL on DB, (2) deploy updated model. Doing it in reverse causes immediate breakage on all queries for that table.

## Evaluation notes (flywheel)

- Failure modes observed: model-first column addition without DB migration — fatal on all ORM queries for the affected table
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment: none
