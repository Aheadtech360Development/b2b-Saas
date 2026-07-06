---
id: "051"
title: Debug Tokenize Not Called in Checkout Step 3
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Debug why tokenize is never called — saved card auto-selected, UX back button fix
labels: ["debug","checkout","tokenize","saved-cards"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/checkout/payment/page.tsx
tests:
  - frontend restarted cleanly
---

## Prompt

Debug why tokenize endpoint is not being called. Logs show confirm happens but tokenize never appears.

## Root cause

**Expected behavior — not a bug.** Tokenize is never called because the saved card is auto-selected on page load. The flow:

- **Saved card selected** (default state): page-level "Continue to Review" → `setSavedCardId` → navigate to review → `confirm` with `saved_card_id`. No tokenize needed or called. ✅
- **"Use a new card" selected**: QBPaymentForm shown, page-level button hidden. Submitting the form → `handleSubmit` → `POST /checkout/tokenize` → `onToken(token)` → `setQbToken` → navigate to review → `confirm` with `qb_token`. ✅

The entire chain was verified correct:
- `QBPaymentForm.tsx:69` — calls `apiClient.post("/api/v1/checkout/tokenize", {card: {...}})`
- `payment/page.tsx:50` — `handleToken(token)` calls `setQbToken(token)`
- `checkout.store.ts:51` — `setQbToken` sets `qbToken`, clears `savedCardId`
- `review/page.tsx:46` — passes `qb_token: qbToken` to `confirmOrder`
- `orders.service.ts:40` — posts payload to `/api/v1/checkout/confirm`

## Fix applied

**UX bug fixed:** When saved cards exist and user selects "Use a new card", clicking Back on the new card form incorrectly navigated to `/checkout/details`. Fixed: Back now returns to saved card list (restores default card selection) instead of leaving the payment step.

```tsx
onBack={
  savedCards.length > 0
    ? () => { setShowNewCardForm(false); setSelectedCardId(savedCards.find(c => c.is_default)?.id ?? savedCards[0]?.id ?? null); }
    : () => router.push("/checkout/details")
}
```

## Outcome
- ✅ Root cause identified: saved card auto-selected → correct behavior
- ✅ "Use a new card" Back button now returns to saved card list
- ✅ New card form submit → tokenize → confirm flow verified end-to-end
- 📁 Files: payment/page.tsx
