---
id: 117
title: Ready for Pickup Status + Will Call Hide Shipped
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["order-status","will-call","ready-for-pickup","admin","shipping","migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/p9q0r1s2t3u4_add_shipping_method_ready_for_pickup.py
  - backend/app/models/order.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/guest.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
tests:
  - none
---

## Prompt

In the admin order detail page, add 'Ready for Pickup' as an order status option that appears after 'Processing' in the status flow. Also, if an order's shipping_method is 'will_call', hide the 'Shipped' status option from the status change dropdown — Will Call orders should never show Shipped as an option. Update both frontend status dropdown and backend allowed status values.

## Response snapshot

**Root cause discovered:** `shipping_method` was used during checkout cost calculation but never persisted on the `Order` model — required adding a new DB column and migration before the frontend could read it.

**Changes made:**

**`backend/migrations/versions/p9q0r1s2t3u4_add_shipping_method_ready_for_pickup.py`** — new migration:
- `ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ready_for_pickup'`
- `ALTER TABLE orders ADD COLUMN shipping_method VARCHAR(50)`

**`backend/app/models/order.py`** — 2 changes:
- Added `"ready_for_pickup"` to the `order_status` PostgreSQL Enum
- Added `shipping_method: Mapped[str | None] = mapped_column(String(50), nullable=True)` field

**`backend/app/services/order_service.py`** — 1 change:
- Added `shipping_method=shipping_method` to the `Order(...)` constructor in wholesale order creation

**`backend/app/api/v1/guest.py`** — 1 change:
- Added `shipping_method=method` to the `Order(...)` constructor in guest order creation

**`backend/app/schemas/order.py`** — 1 change:
- Added `shipping_method: str | None = None` to `AdminOrderDetail` so the field is returned by the admin API

**`backend/app/api/v1/admin/orders.py`** — 1 change:
- Added `"ready_for_pickup": "Ready for Pickup"` to `_LABEL` and `"ready_for_pickup": "#0891b2"` to `_COLOR` in `_send_order_status_email`

**`frontend/src/app/(admin)/admin/orders/[id]/page.tsx`** — 6 changes:
- Added `shipping_method?: string | null` to `AdminOrder` interface
- Added `"ready_for_pickup"` to `STATUSES` array (after `"processing"`)
- Added `STATUS_LABEL` mapping for clean display names
- Added `ready_for_pickup` entry to `STATUS_STYLE` (cyan: `#0891B2`)
- Updated `StatusBadge` to use `STATUS_LABEL` for proper display (shows "Ready for Pickup" not "ready_for_pickup")
- SHIPPING & COURIER card: wrapped in `order.shipping_method !== "will_call"` — hidden for Will Call orders
- Status dropdown: filters out `"shipped"` when `order.shipping_method === "will_call"`; all options use `STATUS_LABEL` for display

## Outcome

- ✅ Impact: "Ready for Pickup" appears in the status dropdown after "Processing"; Will Call orders never show "Shipped" as an option; SHIPPING & COURIER section hidden for Will Call orders; shipping_method persisted for all new orders (wholesale and guest)
- ⚠️ Migration: Run `alembic upgrade head` — requires DB migration for `shipping_method` column and enum update
- 🧪 Tests: None automated; manually test by creating a will_call order and verifying "Shipped" is absent from dropdown; test status change to "ready_for_pickup" sends email
- 📁 Files: 7 files modified/created
- 🔁 Next prompts: Backfill existing will_call orders' shipping_method if needed; add "ready_for_pickup" to customer-facing order timeline/status display
- 🧠 Reflection: shipping_method was computed at checkout but discarded — adding a persistent column is the only clean way to drive conditional UI in the admin. The enum ADD VALUE is idempotent (IF NOT EXISTS) so safe to re-run.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
