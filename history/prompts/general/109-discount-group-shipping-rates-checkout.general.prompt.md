---
id: 109
title: Apply Discount Group Shipping Rates in Checkout
stage: general
date: 2026-04-24
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["bug-fix","shipping","discount-groups","cart","checkout","order"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/shipping_service.py
  - backend/app/services/cart_service.py
  - backend/app/services/order_service.py
tests:
  - null
---

## Prompt

The custom shipping rates defined in Discount Groups are not being applied. When a customer has a tier assigned (e.g. Tier-1 Wholesale or Tier-2 Retail), the checkout shipping step should fetch and display the shipping brackets defined in that customer's assigned discount group, not the default rates. Fix the shipping rate logic to look up the customer's assigned tier and apply the correct shipping brackets from their discount group.

## Response snapshot

**Root cause:** Both `cart_service._validate()` and `order_service.create_order()` only consulted `Company.shipping_tier_id → ShippingTier`. They never checked whether the company's tags matched a `DiscountGroup.customer_tag` with custom shipping brackets.

**Fix 1 — shipping_service.py:**
- Added `import json` at top.
- Added `calculate_dg_shipping_cost()` method that accepts raw DiscountGroup fields (`shipping_type`, `shipping_amount`, `shipping_calc_type`, `shipping_brackets_json`) instead of ORM `ShippingTier` objects.
- Handles `flat_rate` (returns `shipping_amount`), bracket-based `order_value` matching, and bracket-based `units` matching. Falls back to first bracket if nothing matches. Respects `company_override` when positive.

**Fix 2 — cart_service._validate():**
- After loading company, queries `DiscountGroup` where `customer_tag IN company.tags AND status = 'enabled'`.
- If a matching DiscountGroup exists and `shipping_type != 'store_default'`, calls `calculate_dg_shipping_cost()` — this drives the `estimated_shipping` and `has_shipping_tier = True` shown on the checkout address page.
- Otherwise falls through to the existing ShippingTier path unchanged.
- Refactored the duplicate override-sanitization logic into a local `_override()` helper.

**Fix 3 — order_service.create_order():**
- Same DiscountGroup lookup added to step 5 (Calculate shipping), before the `ShippingTier` path.
- If a DiscountGroup match with non-default shipping is found, `shipping_cost` is set via `calculate_dg_shipping_cost()` and `_dg_applied = True` skips the ShippingTier block.
- Expedited surcharge (+$45) still applies on top of either path.
- Refactored override sanitization into local `_override_val()` helper.

## Outcome

- ✅ Impact: Customers tagged with a DiscountGroup tier now see their group's shipping brackets in cart, on the checkout address page, and in the final placed order total.
- ✅ Priority: DiscountGroup > ShippingTier — if both exist, DG wins; ShippingTier is the fallback.
- 🧪 Tests: Manual: assign a discount group with custom shipping brackets to a company tag; add items to cart; verify estimated_shipping matches the bracket; place order; verify order.shipping_cost matches.
- 📁 Files: 3 files modified

## Evaluation notes (flywheel)

- Failure modes observed: Shipping derived only from ShippingTier FK; DiscountGroup shipping_brackets_json never parsed at order time.
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
