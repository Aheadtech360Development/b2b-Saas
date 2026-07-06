# ADR-005: Payment Processing and PCI Compliance via Stripe Elements

- **Status:** Accepted
- **Date:** 2026-03-09
- **Feature:** 001-b2b-wholesale-platform

- **Context:** The platform must accept card payments from wholesale buyers. As a B2B platform processing recurring orders of significant value, payment security is critical. The team must choose a payment architecture that meets PCI DSS requirements without requiring the AF Apparels VPS to become a PCI-compliant environment (which would require extensive auditing, WAF, network segmentation, etc.).

## Decision

Use Stripe as the payment processor with the **Stripe Elements + Payment Intents** pattern:

- **Frontend**: Stripe Elements (Stripe-hosted iframe) captures card data directly — card numbers, CVV, and expiry never touch the AF Apparels servers
- **Backend**: Creates `PaymentIntent` server-side (Stripe secret key used only on backend); returns `client_secret` to frontend
- **Frontend**: Confirms payment using `stripe.confirmCardPayment(clientSecret)` — Stripe handles 3DS/SCA
- **Webhooks**: Stripe sends `payment_intent.succeeded` / `payment_intent.payment_failed` / `charge.refunded` to `POST /api/v1/webhooks/stripe`; backend processes these idempotently (deduplication via `webhook_log.event_id`)
- **Idempotency**: All Stripe API calls use idempotency keys (derived from order ID) to prevent duplicate charges on network retry
- **PCI scope**: Stripe Elements iframe is served from Stripe's PCI-compliant infrastructure; the AF Apparels platform is PCI SAQ-A compliant (lowest tier, no card data handled)

## Consequences

### Positive

- **PCI SAQ-A compliance**: Card data never reaches AF Apparels servers — no PCI Level 1 audit required; SAQ-A self-assessment is sufficient
- **3DS/SCA handled by Stripe**: Authentication challenges (required in EU/UK) are managed transparently by Stripe's frontend SDK
- **Idempotency keys prevent duplicate charges**: Critical for a B2B platform where network issues during checkout could cause order retries
- **Webhook-driven order fulfillment**: Decouples payment confirmation from order creation; backend always hears about payment outcomes regardless of client connectivity
- **Stripe's fraud tools (Radar)**: Applied automatically without additional integration work

### Negative

- **Vendor lock-in**: Migrating away from Stripe requires replacing the entire checkout flow, webhook handler, and Payment Intent model — significant effort
- **Webhook reliability**: If `POST /api/v1/webhooks/stripe` is down during a payment event, Stripe retries for 3 days, but orders may be in a pending state during the gap
- **Stripe fee structure**: Per-transaction fees (2.9% + 30¢ for card-present equivalent) apply; for large wholesale orders this is non-trivial
- **Test/Production key management**: Developers must carefully manage `STRIPE_SECRET_KEY` (test vs live) to avoid accidental charges
- **PaymentIntent lifecycle complexity**: The `pending → confirmed → processing → paid → failed` state machine requires careful mapping to the order status model

## Alternatives Considered

### Alternative A: Server-side card tokenization (Stripe.js v2 / legacy)
Tokenize card on frontend via deprecated Stripe.js v2, send token to backend, charge from backend.

- **Pros**: More server-side control; simpler frontend integration.
- **Cons**: Deprecated pattern; triggers PCI SAQ-D (highest tier) if any card data transits the server; Stripe no longer recommends this.
- **Verdict**: Rejected — PCI compliance requirement eliminates this option.

### Alternative B: PayPal / Braintree
Use PayPal's hosted fields or Braintree Drop-in UI.

- **Pros**: PayPal brand recognition; international coverage.
- **Cons**: B2B wholesale buyers rarely use PayPal; Braintree integration more complex than Stripe Elements; less mature Python SDK; Stripe is the team's explicit preference.
- **Verdict**: Rejected — client requirement is Stripe.

### Alternative C: Bank transfer / ACH only (no card payments)
Accept payment via ACH bank transfer (Stripe ACH) or manual bank transfer with net terms.

- **Pros**: Lower fees for large transactions; common in B2B trade.
- **Cons**: ACH has 2–5 day settlement delay; does not support instant fulfillment; manual bank transfer requires accounts receivable process.
- **Verdict**: Could be added as a supplementary payment method in a future iteration; rejected as the primary method.

## References

- Feature Spec: `specs/001-b2b-wholesale-platform/spec.md`
- Implementation Plan: `specs/001-b2b-wholesale-platform/plan.md` (Payments section, Webhook Infrastructure)
- Constitution: `.specify/memory/constitution.md` (Article V — PCI compliance via Stripe Elements)
- Implementation: `backend/app/api/v1/checkout.py`, `backend/app/api/v1/webhooks.py`, `backend/app/services/payment_service.py`
- Related ADRs: ADR-002 (Two-Service Architecture), ADR-003 (JWT Auth)
