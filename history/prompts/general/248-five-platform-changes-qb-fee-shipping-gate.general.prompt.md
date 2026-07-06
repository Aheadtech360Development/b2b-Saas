---
id: 248
title: Five platform changes — QB sync, image disclaimer, print, 3% card fee, shipping gate
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: session continuation
labels: ["quickbooks","convenience-fee","shipping","print","ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/guest.py
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/services/order_service.py
  - backend/app/tasks/quickbooks_tasks.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/payment/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - npm run build (TypeScript clean, 80 pages)
---

## Prompt

Five separate changes: (1) QB sync fix + invoice download + Mark as Paid; (2) Image Library disclaimer; (3) Print Page button; (4) 3% convenience fee for card payments; (5) Block Continue to Payment until shipping selected.

## Response snapshot

All five changes implemented and committed as b2087ab. Build clean (80 pages, zero TS errors).

1. QB sync: fixed sync_order_to_qb→sync_order_invoice_to_qb import; removed PaymentMethodRef from QB payment; added verbose task logging; Sync Now button.
2. Image Library: "Color may vary due to digital picture." italic disclaimer.
3. Print Page: window.print() button in admin order header + @media print CSS hiding nav/sidebar.
4. 3% convenience fee: computed in order_service/checkout.py/guest.py; stored via raw SQL (convenience_fee column); displayed in payment page summary, customer account order detail, admin order detail. OrderOut schema updated.
5. Shipping gate: Continue button disabled while live rates load; blocked with amber error if no rate selected for live_shippo users; error clears on rate selection.

SQL to run in Railway:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS items_edited BOOLEAN DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS convenience_fee DECIMAL(10,2) DEFAULT 0.00;

## Outcome

- ✅ Impact: QB sync now functional; card orders carry 3% fee stored and displayed across all views; shipping gate prevents proceeding without rate selection; print and disclaimer UI improvements live
- 🧪 Tests: npm run build passes, 80 pages compiled
- 📁 Files: 12 files changed, 146 insertions / 24 deletions
- 🔁 Next prompts: Run Railway SQL migration; verify QB sync in staging; test convenience fee end-to-end with card checkout
- 🧠 Reflection: convenience_fee added to OrderOut base schema so customer-facing order detail endpoint returns it without extra work

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): build PASS
- Prompt variant (if applicable): null
- Next experiment: null
