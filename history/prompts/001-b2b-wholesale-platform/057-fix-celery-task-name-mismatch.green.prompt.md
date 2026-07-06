---
id: "057"
title: Fix Celery Task Name Mismatch
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix Celery task name mismatch in AF Apparels. Worker registers tasks with short names like 'cart.detect_abandoned' but tasks are queued / referenced in beat_schedule as 'app.tasks.cart_tasks.detect_abandoned_carts'.
labels: ["bug-fix","celery","task-routing","beat","queue","devops"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/cart_tasks.py
  - backend/app/tasks/pricelist_tasks.py
  - backend/app/tasks/inventory_tasks.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - docker compose restart celery_worker celery_beat backend
  - docker logs afapparel_celery --tail 30 (should show full-path task names, no KeyError)
---

## Prompt

Fix Celery task name mismatch in AF Apparels.

Problem: Worker has tasks registered as short names like 'cart.detect_abandoned'
but tasks are being queued as 'app.tasks.cart_tasks.detect_abandoned_carts'

Fix backend/app/core/celery.py, backend/celeryconfig.py, and all .delay() calls.
Verify all task modules use correct autodiscovered names.

## Response snapshot

**Root cause analysis:**

Four task files used custom `name=` overrides on the `@celery_app.task` decorator. This caused tasks to be registered under short/custom names instead of the full module path. `celeryconfig.py` routing uses wildcard patterns like `"app.tasks.cart_tasks.*"` that only match full-path names — so tasks with custom names were silently routed to the wrong queue (default instead of their dedicated queue).

More critically, `celeryconfig.py` beat_schedule referenced `"app.tasks.cart_tasks.detect_abandoned_carts"` but the task was registered as `"cart.detect_abandoned"` — this caused a KeyError every time Celery Beat tried to dispatch the periodic task.

**All callers use direct import + `.delay()`** — so removing custom names doesn't affect any call sites. The task object reference is authoritative.

**Fixes applied (removed `name=` from 5 decorators across 4 files):**

| File | Removed custom name | Now registered as |
|------|---------------------|-------------------|
| `cart_tasks.py` | `"cart.detect_abandoned"` | `app.tasks.cart_tasks.detect_abandoned_carts` |
| `pricelist_tasks.py` | `"pricelist.generate"` | `app.tasks.pricelist_tasks.generate_price_list_task` |
| `inventory_tasks.py` | `"inventory.generate_bulk_asset_zip"` | `app.tasks.inventory_tasks.generate_bulk_asset_zip` |
| `quickbooks_tasks.py` | `"quickbooks.sync_customer"` | `app.tasks.quickbooks_tasks.sync_customer_to_qb` |
| `quickbooks_tasks.py` | `"quickbooks.sync_order_invoice"` | `app.tasks.quickbooks_tasks.sync_order_invoice_to_qb` |

**No changes needed to:**
- `celery.py` — `include=` list already correct
- `celeryconfig.py` — routing patterns already correct, beat_schedule already correct
- Any `.delay()` call sites — all use direct imports

## Outcome

- ✅ Impact: Beat scheduler can dispatch `detect-abandoned-carts` (no more KeyError). All tasks route to correct dedicated queues (pricelist, inventory, quickbooks) instead of default.
- 🧪 Tests: docker compose restart; worker logs should list full-path task names and show tasks executing
- 📁 Files: 4 files modified, 5 decorator lines changed
- 🔁 Next prompts: Monitor beat logs to confirm detect_abandoned_carts and check_low_stock_levels fire on schedule
- 🧠 Reflection: Custom `name=` on Celery tasks only makes sense when callers use `send_task('name', ...)` strings. When all callers use direct-import `.delay()`, custom names only break routing and beat_schedule without any benefit.

## Evaluation notes (flywheel)

- Failure modes observed: beat_schedule KeyError (silent dispatch failure); tasks silently going to default queue instead of dedicated queue
- Graders run and results (PASS/FAIL): grep for remaining name= overrides → 0 found (PASS)
- Prompt variant (if applicable): null
- Next experiment: Add worker startup check that verifies all beat_schedule task names are present in registered tasks
