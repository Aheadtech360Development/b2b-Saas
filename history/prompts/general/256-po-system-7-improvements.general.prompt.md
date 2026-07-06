---
id: 256
title: PO System Seven Improvements
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: Update Purchase Order system with 7 improvements — required mfr fields, inline form, apply qty, duplicate variant, both product types in review, auto QB sync on receive
labels: ["purchase-orders","quickbooks","manufacturers","celery","new-product","inventory","auto-sync"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/purchase-orders/manufacturers/page.tsx
  - frontend/src/app/(admin)/admin/purchase-orders/create/page.tsx
  - frontend/src/app/(admin)/admin/purchase-orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/purchase-orders/[id]/receive/page.tsx
  - backend/app/api/v1/admin/purchase_orders.py
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - npm run build (PASS — 80 static pages, 0 TypeScript errors)
---

## Prompt

Update the Purchase Order system with multiple improvements:

CHANGE 1 — Add Manufacturer: all fields required except Notes (Name, Contact Name, Email, Phone, Address).
CHANGE 2 — Manufacturer dropdown: inline Add option with all fields (full form, not just name).
CHANGE 3 — Apply to All: add Quantity alongside Cost in line items.
CHANGE 4 — New Product: duplicate variant button + Apply Qty to All.
CHANGE 5 — Step 3 Review: show ALL products (existing + new) when both block types are used.
CHANGE 6 — Remove manual "Sync to QB" button; QB sync triggers automatically on receive.
CHANGE 7 — Receive & Update Inventory: full cascade — inventory update → new product creation → QB vendor bill via Celery task.

## Response snapshot

**Change 1 (manufacturers/page.tsx):** Added required `*` to Contact Name, Email, Phone, Address labels in the edit/create modal. Updated `save()` to validate all 5 required fields before submitting — previously only validated `name`.

**Change 2 (create/page.tsx):** Replaced single-name inline form (`newMfrName` string) with a full `newMfrForm` object (6 fields). Inline form now shows a 2-column grid with Name, Contact Name, Email, Phone, Address (all required), Notes (optional). `addManufacturer()` validates all required fields and sends the full payload. `Manufacturer` interface updated to include all fields.

**Change 3 & 4 (create/page.tsx):** Added `applyQtyToAll(blockKey, qty)` and `duplicateRow(blockKey, rowKey)` functions alongside existing `applyCostToAll`. `ProductBlockEditor` gains `onApplyQtyToAll` and `onDuplicateRow` props, `applyQtyVal` local state, "Apply Qty" button beside "Apply Cost", and a ⧉ duplicate button per row (all rows, not just new ones). Both props passed from the blocks.map.

**Change 5 (create/page.tsx):** `reviewRows` and `buildLineItems` now iterate over BOTH `search_variant_rows` AND `new_variant_rows` from every block, regardless of block `mode`. Previously they only used the active mode's rows, causing "existing" block rows to disappear from Step 3 when a "new" block was also present. Running total and line item count also updated to sum both row arrays. `handleStep2Next` updated to check both arrays for qty.

**Change 6 ([id]/page.tsx):** Removed `syncQB()` function, `syncing`/`setSyncing` state, and the "Sync to QB" button from the header action buttons. QB sync now happens automatically server-side on receive.

**Change 7 ([id]/receive/page.tsx + purchase_orders.py + quickbooks_tasks.py):**
- Removed `window.confirm("Sync to QuickBooks now?")` dialog and the manual `apiClient.post(…/sync-qb)` call from the receive page.
- Added `_create_new_product_variant()` async helper in purchase_orders.py: for line items with `new_product_name` but no `product_variant_id`, finds-or-creates a draft `Product` (slug-deduped) + `ProductVariant` (by SKU), links it back to the line item before inventory update.
- After `await db.commit()` in `receive_items`, dispatches `sync_po_receipt_to_qb.delay(po_id, receiving_id)` (fire-and-forget with try/except so it never blocks the HTTP response).
- New `sync_po_receipt_to_qb` Celery task in quickbooks_tasks.py: fetches PO + manufacturer + receiving items, builds bill_lines, calls `svc.create_vendor_bill(vendor_name, bill_lines, po_number, date)`, writes `qb_bill_id` + `qb_synced=True` back to POReceiving. Idempotent (skips if `qb_bill_id` already set). Max 3 retries with 60s/120s/240s exponential backoff. Follows exact same `_run_async` / `AsyncSessionLocal` pattern as all other tasks in the file.

## Outcome

- ✅ Impact: Manufacturers now require full contact info; PO create flow has full inline manufacturer form, qty apply-all, and row duplication; Step 3 review shows all products regardless of block mode mix; receiving triggers automatic QB vendor bill creation instead of requiring a manual button click; new products from POs are auto-created as drafts in the system on receive
- 🧪 Tests: npm run build PASS (80 static pages, 0 TypeScript errors)
- 📁 Files: 6 files changed (272 insertions / 87 deletions)
- 🔁 Next prompts: Test receive flow with a mixed existing+new product PO to verify QB bill is created; verify draft product appears in admin products list after receive
- 🧠 Reflection: The reviewRows bug was a design issue — single blocks can only be in one mode at a time, but the rows for the OTHER mode are preserved in state. Looping both arrays unconditionally (instead of the mode-conditional branch) is the correct fix and also makes buildLineItems and the running total consistent.

## Evaluation notes (flywheel)

- Failure modes observed: reviewRows used block.mode to pick rows — single block toggling from existing to new caused existing rows to vanish from Step 3; new-product line items had no product creation path on receive so inventory update was silently skipped
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): none
- Next experiment: add a toast on the receive page confirming "QB vendor bill queued" after successful submit
