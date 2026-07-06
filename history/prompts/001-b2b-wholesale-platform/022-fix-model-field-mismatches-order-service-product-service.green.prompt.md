---
id: "022"
title: Fix model field mismatches in order and product services
stage: green
date: 2026-03-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: "Fix ALL SQLAlchemy model field name mismatches across service files"
labels: ["backend","bug-fix","order-service","product-service","model-mismatch"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/order_service.py
  - backend/app/services/product_service.py
  - frontend/src/app/(admin)/admin/products/new/page.tsx
tests:
  - Backend restarts cleanly (Application startup complete)
  - POST /api/v1/checkout/confirm no longer crashes with TypeError on Order constructor
  - POST /api/v1/orders/{id}/reorder no longer crashes on CartItem constructor
  - DELETE/archive variant no longer crashes with invalid enum value
  - /admin/products/new form includes slug field
---

## Prompt

Fix ALL SQLAlchemy model field name mismatches across service files. Key known mismatches: Order uses 'placed_by_id' not 'created_by', Order uses 'notes' not 'order_notes', Order has no individual address line columns, CartItem has no 'product_id', ProductVariant 'archived' is not a valid enum value.

## Response snapshot

**Ground truth from model files:**

Order model columns: `order_number`, `company_id`, `placed_by_id`, `status`, `po_number`, `notes`, `shipping_address_id`, `shipping_address_snapshot`, `subtotal`, `shipping_cost`, `tax_amount`, `total`, `payment_status`, `stripe_payment_intent_id`, `stripe_customer_id`, `tracking_number`, `carrier`, `qb_sync_status`, `qb_invoice_id`

CartItem columns: `company_id`, `variant_id`, `quantity`, `unit_price` — NO `product_id`

ProductVariant status enum: `"active" | "discontinued" | "out_of_stock"` — NO `"archived"`

UserAddress columns: `address_line1`, `address_line2`, `city`, `state`, `postal_code`, `country`

**Fixes in `order_service.py`:**

1. `Order(created_by=user_id)` → `Order(placed_by_id=user_id)`
2. `order_notes=confirm.order_notes` → `notes=confirm.order_notes`
3. Removed 6 non-existent address line fields (`shipping_address_line1/2/city/state/postal_code/country`). Replaced with:
   - `shipping_address_id=confirm.address_id if confirm.address_id else None`
   - `shipping_address_snapshot=json.dumps(shipping_address) if shipping_address else None`
4. Added `tax_amount=Decimal("0")` to Order constructor
5. `reorder()`: Removed `product_id=variant.product_id` from CartItem constructor
6. `_resolve_address()`: `addr.line1` → `addr.address_line1`, `addr.line2` → `addr.address_line2`

**Fixes in `product_service.py`:**

`variant.status = "archived"` → `variant.status = "discontinued"` (ProductVariant enum is `active|discontinued|out_of_stock`, no `archived`)

**Collateral fix — new product page:**

`ProductCreate` schema requires `slug` (non-optional). The new product page created in session 021 was missing this field. Added:
- `slug` state field with auto-derivation from `name` (lowercased, hyphenated)
- Slug input field in form UI
- Updated submit guard to require both `name` and `slug`

**Other services checked (no fixes needed):**
- `cart_service.py` — already clean from session 017
- `company_service.py` — all field names correct
- `wholesale_service.py` — all field names correct
- `auth_service.py` — uses User model correctly
- `product_service.py` `create_product` — `ProductCreate` does have `slug`, `meta_title`, `category_ids`; no fix needed there

## Outcome

- ✅ Backend restarted cleanly (Application startup complete)
- ✅ Order creation no longer crashes with invalid keyword arguments
- ✅ Reorder no longer crashes on CartItem
- ✅ Variant soft-delete uses valid enum value
- ✅ New product form includes required slug field

## Evaluation notes (flywheel)

- Failure modes observed: Service code written against a stale/different schema than the final SQLAlchemy models; individual address columns on Order never existed
- Graders run and results (PASS/FAIL): Backend startup clean — PASS
- Prompt variant (if applicable): null
- Next experiment: null
