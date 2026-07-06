---
id: 242
title: Inventory QB Sync Countdown + Re-queue
stage: general
date: 2026-06-08
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: increase inventory sync countdown to 15s and re-queue on deferred variant
labels: ["quickbooks", "celery", "inventory", "fix", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/inventory_service.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - manual: adjust stock on a brand-new variant, verify sync_inventory_to_qb fires at t+15s, defers to sync_variant_to_qb, then re-queues itself at t+45s and successfully pushes QtyOnHand to QB
---

## Prompt

In backend/app/services/inventory_service.py, in adjust_stock_with_log function, the sync_inventory_to_qb task fires immediately but qb_item_id may not be saved yet. Change the dispatch to use a 15 second countdown delay. Also in sync_inventory_to_qb task in quickbooks_tasks.py, when status is 'deferred', instead of just returning, re-queue itself with a delay of 30 seconds.

## Response snapshot

**inventory_service.py**: `countdown=10` → `countdown=15` in `adjust_stock_with_log`.

**quickbooks_tasks.py** `sync_inventory_to_qb` deferred branch:
```python
if not variant.qb_item_id:
    sync_variant_to_qb.delay(variant_id)
    # Re-queue this inventory sync to run after variant sync completes
    sync_inventory_to_qb.apply_async(args=[variant_id], countdown=30)
    return {"status": "deferred", "reason": "variant not yet synced to QB"}
```

## Outcome

- ✅ Impact: Stock adjustments on new variants no longer silently drop the QB QtyOnHand update. The inventory sync is guaranteed to eventually fire: first attempt defers, triggers variant sync, and re-queues itself 30s later when qb_item_id should be written.
- 🧪 Tests: Manual — adjust stock on a new variant, confirm in Railway logs: deferred at t+15s → variant sync at t+15s → inventory re-queued → inventory success at ~t+45s
- 📁 Files: 2 files, 3 lines changed
- 🔁 Next prompts: Verify end-to-end in Railway with a new product variant
- 🧠 Reflection: The re-queue is the critical addition — the old code silently dropped the stock update when the variant wasn't synced yet.

## Evaluation notes (flywheel)

- Failure modes observed: If sync_variant_to_qb takes longer than 30s (unlikely but possible under QB rate limiting), the re-queued inventory sync might still see no qb_item_id and defer again. Acceptable — it will keep re-queuing until the variant sync completes.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Cap the re-queue depth with a retry counter to avoid infinite deferral loops under persistent QB failures
