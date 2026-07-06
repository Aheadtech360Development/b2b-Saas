---
id: "248"
title: Payment status paid for card/bank, Net 30 toggle, Invoice section conditional, QB sync
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix payment status and Net 30 system
labels: ["payment","net30","invoice","quickbooks","checkout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
  - backend/app/api/v1/admin/customers.py
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/guest.py
  - backend/app/models/company.py
  - backend/app/schemas/company.py
  - backend/app/services/order_service.py
  - backend/app/services/quickbooks_service.py
  - backend/app/tasks/quickbooks_tasks.py
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
tests:
  - npm run build — 80 pages, 0 TypeScript errors
---

## Prompt

Fix payment status and Net 30 system. Three related changes.

FIX 1 — Card/Bank Transfer orders must show "Paid" not "Due/Pending":
- In order_service.py: net_30 → payment_status="unpaid", all others (card/ach) → payment_status="paid"
- In guest.py: ACH payment_status="paid"
- QB sync: create_payment_for_invoice when payment_status=="paid" and payment_method!="net_30"

FIX 2 — Net 30 toggle per wholesale customer:
- Add net30_enabled to Company model
- Backend: PATCH /api/v1/admin/companies/{company_id}/net30 endpoint
- Frontend: Net 30 toggle in admin customer detail (active companies only)
- Checkout: validate net_30 requires company.net30_enabled == True
- GET /api/v1/account/net30-status endpoint for checkout page

FIX 3 — Invoice & Payment section conditional display:
- Show only for unpaid/due/net_30 orders or draft; hide for card/bank paid orders
- "Mark as Paid" button only shown for unpaid/due/net_30 orders

SQL for Railway:
ALTER TABLE companies ADD COLUMN IF NOT EXISTS net30_enabled BOOLEAN DEFAULT FALSE NOT NULL;
UPDATE orders SET payment_status = 'paid' WHERE payment_method IN ('card','credit_card','stripe','qb_payments','bank_transfer','ach','Credit Card') AND payment_status IN ('pending','unpaid');

## Response snapshot

All three fixes implemented across 12 files:
- Company model: net30_enabled boolean column added
- order_service.py + guest.py: payment_status logic fixed (net_30→unpaid, others→paid)
- checkout.py: net_30 validation against company.net30_enabled
- quickbooks_service.py: create_payment_for_invoice method
- quickbooks_tasks.py: QB payment creation after paid invoice (non-fatal)
- admin/customers/[id]/page.tsx: Net 30 toggle UI (blue, active companies only)
- admin/orders/[id]/page.tsx: Invoice section conditional via showInvoiceSection
- checkout/payment/page.tsx: Net 30 option gated on net30Enabled from /account/net30-status
- account.py: GET /account/net30-status endpoint added
Build: 80 pages, 0 TypeScript errors. Committed and pushed to main (2a59741).

## Outcome

- ✅ Impact: Card/bank orders now immediately show "Paid"; Net 30 is a per-customer opt-in controlled by admin; Invoice section hidden for already-paid orders; QB receives payment record for non-net30 paid orders
- 🧪 Tests: npm run build — 80 pages, 0 TypeScript errors
- 📁 Files: 12 files modified (9 backend, 3 frontend)
- 🔁 Next prompts: Run Railway SQL migration; test Net 30 toggle flow end-to-end
- 🧠 Reflection: Used getattr defensive fallback for net30_enabled until DB migration runs in prod

## Evaluation notes (flywheel)

- Failure modes observed: "due" is not a valid payment_status enum value in DB — used "unpaid" throughout; frontend showInvoiceSection checks both for forward-compat
- Graders run and results (PASS/FAIL): npm run build PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): End-to-end test Net 30 order placement and QB sync
