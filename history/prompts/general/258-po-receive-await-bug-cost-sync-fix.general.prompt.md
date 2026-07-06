---
id: 258
title: PO Receive Await Bug Cost Sync Fix
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix sync_po_receipt_to_qb await bug, add cost_per_item update on receive, dispatch QB inventory sync per variant
labels: ["purchase-orders","quickbooks","celery","await-bug","cost-per-item","inventory-sync"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/api/v1/admin/purchase_orders.py
tests:
  - python ast.parse (PASS — both files)
  - npm run build (PASS — 80 static pages, 0 TypeScript errors)
---

## Prompt

Fix the sync_po_receipt_to_qb task. There is a Python await bug causing the entire receive sync to fail.

ERROR: qb_bill_id = <coroutine object QuickBooksService.create_vendor_bill> (expected str, got coroutine)

Also fix: cost_price not updating on receive; QB item cost+qty not syncing.

## Response snapshot

**Root cause confirmed:**

Grepping `quickbooks_service.py` for `async def` / `def` shows a split:
- `create_customer`, `create_invoice`, `find_or_create_item`, `update_item` → plain `def` (sync) → correctly called via `asyncio.to_thread` in existing tasks
- `find_or_create_vendor`, `create_purchase_order`, `create_vendor_bill` → `async def` → must be `await`ed directly

The `sync_po_receipt_to_qb` task (added in PHR #256) called `create_vendor_bill` with `asyncio.to_thread` — which runs the coroutine function in a thread without awaiting it. The thread returns a coroutine object, `asyncio.to_thread` resolves to that object, and `qb_bill_id` ends up being `<coroutine object>` not a string.

**Cost field:** `ProductVariant.cost_per_item` (Numeric 10,2, nullable) — confirmed by grep of product.py.

**Fix 1 (quickbooks_tasks.py — sync_po_receipt_to_qb):**
```python
# BEFORE (wrong):
qb_bill_id = await asyncio.to_thread(svc.create_vendor_bill, vendor_name, bill_lines, ...)

# AFTER (correct):
qb_result = await svc.create_vendor_bill(vendor_name, bill_lines, ...)
qb_bill_id = str(qb_result.get("id") or "")
if not qb_bill_id:
    raise ValueError(f"QB create_vendor_bill returned no id: {qb_result}")
```

`create_vendor_bill` returns `{"id": qb_bill.get("Id"), **qb_bill}` — so `.get("id")` is the correct key.

**Fix 2 (purchase_orders.py — receive_items):**

Added `variants_received: list[UUID] = []` tracking. Inside the inventory update block, after updating InventoryRecord.quantity, added:

```python
if item_data.unit_cost_actual > 0:
    variant_obj = (await db.execute(select(ProductVariant)...)).scalar_one_or_none()
    if variant_obj:
        old_cost = float(variant_obj.cost_per_item or 0)
        if abs(item_data.unit_cost_actual - old_cost) > 0.001:
            variant_obj.cost_per_item = item_data.unit_cost_actual
            logger.info("cost_per_item updated: %s $%.2f → $%.2f", ...)
if line_item.product_variant_id not in variants_received:
    variants_received.append(line_item.product_variant_id)
```

**Fix 3 (purchase_orders.py — post-commit QB sync):**

After the existing `sync_po_receipt_to_qb.delay()` dispatch, added:

```python
if variants_received:
    from app.tasks.quickbooks_tasks import sync_inventory_to_qb
    for vid in variants_received:
        sync_inventory_to_qb.apply_async(args=[str(vid)], countdown=5)
```

The 5-second countdown ensures the `cost_per_item` DB write is committed before the Celery task reads it. `sync_inventory_to_qb` already reads both `cost_per_item` and total stock and calls `asyncio.to_thread(svc.update_item, ...)` which is correct since `update_item` is sync.

## Outcome

- ✅ Impact: QB Vendor Bill is now correctly created on receive (await bug fixed); variant.cost_per_item updated when actual receive cost differs from expected; QB item stock+cost synced automatically per variant on receive via existing sync_inventory_to_qb task
- 🧪 Tests: Python ast.parse PASS, npm run build PASS (80 static pages)
- 📁 Files: 2 files changed (34 insertions / 2 deletions)
- 🔁 Next prompts: Deploy and trigger a test receive to confirm QB bill ID is saved to POReceiving + PurchaseOrder; verify QB item QtyOnHand and PurchaseCost update
- 🧠 Reflection: asyncio.to_thread is ONLY for sync functions — calling an async def with it returns the coroutine unawaited. The quickbooks_service.py has a mixed sync/async API: older methods (create_customer, create_invoice, find_or_create_item, update_item) are sync; newer methods (find_or_create_vendor, create_purchase_order, create_vendor_bill) are async. Future callers must check the method signature before choosing await vs asyncio.to_thread.

## Evaluation notes (flywheel)

- Failure modes observed: asyncio.to_thread on an async def silently returns a coroutine object instead of raising — the bug saved a str(coroutine) to the DB without erroring, making it hard to detect without reading logs
- Graders run and results (PASS/FAIL): Python syntax PASS, TypeScript build PASS
- Prompt variant (if applicable): none
- Next experiment: add a test fixture that confirms sync_po_receipt_to_qb writes a valid non-empty string to po.qb_bill_id
