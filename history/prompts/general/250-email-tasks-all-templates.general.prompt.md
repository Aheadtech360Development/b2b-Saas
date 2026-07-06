---
id: 250
title: All Email Tasks Use HTML Templates
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix all remaining email tasks to use HTML templates
labels: ["email","templates","celery","tasks"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/email_tasks.py
tests:
  - python AST parse (pass)
---

## Prompt

Email templates are created but most email_tasks.py functions are NOT using them yet. Only 3 were updated.
Fix all remaining tasks to use the new HTML templates. Update wholesale_approved, wholesale_rejected,
send_invoice_email. Add new tasks: send_order_confirmed_email, send_order_processing_email,
send_order_ready_email, send_ready_for_pickup_email, send_order_delivered_email,
send_wholesale_application_received_email.

## Response snapshot

- Discovered WholesaleApplication model still exists with fields email/first_name (not contact_email/contact_name) — fixed field name bugs in wholesale tasks
- Updated send_wholesale_approved_email → wholesale_approved.html (fixed app.email, app.first_name, added login_url)
- Updated send_wholesale_rejected_email → wholesale_rejected.html (same field fixes)
- Updated send_invoice_email → purchase_order.html; added selectinload(Order.items) + _fmt_items() helper
- Added 5 new order-status tasks: send_order_confirmed_email, send_order_processing_email, send_order_ready_email, send_ready_for_pickup_email, send_order_delivered_email
- Added send_wholesale_application_received_email (new, direct args: to_email/contact_name/company_name)
- Kept 5 tasks on DB template lookup (no HTML templates for them): password_reset, email_verification, user_invitation, rma_status, payment_failed
- All template variable names verified via grep — all match exactly

## Outcome

- ✅ Impact: 6 existing tasks migrated, 6 new tasks added; all 12 HTML templates now wired
- 🧪 Tests: AST syntax check pass
- 📁 Files: email_tasks.py (425 insertions, 148 deletions)
- 🔁 Next prompts: wire new tasks to order status update triggers in order_service.py
- 🧠 Reflection: WholesaleApplication model was NOT removed (PHR #170 only removed activation flow); kept existing signature for wholesale tasks to avoid breaking wholesale_service.py caller

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): AST PASS
- Prompt variant (if applicable): none
- Next experiment: trigger new status tasks from order status update endpoints
