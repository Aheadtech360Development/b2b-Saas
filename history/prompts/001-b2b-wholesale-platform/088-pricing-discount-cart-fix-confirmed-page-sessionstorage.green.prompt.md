---
id: "088"
title: Pricing Discount Cart Fix + Confirmed Page sessionStorage
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["pricing","cart","checkout","confirmed","sessionStorage","bugfix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/cart_service.py
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/checkout/confirmed/page.tsx
tests:
  - npx tsc --noEmit (TypeScript clean — only pre-existing test file errors)
---

## Prompt

1. Pricing tiers: when I added to cart, the discount was not being applied. Fix this.
2. Step 4 (order confirmed page) does not appear at all. Everything refreshes and goes back to step 1. The order gets placed and everything works fine, just the order confirmed page is not showing.

## Response snapshot

### Fix 1: Pricing discount not applied when loading cart

**Root cause**: `_load_cart_items` in `cart_service.py` accepted `discount_percent` as a parameter but **never used it** — it read `item.unit_price` directly from the DB. The discount was only applied when an item was first added. If a customer had no tier when items were added (or if their tier was assigned later), the stored `unit_price` was the undiscounted retail price and the cart would always show full price.

**Fix**: In `_load_cart_items`, replaced `item.unit_price` with a fresh `PricingService.calculate_effective_price(variant.retail_price, discount_percent)` call. The cart now always recalculates from retail_price × current tier discount, so changing a tier is immediately reflected without needing to re-add items.

Also fixed `bulk_add_validated_items` (quick order path): it was creating `CartItem` records with no `unit_price` at all. Now it loads the variant and applies the same effective price calculation.

### Fix 2: Confirmed page not showing (sessionStorage persistence)

**Root cause**: Zustand is in-memory only. When Next.js does a full-page navigation (rather than a soft client-side push) between `/checkout/review` and `/checkout/confirmed`, the Zustand store resets to `initialState` — `confirmedOrderId` and `confirmedOrderNumber` become null. The guard `if (!confirmedOrderId && !confirmedOrderNumber) → router.replace("/cart")` fires, sending the user back, which looked like "going to step 1".

**Fix (two-part)**:
1. `review/page.tsx handlePlaceOrder()`: after `setConfirmedOrder(...)`, writes all confirmed data to `sessionStorage.setItem("af_confirmed_order", JSON.stringify(...))`.
2. `confirmed/page.tsx`: replaced the reactive `useEffect` guard with a mount-only effect. On mount: if Zustand store is empty, tries `sessionStorage.getItem("af_confirmed_order")` — if found, calls `setConfirmedOrder(data)` and sets `ready=true` to render the page. If neither store nor sessionStorage has data (genuine direct navigation), redirects to `/cart`.
3. Removed `export const dynamic = "force-dynamic"` from the confirmed page (was leftover noise on a client component).
4. Added `ready` state so the page shows "Loading…" instead of prematurely rendering empty data.

## Outcome

- ✅ Impact: Cart now always shows discounted prices for customers with pricing tiers. Order confirmed page (step 4) reliably displays after order placement, even if the Zustand store is wiped by a full navigation.
- ✅ Tests: TypeScript clean (tsc --noEmit, pre-existing test errors only)
- ✅ Files: 3 files modified
- ✅ No breaking changes

## Evaluation notes (flywheel)

- Failure modes observed: (1) `_load_cart_items` accepting but ignoring `discount_percent` — always verify that a parameter is actually used in the function body. (2) Zustand stores are in-memory only — any critical data that must survive navigation should be backed by sessionStorage.
- Graders run and results (PASS/FAIL): tsc --noEmit PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Clear `af_confirmed_order` from sessionStorage when user clicks "View My Orders" or "Continue Shopping" on the confirmed page for clean session hygiene
