---
id: "056"
title: Fix Celery Email Queue Routing
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Debug why email tasks are not being queued in AF Apparels. Check checkout.py and admin/orders.py for .delay() calls, verify Celery broker connection, check worker logs, report what is missing and fix it.
labels: ["bug-fix","celery","email","queue","docker-compose","devops"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - docker-compose.yml
tests:
  - docker compose restart celery_worker (worker now consuming all queues)
  - Redis LLEN checks: email=34, default=4134, celery=0 (tasks queued, not consumed pre-fix)
---

## Prompt

Debug why email tasks are not being queued in AF Apparels. Check checkout.py and admin/orders.py for `.delay()` calls, verify Celery broker connection, check worker logs, report what is missing and fix it.

## Response snapshot

**Diagnosis steps:**
1. Confirmed `send_order_confirmation_email.delay()` IS called in `order_service.py` after checkout
2. Confirmed all `.delay()` calls present in `admin/orders.py` (shipped, confirmed, cancelled)
3. Broker test: `celery_app.send_task(...)` returned task ID — broker connected ✅
4. Checked Redis queue depths: `email` = 34 items, `default` = 4134 items, `celery` = 0
5. Read `celeryconfig.py`: `task_routes` routes `email_tasks.*` → `email` queue
6. Found root cause: `docker-compose.yml` worker command had no `-Q` flag

**Root cause:** Worker command `celery -A app.core.celery worker --loglevel=info --concurrency=4` defaults to only the `celery` queue. All email tasks are routed to the `email` queue by `celeryconfig.py`, so 34+ email tasks were stuck in Redis, never consumed.

**Fix — `docker-compose.yml` celery_worker command:**
```yaml
command: celery -A app.core.celery worker --loglevel=info --concurrency=4 -Q celery,email,quickbooks,pricelist,inventory,default
```

Worker restarted and confirmed ready on all queues.

## Outcome

- ✅ Impact: All email tasks (order confirmation, shipped, invoice, cancelled) now execute. 34 backlogged email tasks and 4134 default queue tasks will be consumed.
- 🧪 Tests: docker compose restart celery_worker; worker logs confirm all 6 queues declared
- 📁 Files: 1 file modified (docker-compose.yml, 1-line change)
- 🔁 Next prompts: Monitor email delivery via Resend dashboard; consider Flower or celery events for queue visibility
- 🧠 Reflection: The `-Q` queue flag is easy to forget when adding named queues via `task_routes`. The mismatch was invisible — broker accepted tasks, worker appeared healthy, but the email queue was silently accumulating. Redis `LLEN` was the key diagnostic.

## Evaluation notes (flywheel)

- Failure modes observed: Worker running but silently ignoring routed tasks; no error surfaced in logs
- Graders run and results (PASS/FAIL): manual Redis LLEN check — PASS (queues draining after fix)
- Prompt variant (if applicable): null
- Next experiment: Add health-check or monitoring alert when queue depth > threshold
