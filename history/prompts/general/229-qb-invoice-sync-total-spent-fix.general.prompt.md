---
id: 229
title: QB Invoice Sync + Total Spent Fix
stage: general
date: 2026-06-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: direct
labels: ["quickbooks","checkout","total-spent","company-service","fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/checkout.py
  - backend/app/services/company_service.py
  - backend/app/api/v1/admin/customers.py
tests:
  - manual: place net_30 order and verify QB invoice created in QBO
  - manual: check admin customers list total_spent includes net_30 and ACH orders
---

## Prompt

Two fixes needed:

FIX 1: In backend/app/api/v1/orders.py or checkout.py, find where order is created/confirmed. After order is successfully created, add QB invoice sync:

from app.tasks.quickbooks_tasks import sync_order_invoice_to_qb
sync_order_invoice_to_qb.delay(str(order.id))

Check if this line already exists - if not, add it after order creation.

FIX 2: In backend/app/api/v1/admin/customers.py or company_service.py, find where total_spent or amount_spent is calculated for a company. It should sum all completed/confirmed orders for that company. Show me the current calculation and fix if wrong.

Push to Railway when done.

## Response snapshot

**FIX 1 — QB invoice sync (checkout.py):**
- `sync_order_invoice_to_qb.delay()` was NOT called anywhere in the wholesale checkout path
- Added after the email block in `_confirm_checkout_inner`, wrapped in try/except so a Celery failure never breaks order confirmation
- Task already existed in `quickbooks_tasks.py` — just wasn't wired to the checkout flow

**FIX 2 — total_spent calculation (4 places fixed):**

Root cause: all three service calculations filtered `payment_status == "paid"`, which excludes net_30 orders (`payment_status = "pending"`) and ACH orders (also `"pending"` since QB doesn't return CAPTURED for ACH).

Fixes — all changed to `Order.status.not_in(["cancelled", "refunded"])`:
1. `company_service.py` `list_companies_paginated` — `total_spend_sub` wholesale subquery
2. `company_service.py` `list_companies_paginated` — retail users total subquery
3. `company_service.py` `get_order_stats` method
4. `admin/customers.py` `get_customer_stats` endpoint — previously had NO filter at all (counted cancelled/refunded orders too)

Commit: `aee1723` pushed to main → Railway deploys automatically.

## Outcome

- ✅ Impact: QB invoices now auto-created on every wholesale order; total_spent now counts all active orders regardless of payment method
- 🧪 Tests: Manual verification needed — place net_30 order, check QB, check admin customers total
- 📁 Files: 3 files, 11 insertions / 4 deletions
- 🔁 Next prompts: Verify QB invoice appears in QBO after a test checkout
- 🧠 Reflection: The payment_status=="paid" filter was a silent gap that undercounted every non-card order placed since ACH/net_30 were added
