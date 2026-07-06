---
id: "017"
title: CartItem model migration company_id
stage: green
date: 2026-03-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix CartItem model mismatch: user_id→company_id, price_at_add→unit_price, run migration"
labels: ["backend","database","migration","cart","bug-fix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/order.py
  - backend/app/services/cart_service.py
  - backend/migrations/versions/473e7e0a8dd3_cart_item_company_id.py
tests:
  - alembic current == 473e7e0a8dd3 (head)
  - Backend restarts cleanly (Application startup complete)
  - GET /api/v1/cart returns 200 for authenticated company user
---

## Prompt

Fix CartItem model mismatch in backend:
1. Replace `user_id` with `company_id` (FK to companies.id) in CartItem model
2. Rename `price_at_add` → `unit_price`
3. Update relationship from `user` to `company`
4. Verify cart_service.py uses correct field names
5. Generate and run Alembic migration
6. Restart backend

## Response snapshot

**Model was already correct** — `order.py` already had the updated `CartItem` with `company_id`, `unit_price`, and `company` relationship (the old commented-out version with `user_id`/`price_at_add` was already replaced).

**Migration already existed** — `473e7e0a8dd3_cart_item_company_id.py` was already generated today. Ran `alembic upgrade head` → `473e7e0a8dd3 (head)`.

**Two bugs fixed in cart_service.py:**

1. `add_matrix_items()` line 83: `product_id=payload.product_id` was passed to `CartItem()` constructor but `CartItem` has no `product_id` column → removed the field.

2. `save_as_template()` line 173: `created_by=user_id` → should be `created_by_id=user_id` to match the `OrderTemplate.created_by_id` column name.

**Commands run:**
```
alembic upgrade head  → 473e7e0a8dd3 (head)
docker restart afapparel_backend
```
Backend logs confirm clean startup: `Application startup complete.`

## Outcome

- ✅ DB schema: `cart_items` table now has `company_id` (FK → companies), `unit_price`; dropped `user_id`, `price_at_add`
- ✅ Migration at head: `473e7e0a8dd3`
- ✅ Service bugs fixed: `product_id` removed, `created_by_id` corrected
- ✅ Backend restarted and healthy
