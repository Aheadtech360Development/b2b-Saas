---
id: 116
title: Automated Email Notifications Platform-Wide
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["email","notifications","order-status","rma","csv-export","guest","wholesale"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/account.py
tests:
  - none
---

## Prompt

Add automated email notifications throughout the platform. Rules:
- When admin makes changes: send email to the affected customer only (not to admin)
- When customer makes changes in their dashboard: send email to that customer only (not to admin)

Trigger emails for these events:
1. Order status changes (every status change) — email to customer with new status
2. Order shipped — email to customer with tracking info if available
3. Wholesale application approved/rejected — email to applicant [already implemented]
4. Password reset — email to user [already implemented]
5. New order placed (wholesale) — email to customer confirming order [already implemented]
6. New guest order placed — email to guest_email [already implemented]
7. CSV/data export completed — email to the admin who triggered it
8. Shipping label created — email to customer [covered by shipped status email]
9. Refund/RMA created or status changed — email to customer

## Response snapshot

**Already implemented (no changes):** wholesale approved/rejected, password reset/change, wholesale order confirmation, guest order confirmation, RMA Celery task (existed but unwired).

**Changes made:**

**`backend/app/api/v1/admin/orders.py`** — 5 changes:
- Added `Request` to fastapi imports
- Added `_af_email(content_html)` module-level helper that wraps HTML in the AF Apparels branded email shell (dark header, white body, footer)
- Replaced `_send_order_status_email` entirely: now covers ALL statuses (pending, confirmed, processing, shipped, delivered, cancelled, refunded) with branded HTML; branches on `order.is_guest_order` — guest orders use `order.guest_email`, wholesale orders use the active company user's email; "shipped" for wholesale still tries the `order_shipped` template first with raw fallback; removes admin self-notification (was violating the rules)
- `export_orders_csv`: added `request: Request` param; after generating the CSV, looks up the triggering admin by `request.state.user_id` and sends them a completion email with row count and applied filters
- `update_rma`: added `send_rma_status_email.delay(str(rma_id))` call after `db.commit()` so customer is notified on every admin RMA status update

**`backend/app/api/v1/account.py`** — 1 change:
- `create_rma`: after `db.commit()`, sends a branded confirmation email to the submitting user with RMA number, reason, and a link to `/account/rma`

## Outcome

- ✅ Impact: Customers now receive emails on every order status change (all 7 statuses), for guest and wholesale orders alike; customers get RMA confirmation on submission and status updates; admins get CSV export completion notification
- 🧪 Tests: None automated; manual verification needed for each trigger
- 📁 Files: 2 files modified
- 🔁 Next prompts: Add order_confirmation, order_delivered, order_refunded email templates in admin email templates UI; test guest shipped email with tracking number
- 🧠 Reflection: The `send_rma_status_email` Celery task was already written but never called from the admin update endpoint — it just needed to be wired up. The `_af_email` helper avoids duplicating the branded wrapper across all email bodies.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: Add email preview to admin email templates UI showing sample for each trigger event
