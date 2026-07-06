---
id: 180
title: Customer Timeline — Order Status Change Entries
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix customer detail page timeline — must show order status changes, not just account created and order placed
labels: ["customer","timeline","orders","status","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
tests:
  - none
---

## Prompt

Fix customer detail page timeline — must show order status changes, not just account created and order placed.

## Response snapshot

Root cause: Customer timeline was built purely on the frontend using `orders` state (only "Order placed" + "Account created" entries). The per-order `timeline` JSONB array (status change entries) was not in the `OrderRow` type or the list endpoint response.

Fix (minimal — no new endpoints):
- `backend/app/schemas/order.py`: Added `timeline: list[dict] = []` to `AdminOrderListItem`
- `backend/app/api/v1/admin/orders.py` `list_admin_orders`: Added `timeline=order.timeline or []` to `AdminOrderListItem` constructor
- `frontend/src/app/(admin)/admin/customers/[id]/page.tsx`:
  - Added `timeline?: Array<{status, message, created_by, created_at}>` to `OrderRow` interface
  - Replaced hardcoded 5-order timeline builder with full unified builder:
    - Seeds "Account created" entry
    - For every order: adds "Order placed" entry + iterates all `o.timeline` entries as "Status changed" entries with order number as subtitle
    - All entries sorted newest-first
  - Status change entries use `ORDER_STATUS[e.status]?.color ?? "#8B5CF6"` (purple fallback for unmapped statuses)

## Outcome

- ✅ Impact: Customer timeline now shows all status transitions (Confirmed, Processing, Shipped, etc.) alongside order-placed and account-created events
- 🧪 Tests: Manual — update an order status, reload customer detail, verify status entry appears in timeline
- 📁 Files: 3 files changed
- 🔁 Next prompts: none
- 🧠 Reflection: Reused existing orders fetch — no new API call needed. Adding timeline to AdminOrderListItem is a small schema addition that pays for all customer timelines.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: not run
- Prompt variant: none
- Next experiment: none
