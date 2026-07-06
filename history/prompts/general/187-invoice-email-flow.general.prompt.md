---
id: 187
title: Invoice Email Flow — Admin Orders Full Implementation
stage: green
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: invoice-email-flow
branch: main
user: umeradnan7106
command: Implement Invoice Email flow for admin-created/edited orders
labels: ["invoice","email","pdf","admin","orders","payment-terms","mark-paid"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/order.py
  - backend/app/main.py
  - backend/app/schemas/order.py
  - backend/app/services/pdf_service.py
  - backend/app/services/email_service.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - manual: admin confirms draft order → invoice auto-emailed
  - manual: Send Invoice button emails customer with correct payment terms
  - manual: Mark as Paid updates payment_status and shows PAID badge
  - manual: Resend Invoice works for already-confirmed orders
---

## Prompt

Implement Invoice Email flow for admin-created/edited orders. Steps:
1. Add payment_terms, invoice_sent_at, marked_paid_at, marked_paid_by columns to orders table via startup SQL
2. Update PDF invoice to include dynamic payment terms + bank details (placeholders)
3. Update email service send_invoice to accept payment_terms and include bank details
4. Auto-send invoice when draft/pending order is confirmed (status → confirmed)
5. Admin order detail page — Payment Terms selector + Invoice & Payment action bar
6. Two new backend endpoints: POST /admin/orders/{order_id}/send-invoice and POST /admin/orders/{order_id}/mark-paid

## Response snapshot

Implemented the full invoice email flow across 7 files:

**Backend model** (`order.py`): Added 4 new nullable mapped columns — `payment_terms` (VARCHAR 20, default 'net_30'), `invoice_sent_at` (TIMESTAMPTZ), `marked_paid_at` (TIMESTAMPTZ), `marked_paid_by` (VARCHAR 255).

**Startup SQL** (`main.py`): Added idempotent `DO $ BEGIN IF NOT EXISTS ... ALTER TABLE orders ADD COLUMN ... END IF; END$;` block for all 4 new columns.

**Pydantic schemas** (`schemas/order.py`): Added 4 fields to `AdminOrderDetail`, `payment_terms` to `OrderUpdateRequest`, new `SendInvoicePayload(payment_terms='net_30')` schema.

**PDF service** (`pdf_service.py`): Dynamic due date via `_days_map` dict, dynamic terms text per `payment_terms` value, bank wire transfer details section with placeholders (`[YOUR BANK NAME]`, `[ROUTING NUMBER]`, `[ACCOUNT NUMBER]`), colored reference line.

**Email service** (`email_service.py`): Updated `send_invoice` signature with `payment_terms` param, personalized greeting, dynamic due date in subject line (`Invoice XXXX — Due MMM DD, YYYY | AF Apparels`), bank details HTML section, `object.__setattr__` trick to set payment_terms on ORM object for PDF.

**Admin orders API** (`admin/orders.py`): Auto-send invoice on status change pending→confirmed; new `POST /send-invoice` endpoint with `SendInvoicePayload`; new `POST /mark-paid` endpoint updating payment_status, marked_paid_at, marked_paid_by, appending timeline entry.

**Frontend** (`orders/[id]/page.tsx`): Added interface fields, `paymentTerms`/`isMarkingPaid` state, Payment Terms selector in UPDATE ORDER form, `handleMarkAsPaid` function, Invoice & Payment action bar below ORDER ITEMS totals showing invoice sent date, Send/Resend Invoice button, Mark as Paid button, PAID badge.

## Outcome

- ✅ Impact: Full invoice email lifecycle — auto-send on confirm, manual send/resend, mark paid, PAID badge. Admin has full control over payment terms per order.
- 🧪 Tests: Manual test paths: confirm order → check email received; Send Invoice button; Mark as Paid → PAID badge; Resend Invoice on confirmed order.
- 📁 Files: 7 files modified across backend model, startup, schemas, pdf service, email service, API, and frontend order detail page.
- 🔁 Next prompts: Replace bank detail placeholders with real bank info before going live.
- 🧠 Reflection: Used `object.__setattr__` to temporarily patch ORM object for PDF generation without mutating DB state. `getattr(order, 'field', None)` for safe access on old records missing new columns.

## Evaluation notes (flywheel)

- Failure modes observed: none — idempotent startup SQL guards against re-running on existing columns
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: replace bank placeholder values with real wire transfer details
