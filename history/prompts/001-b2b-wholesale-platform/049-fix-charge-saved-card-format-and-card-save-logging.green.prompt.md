---
id: "049"
title: Fix Charge Saved Card Format and Card Save Logging
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix charge_saved_card cardOnFile format and improve card save logging
labels: ["bug-fix","qb-payments","charge","logging"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/qb_payments_service.py
  - backend/app/api/v1/checkout.py
tests:
  - docker logs afapparel_backend --tail 3 (Application startup complete)
---

## Prompt

Bug 1: charge_saved_card sending wrong cardOnFile format (object instead of string).
Bug 2: Add better logging to card save block.

## Changes

### qb_payments_service.py — charge_saved_card
BEFORE: `"cardOnFile": {"customerId": customer_id, "cardId": card_id}` (nested object)
AFTER: `"cardOnFile": card_id` (plain string) + `"context": {"mobile": False, "isEcommerce": True}`

### checkout.py — tokenize_card card save block
Added explicit log lines:
- Before save: `"Card save attempt — company: {id}, qb_customer_id: {qb_id}"`
- Customer created: `"QB Payments customer created: {id}"`
- Success: `"Card save SUCCESS for company {id} — card_id: {card_id}"`
- Failure: `"Card save FAILED for company {id}: {ExcType}: {message}"`

## Outcome
- ✅ charge_saved_card sends `cardOnFile` as plain string card ID
- ✅ context field added (mobile: false, isEcommerce: true)
- ✅ Card save logging now shows SUCCESS/FAILED clearly in docker logs
- ✅ Backend started cleanly
- 📁 Files: qb_payments_service.py, checkout.py
