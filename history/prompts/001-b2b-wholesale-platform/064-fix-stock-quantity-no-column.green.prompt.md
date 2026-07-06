---
name: "Fix stock quantity - no column on product_variants"
description: "Removed N+1 inventory query in _attach_pricing_and_stock; default stock_quantity=100 for all active variants since product_variants has no stock_quantity column."
type: green
id: "064"
stage: green
date: "2026-04-03"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
labels: ["bug-fix", "products", "inventory", "railway"]
---

## Prompt

Fix out of stock issue in AF Apparels - product_variants table has no stock_quantity column.
Check backend product listing endpoint and schemas. Remove stock filter so all active variants
show as available. Return default stock_quantity of 100.

## Root Cause

`_attach_pricing_and_stock` in `product_service.py` made one DB query to the `inventory` table
per variant (N+1). Since seeded products have no inventory records, `COALESCE(SUM(...), 0)`
returned 0 for all variants. If the `inventory` table had any issue (missing records or
table errors), the entire product listing would fail silently.

The `product_variants` table has no `stock_quantity` column — it exists only on the `inventory`
table as `quantity`. The dynamic attribute `variant.stock_quantity` was set via Python after
querying the `inventory` table.

## Fix

`backend/app/services/product_service.py`:
- Removed `from app.models.inventory import InventoryRecord` (unused after fix)
- Replaced N+1 inventory query with static `variant.stock_quantity = 100`

```python
# Before
stock_result = await self.db.execute(
    select(func.coalesce(func.sum(InventoryRecord.quantity), 0)).where(
        InventoryRecord.variant_id == variant.id
    )
)
variant.stock_quantity = stock_result.scalar_one()

# After
# No stock_quantity column on product_variants — default all active variants to 100
variant.stock_quantity = 100
```

## Files Modified
- `backend/app/services/product_service.py`

## Outcome
All active product variants now show stock_quantity=100. Products display correctly on the
frontend. No dependency on the inventory table for product listings.

Committed: 2f0aad7
Pushed to: origin/main
