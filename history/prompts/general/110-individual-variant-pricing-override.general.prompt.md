---
id: 110
title: Apply Individual Variant Pricing Overrides Per Tier
stage: general
date: 2026-04-24
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["bug-fix","pricing","discount-groups","variant-pricing","product-page"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/pricing_middleware.py
  - backend/app/api/v1/products.py
  - backend/app/services/product_service.py
tests:
  - null
---

## Prompt

Individual Variant Pricing is set up in admin for specific tiers, but when a customer with that tier assigned logs in and views the product, the original price shows instead of the discounted tier price. Fix the product page and pricing logic so that when a logged-in customer has a tier assigned, their variant prices are calculated by deducting the tier's individual variant pricing override from the base price.

## Response snapshot

**Root cause:** `_attach_pricing_and_stock` only called `pricing_svc.calculate_effective_price(retail_price, flat_discount_percent)`. The `VariantPricingOverride` table (keyed by `product_id` × `tier_id` where `tier_id` = `DiscountGroup.id`) was never consulted. The middleware also never resolved which DiscountGroup the customer belongs to.

**Fix 1 — pricing_middleware.py:**
- After resolving `tier_discount_percent`, added a second lookup: queries `Company.tags` then finds a matching `DiscountGroup` where `customer_tag IN tags AND status = 'enabled'`.
- Sets `request.state.discount_group_id` (str UUID or None).
- Result is Redis-cached at `company:{company_id}:discount_group_id` with the same 1-hour TTL.

**Fix 2 — products.py:**
- Both `list_products` and `get_product` now read `request.state.discount_group_id` and pass it to `svc.list_with_filters_and_search(..., discount_group_id)` and `svc.get_by_slug_with_variants(..., discount_group_id)`.

**Fix 3 — product_service.py:**
- Added `discount_group_id: str | None = None` to `list_with_filters_and_search`, `get_by_slug_with_variants`, and `_attach_pricing_and_stock`.
- Cache keys updated to include `discount_group_id` so each tier group gets its own cache entry.
- In `_attach_pricing_and_stock`: if `discount_group_id` is set, batch-loads all `VariantPricingOverride` rows for the displayed product IDs and that group. Override priority per variant:
  1. `override.price` set → use as absolute `effective_price`
  2. `override.discount_percent` set → apply per-variant: `retail_price × (1 - override_pct/100)`
  3. Neither → fall back to flat `tier_discount_percent`

## Outcome

- ✅ Impact: Customers tagged to a DiscountGroup with individual variant pricing overrides now see the correct overridden price on both the product list page and the product detail page.
- ✅ Fallback: Customers without a discount group (or whose group has no override for a given product) still get the flat PricingTier discount as before.
- 🧪 Tests: Manual: assign a discount group with variant pricing overrides to a company tag; log in as that customer; verify product page shows discounted price matching the override.
- 📁 Files: 3 files modified

## Evaluation notes (flywheel)

- Failure modes observed: VariantPricingOverride never read during product rendering; DiscountGroup ID never propagated through middleware/endpoint/service chain.
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
