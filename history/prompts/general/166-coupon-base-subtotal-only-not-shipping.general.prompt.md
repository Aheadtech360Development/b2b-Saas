---
id: "166"
title: Coupon Base Subtotal Only — Shipping Not Included
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix discount/coupon calculation on cart page — discount must apply on subtotal only, NOT on shipping"
labels: ["coupon","discount","cart","checkout","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/cart/page.tsx
  - backend/app/api/v1/checkout.py
tests:
  - manual: apply % coupon — discount_amount = subtotal * percent (not subtotal+shipping)
  - manual: subtotal=129.79 shipping=20.00 coupon(TEST02)=-14.98 → total=134.81
  - manual: checkout confirm re-validates coupon against cart.subtotal only
---

## Prompt

Fix discount/coupon calculation on cart page — discount must apply on subtotal only, NOT on shipping.

Expected: subtotal=129.79, shipping=20.00, coupon=-14.98 (% of subtotal only), total=134.81

## Response snapshot

**cart/page.tsx** `handleApplyCoupon`:
- Removed `discountBase = subtotal + (hasShippingTier ? estimatedShipping : 0)`
- Changed `cart_total: discountBase` → `cart_total: subtotal`

**checkout.py** server-side coupon validation:
- Changed `cart_total_for_coupon = float(cart.subtotal + base_shipping + expedited_surcharge)` → `float(cart.subtotal)`
- Both `validate_discount_code` and `compute_discount_amount` now use subtotal-only base

**Not changed**:
- `OrderSummary` total formula: `subtotal + shipping - couponDiscount` is correct as-is
- `cart.py`: thin router, no discount logic
- Tax paths: unrelated

## Outcome

- ✅ Impact: Coupon percentage correctly computed on merchandise subtotal; shipping never included in discount base
- 🧪 Tests: Manual verification needed
- 📁 Files: 2 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: PHR #162 lifted estimatedShipping into handleApplyCoupon's cart_total; PHR #163 carried that into checkout.py — both now reverted to subtotal-only per the correct business rule

## Evaluation notes (flywheel)

- Failure modes observed: rule changed direction twice (subtotal → subtotal+shipping → subtotal); need explicit acceptance criteria at the outset
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
