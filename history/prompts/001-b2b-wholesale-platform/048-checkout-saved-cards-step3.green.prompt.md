---
id: "048"
title: Checkout Step 3 Saved Cards Selection
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Update Checkout Step 3 to show saved cards first with selectable list
labels: ["checkout","saved-cards","qb-payments","frontend"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - backend/app/api/v1/checkout.py
tests:
  - docker logs afapparel_backend --tail 3 (Application startup complete)
---

## Prompt

Update Checkout Step 3 to show saved cards first. Load saved cards, show selectable radio list, "Use a new card" option, continue button for saved card selection.

## Changes

### checkout.store.ts
- Added `savedCardId: string | null` to state and `initialState`
- Added `setSavedCardId(id)` action — also clears `qbToken`
- Updated `setQbToken(token)` — also clears `savedCardId`
- Updated `setQbToken` type: accepts `string | null`

### checkout/payment/page.tsx (rewrite)
- Loads saved cards from `/api/v1/account/payment-methods` on mount
- Auto-selects default card (or first card) if any exist
- Shows saved cards as radio options with card icon, brand/last4, expiry, Default badge
- "Use a new card" radio option at bottom of saved cards list
- If no saved cards → shows `QBPaymentForm` directly
- "Continue to Review" button for saved card selection → calls `setSavedCardId` + navigate
- `QBPaymentForm` shown when "Use a new card" selected or no saved cards

### checkout/review/page.tsx
- Reads `savedCardId` from store
- Validation: accepts `qbToken || savedCardId || paymentIntentId`
- `confirmOrder` payload: adds `saved_card_id: savedCardId ?? undefined`
- Payment summary: shows "Saved card selected" when `savedCardId` is set

### checkout.py (backend)
- `has_qb` check: `bool(payload.qb_token or payload.saved_card_id)` — no longer requires `qb_customer_id` from frontend
- Saved card charge: looks up `company.qb_customer_id` from DB automatically
- Raises `ValidationError` if no QB Payments profile found (company needs to complete one order with new card first)

## Outcome

- ✅ Step 3 shows saved cards for returning customers
- ✅ Default card auto-selected
- ✅ "Use a new card" option to enter a different card
- ✅ Saved card charges look up qb_customer_id from DB — frontend doesn't pass it
- ✅ Backend started cleanly
- 📁 Files: checkout.store.ts, payment/page.tsx, review/page.tsx, checkout.py
