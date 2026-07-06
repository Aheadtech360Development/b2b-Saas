---
id: 184
title: Variant Default Stock — Zero Not Null
stage: general
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix variant default stock — new variants must default to 0 not null
labels: ["product","variants","stock","model","schema","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/product.py
  - backend/app/api/v1/admin/products.py
  - backend/app/schemas/product.py
  - backend/scripts/migrate_variant_stock_default.sql
tests:
  - none
---

## Prompt

Fix variant default stock — new variants must default to 0 not null. Model had no `stock` column mapped; stock was computed from InventoryRecord at runtime. `VariantCreate` had no `stock` field. `add_variant` set `variant.stock_quantity = 0` as Python attribute (not DB). `create_variants_batch` set nothing.

## Response snapshot

**Fix 1 — Model column:**
`backend/app/models/product.py` `ProductVariant`:
```python
stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
```
Added after `sort_order` field.

**Fix 2 — SQL migration:**
`backend/scripts/migrate_variant_stock_default.sql`:
```sql
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS stock INTEGER;
UPDATE product_variants SET stock = 0 WHERE stock IS NULL;
ALTER TABLE product_variants ALTER COLUMN stock SET DEFAULT 0;
ALTER TABLE product_variants ALTER COLUMN stock SET NOT NULL;
```

**Fix 3 — `add_variant` endpoint:**
```python
variant = ProductVariant(
    ...
    stock=payload.stock if payload.stock is not None else 0,
)
# After refresh:
variant.stock_quantity = variant.stock  # use actual DB value for response
```

**Fix 4 — `create_variants_batch` endpoint:**
```python
variant = ProductVariant(
    ...
    stock=int(v.get("stock", 0)),
)
```

**Fix 5 — `VariantCreate` schema:**
```python
stock: int = 0
```

## Outcome

- ✅ Impact: New variants always get stock=0 in DB (not null); `VariantCreate` accepts stock field; batch creation also defaults to 0; response reflects actual DB value
- 🧪 Tests: Manual — create new variant via admin, check DB stock column is 0; run SQL migration, verify no NULL stock values remain
- 📁 Files: 4 files changed (model, admin products, schema, migration script)
- 🔁 Next prompts: Run SQL migration on DB — `psql -f backend/scripts/migrate_variant_stock_default.sql`
- 🧠 Reflection: Stock column did not exist in the model at all — it was purely a runtime attribute set by admin endpoints. Adding it as a proper DB column with NOT NULL default makes it reliable for all code paths (public API, admin API, direct DB queries)

## Evaluation notes (flywheel)

- Failure modes observed: runtime-only attributes (not DB columns) are invisible to any path that doesn't manually set them — source of null values on public API routes
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment: none
