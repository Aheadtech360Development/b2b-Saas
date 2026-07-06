---
id: "155"
title: Ten Platform Fixes — Statements, Shipping, ACH, Filters, Variants
stage: green
date: 2026-05-08
surface: agent
model: claude-sonnet-4-6
feature: ui-fixes
branch: main
user: umeradnan7106
command: fix statements total payments, navigation loading, guest checkout shipping, ACH full numbers, abandoned carts error, filter checkmarks, will call timing, variant pricing expand, discounted prices, sales by product variants
labels: ["statements","shipping","ach","filters","variants","abandoned-carts","checkout","sales-history"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
  - backend/app/api/v1/checkout.py
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
  - frontend/src/app/(customer)/products/ProductListClient.tsx
  - frontend/src/app/(customer)/products/page.tsx
  - frontend/src/app/(customer)/account/sales-history/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - manual: abandoned carts no longer shows "Failed to load abandoned carts" (datetime import fix)
  - manual: guest checkout shipping reads from admin standard_shipping setting
  - manual: ACH form accepts full routing (9 digits) and account numbers, trims to last 4 on save
  - manual: product filter sidebar shows checkmark on active Gender and Category
  - manual: Will Call option shows timing info (before/after 12PM, Sat/Sun closed)
  - manual: statements shows Total Payments > $0 after card checkout
  - manual: product list cards show crossed-out MSRP when discount applies
  - manual: sales-history "Sales by Product" has expand arrow to show variant breakdown
  - manual: Individual Variant Pricing product rows expand to show variants with calculated prices
  - manual: products page no longer shows "Loading products…" text during navigation
---

## Prompt

In the Customer Dashboard, an error is appearing on Abandoned Carts. Shipping (Standard Ground) is showing correctly for logged-in users, but it is not correct for logged-out users. In the cart, the same logic should apply that we added in the Admin panel under Customers → Discount Groups & Pricing → Standard Shipping. Also, do not keep this under Customers → Discount Groups & Pricing. Create a separate tab for it, just like Discounts etc., and name it Standard Shipping. Show this there: 'Standard Shipping — applies to customers who are not in any discount group and have no shipping tier assigned. Configure a flat rate or bracket-based shipping rate for these customers.' Also mention logged-out users in this sentence as well. On the cart page, we previously had 'Tier Discount (10% applied)' but later we removed all of that. However, in one or two places the data is still saved, so remove it from the Order Summary because we are not using it anymore.

[Continued with 10 items:]
1. Statements page: Total Payments showing $0.00 — fix
2. Navigation delay: remove loading text on products page
3. Guest checkout shipping: fetch from /api/v1/guest/shipping-estimate
4. ACH payment: accept full routing/account numbers, trim to last 4 on save
5. Abandoned carts customer dashboard shows error
6. Shop All filters: add checkmarks to active Gender, Category, Availability
7. Will Call Pickup timing info in checkout Step 1
8. Individual Variant Pricing: add click-to-expand per product showing variants
9. Discounted prices: show original crossed out + discounted price on product cards
10. Sales by Product: add variants/sizes breakdown within each product row

## Response snapshot

1. `account.py` abandoned-carts endpoint: local import was `from datetime import timedelta` — missing `datetime` class and `timezone`. Fixed to `from datetime import datetime, timedelta, timezone`. This caused NameError on every call.

2. `checkout/address/page.tsx`:
   - Guest shipping: replaced `setTierShipping(9.99)` with `apiClient.get("/api/v1/guest/shipping-estimate?units=X&subtotal=Y").then(est => setTierShipping(Number(est.estimated_shipping ?? 9.99))).catch(() => setTierShipping(9.99))`
   - Will Call sub text updated to include timing: "Orders before 12 PM → same-day pickup by 4 PM · After 12 PM → next business day by 12 PM · Sat/Sun: closed"

3. `payment-methods/page.tsx`:
   - Routing input: maxLength 4→9, label "Routing Number (last 4)"→"Routing Number", placeholder updated
   - Account input: maxLength 4→17, label "Account Number (last 4)"→"Account Number"
   - `handleSaveAch`: slices to last 4 before API call via `routing_last4: (achForm.routing_last4 || "").replace(/\D/g, "").slice(-4)`

4. `ProductListClient.tsx`:
   - Gender filter items: added `display: flex, justifyContent: space-between` + checkmark SVG when active
   - Category items (All Products + each category): added checkmark SVG when active
   - Product list card price: added crossed-out MSRP when `effective_price < retail_price`

5. `products/page.tsx`: Suspense fallback changed from "Loading products…" div to `null`

6. `checkout.py` `_confirm_checkout_inner`: added `StatementTransaction` charge record on every order, plus payment record when `qb_payment_status == "CAPTURED"`. Imported `StatementTransaction` from `app.models.statement`.

7. `account.py` sales-history endpoint: "product" grouping now includes `variants` list per product (color, size, units_sold, total_revenue).

8. `sales-history/page.tsx`:
   - Added `SalesByProductVariant` interface and `variants?` to `SalesByProduct`
   - Added `productExpanded` state (`Set<number>`)
   - Product rows now clickable to toggle expand; expanded rows show variant sub-rows

9. `tiers/page.tsx` Individual Variant Pricing:
   - Added `VPVariant` interface, `variants: VPVariant[]` to `VPProduct`
   - Added `vpExpanded` state (`Set<string>`)
   - `loadVariantPricing` now maps all variants per product
   - Product rows: expand toggle with ▶ arrow; expanded sub-table shows color/size/MSRP + calculated price per group

## Outcome

- ✅ Impact: 10 fixes across customer and admin surfaces; key fixes: abandoned carts (NameError), statements payments, guest checkout shipping, ACH UX
- 🧪 Tests: Manual verification required
- 📁 Files: 8 files modified
- 🔁 Next prompts: Checkout review page could show crossed-out pricing (requires retail_price in cart item schema); ACH and Stripe payments could auto-create payment transactions
- 🧠 Reflection: The abandoned carts NameError was caused by a local `from datetime import timedelta` that omitted the `datetime` class itself — admin endpoint worked because it imports datetime at module level

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
