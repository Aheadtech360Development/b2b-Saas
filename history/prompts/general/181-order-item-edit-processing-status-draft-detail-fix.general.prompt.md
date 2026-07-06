---
id: 181
title: Order Item Edit Processing Status + Draft Detail Load Fix
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix 2 issues — order item add failing for processing status, draft order detail page failing to load
labels: ["orders","draft","processing","items","admin","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
tests:
  - none
---

## Prompt

Fix 2 issues: order item add failing for processing status, draft order detail page failing to load.

## Response snapshot

**FIX 1 — add_order_item status check too restrictive:**
Line 538: `if order.status not in ("pending", "confirmed")` blocked `processing`, `ready_for_pickup`, `shipped`.
Fix: inverted to `if order.status in ("delivered", "cancelled", "refunded")` — only truly final states block editing.

Also fixed `remove_order_item` totals recalculation: was `if order.status in ("pending", "confirmed")` → changed to `if order.status not in ("delivered", "cancelled", "refunded")` so total is updated consistently for any editable status.

**FIX 2 — DRAFT- order numbers crashing get_admin_order:**
Root cause: main orders list `page.tsx` "View" link uses `o.order_number` (not `o.id`), so navigating to a draft order produces URL `/admin/orders/DRAFT-118393`. Backend `get_admin_order` only checked for `AF-` prefix; falling through to `_uuid.UUID("DRAFT-118393")` raised a `ValueError` (unhandled → 500).
Fix: changed prefix check from `if order_id.upper().startswith("AF-"):` to `if upper.startswith("AF-") or upper.startswith("DRAFT-"):` — both do an `Order.order_number == upper` lookup.

## Outcome

- ✅ Impact: Admins can now add/remove items from processing orders; draft order detail pages load correctly
- 🧪 Tests: Manual — set an order to processing, add an item; click View on a DRAFT order from the orders list
- 📁 Files: 1 backend file changed (3 edits)
- 🔁 Next prompts: none
- 🧠 Reflection: The root cause of FIX 2 was in the main orders list (using order_number for the link), not in the drafts page (which correctly uses UUID). Backend fix covers all callers.

## Evaluation notes (flywheel)

- Failure modes observed: status guard was inverted (allow-list instead of deny-list) — deny-list is more forward-compatible
- Graders run: not run
- Next experiment: none
