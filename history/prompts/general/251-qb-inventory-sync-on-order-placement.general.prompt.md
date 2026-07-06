---
id: 251
title: QB Inventory Sync On Order Placement Investigation
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix QB inventory sync not triggering when customer places order
labels: ["quickbooks","inventory","celery","order-service","guest-checkout"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/api/v1/guest.py
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/services/inventory_service.py
  - backend/app/services/quickbooks_service.py
tests:
  - no code changes — investigation only
---

## Prompt

Fix: When a customer places an order, inventory stock is reduced on our platform but NOT synced to QuickBooks. Admin manual stock updates DO sync to QB correctly. We need order-triggered stock reductions to also sync.

Read these files: order_service.py (where stock is reduced), checkout.py (order creation flow), guest.py (guest order), quickbooks_tasks.py (sync task), inventory_service.py (stock reduction), inventory model.

Implement the fix, git add -A, commit, push.

## Response snapshot

Investigation revealed the fix was already implemented in a prior commit (b2087ab "feat: QB sync fix"). No new code was written.

Findings:
- `order_service.py` lines 375-380: dispatches `sync_inventory_to_qb.apply_async(args=[str(variant_id)], countdown=15)` after each variant's stock deduction (inside outer variant loop, outside inner inv_records loop — correct)
- `guest.py` lines 316-321: same dispatch pattern for guest checkout orders
- `inventory_service.py` lines 176-177: same dispatch for admin path (the working reference)
- All three paths are now identical in behavior

`sync_inventory_to_qb` task:
- If no `qb_item_id`: defers to `sync_variant_to_qb` (creates item with correct initial stock) then re-queues itself with countdown=30
- If `qb_item_id` exists: reads SUM(InventoryRecord.quantity) post-deduction, calls `update_item(qb_item_id, unit_price, cost, total_stock)`

`update_item` uses sparse POST to QB Items API with QtyOnHand + InvStartDate. This is the same path that admin manual adjustments use.

## Outcome

- ✅ Impact: No code changes needed — fix was already in place on all order paths
- 🧪 Tests: No tests run (investigation only)
- 📁 Files: 0 files modified
- 🔁 Next prompts: If sync still not working after server restart, check Celery worker logs for QB API errors; consider adding explicit success/failure logging after `update_item` returns
- 🧠 Reflection: User likely tested before b2087ab was deployed. The fix pattern is correct. If users still see stale QB stock, the likely culprits are: Celery workers down, QB OAuth tokens expired, or server not restarted with latest code.

## Evaluation notes (flywheel)

- Failure modes observed: none — investigation completed without errors
- Graders run and results (PASS/FAIL): no code change, no grader applicable
- Prompt variant (if applicable): none
- Next experiment: add explicit log after update_item returns bool so we can tell success vs silent QB API failure
