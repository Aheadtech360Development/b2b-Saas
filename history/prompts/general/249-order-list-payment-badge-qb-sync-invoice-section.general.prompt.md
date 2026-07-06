---
id: "249"
title: Order list payment badge, QB sync fix, Invoice section always visible
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix three issues with order status display, QB payment sync, and Invoice section
labels: ["orders","quickbooks","payment","invoice","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/app/api/v1/admin/orders.py
  - backend/app/services/quickbooks_service.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - npm run build — 80 pages, 0 TypeScript errors
---

## Prompt

Fix three issues with order status display, QB payment sync, and Invoice section.

FIX 1 — Order list shows "pending" even when payment is "Paid": orders list was
showing fulfillment status in the Status column with no payment status badge.
Show two separate badges — fulfillment status always, payment badge only when
payment_status !== 'paid'. Remove duplicate fulfillment badge from Order # column.

FIX 2 — QB invoice showing "Due" instead of "Paid":
- Backend `/orders/{id}/sync-quickbooks` endpoint imported `sync_order_to_qb`
  (non-existent task) instead of `sync_order_invoice_to_qb` — QB sync button
  was silently broken.
- `create_payment_for_invoice` included `PaymentMethodRef` which fails if "Credit
  Card"/"Check" isn't configured in QB; removed it.
- Improved error logging from `logger.warning` to `logger.error` with exc_info=True.
- Add "Sync Now" button next to "Not synced" in order detail sidebar.

FIX 3 — Invoice & Payment section missing after order edit: removed
`showInvoiceSection` conditional entirely; always render the section.
"Mark as Paid" button only shown when `payment_status !== 'paid'`.

## Response snapshot

5 files changed:
- orders/page.tsx: Added PAYMENT_COLORS map; Status column shows fulfillment badge + payment badge (only when not paid); removed duplicate status badge from Order # column
- orders/[id]/page.tsx: Invoice & Payment always visible; Mark as Paid only when unpaid; "Sync Now" button appears next to "Not synced" QB invoice label
- admin/orders.py: Fixed sync endpoint to import sync_order_invoice_to_qb (was sync_order_to_qb)
- quickbooks_service.py: Removed PaymentMethodRef from create_payment_for_invoice payload
- quickbooks_tasks.py: Improved payment creation logging (error+exc_info, log payment Id on success)
Build: 80 pages, 0 TypeScript errors. Committed 34a5951 and pushed.

## Outcome

- ✅ Impact: Orders list now shows fulfillment + payment badges separately; QB Sync Now button actually queues the correct task; create_payment_for_invoice no longer fails on missing PaymentMethodRef; Invoice section always visible to admin
- 🧪 Tests: npm run build PASS
- 📁 Files: 5 files modified (2 frontend, 3 backend)
- 🔁 Next prompts: Test QB sync on a new card order to verify payment syncs to QB
- 🧠 Reflection: The sync endpoint bug (wrong task name) was silently swallowing all manual QB sync attempts — the button appeared to work but did nothing

## Evaluation notes (flywheel)

- Failure modes observed: sync_order_to_qb imported but doesn't exist — NameError at runtime, task never queued
- Graders run and results (PASS/FAIL): npm run build PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Verify QB payment creation works end-to-end on a test card order
