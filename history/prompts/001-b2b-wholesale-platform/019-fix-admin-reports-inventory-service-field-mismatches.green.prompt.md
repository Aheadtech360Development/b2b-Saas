---
id: "019"
title: Fix admin reports and inventory service field mismatches
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix all crashing admin panel backend endpoints"
labels: ["backend","bug-fix","admin","reports","inventory","celery"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/reports.py
  - backend/app/services/inventory_service.py
  - backend/app/tasks/inventory_tasks.py
tests:
  - Backend restarts cleanly (Application startup complete)
  - GET /api/v1/admin/reports/inventory returns 200
  - GET /api/v1/admin/reports/inventory?low_stock_only=true returns 200
  - GET /api/v1/admin/reports/inventory/export-csv returns CSV stream
  - POST /api/v1/admin/inventory/adjust succeeds without InventoryAdjustment field error
---

## Prompt

Fix all crashing admin panel backend endpoints in AF Apparels platform. Fix field mismatches in reports.py, inventory_service.py, and inventory_tasks.py.

## Response snapshot

**Fix 1 — `inventory_service.py` `adjust_stock_with_log`:**

`InventoryAdjustment` constructor used wrong field names:
- `inventory_id=record.id` → `inventory_record_id=record.id`
- `adjusted_by=adjusted_by` → `adjusted_by_id=adjusted_by`

**Fix 2 — `admin/reports.py` inventory report query (lines ~171-225):**

Multiple non-existent fields on `ProductVariant` and `InventoryRecord`:
- `InventoryRecord.quantity_on_hand` → `InventoryRecord.quantity`
- `InventoryRecord.quantity_reserved` → removed (no such column); response uses `0`
- `ProductVariant.name.label("variant_name")` → `func.concat_ws(" ", ProductVariant.color, ProductVariant.size)`
- `ProductVariant.is_active == True` → `ProductVariant.status == "active"`
- `ProductVariant.low_stock_threshold` (in SELECT and GROUP BY) → `func.coalesce(func.min(InventoryRecord.low_stock_threshold), 10)` (aggregated from InventoryRecord)
- GROUP BY updated to use `color`, `size` instead of `name`, `low_stock_threshold`

Same fixes applied to the CSV export section (report_type == "inventory").

**Fix 3 — `inventory_tasks.py` `check_low_stock_levels`:**

Celery task used `ProductVariant.low_stock_threshold` (doesn't exist) and `ProductVariant.is_active` (doesn't exist):
- Added a second subquery `threshold_q` that aggregates `min(InventoryRecord.low_stock_threshold)` per variant
- Joined `threshold_q` and compared `stock_q.c.total <= threshold_q.c.threshold`
- Replaced `ProductVariant.is_active.is_(True)` → `ProductVariant.status == "active"`

## Outcome

- ✅ Backend reloaded cleanly after each file change (Application startup complete)
- ✅ `InventoryAdjustment` constructor uses correct field names
- ✅ Inventory report and CSV export use actual model columns
- ✅ Celery low-stock task uses correct fields with proper subquery join
- 🔁 Next prompts: frontend Docker rebuild for @tailwindcss/postcss fix
- 🧠 Reflection: ProductVariant fields confirmed: sku, color, size, retail_price, status, sort_order — no name/is_active/low_stock_threshold. InventoryRecord confirmed: quantity, low_stock_threshold, variant_id, warehouse_id.

## Evaluation notes (flywheel)

- Failure modes observed: Model field names in service/report code diverged from actual SQLAlchemy model definitions
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: Add a startup-time field-name validation or at minimum a smoke test hitting each admin endpoint
