# API Contract: Admin Panel

**Base path**: `/api/v1/admin`
**Auth required**: All endpoints require `is_admin = true`.
**Audit logging**: All write operations automatically logged to `audit_log`.

---

## Products Admin

### GET /api/v1/admin/products
List all products with admin filters (includes draft/archived).
**Query**: `?q=&category=&status=&stock_level=low|out|in&page=&page_size=&sort=`
**Response 200**: Same structure as customer listing + `status`, `variant_count`, `total_stock`.

### POST /api/v1/admin/products
Create a new product.
**Request**: `{ name, slug, description, base_price, status, meta_title, meta_description, moq_override, category_ids[] }`
**Response 201**: Full product object.

### PATCH /api/v1/admin/products/{id}
Update product fields.
**Request**: Any subset of product fields.
**Response 200**: Updated product object.

### POST /api/v1/admin/products/{id}/images
Upload and process product image (multipart/form-data). Generates 3 sizes + WebP.
**Request**: `file (image/jpeg|png|webp, max 10MB)`, `alt_text`, `is_primary`
**Response 201**: `{ id, thumbnail_url, medium_url, large_url, sort_order }`

### PATCH /api/v1/admin/products/{id}/images/reorder
Reorder images.
**Request**: `{ "image_ids": ["uuid", "uuid", ...] }` (ordered array)
**Response 200**: Updated images array.

### POST /api/v1/admin/products/{id}/variants/bulk-generate
Generate variants from color × size combinations.
**Request**: `{ "colors": ["Red", "Blue"], "sizes": ["S", "M", "L"] }`
**Response 201**: `{ "created": [variant objects], "count": integer }`

### PATCH /api/v1/admin/products/{id}/variants/{variant_id}
Update a single variant (SKU, price_override, status).
**Response 200**: Updated variant.

### POST /api/v1/admin/products/bulk-action
Apply action to multiple products.
**Request**: `{ "product_ids": ["uuid"], "action": "change_status | change_category | update_pricing_pct", "value": "string | uuid | decimal" }`
**Response 200**: `{ "updated": integer, "failed": integer }`

### POST /api/v1/admin/products/import-csv
Bulk import/update products and variants from CSV.
**Request**: `multipart/form-data { file: CSV }`
**Response 200**: `{ "created": int, "updated": int, "failed": int, "errors": [{ row, message }] }`

### GET /api/v1/admin/products/export-csv
Export product catalog as CSV.
**Query**: All product filter params.
**Response 200**: `text/csv` file download.

---

## Inventory Admin

### GET /api/v1/admin/inventory
List inventory per variant per warehouse.
**Query**: `?sku=&warehouse_id=&stock_level=low|out`
**Response 200**: Paginated list of inventory records with variant and warehouse info.

### POST /api/v1/admin/inventory/adjust
Adjust stock for a variant at a warehouse.
**Request**: `{ variant_id, warehouse_id, new_quantity, adjustment_type, reason }`
**Response 200**: `{ old_quantity, new_quantity, adjustment_log_id }`

### POST /api/v1/admin/inventory/import-csv
Bulk inventory adjustment from CSV.
**Request**: `multipart/form-data { file: CSV (SKU, Warehouse Code, Quantity, Type) }`
**Response 200**: `{ updated: int, failed: int, errors: [{ row, message }] }`

### GET /api/v1/admin/warehouses
List all warehouses.
**Response 200**: Array of warehouse objects.

### POST /api/v1/admin/warehouses
Create warehouse.
**Request**: `{ name, code, address, is_active }`
**Response 201**: Warehouse object.

### PATCH /api/v1/admin/warehouses/{id}
Update warehouse.
**Response 200**: Updated warehouse.

---

## Orders Admin

### GET /api/v1/admin/orders
List all orders.
**Query**: `?q=&status=&payment_status=&company_id=&date_from=&date_to=&page=&page_size=`
**Response 200**: Paginated list with company name, status, payment status, QB sync status.

### GET /api/v1/admin/orders/{id}
Get full order detail.
**Response 200**: Order + items + company info + payment status + qb_sync status + audit trail.

### PATCH /api/v1/admin/orders/{id}
Update order status, tracking number, internal notes.
**Request**: `{ status?, tracking_number?, internal_notes? }`
**Response 200**: Updated order.
**Side effect**: If `tracking_number` set and `status = shipped`, sends shipping email.

### POST /api/v1/admin/orders/{id}/cancel
Cancel an order (refund initiated via Stripe).
**Request**: `{ reason: "string" }`
**Response 200**: `{ order_id, status: "cancelled", refund_id? }`

### POST /api/v1/admin/orders/{id}/sync-quickbooks
Manually trigger QB sync for this order.
**Response 200**: `{ sync_status: "pending | success | failed", message? }`

