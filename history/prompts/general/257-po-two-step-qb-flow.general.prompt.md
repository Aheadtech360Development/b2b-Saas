---
id: 257
title: PO Two-Step QB Flow
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: PO Sync Now button calls sync-qb; before receive = Sync to QB (creates QB PO), after receive = View in QB link
labels: ["purchase-orders","quickbooks","vendor-bill","two-step","sync","view-in-qb"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/purchase_orders.py
  - backend/app/tasks/quickbooks_tasks.py
  - frontend/src/app/(admin)/admin/purchase-orders/[id]/page.tsx
tests:
  - npm run build (PASS — 80 static pages, 0 TypeScript errors)
---

## Prompt

[Sync Now] button calls existing sync-qb endpoint for the PO.

Also update the "Sync to QB" button behavior:
- Before receive: button syncs/creates QB Purchase Order only
- After receive: button label changes to "View in QB" (links to QB, no re-sync needed)

SQL to run on Railway:
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qb_po_id VARCHAR(50);
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS qb_bill_id VARCHAR(50);

## Response snapshot

**Key findings before implementing:**
- `PurchaseOrder` model already had both `qb_po_id: Mapped[str | None]` and `qb_bill_id: Mapped[str | None]` columns (String 255) — model and `_po_dict` both already include them
- Frontend `PO` interface also already had both fields
- `sync_to_quickbooks` endpoint already handled draft/sent (QB PO) vs else (QB Vendor Bill) — the else-branch was redundant since Change 7 added Celery auto-sync on receive
- `sync_po_receipt_to_qb` Celery task was only writing `receiving.qb_bill_id`, not `po.qb_bill_id`

**Changes made:**

1. `purchase_orders.py — sync_to_quickbooks`: Removed the else-branch (vendor bill creation). Now returns HTTP 400 for any status other than draft/sent with message "QB PO sync only available for draft/sent POs." The QB PO creation path is unchanged — creates QB PO, saves `qb_po_id`, sets `qb_synced = True`.

2. `quickbooks_tasks.py — sync_po_receipt_to_qb`: Added `po.qb_bill_id = qb_bill_id` and `po.qb_synced = True` alongside the existing `receiving.qb_bill_id` write before `session.commit()`. The `po` object is already loaded in the same SQLAlchemy session, so no extra query needed.

3. `[id]/page.tsx`: Restored `syncing` state and `syncQB()` function. QB button is now conditional:
   - status = "draft" or "sent" → "Sync to QB" button (calls sync-qb, creates QB PO); shows "Re-sync to QB" if `qb_po_id` already set
   - status = partial/received/closed AND qb_bill_id or qb_po_id set → "View in QB ↗" anchor link; href = `https://app.qbo.intuit.com/app/bill?txnId={qb_bill_id}` if bill ID set, else `https://app.qbo.intuit.com/app/purchaseorder?txnId={qb_po_id}`

## Outcome

- ✅ Impact: Two-step QB flow — admin syncs PO to QB before sending to manufacturer (creates QB Purchase Order, saves qb_po_id); after items received, Celery task auto-creates QB Vendor Bill and saves qb_bill_id to both POReceiving and PurchaseOrder; "View in QB" button links directly to the relevant QB transaction
- 🧪 Tests: npm run build PASS (80 static pages, 0 TypeScript errors)
- 📁 Files: 3 files changed (53 insertions / 34 deletions)
- 🔁 Next prompts: Run the Railway SQL to ensure columns exist in DB; test the full flow: create PO → Sync to QB → Receive Items → verify "View in QB" button appears and links to vendor bill
- 🧠 Reflection: The sync_to_quickbooks else-branch was dead code after Change 7 added the Celery task; removing it clarifies the endpoint's single responsibility and prevents double-billing if someone manually clicked Sync QB after receiving.

## Evaluation notes (flywheel)

- Failure modes observed: sync_po_receipt_to_qb was writing qb_bill_id only to POReceiving row; frontend had no way to show "View in QB" since po.qb_bill_id was never set
- Graders run and results (PASS/FAIL): TypeScript build PASS
- Prompt variant (if applicable): none
- Next experiment: add QB connection status check before allowing Sync to QB — show a warning if QB tokens are expired
