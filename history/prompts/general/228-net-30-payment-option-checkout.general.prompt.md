---
id: 228
title: Net 30 Payment Option at Checkout
stage: general
date: 2026-06-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: direct
labels: ["checkout","payment","net-30","wholesale"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual UI verification required
---

## Prompt

Add Net 30 payment option to checkout. Three files need changes:

1. frontend/src/stores/checkout.store.ts
   - paymentMethod type already updated to include "net_30" (partially done)
   - setPaymentMethod type already updated

2. frontend/src/app/(customer)/checkout/payment/page.tsx
   - Add "Net 30 - Pay by Invoice" option for wholesale users
   - When selected, setPaymentMethod("net_30") and hide card fields
   - Only show this option when user.account_type === "wholesale"

3. frontend/src/app/(customer)/checkout/review/page.tsx  
   - Line 95: change condition from:
     } else if (!savedCardId && !qbToken && paymentMethod !== "ach") {
   - To:
     } else if (!savedCardId && !qbToken && paymentMethod !== "ach" && paymentMethod !== "net_30") {
   - In the confirm API call, make sure payment_method: paymentMethod is sent in the body

## Response snapshot

Three files updated:

**checkout.store.ts**: Fixed `initialState.paymentMethod` type annotation from `"card" | "ach"` to `"card" | "ach" | "net_30"`.

**payment/page.tsx**:
- Added `user` to `useAuthStore()` destructure; derived `isWholesale = user?.account_type === "wholesale"`
- Widened `paymentType` state type to `"card" | "ach" | "net_30"`
- Added Net 30 radio option that only renders for `!isGuest && isWholesale`
- Added `handleNet30Continue()` — calls `setPaymentMethod("net_30")` then routes to `/checkout/review`
- Added Net 30 info/CTA section rendered when `paymentType === "net_30"` (no card fields)

**review/page.tsx**:
- Guard condition now passes for `net_30` (won't redirect back to payment)
- `confirmOrder` call has a new `net_30` branch: `{ ...basePayload, payment_method: "net_30" }`
- `paymentLabel` resolves to `"Net 30 — Pay by Invoice"` for net_30
- Payment display section shows an invoice-pending notice for net_30

## Outcome

- ✅ Impact: Wholesale users can now select Net 30 at checkout; order placed with payment_method=net_30 sent to backend
- 🧪 Tests: Manual test required — log in as wholesale user, add to cart, go through checkout, verify Net 30 option appears and order completes
- 📁 Files: 3 files modified
- 🔁 Next prompts: Verify backend order_service accepts net_30 payment method; add invoice-generation trigger for net_30 orders
- 🧠 Reflection: IIFE pattern used for the net_30 radio to avoid an extra component; kept the UI consistent with existing ACH/card radio styles