### GET /api/v1/admin/orders/export-csv
Export filtered orders as CSV.
**Response 200**: `text/csv`

---

## Customers Admin

### GET /api/v1/admin/companies
List all wholesale companies.
**Query**: `?q=&status=&pricing_tier_id=&page=&page_size=`
**Response 200**: Paginated list with order_count, last_order_date, tier names.

### GET /api/v1/admin/companies/{id}
Full company detail: profile, tier assignments, users, contacts, order history.
**Response 200**: Company object + users + contacts + recent orders.

### PATCH /api/v1/admin/companies/{id}
Update company info, tier assignments, shipping override.
**Response 200**: Updated company.

### POST /api/v1/admin/companies/{id}/suspend
Suspend a company account.
**Request**: `{ reason: "string" }`
**Response 200**: `{ status: "suspended" }`

### POST /api/v1/admin/companies/{id}/reactivate
Reactivate a suspended company.
**Response 200**: `{ status: "active" }`

### GET /api/v1/admin/wholesale-applications
List pending wholesale applications.
**Query**: `?status=pending|approved|rejected&page=&page_size=`
**Response 200**: Paginated application list.

### POST /api/v1/admin/wholesale-applications/{id}/approve
Approve application and create company account.
**Request**: `{ pricing_tier_id: "uuid", shipping_tier_id: "uuid", admin_notes?: "string" }`
**Response 201**: `{ company_id: "uuid", application_status: "approved" }`
**Side effects**: Create company + user records, send welcome email, queue QB customer sync.

### POST /api/v1/admin/wholesale-applications/{id}/reject
Reject application.
**Request**: `{ reason: "string" }`
**Response 200**: `{ application_status: "rejected" }`
**Side effect**: Send rejection email to applicant.

---

## Pricing & Shipping Admin

### GET /api/v1/admin/pricing-tiers
List all pricing tiers.

### POST /api/v1/admin/pricing-tiers
Create a pricing tier.
**Request**: `{ name, discount_percentage, description? }`

### PATCH /api/v1/admin/pricing-tiers/{id}
Update a pricing tier.
**Side effect**: Invalidate pricing tier cache.

### GET /api/v1/admin/shipping-tiers
List all shipping tiers with brackets.

### POST /api/v1/admin/shipping-tiers
Create a shipping tier.
**Request**: `{ name, calculation_method, description?, brackets: [{range_min, range_max?, shipping_cost}] }`

### PATCH /api/v1/admin/shipping-tiers/{id}
Update shipping tier and brackets (replace brackets entirely).

---

## Reports Admin

### GET /api/v1/admin/reports/sales
Sales report.
**Query**: `?date_from=&date_to=&group_by=day|week|month&category_id=&company_id=`
**Response 200**: `{ period_data: [{date, revenue, order_count}], by_category: [...], top_products: [...] }`

### GET /api/v1/admin/reports/inventory
Inventory report.
**Query**: `?type=stock_levels|low_stock|movement&warehouse_id=&date_from=&date_to=`

### GET /api/v1/admin/reports/customers
Customer report.
**Query**: `?date_from=&date_to=&pricing_tier_id=`
**Response 200**: `{ new_registrations, approval_rate, avg_order_value_by_tier: [...] }`

### GET /api/v1/admin/reports/{type}/export-csv
Export any report as CSV.

---

## System Admin

### GET /api/v1/admin/audit-log
Search audit log.
**Query**: `?admin_user_id=&entity_type=&entity_id=&date_from=&date_to=&page=&page_size=`
**Response 200**: Paginated audit entries with admin user info.

### GET /api/v1/admin/settings
Get all system settings.

### PATCH /api/v1/admin/settings
Update system settings.
**Request**: `{ key: value, key2: value2 }`
**Side effect**: Invalidate settings Redis cache.

### GET /api/v1/admin/quickbooks/status
QuickBooks sync dashboard.
**Response 200**: `{ last_sync_at, synced_today, failed_syncs: [{ entity_type, entity_id, error, retry_count, last_attempted_at }] }`

### POST /api/v1/admin/quickbooks/retry/{log_id}
Retry a failed QB sync.

### GET /api/v1/admin/email-templates
List all email templates.

### GET /api/v1/admin/email-templates/{id}
Get a single template with available variables.

### PATCH /api/v1/admin/email-templates/{id}
Update template subject and body.

### POST /api/v1/admin/email-templates/{id}/preview
Preview rendered template with sample data.
**Response 200**: `{ subject: "string", body_html: "string" }`

### POST /api/v1/admin/email-templates/{id}/test
Send a test email.
**Request**: `{ email: "string" }`
**Response 200**: `{ message: "Test email queued." }`
