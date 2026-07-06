---
id: "099"
title: Cart + checkout shipping display, Will Call, expedited fix
stage: green
date: 2026-04-20
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: show actual shipping on cart, fix checkout shipping methods, will call pickup, expedited price fix
labels: ["shipping","cart","checkout","will-call","expedited"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - backend/app/services/order_service.py
  - backend/app/api/v1/checkout.py
tests:
  - " - none"
---

## Prompt

On the Cart page, under Order Summary, it says "Calculated at checkout" for shipping instead of the actual shipping price; that needs to be displayed. Also, when we display it there, on the checkout page under shipping methods, it shows "Free on 500+" for Standard Ground; instead of "500+", it should show the price based on the free shipping tier. Keep Expedited (2-Day) as it is, but when it is selected and we proceed to payment, the price is not being added, so that needs to be fixed. Additionally, remove "Freight / LTL" and replace it with "Will Call Pickup" and make it free; no shipping fee should be applied, only the product price.

In step 2, show the total of the subtotal and shipping. Display the shipping related to the selection made here, and in the next step wherever shipping appears, show the same thing as in step 2.

Currently, everywhere shipping is displayed, it says "Calculated at checkout" or "Calculated"; please implement the changes I mentioned.

## Response snapshot

**checkout.store.ts**: Added `shippingCost: number` + `setShippingCost` action. Changed `ShippingMethod` type from `"standard" | "expedited" | "freight"` to `"standard" | "expedited" | "will_call"`.

**cart/page.tsx**: Removed "Calculated at checkout" fallback. Always shows tier-based shipping: `FREE` when $0, `$X.XX` otherwise. Label changed to "Shipping (Standard Ground)".

**checkout/address/page.tsx**: Complete rewrite of shipping method section:
- Standard Ground: shows tier price from `cart.validation.estimated_shipping`
- Expedited (2-Day): shows tier + $45 surcharge
- Will Call Pickup (replaced Freight/LTL): always FREE
- Added "Order Summary" section at bottom showing subtotal + selected method shipping = total
- On "Continue to Payment": calls `setShippingCost(methodCost)` so subsequent pages use stored value

**checkout/payment/page.tsx**: Changed to use `shippingCost` from checkout store instead of cart's `estimated_shipping`. Shows method label and FREE/$X.XX.

**checkout/review/page.tsx**: Updated SHIPPING_LABELS (freight → will_call). Uses `shippingCost` from store. Removed separate expedited surcharge line — cost is already baked in. Shipping method display includes price. `handlePlaceOrder` uses `shippingCost` for confirmed order total.

**order_service.py**: Applied shipping method logic to stored `shipping_cost`:
```python
if shipping_method == "will_call":
    shipping_cost = Decimal("0.00")
elif company.shipping_tier_id:
    shipping_cost = tier_calculation(...)
    if shipping_method == "expedited":
        shipping_cost += Decimal("45.00")
```

**checkout.py (QB flow)**: Updated payment charge calculation to handle will_call ($0) and expedited (+$45), consistent with order_service logic.

## Outcome

- ✅ Impact: Shipping fully displayed throughout cart → checkout flow; Will Call replaces Freight/LTL; expedited surcharge now correctly added to order record and payment charge
- 🧪 Tests: None added
- 📁 Files: 7 files modified
- 🔁 Next prompts: Restart backend; test full checkout flow for all three shipping methods

## Evaluation notes (flywheel)

- Failure modes observed: expedited surcharge was frontend-only, not stored in order record
- Graders run and results (PASS/FAIL): none
