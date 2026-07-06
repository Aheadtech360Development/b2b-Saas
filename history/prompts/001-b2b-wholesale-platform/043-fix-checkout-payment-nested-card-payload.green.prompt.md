---
id: "043"
title: Fix Checkout Payment Nested Card Payload
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix checkout payment page sending flat card fields when backend expects nested card object
labels: ["bug-fix","checkout","qb-payments","tokenize"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/checkout/QBPaymentForm.tsx
tests:
  - docker logs afapparel_backend --tail 5 (clean startup, no errors)
---

## Prompt

Fix two payment issues:

Bug 1: account.py NameError — settings not defined (already fixed in PHR #042)

Bug 2: Checkout Step 3 — "Missing required card field: 'card'"
Frontend sends flat fields but backend now expects nested card object.

## Response snapshot

**Root cause:** `QBPaymentForm.tsx` called `POST /checkout/tokenize` with flat keys (`card_number`, `exp_month`, etc.) but backend was updated in PHR #041 to expect `{ card: { number, expMonth, expYear, cvc, ... } }`.

**Fix (`QBPaymentForm.tsx` lines 69–76):**

BEFORE:
```json
{
  "card_number": "4111...",
  "exp_month": "12",
  "exp_year": "2026",
  "cvc": "123",
  "name": "Jane",
  "postal_code": "10001"
}
```

AFTER:
```json
{
  "card": {
    "number": "4111...",
    "expMonth": "12",
    "expYear": "2026",
    "cvc": "123",
    "name": "Jane",
    "address": { "postalCode": "10001" }
  }
}
```

Note: `address` field only included when `postal_code` is non-empty (avoids sending `address: { postalCode: "" }`).

Bug 1 (settings NameError) was already fixed in PHR #042 — import verified present at account.py line 13.

## Outcome

- ✅ `QBPaymentForm.tsx` now sends nested `card` object matching backend contract
- ✅ `address` only included when postal code provided
- ✅ Backend restarted cleanly — no errors
- 📁 Files: QBPaymentForm.tsx
