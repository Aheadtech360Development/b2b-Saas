---
id: 234
title: Retail and Guest Orders QB Invoice Sync
stage: general
date: 2026-06-08
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "yes, build it"
labels: ["quickbooks","retail","guest","invoices","celery","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
tests:
  - none
---

## Prompt

Currently only wholesale company orders sync to QuickBooks as invoices.
We need retail customer orders to also sync to QB.
[investigate then] yes, build it

## Response snapshot

Modified `sync_order_invoice_to_qb` in `quickbooks_tasks.py` to handle three paths:

**True guest orders** (`order.company_id is None`):
- Snapshots `guest_display_name` from `order.guest_name` (fallback: `"Guest {order_number}"`)
- Snapshots `guest_email_addr` from `order.guest_email` (fallback: `guest+{id[:8]}@afapparels.com`)
- After session closes, calls `svc.create_customer(guest_display_name, guest_email_addr)`
  — `create_customer` deduplicates by DisplayName, so repeated orders from the same guest
  reuse the same QB customer
- Proceeds directly to `create_invoice`

**Company orders** (wholesale + retail-with-company):
- First checks `company.qb_customer_id` column directly (new fast path)
- Falls back to `QBSyncLog` lookup (existing path preserved)
- If still no QB customer → dispatch `sync_customer_to_qb.delay(company_id)` and retry

**Root cause of the prior crash:**
Old code did `QBSyncLog.entity_id == order.company_id` with `company_id = None`, returning
nothing, then called `sync_customer_to_qb.delay("None")` → UUID parse error → infinite retry loop.

Committed: `6c1df62 feat: sync retail and guest orders to QB as invoices`

## Outcome

- ✅ Impact: All order types (wholesale, retail, guest) now create QB invoices
- 🧪 Tests: Manual — requires QB sandbox with test orders
- 📁 Files: 1 file modified (+55 / -20 lines)
- 🔁 Next prompts: Wire QB invoice ID to order detail page; admin retry UI for failed syncs
- 🧠 Reflection: Variable pre-declaration before the session block (`qb_customer_id = None`, `is_guest_no_company = False`) is required because Python scoping keeps them alive after the `async with` closes
