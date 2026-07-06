---
id: 144
title: Payment Step Tax Line + ACH Bank Transfer
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix 1: Add tax line to payment step order summary. Fix 2: Add ACH/bank transfer as second payment method with bank fields, backend pending status, and admin verify button."
labels: ["frontend","backend","checkout","payment","ach","tax"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/stores/checkout.store.ts
  - frontend/src/services/orders.service.ts
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/checkout.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/main.py
tests:
  - manual: Payment step shows Tax line with correct amount and region/rate label
  - manual: Payment step Total includes tax amount
  - manual: Wholesale user sees Card / ACH selector at top of payment step
  - manual: Selecting ACH shows bank form with Bank Name, Account Holder, Routing, Account Number, Account Type
  - manual: ACH routing number field only accepts 9 digits
  - manual: Account number is stored as last-4 only (not full number)
  - manual: ACH Continue to Review navigates to review with ACH details shown
  - manual: Review page shows ACH bank info and pending notice instead of card icon
  - manual: Placing order with ACH creates order with payment_status=pending, payment_method=ach
  - manual: Admin order detail shows ACH bank/holder/last4/type and Pending Verification badge
  - manual: Admin Mark as Verified sets payment_status=paid and ach_verified=true
  - manual: Guest checkout unaffected — card-only flow unchanged
---

## Prompt

Fix 1: Tax not showing in Payment step (Step 2). Add tax line same as Step 1 and Step 3. Total must include tax.

Fix 2: Add ACH / Bank Transfer payment method. Show two payment options for wholesale: Credit/Debit Card (existing) and ACH. ACH fields: Bank Name, Account Holder, Routing (9 digits), Account Number, Account Type (checking/savings). Backend: payment_method=ach, payment_status=pending, save last-4 only. Admin: show ACH details, Pending Verification badge, Mark as Verified button.

## Response snapshot

**Fix 1 — Tax in payment step:**
- Read `storedTaxAmount`, `storedTaxRate`, `storedTaxRegion` from checkout store
- Added tax line row in the order summary (`{cart && paymentType === "card" && ...}` block)
- Updated `total = subtotal + shipping + taxAmountDisplay - couponDiscount`

**Fix 2 — ACH payment method:**

*Frontend store (`checkout.store.ts`)*: Added `paymentMethod`, `achBankName`, `achAccountHolder`, `achRoutingNumber`, `achAccountLast4`, `achAccountType` fields + `setPaymentMethod` + `setAchInfo` actions.

*Payment page (`payment/page.tsx`)*: Added payment type selector (Card vs ACH) for wholesale users. ACH form section with all required fields; routing enforces 9-digit pattern; account number is stored as last-4 only. ACH "Continue to Review" handler validates, stores in store, navigates. Card section still uses existing QB flow unchanged.

*Review page (`review/page.tsx`)*: Guard updated to allow `paymentMethod === "ach"`. Payment label shows "ACH / Bank Transfer — ****XXXX". Payment section shows bank details + amber pending notice for ACH orders. `handlePlaceOrder` sends `payment_method: "ach"` + ACH fields to `/checkout/confirm`; card flow unchanged.

*Orders service*: Added ACH fields to `ConfirmOrderPayload`.

*Backend schema (`schemas/order.py`)*: Added ACH fields to `CheckoutConfirmRequest` and ACH display fields to `AdminOrderDetail`.

*Backend model (`models/order.py`)*: Added `payment_method`, `ach_bank_name`, `ach_account_holder`, `ach_routing_number`, `ach_account_last4`, `ach_account_type`, `ach_verified` columns.

*Backend checkout (`checkout.py`)*: Added `has_ach = payload.payment_method == "ach"` — ACH bypasses QB charge requirement. Payment_status becomes "pending" naturally (qb_payment_status is None).

*Backend order_service*: Saves `payment_method` + ACH fields via raw SQL UPDATE (same safe pattern as tax_rate/tax_region).

*Backend main.py*: Idempotent migration adds all 7 new columns via `DO $$ IF NOT EXISTS` blocks.

*Backend admin/orders.py*: `get_admin_order()` now returns ACH fields. New `POST /admin/orders/{id}/verify-ach` sets `ach_verified=true` and `payment_status='paid'`.

*Admin order detail page*: Payment section shows "ACH / Bank Transfer" method, bank info card, Pending Verification or Verified badge, "Mark as Verified" button.

## Outcome

- ✅ Tax line visible in payment step with correct region/rate label and amount
- ✅ ACH payment option available for wholesale checkout
- ✅ Only last 4 digits of account number stored in DB
- ✅ ACH orders created with payment_status=pending for manual verification
- ✅ Admin can verify ACH payments via Mark as Verified button
- ✅ Guest checkout and card checkout flows unaffected
- 🧪 Tests: Manual
- 📁 Files: 11 files modified
- 🔁 Next prompts: null
- 🧠 Reflection: ACH requires bypassing QB payment validation — the `has_ach` guard cleanly slots into the existing has_qb/has_stripe pattern

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
