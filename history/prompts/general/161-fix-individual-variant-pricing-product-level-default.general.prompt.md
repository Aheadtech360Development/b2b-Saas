---
id: "161"
title: Fix Individual Variant Pricing Product-Level Default
stage: general
date: 2026-05-11
surface: agent
model: claude-sonnet-4-6
feature: pricing
branch: main
user: umeradnan7106
command: "Fix Individual Variant Pricing logic — product-level price must be the default for all variants, variant-level overrides take priority"
labels: ["pricing","cart","orders","discount-groups","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/cart_service.py
  - backend/app/services/order_service.py
tests:
  - manual: variant with no per-variant override should use product-level group price in cart
  - manual: variant WITH per-variant override should use that price (not product-level)
  - manual: variant with no overrides at all should use flat tier discount
  - manual: order creation should reflect same resolved price as cart
---

## Prompt

Fix Individual Variant Pricing logic — product-level price must be the default for all variants, variant-level overrides take priority. Read ALL relevant files first.

Correct hierarchy:
1. VariantLevelPricingOverride (variant_id + group_id) → use that price
2. VariantPricingOverride (product_id + tier_id=group_id) → product-level default price
3. Base variant retail_price → fallback

## Response snapshot

Root cause: `cart_service._effective_price()` and `order_service._snapshot_price()` both jumped from step 1 directly to step 3 (tier discount), skipping the product-level `VariantPricingOverride` entirely. The product page was already correct because `product_service._attach_pricing_and_stock()` had all three steps.

Convention confirmed: `VariantPricingOverride.tier_id` stores `discount_group_id` (same field is overloaded — confirmed by product_service code: `VariantPricingOverride.tier_id == discount_group_id`).

Both functions updated to the three-step hierarchy: VariantLevelPricingOverride → VariantPricingOverride (product-level absolute price or discount%) → flat tier discount.

## Outcome

- ✅ Impact: Cart and order creation now use the same pricing hierarchy as the product page; product-level group prices are respected as defaults for all variants in that group
- 🧪 Tests: Manual verification required
- 📁 Files: 2 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: Identical fix applied to both cart and order services keeps them in sync; the comment about tier_id storing group_id is important to preserve since the field name is misleading

## Evaluation notes (flywheel)

- Failure modes observed: silent pricing gap — product page showed correct price, cart showed wrong price (the classic "product page works, cart doesn't" divergence)
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
