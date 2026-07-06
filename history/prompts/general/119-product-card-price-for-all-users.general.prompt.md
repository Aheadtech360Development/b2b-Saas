---
id: 119
title: Product Card Price Visible for All Users
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["pricing","product-listing","guest","wholesale","product-card"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/ProductListClient.tsx
tests:
  - none
---

## Prompt

On the customer-facing product listing page (collections/products grid), show prices on product cards for all users:
- Logged-out guests: show MSRP price with label "From $X.XX"
- Logged-in wholesale users: show retail_price (wholesale price) with label "From $X.XX"

The price is already available in the product list API response as effective_price on the first variant. Display it on each product card.

## Response snapshot

**No backend changes needed:** The backend already returns the correct `effective_price` per user type — MSRP for unauthenticated guests, `retail_price` (with any tier discounts applied) for authenticated wholesale users. This was verified in `product_service.py` `_attach_pricing_and_stock`.

**Change made** — `frontend/src/app/(customer)/products/ProductListClient.tsx` — 3 changes:

1. Removed `LockIcon` from icon import (no longer used)
2. Replaced the Price block:
   - Before: `isAuthenticated && price ? <price> : <LockIcon + "Login for pricing">`
   - After: `price ? <"From $X.XX"> : null`
3. Price format: `"From $X.XX"` in 13px bold for all users when `effective_price` is present

The `price` variable was already computed as `primaryVariant?.effective_price ?? primaryVariant?.retail_price` — no change needed there.

## Outcome

- ✅ Impact: All visitors see "From $X.XX" on every product card; guests see MSRP, wholesale users see their tier-adjusted wholesale price; the lock icon is gone
- 🧪 Tests: None automated; verify by visiting /products logged out (MSRP shown) and logged in as wholesale user (retail_price shown)
- 📁 Files: 1 file modified
- 🔁 Next prompts: None
- 🧠 Reflection: The backend pricing layer already handled the guest/wholesale split correctly — the frontend just needed to stop gating the display on `isAuthenticated`.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
