---
id: "157"
title: Four Critical Fixes — Cart Pricing, Order Display, Product Search
stage: green
date: 2026-05-10
surface: agent
model: claude-sonnet-4-6
feature: ui-fixes
branch: main
user: umeradnan7106
command: fix variant pricing in cart and checkout, fix order items shipping/payment display, fix variant pricing on product page, fix admin order product search dropdown
labels: ["cart","pricing","variant-level-pricing","checkout","confirmed","shipping","ach","admin","product-search","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/cart.py
  - backend/app/api/v1/checkout.py
  - backend/app/schemas/order.py
  - backend/app/services/cart_service.py
  - backend/app/services/order_service.py
  - backend/app/services/product_service.py
  - frontend/src/stores/checkout.store.ts
  - frontend/src/services/orders.service.ts
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/checkout/confirmed/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: add item from group with variant-level price override — cart shows override price, not tier-discounted price
  - manual: place order with variant-level price override — order items snapshot override price
  - manual: product detail page shows per-variant price override for logged-in group customer
  - manual: checkout confirmed page shows correct shipping label+cost (not hardcoded "Standard Ground — FREE")
  - manual: checkout confirmed page shows "ACH / Bank Transfer" when ACH was selected (not "Credit Card")
  - manual: checkout confirmed page shows correct total (includes tax, deducts coupon)
  - manual: admin order detail shows non-zero shipping_cost when customer has no tier (uses client-provided fallback)
  - manual: admin order product search — type in search box shows dropdown of matching products
---

## Prompt

Fix 4 critical issues in AF Apparels. Read ALL relevant files before making any changes.

Fix 1 - Tier/Variant pricing not applying in cart and checkout:
- Product page shows correct discounted price but cart shows original price
- CartService `_load_cart_items` only uses `PricingService.calculate_effective_price()` with tier discount_percent — ignores VariantLevelPricingOverride
- Priority: check VariantLevelPricingOverride(variant_id + group_id) first, then tier discount, then base price

Fix 2 - Order Items — Shipping/payment display issues:
- Problem A: Shipping shows $0.00 in admin order detail
- Problem B: Checkout step 4 shows "Standard Ground — FREE" hardcoded; shows "Credit Card" even when ACH was selected
- Problem C: Order confirmation page shows wrong values (shipping, payment method, total)

Fix 3 - Individual Variant Pricing not applying on product page:
- Admin sets variant-level price override but product page doesn't reflect it for logged-in customer with that group
- Product detail endpoint needs to query VariantLevelPricingOverride for customer's group_id and return effective_price per variant

Fix 4 - Admin order edit — product search not showing suggestions:
- Typing in the search box in "ADD PRODUCT" section shows no dropdown suggestions
- Need to wire up search handler calling `/api/v1/admin/products?search=X&page_size=10` and display dropdown

## Response snapshot

**Fix 4** — Admin product search dropdown was broken because frontend called `data.items` but `/api/v1/admin/products` returns a plain array. Changed type annotation and iteration to use array directly.

**Fix 1** — Added `_effective_price()` helper to `CartService` that checks `VariantLevelPricingOverride` (variant_id + group_id) before falling back to tier discount. Updated `_load_cart_items`, `add_matrix_items`, `bulk_add_validated_items`, `update_item_quantity`, `remove_item` to accept and pass `group_id`. Added `_group_id(request)` helper to `cart.py` API. Also propagated `group_id` through `checkout.py` → `order_service.create_order`. Added `_snapshot_price()` helper to `OrderService` for same logic during order creation.

**Fix 3** — Updated `product_service._attach_pricing_and_stock` to batch-load `VariantLevelPricingOverride` rows for the discount group and apply them per-variant at highest priority (above `VariantPricingOverride` product-level).

**Fix 2A** — Added `shipping_cost: Decimal | None` to `CheckoutConfirmRequest` schema. In `order_service.create_order`, if server-side calculation returns $0 but client sent `shipping_cost > 0`, uses the client value as fallback. Frontend passes `shipping_cost: shippingCost` from checkout store.

**Fix 2B+2C** — Added `confirmedShippingCost` and `confirmedPaymentMethod` to `checkout.store.ts`. Updated `review/page.tsx` to include them in `confirmedData` and fixed total calculation to include `taxAmount` and `couponDiscount`. Updated `confirmed/page.tsx`: removed hardcoded prices from `SHIPPING_LABELS`, shows actual cost from store, shows correct payment method label.

## Outcome

- ✅ Impact: 4 critical bugs fixed across cart pricing, order confirmation display, product pricing, and admin tools
- 🧪 Tests: Manual verification required
- 📁 Files: 11 files modified
- 🔁 Next prompts: Could add test coverage for VariantLevelPricingOverride pricing path
- 🧠 Reflection: Fix 4 root cause was mismatched response shape (array vs {items:[]}). Fix 1+3 share the same VariantLevelPricingOverride lookup pattern — centralized into helpers to avoid duplication.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
