---
id: "074"
title: Fix Email System — Templates and Celery
stage: green
date: 2026-04-10
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: Fix email system for AF Apparels. Emails not working - templates not in DB, Celery not sending.
labels: ["email","celery","migration","resend","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/g7f6e5d4c3b2_seed_email_templates.py
  - backend/app/tasks/email_tasks.py
tests:
  - none added
---

## Prompt

Fix email system for AF Apparels. Emails not working - templates not in DB, Celery not sending.
Read: backend/migrations/versions/ - find email templates seed migration. Find the enum issue and fix it.

## Response snapshot

Identified two root causes for emails not working:

1. **Enum cast bug in seed migration** (`g7f6e5d4c3b2_seed_email_templates.py`): The `INSERT ... SELECT FROM (VALUES ...)` SQL inserted text literals into a PostgreSQL enum column (`email_trigger_event`) without `::email_trigger_event` casts. This caused the entire INSERT statement to abort, leaving `email_templates` table empty. Fixed by adding `::email_trigger_event` cast in the SELECT projection and the WHERE NOT EXISTS comparison.

2. **Invalid enum value**: The migration used `wholesale_application_received` which is not in the `email_trigger_event` PostgreSQL enum. Valid values are `wholesale_approved` and `wholesale_rejected`. Replaced accordingly.

3. **Missing required templates**: Tasks using `svc.send(trigger_event, ...)` need DB templates. Added all 10 required templates: `order_confirmation`, `password_reset`, `wholesale_approved`, `wholesale_rejected`, `email_verification`, `user_invitation`, `rma_approved`, `rma_rejected`, `payment_failed`, `welcome`.

4. **`asyncio.get_event_loop()` in Celery tasks** (`email_tasks.py`): On Python 3.10+, calling `get_event_loop()` from a Celery worker thread raises `RuntimeError`. Fixed `_run()` helper to use `asyncio.run(coro)` instead.

No SMTP changes — the existing Resend SDK implementation is correct and was left intact.

**Task wiring already correct** (no changes needed):
- `wholesale_service.py` → `send_wholesale_approved/rejected_email.delay()`
- `admin/orders.py` → `send_order_shipped/invoice/cancelled_email.delay()`, `send_rma_status_email.delay()`
- `webhooks.py` → `send_order_confirmation_email.delay()`
- `auth_service.py` → `email_svc.send("password_reset", ...)` (direct, no Celery)

**Railway env vars required for emails to send:**
- `RESEND_API_KEY` — email delivery will silently skip if not set
- `CELERY_BROKER_URL` → Railway Redis URL
- `CELERY_RESULT_BACKEND` → Railway Redis URL
- `FRONTEND_URL` → production URL (used in reset/order links)

## Outcome

- ✅ Impact: Email templates will be seeded on next `alembic upgrade head`; Celery email tasks will no longer throw RuntimeError on Python 3.10+
- 🧪 Tests: none added
- 📁 Files: 2 files modified
- 🔁 Next prompts: Set RESEND_API_KEY on Railway; verify Celery worker is running and connected to Redis
- 🧠 Reflection: The enum cast issue is a PostgreSQL-specific footgun — text literals in VALUES sub-selects are typed as `text`, not inferred from the target column, requiring explicit `::typename` casts.

## Evaluation notes (flywheel)

- Failure modes observed: Missing enum cast in INSERT...VALUES; deprecated asyncio API in Celery threads
- Graders run and results (PASS/FAIL): manual review
- Prompt variant (if applicable): null
- Next experiment: add explicit cast validation in migration CI
