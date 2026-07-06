---
id: 138
title: Remove MOQ/MOV Validation from Checkout
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Remove MOQ and MOV cart validation blocking order placement at checkout step 3"
labels: ["backend","checkout","cart","validation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/cart_service.py
  - backend/app/api/v1/checkout.py
tests:
  - manual: Placing an order at checkout step 3 no longer shows "Cart validation failed" error
  - manual: Empty cart still blocked with "Cart is empty" error
  - manual: Shipping estimate still calculated correctly
---

## Prompt

At checkout Step 3, when placing an order, this error appears: "Cart validation failed — check MOQ and MOV requirements". We have already removed MOQ and MOV from everywhere. Now remove this validation from the order placement flow too.

## Response snapshot

**`cart_service.py`**: Changed `is_valid=not moq_violations and not mov_violation` to `is_valid=True`. MOQ/MOV violation tracking fields remain intact but no longer gate the cart.

**`checkout.py`**: Removed both `if not cart.validation.is_valid: raise ValidationError(...)` guards — one in the Stripe `create_payment_intent` flow (line ~37) and one in the QB Payments `confirm_checkout` flow (line ~189). Empty cart check kept in both locations.

## Outcome

- ✅ Order placement no longer blocked by MOQ/MOV validation
- ✅ Empty cart still raises a validation error
- ✅ Shipping estimation unchanged
- 🧪 Tests: Manual
- 📁 Files: 2 files modified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
