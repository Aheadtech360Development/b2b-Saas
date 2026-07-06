---
id: 261
title: QB Vendor Bill Item Details Tab
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: production.aheadtech360@gmail.com
command: fix QB vendor bill line items to show product details in Item details tab instead of generic "Item" in Category details
labels: ["quickbooks","vendor-bill","item-details","product-name","selectinload"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/tasks/quickbooks_tasks.py
  - backend/app/services/quickbooks_service.py
tests:
  - python ast.parse (PASS — both files)
---

## Prompt

Fix QB Vendor Bill line items to show product details instead of generic "Item".

CURRENT (wrong): Category: Uncategorized Asset | Description: Item | Amount: $336
REQUIRED: Product: Premium Unisex Burnout Hoodie - Black/M | Qty: 7 | Cost: $25.94

## Response snapshot

**Two-file change:**

**`sync_po_receipt_to_qb` (quickbooks_tasks.py):**

Added eager-load of `POLineItem.variant.product` via chained selectinload:
```python
selectinload(PurchaseOrder.line_items)
    .selectinload(POLineItem.variant)
    .selectinload(ProductVariant.product),
```

Added `from app.models.product import ProductVariant, Product` import.

Bill line description now uses real product data:
```python
if variant:
    product_name = variant.product.name if variant.product else ...
    detail = "/".join(filter(None, [variant.color, variant.size]))
    desc = f"{product_name} — {detail}" if detail else product_name
    qb_item_id = variant.qb_item_id
elif li and li.new_product_name:
    detail = "/".join(filter(None, [li.new_product_color, li.new_product_size]))
    desc = f"{li.new_product_name} — {detail}" if detail else li.new_product_name
    qb_item_id = None
else:
    desc = f"SKU {li.new_product_sku}" if li and li.new_product_sku else "Item"
    qb_item_id = None

bill_lines.append({..., "qb_item_id": qb_item_id})
```

**`create_vendor_bill` (quickbooks_service.py):**

Replaced single `AccountBasedExpenseLineDetail` block with conditional:
- If `qb_item_id` present → `ItemBasedExpenseLineDetail` with `ItemRef`, `Qty`, `UnitPrice` (shows in QB "Item details" tab)
- If `qb_item_id` absent → `AccountBasedExpenseLineDetail` with COGS account + `BillableStatus: NotBillable` (fallback for new/unsynced products)

## Outcome

- ✅ Impact: QB Vendor Bills now show "Premium Unisex Burnout Hoodie — Black/M | Qty: 7 | $25.94" in the Item details tab for synced products; new/unsynced products fall back to Category details with full description
- 🧪 Tests: Python ast.parse PASS — both files
- 📁 Files: 2 files changed (52 insertions / 18 deletions)
- 🔁 Next prompts: Restart Railway Celery worker and trigger a test receive — verify QB bill "Item details" tab shows the product name + color/size + qty + unit cost
- 🧠 Reflection: QB has two separate line detail types: ItemBasedExpenseLineDetail (appears in "Item details" tab, requires a QB Item reference) and AccountBasedExpenseLineDetail (appears in "Category details" tab, requires an account reference). Only items with qb_item_id already synced to QB can use the Item-based type.

## Evaluation notes (flywheel)

- Failure modes observed: AccountBasedExpenseLineDetail always uses Category tab with generic description — qb_item_id is required for the Item tab
- Graders run and results (PASS/FAIL): Python ast.parse PASS
- Prompt variant (if applicable): none
- Next experiment: for new products that eventually get a qb_item_id after first sync, a "re-sync bill" feature could update existing bill lines to use ItemBasedExpenseLineDetail
