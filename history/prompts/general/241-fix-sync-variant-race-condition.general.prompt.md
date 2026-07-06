---
id: 241
title: Fix sync_variant_to_qb Race Condition
stage: general
date: 2026-06-08
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: rewrite sync_variant_to_qb with single locked session to fix race condition
labels: ["quickbooks", "celery", "race-condition", "fix", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - manual: trigger two concurrent sync_variant_to_qb tasks for the same variant_id and verify only one QB item is created and qb_item_id is written exactly once
  - manual: verify Railway logs show "already synced, skipping" for the second worker after the first commits
---

## Prompt

In backend/app/tasks/quickbooks_tasks.py, the qb_item_id is still not being saved to DB even though logs show 'qb_item_id saved to DB'. The issue is that two workers run simultaneously - one saves qb_item_id=11, other saves qb_item_id=12. Then the first worker's value gets overwritten. Also the SELECT FOR UPDATE fix needs to be implemented properly. Please rewrite the sync_variant_to_qb task with this approach:
1. At the START of the task, open a DB session with SELECT FOR UPDATE on the variant row.
2. If variant.qb_item_id already exists (set by concurrent worker), skip QB creation and return immediately.
3. If not, proceed to create/find QB item.
4. Save qb_item_id back to DB in the SAME locked session (not a separate session).
5. Commit and release the lock.
This ensures only one worker creates the QB item and saves the ID atomically.

## Response snapshot

Collapsed the three-session pattern into a single `async with AsyncSessionLocal() as session:` block:

1. `SELECT ... FOR UPDATE` — acquires row-level PG lock; concurrent worker blocks here
2. If `variant.qb_item_id` already set → log "already synced, skipping" and return early
3. Snapshot data (`sku`, `item_name`, `unit_price`, `cost`, `total_stock`) while session is open
4. `asyncio.to_thread(svc.find_or_create_item, ...)` — QB API call while session (and lock) stays open
5. `variant.qb_item_id = qb_item_id` — ORM dirty-tracking picks this up (object is in identity map)
6. `await session.commit()` — atomically saves the new `qb_item_id` AND releases the lock

When the second worker unblocks after step 6, it re-reads the row and hits step 2 (early return). No duplicate QB items.

Removed the old three sessions: lock-check session (released too early), snapshot session, and raw-SQL save session.

## Outcome

- ✅ Impact: Eliminates the race condition where two Celery workers both see no qb_item_id, both call find_or_create_item, and create duplicate QB inventory items. The DB row lock is now held through the entire check→create→save cycle.
- 🧪 Tests: Manual — dispatch two tasks for the same variant_id simultaneously; verify exactly one QB item created, second worker logs "already synced, skipping"
- 📁 Files: backend/app/tasks/quickbooks_tasks.py (1 file, net -8 lines — simpler than before)
- 🔁 Next prompts: Test in Railway with a real variant creation; verify QB item appears in QB Items list with correct stock
- 🧠 Reflection: The root issue was releasing the PG lock between the check and the save. SQLAlchemy's `with_for_update()` only holds the lock until the session commits or closes — so closing the session after the check (as the old code did) silently released the lock, making the whole FOR UPDATE pointless.

## Evaluation notes (flywheel)

- Failure modes observed: QB API call duration holds the PG row lock for its duration (~1-5s). Acceptable for this use case since the row lock is per-variant and QB calls are fast.
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Add a bulk-backfill endpoint (POST /admin/qb/sync-all-variants) to sync variants that existed before this feature was added
