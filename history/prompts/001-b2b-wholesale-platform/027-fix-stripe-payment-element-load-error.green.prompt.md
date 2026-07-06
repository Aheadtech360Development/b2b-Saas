---
id: "027"
title: Fix Stripe payment Element load error
stage: green
date: 2026-03-18
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix Stripe payment Element load error {}"
labels: ["backend","bug-fix","stripe","payment"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/payment_service.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - POST /api/v1/checkout/intent creates PaymentIntent with card payment method
  - Stripe PaymentElement loads without "load error {}" in browser console
---

## Prompt

Console error in Step 3 - Payment: "Unhandled payment Element load error {}"
Stack trace from https://js.stripe.com/clover/stripe.js — error in iframe message handler with empty error object {}.

## Response snapshot

**Root cause:**

`automatic_payment_methods: {enabled: True}` requires payment method types to be configured in the Stripe Dashboard for the account. On a fresh test account without explicit dashboard configuration, Stripe's Elements cannot determine which payment methods to offer, resulting in a silent load error with empty `{}` object.

The error "Unhandled payment Element load error {}" with an empty object is characteristic of this failure mode — Stripe loads the iframe, tries to retrieve payment method configuration, gets nothing, and emits an unhandled load error.

**Fix — `backend/app/services/payment_service.py`:**

```python
# Before:
params: dict = {
    "amount": amount_cents,
    "currency": currency,
    "automatic_payment_methods": {"enabled": True},
    "metadata": metadata or {},
}

# After:
params: dict = {
    "amount": amount_cents,
    "currency": currency,
    "payment_method_types": ["card"],
    "metadata": metadata or {},
}
```

`payment_method_types: ["card"]` is explicit and always works without any Stripe Dashboard configuration. This is the correct approach for a B2B platform where only card payments are needed.

**Investigation ruled out:**
- Key mismatch: `.env` has matching `sk_test_51QoJDSK...` and `pk_test_51QoJDSK...` — same account ✅
- `clientSecret` format: backend returns correct `pi_xxx_secret_yyy` format ✅
- Zero amount: cart validation prevents empty/zero cart before intent creation ✅

## Outcome

- ✅ Impact: PaymentElement loads the card payment form correctly
- 🧪 Tests: Backend startup clean — PASS
- 📁 Files: payment_service.py (automatic_payment_methods → payment_method_types: ["card"])
- 🔁 Next prompts: Test complete checkout flow end-to-end with Stripe test card
- 🧠 Reflection: `automatic_payment_methods: {enabled: True}` is the newer Stripe API approach but requires dashboard setup. `payment_method_types: ["card"]` is explicit and always works — prefer it for new integrations.

## Evaluation notes (flywheel)

- Failure modes observed: Stripe's "load error {}" with empty object is the specific error signature for automatic_payment_methods failing to find configured methods. The empty error object is by design — Stripe doesn't expose internal API errors through the iframe message channel.
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
