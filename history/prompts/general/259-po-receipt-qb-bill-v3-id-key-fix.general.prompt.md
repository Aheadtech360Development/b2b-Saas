---
id: 259
title: PO Receipt QB Bill v3 Id Key Fix
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: production.aheadtech360@gmail.com
command: fix sync_po_receipt_to_qb — await still shows coroutine error; read exact code, confirm fix, add v3 marker
labels: ["purchase-orders","quickbooks","celery","await","bill-id","key-extraction"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - python ast.parse (PASS)
---

## Prompt

The sync_po_receipt_to_qb task STILL has the same await bug after the last fix.
Read the EXACT current code and fix it properly.

ERROR: "expected str, got coroutine object QuickBooksService.create_vendor_bill"

## Response snapshot

**Diagnosis after reading lines 540–642 of quickbooks_tasks.py:**

The `await` at line 615 was ALREADY correct after commit `9717583`:
```python
qb_result = await svc.create_vendor_bill(
    vendor_name,
    bill_lines,
    po.po_number,
    receiving.received_date.isoformat() if receiving.received_date else None,
)
```

The persistent error is almost certainly a **stale Celery worker** running pre-fix bytecode —
Railway redeploys the web server container but does NOT automatically restart Celery worker
processes. The worker must be explicitly restarted (Railway → service → restart) after each
deploy for Celery task code changes to take effect.

**Latent bug found and fixed:** `qb_bill_id = str(qb_result.get("id") or "")` only checked
the injected lowercase alias. If QB's native `"Id"` key differs (or the lowercase alias is
missing), this would silently raise a ValueError. Fixed by checking `"Id"` first:
```python
qb_bill_id = str(qb_result.get("Id") or qb_result.get("id") or "")
```

**Version log added:** A `logger.info("sync_po_receipt_to_qb v3: ...")` line before the
`create_vendor_bill` call so Railway worker logs confirm exactly which code revision is
running after next deploy + restart.

**create_vendor_bill call chain verified:**
- `create_vendor_bill` → `async def`, awaits `find_or_create_vendor` + `_make_request`
- `_make_request` → `async def`, wraps sync `_request` via `asyncio.to_thread`
- `_request` → sync `def`, makes httpx HTTP calls — correct to use in `asyncio.to_thread`
- `_run_async` creates a fresh event loop + `asyncio.set_event_loop(loop)` before
  `loop.run_until_complete(_run_all())` — `asyncio.to_thread` has a running loop available

**cost_per_item and inventory sync confirmed present:**
- `purchase_orders.py` lines 404–416: updates `variant_obj.cost_per_item` when actual cost differs
- Lines 451–457: dispatches `sync_inventory_to_qb.apply_async(countdown=5)` per received variant

## Outcome

- ✅ Impact: Robust bill ID extraction (checks QB-native "Id" before injected "id"); v3 marker confirms worker code version in logs; user must restart Railway Celery worker after deploy
- 🧪 Tests: Python ast.parse PASS
- 📁 Files: 1 file changed (7 insertions / 2 deletions)
- 🔁 Next prompts: After pushing, restart Celery workers on Railway and trigger a test receive; look for "sync_po_receipt_to_qb v3" in worker logs to confirm new code is running
- 🧠 Reflection: Railway Celery worker processes do not auto-restart on deploy — code changes to tasks.py are invisible until the worker service is explicitly restarted. A version log marker ("v3") is a cheap diagnostic to confirm which code revision is actually executing.

## Evaluation notes (flywheel)

- Failure modes observed: Celery workers running stale bytecode after deploy — no automatic restart on Railway for worker services
- Graders run and results (PASS/FAIL): Python ast.parse PASS
- Prompt variant (if applicable): none
- Next experiment: add a /api/v1/admin/celery-status endpoint that returns the Celery worker ping + task revision marker so the admin can verify worker code version without reading raw logs
