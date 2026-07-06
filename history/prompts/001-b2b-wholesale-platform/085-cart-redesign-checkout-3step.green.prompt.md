---
id: "085"
title: Cart Redesign and Checkout 3-Step Flow
stage: green
date: 2026-04-15
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["cart","checkout","ux","redesign","responsive"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/layout.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/stores/checkout.store.ts
tests:
  - npx tsc --noEmit (TypeScript clean — only pre-existing test file errors)
---

## Prompt

The Cart page is almost correctly built right now, but some changes need to be made:

1. The items should be grouped by product. Each product gets its own card. Inside each card, there is a color breakdown. So for example if there is a product "Gildan 5000 Tee" with 3 colors, show the product name and then below, show each color and the breakdown per size. So it would be: Color Name | S: 50 M: 80 L: 30 — and how many units of that color. Then at the bottom, show the total price of the entire product and remove button.

2. The Order Summary sidebar needs to be improved — show Subtotal, then "Shipping: Calculated at checkout" (unless we have the data), then Tax (if any), then Total. Below the CTA button, show 4 trust/USP items: same-day shipping cutoff, SSL/secure, phone support, email support. Also show card brand chips (Visa, MC, Amex, Discover) at the bottom of the sidebar.

3. In checkout there will be 3 steps:
   - Step 1: Shipping — collect Company Name, Contact Name, Street Address, City, State, ZIP, Phone. Also collect Shipping Method (Standard FREE / Expedited $45 / Freight Quoted).
   - Step 2: Payment — show saved QB cards or new card form. Place Order button is on this step (not step 3). When order is placed, save confirmed order data to the store.
   - Step 3: Confirmed — read confirmed order data from store and display Order Confirmed page with order number, unit count, color summary, shipping method, payment type, and total charged. Provide "View My Orders" and "Continue Shopping" CTAs.

## Response snapshot

Implemented full cart + checkout redesign across 6 files:

**checkout.store.ts** — Extended with new fields:
- `companyName`, `contactName`, `shippingPhone` — shipping contact info
- `shippingMethod: ShippingMethod` ("standard" | "expedited" | "freight")
- `confirmedOrderId`, `confirmedOrderNumber`, `confirmedOrderTotal`, `confirmedUnits`, `confirmedColorSummary`, `confirmedProductName`, `confirmedShippingMethod` — post-order confirmation data
- Added `setCompanyName`, `setContactName`, `setShippingPhone`, `setShippingMethod`, `setConfirmedOrder` actions
- Exported `ShippingMethod` type

**cart/page.tsx** — Full rewrite with grouped product design:
- `ProductGroup` interface aggregates cart items by `product_id`
- `groupByProduct()` builds nested `colorGroups` (color → sizes → units)
- Dark header bar ("Your Cart" + item count chip)
- Empty cart SVG icon + CTA
- Per-product cards: name, SKU chip, units+price, color rows (swatch circle + name + per-size breakdown + units), remove button, product total
- Inline `OrderSummary` component: Subtotal/Shipping (Calculated)/Tax(if any)/Total, red CTA, 4 USP rows with icons, card brand chips (Visa/MC/Amex/Discover SVGs)
- Responsive layout via `.cart-grid-responsive` CSS class

**checkout/layout.tsx** — 3-step indicator replacing 4-step:
- Steps: Shipping (1), Payment (2), Confirmed (3)
- Bubbles: green ✓ (done), red (active), gray (pending)
- Connector lines turn green when step is done

**checkout/address/page.tsx** — Step 1 (Shipping):
- Form fields: Company Name*, Contact Name*, Street Address*, City*, State (dropdown)*, ZIP*, Phone
- US_STATES array, inline validation with red error messages
- Shipping method radio cards (Standard/Expedited/Freight) with free shipping note in green when subtotal ≥ $500
- On continue: saves all fields to store → routes to /checkout/payment

**checkout/payment/page.tsx** — Step 2 (Payment + Place Order):
- Loads saved QB cards from `/api/v1/account/payment-methods`
- Radio card selection with brand icon SVGs
- "Use a new card" option opens QBPaymentForm inline
- `handlePlaceOrder()` calls `ordersService.confirmOrder()`, then `setConfirmedOrder()`, clears cart, resets store, routes to /checkout/review
- `buildColorSummary(cart)` aggregates color→units for the confirmed page
- Order total summary box below payment section
- Error display on failure

**checkout/review/page.tsx** — Step 3 (Order Confirmed):
- Reads `confirmed*` fields from checkout store
- Redirects to /cart if no confirmed order (direct navigation guard)
- Green checkmark circle, "Order Confirmed!" heading
- Order number with AF- prefix normalization
- Confirmation message: unit count + Dallas warehouse mention
- Order detail box: Product, Colors, Shipping label, Payment: Credit Card, Total Charged (red Bebas font)
- "View My Orders" + "Continue Shopping" CTAs

## Outcome

- ✅ Impact: Cart grouped by product with color/size breakdown; checkout collapsed to 3 steps; order placement moved to payment step; confirmed order displayed on review page
- 🧪 Tests: TypeScript compiled clean — only pre-existing errors in `src/__tests__/api-client.test.ts` (Object possibly undefined), all new code error-free
- 📁 Files: 6 files modified (checkout.store.ts, cart/page.tsx, checkout/layout.tsx, checkout/address/page.tsx, checkout/payment/page.tsx, checkout/review/page.tsx)
- 🔁 Next prompts: Test full checkout flow end-to-end; verify QB payment tokenization; add PO Number / Order Notes fields if needed
- 🧠 Reflection: Moving order placement from review→payment page simplifies the UX and reduces confusion; grouping cart items by product improves readability for multi-color B2B orders

## Evaluation notes (flywheel)

- Failure modes observed: None — TypeScript clean, logic sound
- Graders run and results (PASS/FAIL): tsc --noEmit PASS (excluding pre-existing test errors)
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add PO Number field to address step; test freight shipping quote flow
