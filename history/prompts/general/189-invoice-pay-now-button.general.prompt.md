---
id: 189
title: Invoice Pay Now Button
stage: green
date: 2026-05-14
surface: agent
model: claude-sonnet-4-6
feature: admin-orders
branch: main
user: umeradnan7106
command: Replace bank details in invoice email with a Pay Now button that redirects to checkout
labels: ["invoice","payment","email","qb-payments","checkout","frontend","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/email_service.py
  - backend/app/api/v1/orders.py
  - frontend/src/components/checkout/QBPaymentForm.tsx
  - frontend/src/app/(customer)/checkout/layout.tsx
  - frontend/src/app/(customer)/checkout/invoice/[order_number]/page.tsx
tests:
  - manual: Invoice email shows centered Pay Now button linking to /checkout/invoice/{order_number}
  - manual: GET /checkout/invoice/AF-XXXXXX loads order summary and card form
  - manual: Unauthenticated visit redirects to /login?redirect=/checkout/invoice/...
  - manual: Submitting card on invoice page calls POST /api/v1/orders/{id}/pay-invoice and marks order paid
  - manual: Already-paid order shows PAYMENT COMPLETE screen immediately
  - manual: QBPaymentForm submit button shows "Pay $X.XX" on invoice page, "Continue to Review" on checkout
---

## Prompt

Replace bank details in invoice email with a "Pay Now" button that redirects to checkout. Read files first.

[Full prompt with detailed file specifications and code for email_service.py, frontend invoice page, and backend pay-invoice endpoint]

## Response snapshot

Implemented across 5 files:

**`email_service.py`**: Added `pay_url = f"{settings.FRONTEND_URL}/checkout/invoice/{order_num}"` and replaced the bank details yellow box (`#fff8e1`) with a centered "Pay Now — $X.XX" button linking to the invoice payment page.

**`backend/app/api/v1/orders.py`**: Added `_PayInvoiceRequest(card_token: str)` inline schema and `POST /{order_id}/pay-invoice` endpoint that: verifies order ownership (wholesale company_id or retail placed_by_id), rejects already-paid orders with 400, charges via `QBPaymentsService().charge_card()`, verifies CAPTURED status, then issues a raw SQL UPDATE to set `payment_status='paid'`, `marked_paid_at=now`, and appends a timeline entry.

**`QBPaymentForm.tsx`**: Added optional `submitLabel?: string` prop (defaults to "Continue to Review" for backward compat). Invoice page passes `"Pay $X.XX"` so the submit button is clearly labeled.

**`checkout/layout.tsx`**: Added `display: pathname.includes('/checkout/invoice') ? 'none' : undefined` to the step indicator bar so it doesn't show on the invoice payment page.

**`checkout/invoice/[order_number]/page.tsx`** (NEW): Client page that: redirects to `/login?redirect=...` if unauthenticated; fetches order via `GET /api/v1/orders/{order_number}`; shows order summary (items, shipping, tax, total due); renders `QBPaymentForm` with `submitLabel="Pay $X.XX"`; on token calls `POST /api/v1/orders/{id}/pay-invoice`; on success shows PAYMENT COMPLETE screen; on error shows retry/view orders buttons.

## Outcome

- ✅ Impact: Invoice emails now have a "Pay Now" button instead of placeholder bank details. Customers can pay online directly from the invoice email link.
- 🧪 Tests: Manual — send invoice, click Pay Now, enter card, verify order marked paid.
- 📁 Files: 5 files modified/created — email_service.py, orders.py (backend), QBPaymentForm.tsx, layout.tsx, invoice/[order_number]/page.tsx (new).
- 🔁 Next prompts: None — invoice payment flow complete.
- 🧠 Reflection: QBPaymentForm needed a `submitLabel` prop to avoid "Continue to Review" being misleading on the invoice page. The checkout layout step bar needed hiding for the invoice sub-route. Auth redirect pattern (check isLoading before redirecting) avoids flash redirects on page load.

## Evaluation notes (flywheel)

- Failure modes observed: step bar showing on invoice page (unrelated to checkout flow); misleading submit button label from reused component
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
