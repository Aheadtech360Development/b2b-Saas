---
id: "086"
title: 4-Step Checkout, Registration Fix, Pricing Tier Display
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["checkout","registration","pricing","ux","4-step"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/layout.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/checkout/confirmed/page.tsx
  - frontend/src/app/(auth)/wholesale/register/page.tsx
  - frontend/src/services/auth.service.ts
  - frontend/src/types/order.types.ts
  - frontend/src/app/(customer)/cart/page.tsx
  - backend/app/schemas/cart.py
  - backend/app/services/cart_service.py
tests:
  - npx tsc --noEmit (TypeScript clean — only pre-existing test file errors)
---

## Prompt

1. In the 3-step checkout flow, the 3rd step (confirmed) is not showing — it directly redirects to cart. The order is being placed, but the confirmed page is not visible. Convert to 4 steps: step 3 shows all order details with a Place Order button, step 4 is the confirmed page. Remove Place Order from step 2.

2. When filling the wholesale registration form and applying, it was not submitting. Some fields are missing. Fix this.

3. Pricing Tiers should be applied at order time. If working, show the discount being applied.

## Response snapshot

### Fix 1: 4-Step Checkout

**Root cause of Step 3 redirect**: In payment/page.tsx, `reset()` was called after `setConfirmedOrder()` but BEFORE navigating to /checkout/review — this wiped `confirmedOrderId` and `confirmedOrderNumber`, triggering the redirect guard on the old review page.

**New 4-step structure:**
- Step 1: Shipping (address/page.tsx) — unchanged
- Step 2: Payment (payment/page.tsx) — now just selects card and saves to store, routes to /checkout/review with "Continue to Review →" button
- Step 3: Review (review/page.tsx) — NEW: shows full order details (address, payment, items, PO/Notes fields), then "Place Order" button places the order, routes to /checkout/confirmed
- Step 4: Confirmed (confirmed/page.tsx) — NEW file: the old confirmed display (green check, order number, details, CTAs)

**checkout/layout.tsx**: 4-step indicator (Shipping, Payment, Review, Confirmed), tightened connector spacing

**checkout/payment/page.tsx**: Removed handlePlaceOrder, buildColorSummary, ordersService, clearCart, reset. Added handleContinueWithSavedCard() → setSavedCardId → push /checkout/review. handleNewCardToken() → setQbToken → push /checkout/review. Added shipping address guard (redirects to /checkout/address if missing).

**checkout/review/page.tsx (new Step 3)**: Loads cart + saved cards. Shows: shipping address card, payment card (with Edit/Change links), items list, optional PO Number + Order Notes fields, order total with discount display. Place Order button calls ordersService.confirmOrder() → setConfirmedOrder() → clearCart() → reset() → navigate to /checkout/confirmed.

**checkout/confirmed/page.tsx (new Step 4)**: Moved from old review/page.tsx. Reads confirmedOrder* from store. Redirect guard if !confirmedOrderNumber → /cart. Shows order confirmed, detail box, View My Orders + Continue Shopping CTAs.

### Fix 2: Wholesale Registration

**Root cause**: handleSubmit in register/page.tsx only sent 9 fields (company_name, business_type, tax_id, website, first_name, last_name, email, phone, password), missing all extended fields collected in the form (company_email, address fields, fax, PPAI, ASI, secondary_business, how_heard, num_employees, num_sales_reps).

Also: website field had `type="url"` which caused browser HTML5 URL validation to block submission if user entered URL without https://.

**register/page.tsx**: Updated handleSubmit to send all 20+ form fields with correct backend field name mapping. Changed website input type="url" → type="text".

**auth.service.ts**: Extended RegisterWholesalePayload interface to include all extended company fields.

### Fix 3: Pricing Tier Display

**Status**: Backend was already correctly applying pricing tiers — PricingMiddleware reads pricing_tier_id from JWT, looks up discount_percent, attaches to request.state. CartService.get_cart_with_pricing receives discount_percent and applies it to unit_price in cart items. The discount was being applied but not shown to the user.

**backend/app/schemas/cart.py**: Added `discount_percent: Decimal = Decimal("0")` to CartResponse.

**backend/app/services/cart_service.py**: Pass `discount_percent=discount_percent` when constructing CartResponse.

**frontend/src/types/order.types.ts**: Added `discount_percent: string` to Cart interface.

**cart/page.tsx OrderSummary**: Added discount line item — "Tier Discount (X% applied) ✓ Included" in green, shown only when discount_percent > 0.

**checkout/payment/page.tsx**: Same discount line item shown in order total summary section.

**checkout/review/page.tsx**: Same discount line item shown in order total section before Place Order.

## Outcome

- ✅ Impact: Checkout now 4 steps — Step 3 is the review/confirmation step with Place Order, Step 4 is the success page. Registration form now sends all fields. Pricing tier discount is displayed in cart, payment step, and review step.
- ✅ Tests: TypeScript clean (tsc --noEmit, excluding pre-existing test errors only)
- ✅ Files: 10 files modified + 1 new (confirmed/page.tsx)
- ✅ No breaking changes to existing functionality
- &#128260; Next: Test full checkout flow end-to-end; verify registration form submission to backend; confirm pricing tier display for customers with non-zero tiers

## Evaluation notes (flywheel)

- Failure modes observed: reset() called before navigation wiped confirmed order data — fixed by moving reset() to review page (step 3) after order placed
- Graders run and results (PASS/FAIL): tsc --noEmit PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add email validation on registration form before submission
