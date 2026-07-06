---
id: "054"
title: Fix Order Status Change Emails
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix order status change emails in admin panel — not sending on shipped/cancelled
labels: ["bug-fix","email","celery","contacts","admin-orders"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - backend/app/tasks/email_tasks.py
tests:
  - docker compose restart backend celery_worker (both started cleanly)
  - Application startup complete
  - celery@... ready
---

## Prompt

Fix order status change emails in AF Apparels admin panel. When admin changes order status, emails are not being sent.

## Root causes found

1. **`update_admin_order` PATCH never triggered `send_order_cancelled_email`** — cancelled status was only handled by the separate POST /cancel endpoint, not the generic PATCH.

2. **`order.created_by_id` AttributeError** — `send_order_confirmation_email` and `send_order_shipped_email` both referenced `order.created_by_id` which doesn't exist on the Order model (field is `placed_by_id`). Tasks failed with AttributeError on every attempt, exhausted retries silently.

3. **Template dependency failure** — existing tasks called `svc.send("order_shipped", ...)` which requires a matching EmailTemplate row in the DB. If the template doesn't exist, `NotFoundError` is raised inside the task → retry → fail permanently.

4. **Single-user vs contacts fan-out** — emails went only to the placing user, not to all company contacts who opted into notifications.

## Changes

### backend/app/api/v1/admin/orders.py — update_admin_order

Added `cancelled` trigger alongside `shipped` and `confirmed`:
```python
elif payload.status == "cancelled":
    from app.tasks.email_tasks import send_order_cancelled_email
    send_order_cancelled_email.delay(str(order_id))
```
Also fixed: now passes `order.tracking_number` (post-commit value) instead of `payload.tracking_number` for shipped email.

### backend/app/tasks/email_tasks.py — all 4 order email tasks

Rewrote `send_order_confirmation_email`, `send_order_shipped_email`, `send_order_cancelled_email`, `send_invoice_email`:

- **Removed `order.created_by_id`** (field doesn't exist) — all tasks now query contacts instead.
- **Switched to contact fan-out** — each task queries `Contact` rows for the order's company filtered by notification preference:
  - `send_order_confirmation_email` → `notify_order_confirmation=True`
  - `send_order_shipped_email` → `notify_order_shipped=True`
  - `send_order_cancelled_email` → `notify_order_confirmation=True`
  - `send_invoice_email` → `notify_invoices=True`
- **Switched from template system to `send_raw`** with inline HTML — eliminates EmailTemplate DB dependency; emails work even without template rows seeded.
- All tasks return `{"status": "sent", "sent": N}` or `{"status": "skipped", "reason": "no_notify_contacts"}`.

## Outcome
- ✅ Backend and Celery restarted cleanly
- ✅ PATCH /admin/orders/{id} now triggers cancelled email when status → cancelled
- ✅ `order.created_by_id` AttributeError eliminated — all tasks use contact queries
- ✅ Template dependency removed — inline HTML emails via `send_raw`
- ✅ All 4 order notification tasks fan out to relevant contacts
- 📁 Files: admin/orders.py, email_tasks.py
