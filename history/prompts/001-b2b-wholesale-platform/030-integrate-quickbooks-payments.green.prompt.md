---
id: "030"
title: Integrate QuickBooks Payments API
stage: green
date: 2026-03-24
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: resume (continued from context-compacted session)
labels: ["quickbooks","payments","checkout","qb-payments","integration"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/qb_payments_service.py (created)
  - backend/app/models/order.py (added qb_payment_charge_id, qb_payment_status columns)
  - backend/app/schemas/order.py (CheckoutConfirmRequest: payment_intent_id optional, added qb_token/saved_card_id/qb_customer_id/save_card)
  - backend/app/services/order_service.py (create_order accepts qb_charge_id, qb_payment_status)
  - backend/app/api/v1/checkout.py (added POST /checkout/tokenize, updated POST /checkout/confirm for QB flow)
  - backend/migrations/versions/f3a9c1d2e456_order_qb_payment_fields.py (created)
  - frontend/src/components/checkout/QBPaymentForm.tsx (created)
  - frontend/src/stores/checkout.store.ts (added qbToken, setQbToken)
  - frontend/src/app/(customer)/checkout/payment/page.tsx (replaced Stripe Elements with QBPaymentForm)
  - frontend/src/app/(customer)/checkout/review/page.tsx (sends qb_token, updated payment status display)
  - frontend/src/services/orders.service.ts (ConfirmOrderPayload updated: payment_intent_id optional, added QB fields)
tests:
  - none (manual end-to-end test required with valid QB OAuth tokens)
---

## Prompt

Integrate QuickBooks Payments into AF Apparels platform. Replace Stripe payment processing with QuickBooks Payments API. (Resumed from previous compacted session — implementing the full 12-step plan.)

## Response snapshot

Full QB Payments integration implemented across backend and frontend:

**Backend:**
- `qb_payments_service.py`: stateless service wrapping QB Payments REST API (sandbox/production). Methods: `create_token`, `charge_card`, `charge_saved_card`, `get_charge`, `refund_charge`, `save_card`, `list_saved_cards`, `delete_saved_card`. Reuses OAuth tokens from `QuickBooksService.get_access_token()`.
- `models/order.py`: added `qb_payment_charge_id` (String 255, indexed) and `qb_payment_status` (String 50).
- `schemas/order.py`: `CheckoutConfirmRequest.payment_intent_id` made optional; added `qb_token`, `saved_card_id`, `qb_customer_id`, `save_card`.
- `order_service.py`: `create_order` accepts `qb_charge_id` and `qb_payment_status`; sets `payment_status="paid"` when QB charge succeeds.
- `checkout.py`: new `POST /checkout/tokenize` endpoint (server-side SAQ D path); `POST /checkout/confirm` handles QB token charge, saved-card charge, optional card save, then delegates to `create_order`.
- Alembic migration `f3a9c1d2e456` adds both new columns (down_revision = `e114fbbfad6b`).

**Frontend:**
- `QBPaymentForm.tsx`: card entry UI with auto-spacing, validation, calls `POST /checkout/tokenize`, fires `onToken(token)` callback.
- `checkout.store.ts`: added `qbToken: string | null` and `setQbToken`.
- `payment/page.tsx`: simplified to just mount `QBPaymentForm`; on token → store + navigate to review.
- `review/page.tsx`: sends `qb_token` in `confirmOrder`, falls back to `payment_intent_id`; updated status text.
- `orders.service.ts`: `ConfirmOrderPayload` has all QB fields; `payment_intent_id` is now optional.

## Outcome

- ✅ Impact: Stripe replaced with QuickBooks Payments for card processing; Stripe code retained in payment_service.py for rollback.
- 🧪 Tests: Manual test requires valid QB_ACCESS_TOKEN and QB_REFRESH_TOKEN in .env (currently empty). QB sandbox credentials must be obtained via QB Developer portal OAuth flow.
- 📁 Files: 11 files modified/created
- 🔁 Next prompts: (1) Run Alembic migration `alembic upgrade head`. (2) Populate QB OAuth tokens via OAuth flow or manually. (3) End-to-end checkout test in sandbox.
- 🧠 Reflection: PCI note documented in service: server-side tokenize endpoint requires SAQ D; QB.js client-side path reduces scope to SAQ A. QB Payments base URL derived from existing QB_ENVIRONMENT setting — no new config keys needed.

## Evaluation notes (flywheel)

- Failure modes observed: none (implementation complete)
- Graders run and results (PASS/FAIL): none automated
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): add QB.js client-side tokenizer to eliminate server-side card handling
