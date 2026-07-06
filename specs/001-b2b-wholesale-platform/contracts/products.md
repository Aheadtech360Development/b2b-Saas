# API Contract: Products & Catalog

**Base path**: `/api/v1/products`
**Auth**: Guest gets retail/masked prices; authenticated customer gets tier prices.

---

## GET /api/v1/products

List products with filtering, search, and pagination.

**Query parameters**:
- `q` (string) — full-text search
- `category` (string) — category slug
- `size` (string, multi) — filter by size (e.g., `?size=S&size=M`)
- `color` (string, multi) — filter by color
- `min_price` (decimal) — retail price lower bound
- `max_price` (decimal) — retail price upper bound
- `status` (string, default `active`) — admin only: `active | draft | archived`
- `page` (int, default 1)
- `page_size` (int, default 24, max 100)
- `sort` (string) — `name_asc | name_desc | price_asc | price_desc | newest`

**Response 200**:
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "slug": "string",
      "base_price": "decimal",
      "effective_price": "decimal | null",
      "pricing_display_mode": "price | login_prompt | hidden",
      "primary_image": { "thumbnail_url": "string", "alt_text": "string" },
      "categories": ["slug1", "slug2"],
      "is_in_stock": "boolean",
      "total_stock": "integer",
      "status": "active | draft | archived"
    }
  ],
  "total": "integer",
  "page": "integer",
  "page_size": "integer",
  "total_pages": "integer"
}
```

`effective_price`: tier-discounted price for authenticated customers; retail for guests
(unless `pricing_display_mode` is `login_prompt` or `hidden`, in which case `null`).

---

## GET /api/v1/products/{slug}

Get full product detail including all variants and images.

**Response 200**:
```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "description": "string",
  "base_price": "decimal",
  "effective_price": "decimal | null",
  "pricing_display_mode": "price | login_prompt | hidden",
  "moq": "integer",
  "meta_title": "string",
  "meta_description": "string",
  "status": "string",
  "categories": [{ "id": "uuid", "name": "string", "slug": "string" }],
  "images": [
    {
      "thumbnail_url": "string",
      "medium_url": "string",
      "large_url": "string",
      "alt_text": "string",
      "is_primary": "boolean"
    }
  ],
  "assets": [
    { "id": "uuid", "asset_type": "flyer | datasheet", "file_name": "string" }
  ],
  "variants": [
    {
      "id": "uuid",
      "sku": "string",
      "size": "string",
      "color": "string",
      "effective_price": "decimal | null",
      "base_price": "decimal",
      "stock": "integer",
      "status": "active | inactive"
    }
  ]
}
```

**Errors**: `404 RESOURCE_NOT_FOUND`

---

## GET /api/v1/products/{slug}/variant-matrix

Get variant grid data optimized for the bulk ordering matrix.

**Response 200**:
```json
{
  "product_id": "uuid",
  "product_name": "string",
  "moq": "integer",
  "colors": ["Red", "Blue", "Black"],
  "sizes": ["XS", "S", "M", "L", "XL", "2XL"],
  "matrix": {
    "Red": {
      "XS": { "variant_id": "uuid", "sku": "string", "stock": 45, "effective_price": "19.99" },
      "S": { "variant_id": "uuid", "sku": "string", "stock": 0, "effective_price": "19.99" }
    }
  }
}
```

`stock: 0` = out of stock for that cell. `null` entry in matrix = no variant for that combination.

---

## GET /api/v1/products/quick-order/validate

Validate SKU+quantity pairs for quick order.

**Request**:
```json
{
  "items": [
    { "sku": "string", "quantity": "integer" }
  ]
}
```

**Response 200**:
```json
{
  "valid": [
    { "sku": "string", "product_name": "string", "size": "string", "color": "string",
      "quantity": "integer", "effective_price": "decimal", "line_total": "decimal",
      "available_stock": "integer" }
  ],
  "invalid_sku": ["SKU999", "SKU888"],
  "insufficient_stock": [
    { "sku": "string", "requested": 20, "available": 5 }
  ]
}
```

---

## GET /api/v1/categories

List all categories (with product counts).

**Response 200**:
```json
[
  {
    "id": "uuid",
    "name": "string",
    "slug": "string",
    "image_url": "string | null",
    "product_count": "integer",
    "children": []
  }
]
```
