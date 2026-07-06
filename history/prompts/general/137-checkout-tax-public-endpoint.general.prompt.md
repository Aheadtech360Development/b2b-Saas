---
id: 137
title: Checkout Tax — Public Endpoint + Order Integration
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix checkout tax: public GET /api/v1/tax-rate, apply tax at review + address pages, save tax_amount in both guest and wholesale orders"
labels: ["backend","frontend","checkout","tax","orders"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/tax_rate.py
  - backend/app/main.py
  - backend/app/schemas/order.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/guest.py
  - frontend/src/services/orders.service.ts
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
tests:
  - manual: GET /api/v1/tax-rate?region=TX returns { region, rate, name } for enabled TX rate
  - manual: GET /api/v1/tax-rate?region=CA returns { rate 0 } when no CA rate configured
  - manual: Checkout review page fetches public endpoint (not /api/v1/admin/taxes) — works for guests
  - manual: Tax line shows "Tax (TX 6.25%): $X.XX" on review page when TX address selected
  - manual: Tax line shows "Calculated at checkout" when no matching tax rate found
  - manual: Address page order summary shows tax line matching selected state
  - manual: Wholesale order placed with tax_amount saved to DB
  - manual: Guest order placed with tax_amount saved to DB and included in QB Payments charge
---

## Prompt

The tax system is set up in admin but taxes are not being applied at checkout. Fix the checkout tax calculation:

1. Create a PUBLIC backend endpoint GET /api/v1/tax-rate?region=TX (no auth required) that queries the tax_rates table and returns { region, rate, name } or { rate: 0 } if not found/disabled.

2. Update the checkout review page to use this public endpoint instead of /api/v1/admin/taxes (which requires admin auth and fails for customers). Fetch on state change, show tax line with region+rate label.

3. Pass tax_amount and tax_rate in the order payload for both guest and wholesale checkout paths.

4. Show tax line in the address page order summary (step 1 of checkout).

5. Ensure state is a dropdown — it already is, no change needed.

## Response snapshot

**`backend/app/api/v1/tax_rate.py`** (new): Public GET /api/v1/tax-rate?region={state} — queries TaxRate model (imported from admin/taxes.py), returns `{ region, rate, name }` if is_enabled, otherwise `{ region, rate: 0, name: null }`. No auth dependency.

**`backend/app/main.py`**: Added `tax_rate` to public router imports; registered `app.include_router(tax_rate.router, prefix=_V1)`.

**`backend/app/schemas/order.py`**: Added `tax_amount: Decimal | None = None` and `tax_rate: float | None = None` to `CheckoutConfirmRequest`.

**`backend/app/services/order_service.py`**: Added `tax_amount_val = Decimal(str(confirm.tax_amount or 0))`. Updated total: `total = subtotal + shipping_cost + tax_amount_val - coupon_discount_amount`. Changed order creation `tax_amount=tax_amount_val`.

**`backend/app/api/v1/guest.py`**: Added `tax_amount: Decimal | None = None` to `GuestCheckoutRequest`. Added `tax_amount_val = payload.tax_amount or Decimal("0")`. Updated total: `total = subtotal + shipping_cost + tax_amount_val`. QB Payments charge now includes tax. Order creation uses `tax_amount=tax_amount_val`.

**`frontend/src/services/orders.service.ts`**: Added `tax_amount?: number` and `tax_rate?: number` to `ConfirmOrderPayload`.

**`frontend/src/app/(customer)/checkout/review/page.tsx`**: Changed tax useEffect from `/api/v1/admin/taxes` (admin-only) to `/api/v1/tax-rate?region=${state}` (public). Both guest and wholesale payloads now include `tax_amount` when > 0.

**`frontend/src/app/(customer)/checkout/address/page.tsx`**: Added `taxRate` state, tax fetch useEffect (derives active state from form or saved address), `taxAmount` calculation, tax line in order summary, and tax included in `orderTotal`.

## Outcome

- ✅ Public tax-rate endpoint — no auth required, works for guests and wholesale customers
- ✅ Review page tax fetches correct endpoint
- ✅ Tax saved in DB for both guest and wholesale orders
- ✅ QB Payments charge includes tax for guest checkout
- ✅ Tax line shown in both address and review page order summaries
- 🧪 Tests: Manual
- 📁 Files: 8 files modified/created

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
