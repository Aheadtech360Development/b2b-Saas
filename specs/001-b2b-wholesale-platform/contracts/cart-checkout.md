# API Contract: Cart & Checkout

**Base path**: `/api/v1/cart`, `/api/v1/checkout`
**Auth required**: All endpoints require authenticated customer.

---

## GET /api/v1/cart

Get current cart with MOQ/MOV validation status.

**Response 200**:
```json
{
  "items": [
    {
      "id": "uuid",
      "variant_id": "uuid",
      "product_name": "string",
      "product_slug": "string",
      "sku": "string",
      "size": "string",
      "color": "string",
      "quantity": "integer",
      "unit_price": "decimal",
      "line_total": "decimal",
      "available_stock": "integer",
      "thumbnail_url": "string",
      "moq": "integer",
      "moq_met": "boolean"
    }
  ],
  "subtotal": "decimal",
  "shipping_estimate": "decimal",
  "shipping_tier_name": "string",
  "tax_estimate": "decimal",
  "total_estimate": "decimal",
  "total_units": "integer",
  "mov": "decimal",
  "mov_met": "boolean",
  "mov_remaining": "decimal",
  "moq_violations": [
    { "product_name": "string", "required": 12, "current": 5 }
  ],
  "can_checkout": "boolean"
}
```

---

## POST /api/v1/cart/items

Add items to cart (from variant matrix or quick order).

**Request**:
```json
{
  "items": [
    { "variant_id": "uuid", "quantity": "integer" }
  ]
}
```

**Response 200**: Full cart response (same as GET /api/v1/cart)

**Errors**: `422 VALIDATION_ERROR` (quantity ≤ 0), `404 RESOURCE_NOT_FOUND` (variant not found),
`409 OUT_OF_STOCK` (insufficient stock)

---

## PATCH /api/v1/cart/items/{item_id}

Update quantity of a cart item.

**Request**: `{ "quantity": "integer" }` — send `0` to remove.

**Response 200**: Full cart response

**Errors**: `404 RESOURCE_NOT_FOUND`, `409 OUT_OF_STOCK`

---

## DELETE /api/v1/cart/items/{item_id}

Remove a single item from cart.

**Response 200**: Full cart response

---

## DELETE /api/v1/cart

Clear entire cart.

**Response 200**: `{ "message": "Cart cleared." }`

---

## POST /api/v1/cart/save-template

Save current cart as an order template.

**Request**: `{ "name": "string, required" }`

**Response 201**: `{ "template_id": "uuid", "name": "string" }`

**Errors**: `409 CONFLICT` (template name already exists for this company)

---

## POST /api/v1/checkout/payment-intent

Create Stripe Payment Intent for checkout step 3. Server validates cart server-side.

**Request**:
```json
{
  "shipping_address_id": "uuid",
  "po_number": "string, optional",
  "order_notes": "string, optional",
  "save_payment_method": "boolean"
}
```

**Response 200**:
```json
{
  "client_secret": "string (Stripe Payment Intent client_secret)",
  "order_id": "uuid",
  "order_number": "string",
  "order_summary": {
    "subtotal": "decimal",
    "shipping_cost": "decimal",
    "tax_amount": "decimal",
    "total": "decimal",
    "shipping_tier_name": "string"
  }
}
```

**Errors**:
- `409 MOQ_NOT_MET` — specific product(s) with violation details
- `409 MOV_NOT_MET` — current total and required amount
- `409 OUT_OF_STOCK` — specific variant(s) with available stock
- `422 VALIDATION_ERROR`

---

## POST /api/v1/checkout/confirm

Called after Stripe confirms payment. Backend re-validates and finalizes order.
(Primarily used as fallback; webhook is the authoritative signal.)

**Request**: `{ "payment_intent_id": "string" }`

**Response 200**:
```json
{
  "order_id": "uuid",
  "order_number": "string",
  "po_number": "string | null",
  "status": "processing",
  "total": "decimal"
}
```
