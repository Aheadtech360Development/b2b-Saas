---
id: "050"
title: Debug Card Save Logs in Confirm Checkout
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Add debug logs to confirm_checkout and diagnose card save not appearing
labels: ["debug","checkout","card-save","logging"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
tests:
  - docker logs afapparel_backend --tail 3 (Application startup complete)
---

## Prompt

Fix card save not executing after checkout. Logs show no "Card save attempt" after POST /checkout/confirm.

## Root cause found

**There is no card save block in `confirm_checkout`** — it was moved to `tokenize_card` in PHR #047. The entire frontend chain (store → review → service → payload) is correct.

The "Card save attempt" log appears around POST /checkout/tokenize (Step 3 payment page), NOT after POST /checkout/confirm (Step 4 review). The card is saved BEFORE the order is placed.

Timeline of logs for a new-card checkout:
1. `tokenize_card called — company: X` → during Step 3
2. `Card save attempt — company: X, qb_customer_id: Y`
3. `Card save SUCCESS for company X — card_id: Z`
4. `confirm_checkout called — company: X, fields_set: {qb_token, ...}` → during Step 4
5. `confirm_checkout payment — qb_token: True, saved_card_id: False`

## Changes

### checkout.py — tokenize_card
Added: `"tokenize_card called — company: X (card save runs here, not at confirm)"`

### checkout.py — confirm_checkout
Added two diagnostic logs at function start:
- `"confirm_checkout called — company: X, fields_set: {qb_token, address_id, ...}"`
- `"confirm_checkout payment — qb_token: True/False, saved_card_id: True/False, payment_intent_id: True/False"`

## Outcome
- ✅ Debug logs added to both endpoints
- ✅ Timeline of card save vs order confirm is now visible in logs
- ✅ Backend started cleanly
- 📁 Files: checkout.py
