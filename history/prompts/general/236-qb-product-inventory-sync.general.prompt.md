---
id: 236
title: QB Product and Inventory Sync
stage: general
date: 2026-06-08
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: sync products and inventory to QuickBooks
labels: ["quickbooks", "products", "inventory", "celery", "backend", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/a1b2c3qb0001_add_qb_item_id_to_variants.py
  - backend/app/models/product.py
  - backend/app/services/quickbooks_service.py
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/services/inventory_service.py
  - backend/app/api/v1/admin/products.py
tests:
  - manual: add a variant in admin, verify sync_variant_to_qb fires and qb_item_id is written back
  - manual: adjust stock in admin, verify sync_inventory_to_qb fires and QB QtyOnHand updates
  - manual: place order after variant sync, verify invoice line items include ItemRef
---

## Prompt

We need to sync products and inventory to QuickBooks. Check: 1. quickbooks_service.py - existing item methods? 2. backend/app/tasks/ - existing inventory sync tasks? 3. QB products are "Items" — create/update QB Item when product created/updated, sync inventory quantity when stock changes. Show current product/inventory model fields, any existing QB item methods. Then tell me what needs to be built.

User selected: QB Item type = Inventory (with stock tracking), invoice line items should reference QB Items.

## Response snapshot

**DB:** Migration `a1b2c3qb0001` adds `qb_item_id VARCHAR(255)` to `product_variants`.

**Model:** `ProductVariant.qb_item_id: Mapped[str | None]`.

**QB Service** — 3 new methods:
- `get_item(qb_item_id)` — GET single item (returns dict with SyncToken)
- `find_or_create_item(sku, name, unit_price, cost, qty_on_hand)` — query by SKU, create Inventory-type item with standard account refs if not found
- `update_item(qb_item_id, unit_price, cost, qty_on_hand)` — sparse update with SyncToken; sets QtyOnHand + InvStartDate when qty_on_hand provided

**QB Service** — `create_invoice` updated to include `ItemRef` in `SalesItemLineDetail` when `qb_item_id` is in line item dict.

**QB Tasks** — 2 new tasks:
- `sync_variant_to_qb(variant_id)` — snapshots variant+product, calls find_or_create_item (or update_item if qb_item_id exists), writes qb_item_id back to DB
- `sync_inventory_to_qb(variant_id)` — sums InventoryRecord.quantity across all warehouses, calls update_item; defers to sync_variant_to_qb if no qb_item_id yet

**QB Tasks** — `sync_order_invoice_to_qb` updated to look up `qb_item_id` per SKU in the order session and pass it through as `qb_item_id` field in line items.

**Triggers:**
- `inventory_service.adjust_stock_with_log` → `sync_inventory_to_qb.delay` after flush
- `admin/products.add_variant` → `sync_variant_to_qb.delay` after commit
- `admin/products.bulk_generate_variants` → `sync_variant_to_qb.delay` per variant
- `admin/products.create_variants_batch` → `sync_variant_to_qb.delay` per variant
- `admin/products.update_variant` → `sync_variant_to_qb.delay` after commit

## Outcome

- ✅ Impact: Every new/updated variant automatically creates/updates a QB Inventory Item. Every stock adjustment pushes QtyOnHand to QB. Invoices now reference actual QB items for proper accounting linkage.
- 🧪 Tests: Manual — create variant, check Railway logs for sync_variant_to_qb; adjust stock, check sync_inventory_to_qb; place order, check invoice line items in QB
- 📁 Files: 6 files (294 lines added)
- 🔁 Next prompts: Run alembic upgrade head on Railway, test with a real variant. Check if QB account names match ("Inventory Asset", "Sales", "Cost of Goods Sold").
- 🧠 Reflection: Kept Celery task pattern identical to sync_customer_to_qb/_run_async style. Trigger dispatch is wrapped in try/except so QB failures never block product/inventory API responses.

## Evaluation notes (flywheel)

- Failure modes observed: QB account names ("Inventory Asset", "Sales", "Cost of Goods Sold") may differ in client's QB setup — update find_or_create_item account refs if QB returns 400 on item creation
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment: Add a bulk-sync endpoint (GET /admin/qb/sync-all-variants) to backfill existing variants that predate this feature
