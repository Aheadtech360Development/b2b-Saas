---
id: 107
title: Add Complete Discount Coupon System
stage: general
date: 2026-04-23
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["feature","discounts","coupons","cart","admin","checkout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/discount.py
  - backend/app/schemas/discount.py
  - backend/app/api/v1/discounts.py
  - backend/app/api/v1/admin/discounts.py
  - backend/migrations/versions/m6n7o8p9q0r1_add_discount_codes.py
  - backend/app/models/__init__.py
  - backend/app/main.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/checkout.py
  - backend/app/services/order_service.py
  - frontend/src/app/(admin)/admin/discounts/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/services/orders.service.ts
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - null
---

## Prompt

Add a complete discount/coupon system to the existing AF Apparels B2B platform.

Database — add these tables to the existing PostgreSQL schema:

discount_codes table with fields: id, code (unique, case-insensitive), discount_type (enum: percentage/fixed_amount/free_shipping), discount_value (decimal), minimum_order_amount (decimal, nullable), usage_limit_total (int, nullable), usage_limit_per_customer (int, nullable), applicable_to (enum: all/specific_categories/specific_products), applicable_ids (JSON array, nullable), customer_eligibility (enum: all/wholesale/retail), starts_at (timestamp, nullable), expires_at (timestamp, nullable), is_active (boolean, default true), created_at, updated_at.

discount_usage table with fields: id, discount_code_id (FK), order_id (FK, nullable), user_id (FK, nullable), used_at, discount_amount_applied (decimal).

Backend — FastAPI endpoints: Public endpoints: POST /api/v1/discounts/validate — accepts {code, cart_total, user_id, customer_type}, returns discount details or error message. POST /api/v1/discounts/apply — called when order is placed, records usage in discount_usage, returns final discounted amount. Admin endpoints: GET /api/v1/admin/discounts — paginated list with usage count per coupon. POST /api/v1/admin/discounts — create new coupon. PUT /api/v1/admin/discounts/{id} — edit coupon. DELETE /api/v1/admin/discounts/{id} — soft delete / deactivate. GET /api/v1/admin/discounts/{id}/usage — usage history for a specific coupon.

Frontend — Customer side: In the Cart page, add a coupon input field with an Apply button. On apply: call validate endpoint, show success state with discount line item deducted in order summary, or show inline error. Store applied coupon in cart state. On order submission call apply endpoint. Remove coupon option should also be there.

Frontend — Admin Dashboard: Add a "Discounts" section in the admin sidebar. Pages needed: Discount list page with copy code button. Create/Edit form with date picker and active toggle.

## Response snapshot

**Architecture:** Created two new DB tables (`discount_codes`, `discount_usage`) as new SQLAlchemy models. Validation logic extracted into `validate_discount_code()` helper in `discounts.py` so it can be shared between the public validate endpoint and the checkout/confirm endpoint.

**Backend model** (`backend/app/models/discount.py`): `DiscountCode` + `DiscountUsage` with proper FK relationships to `orders` and `users`.

**Alembic migration** (`m6n7o8p9q0r1`): Creates both tables, down_revision from `l5m6n7o8p9q0`.

**Public API** (`backend/app/api/v1/discounts.py`): `POST /validate` — validates code, checks expiry, limits, eligibility, minimum order; returns `{valid, message, discount_amount, final_total}`. `POST /apply` — records `DiscountUsage` row after order is placed.

**Admin API** (`backend/app/api/v1/admin/discounts.py`): Full CRUD + usage history, with batch usage count query for list performance. Delete = soft deactivate (sets `is_active=False`).

**Checkout integration**: Added `discount_code: str | None` to `CheckoutConfirmRequest`. In `checkout.py` confirm endpoint, coupon is validated before QB payment charge — discount is subtracted from `total_float`. Also passes `coupon_discount_amount` to `order_service.create_order()` which subtracts it from order `total`. `DiscountUsage` is recorded in same transaction as order creation.

**Cart page** (`frontend/src/app/(customer)/cart/page.tsx`): Added `couponInput`, `appliedCoupon`, `couponError`, `applyingCoupon` state. Calls `POST /api/v1/discounts/validate`. Shows green discount line in `OrderSummary`. Coupon stored in `localStorage` key `af_coupon`.

**Checkout review page**: Reads `af_coupon` from localStorage, passes as `discount_code` in `confirmOrder` payload. Clears localStorage after successful order.

**Admin page** (`frontend/src/app/(admin)/admin/discounts/page.tsx`): Full list table with code, type/value, usage count vs limit, expiry, status badges, copy-to-clipboard button, edit/deactivate actions. Create/Edit modal with all fields.

**Sidebar**: Added "Discounts" link under new "Marketing" section.

## Outcome

- ✅ Impact: Complete coupon system — create/manage codes, apply at checkout, discount applied to actual order total
- 🧪 Tests: Manual verification needed — run migration, create a test code, apply to cart
- 📁 Files: 15 files created/modified
- 🔁 Next steps: Run `alembic upgrade head` (or restart backend to auto-migrate), test validate/apply flow
- 🧠 Reflection: Shared `validate_discount_code()` between public and checkout endpoints avoids duplication. Coupon is applied at the QB charge level so the actual charged amount is reduced.

## Evaluation notes (flywheel)

- Failure modes observed: None during implementation
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
