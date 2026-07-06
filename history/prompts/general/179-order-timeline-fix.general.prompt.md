---
id: 179
title: Order Timeline Fix — Dynamic Status Updates and Dropdown Filtering
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix order timeline — update on every status change, and remove Cancelled option when order is Delivered
labels: ["order","timeline","status","admin","backend","frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/order.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - backend/scripts/migrate_timeline_column.sql
tests:
  - none
---

## Prompt

Fix order timeline — update on every status change, and remove 'Cancelled' option when order is 'Delivered'. Read files first.

FIX 1 — Backend: timeline entry appended on every status change in both PATCH endpoints.
FIX 2 — Frontend: status dropdown filtered by getAvailableStatuses(currentStatus) — no Cancelled when delivered; only [cancelled, refunded] when already cancelled.
FIX 3 — Frontend: timeline display reads from order.timeline (backend-driven), not hardcoded events.

## Response snapshot

Backend:
- `backend/app/models/order.py`: Added `JSONB` import and `timeline: Mapped[list | None] = mapped_column(JSONB, nullable=True, default=list)` to Order class (already applied in prior session).
- `backend/app/schemas/order.py`: Added `timeline: list[dict] = []` field to `AdminOrderDetail`.
- `backend/app/api/v1/admin/orders.py`:
  - `get_admin_order`: Added `timeline=order.timeline or []` to `AdminOrderDetail` constructor.
  - `update_admin_order` (PATCH /orders/{order_id}): Appends timeline entry via raw SQL `UPDATE orders SET timeline = :tl::jsonb` when status changes.
  - `update_order_status` (PATCH /orders/{order_id}/status): Always appends timeline entry on call (every invocation records the transition).
- `backend/scripts/migrate_timeline_column.sql`: Created idempotent `ALTER TABLE orders ADD COLUMN IF NOT EXISTS timeline JSONB DEFAULT '[]'::jsonb`.

Frontend (`frontend/src/app/(admin)/admin/orders/[id]/page.tsx`):
- Added `timeline` field to `AdminOrder` interface.
- Added `refunded` to `STATUSES`, `STATUS_LABEL`, and `STATUS_STYLE`.
- Added `getAvailableStatuses(currentStatus)` — delivered → [delivered, refunded]; cancelled → [cancelled, refunded]; otherwise full list excluding refunded.
- Added `getStatusColor(status)` helper returning hex per status.
- Replaced hardcoded `timelineEvents` array with dynamic builder: seeds "Order placed" from `order.created_at`, appends all `order.timeline` entries mapped to `{text, sub, time, color}`, sorted ascending then reversed (newest first).
- Timeline dot no longer renders icon (just colored circle).
- Removed unused `TruckIcon, PackageIcon, CheckIcon` imports.
- Status dropdown now calls `getAvailableStatuses(order.status).filter(...)`.

## Outcome

- ✅ Impact: Timeline records every status change; admin cannot select Cancelled on delivered orders; all timeline entries from backend render in order detail.
- 🧪 Tests: Manual — run migrate_timeline_column.sql, update an order status, reload detail page.
- 📁 Files: 5 files changed (4 modified, 1 created).
- 🔁 Next prompts: none
- 🧠 Reflection: Used raw SQL UPDATE for timeline append because SQLAlchemy JSONB mutation tracking requires flag_modified() or full reassignment; raw SQL avoids that complexity.

## Evaluation notes (flywheel)

- Failure modes observed: none anticipated
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
