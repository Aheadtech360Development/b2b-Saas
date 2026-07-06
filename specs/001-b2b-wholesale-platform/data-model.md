# Data Model: AF Apparels B2B Wholesale Platform

**Branch**: `001-b2b-wholesale-platform` | **Date**: 2026-03-06
**Phase**: Phase 1 — Design & Contracts

All tables include `id` (UUID or serial), `created_at` (timestamptz), `updated_at`
(timestamptz) unless noted. All monetary fields use `DECIMAL(10,2)`. All timestamps UTC.

---

## Domain: Identity & Access

### `companies`

Wholesale company accounts.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK, default gen_random_uuid() | |
| name | VARCHAR(255) | NOT NULL | Company display name |
| tax_id | VARCHAR(50) | NOT NULL | EIN / Tax ID |
| business_type | VARCHAR(100) | NOT NULL | e.g., Distributor, Reseller |
| status | ENUM | NOT NULL, default 'pending' | pending / active / suspended |
| pricing_tier_id | UUID | FK→pricing_tiers, nullable | NULL until approved |
| shipping_tier_id | UUID | FK→shipping_tiers, nullable | NULL until approved |
| shipping_override | DECIMAL(10,2) | nullable | Fixed shipping cost; overrides tier brackets |
| qb_customer_id | VARCHAR(100) | nullable, unique | QuickBooks customer record ID |
| created_at | TIMESTAMPTZ | NOT NULL, default now() | |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() | |

**Indexes**: `status`, `pricing_tier_id`, `shipping_tier_id`
**Soft delete**: via `status = 'suspended'`

---

### `users`

Individual user accounts (customers and admins).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| email | VARCHAR(255) | NOT NULL, UNIQUE | Login identifier |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt hash |
| first_name | VARCHAR(100) | NOT NULL | |
| last_name | VARCHAR(100) | NOT NULL | |
| is_admin | BOOLEAN | NOT NULL, default false | Admin users have no company_id |
| is_active | BOOLEAN | NOT NULL, default true | |
| email_verified | BOOLEAN | NOT NULL, default false | |
| email_verify_token | VARCHAR(255) | nullable | One-time token |
| password_reset_token | VARCHAR(255) | nullable | One-time token |
| last_login | TIMESTAMPTZ | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `email` (UNIQUE), `is_admin`, `is_active`

---

### `company_users`

Many-to-many: User roles within a company.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users NOT NULL | |
| company_id | UUID | FK→companies NOT NULL | |
| role | ENUM | NOT NULL | owner / buyer / viewer / finance |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Unique constraint**: `(user_id, company_id)`
**Indexes**: `user_id`, `company_id`

---

### `contacts`

Company contact directory (receives notifications).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | NOT NULL | |
| phone | VARCHAR(50) | nullable | |
| title | VARCHAR(100) | nullable | |
| receives_order_notifications | BOOLEAN | NOT NULL, default false | |
| receives_shipping_notifications | BOOLEAN | NOT NULL, default false | |
| receives_invoices | BOOLEAN | NOT NULL, default false | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `company_id`

---

### `user_addresses`

Shipping and billing addresses per company.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| label | VARCHAR(100) | NOT NULL | e.g., "Main Warehouse", "HQ" |
| address_line_1 | VARCHAR(255) | NOT NULL | |
| address_line_2 | VARCHAR(255) | nullable | |
| city | VARCHAR(100) | NOT NULL | |
| state | VARCHAR(50) | NOT NULL | |
| zip | VARCHAR(20) | NOT NULL | |
| country | VARCHAR(50) | NOT NULL, default 'US' | |
| is_default_shipping | BOOLEAN | NOT NULL, default false | |
| is_default_billing | BOOLEAN | NOT NULL, default false | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `company_id`

---

## Domain: Product Catalog

### `categories`

Hierarchical product categories.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL | |
| slug | VARCHAR(120) | NOT NULL, UNIQUE | URL-safe identifier |
| parent_id | UUID | FK→categories, nullable | NULL = top-level |
| image_url | TEXT | nullable | Category thumbnail |
| sort_order | INTEGER | NOT NULL, default 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `slug` (UNIQUE), `parent_id`

---

### `products`

Product catalog entries.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| slug | VARCHAR(280) | NOT NULL, UNIQUE | URL-safe, must be unique |
| description | TEXT | nullable | |
| base_price | DECIMAL(10,2) | NOT NULL | Retail price; tier discount applied on top |
| status | ENUM | NOT NULL, default 'draft' | active / draft / archived |
| meta_title | VARCHAR(255) | nullable | SEO |
| meta_description | VARCHAR(500) | nullable | SEO |
| moq_override | INTEGER | nullable | Per-product MOQ; NULL = use system default |
| shopify_handle | VARCHAR(255) | nullable | For migration 301 redirect mapping |
| search_vector | TSVECTOR | | Auto-updated by trigger |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `slug` (UNIQUE, BTREE), `status` (BTREE), `search_vector` (GIN)
**Trigger**: `update_product_search_vector()` — fires on INSERT/UPDATE of `name`,
`description`; also refreshed when variants change SKUs.

---

### `product_variants`

Individual size/color combinations.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| product_id | UUID | FK→products NOT NULL | |
| sku | VARCHAR(100) | NOT NULL, UNIQUE | Stock-keeping unit |
| size | VARCHAR(50) | NOT NULL | |
| color | VARCHAR(100) | NOT NULL | |
| price_override | DECIMAL(10,2) | nullable | NULL = use product.base_price |
| weight | DECIMAL(8,3) | nullable | kg |
| status | ENUM | NOT NULL, default 'active' | active / inactive |
| sort_order | INTEGER | NOT NULL, default 0 | For grid display ordering |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `sku` (UNIQUE), `product_id`, `(product_id, status)`

---

### `product_images`

Multiple images per product.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| product_id | UUID | FK→products NOT NULL | |
| s3_key | VARCHAR(500) | NOT NULL | Base S3 key; sizes appended (_thumbnail, _medium, _large) |
| alt_text | VARCHAR(255) | nullable | |
| sort_order | INTEGER | NOT NULL, default 0 | 0 = primary |
| is_primary | BOOLEAN | NOT NULL, default false | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `product_id`, `(product_id, sort_order)`

---

### `product_assets`

Downloadable marketing files (flyers, datasheets).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| product_id | UUID | FK→products NOT NULL | |
| asset_type | ENUM | NOT NULL | flyer / datasheet |
| file_url | TEXT | NOT NULL | S3 pre-signed or Cloudflare URL |
| file_name | VARCHAR(255) | NOT NULL | Display name for download |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `product_id`

---

### `product_categories`

Many-to-many join: products to categories.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| product_id | UUID | FK→products NOT NULL | |
| category_id | UUID | FK→categories NOT NULL | |

**Unique constraint**: `(product_id, category_id)`

---

## Domain: Inventory

### `warehouses`

Physical stock locations.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(255) | NOT NULL | |
| code | VARCHAR(20) | NOT NULL, UNIQUE | Short identifier for CSV imports |
| address | JSONB | NOT NULL | `{street, city, state, zip}` |
| is_active | BOOLEAN | NOT NULL, default true | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `code` (UNIQUE), `is_active`

---

### `inventory`

Stock levels per variant per warehouse.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| variant_id | UUID | FK→product_variants NOT NULL | |
| warehouse_id | UUID | FK→warehouses NOT NULL | |
| quantity | INTEGER | NOT NULL, default 0, CHECK ≥ 0 | |
| low_stock_threshold | INTEGER | NOT NULL, default 10 | Alert trigger |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Unique constraint**: `(variant_id, warehouse_id)`
**Indexes**: `variant_id`, `warehouse_id`, `(variant_id, quantity)` for stock queries

---

### `inventory_adjustments`

Immutable audit trail of all stock changes.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| variant_id | UUID | FK→product_variants NOT NULL | |
| warehouse_id | UUID | FK→warehouses NOT NULL | |
| old_quantity | INTEGER | NOT NULL | |
| new_quantity | INTEGER | NOT NULL | |
| adjustment_type | ENUM | NOT NULL | received / damaged / returned / correction / sold |
| reason | TEXT | nullable | Admin-entered note |
| admin_user_id | UUID | FK→users NOT NULL | Who made the change |
| created_at | TIMESTAMPTZ | NOT NULL | Immutable — no updated_at |

**Indexes**: `variant_id`, `warehouse_id`, `admin_user_id`, `created_at`

---

## Domain: Pricing & Shipping

### `pricing_tiers`

Discount tier definitions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL, UNIQUE | e.g., "Tier Gold", "Tier Silver" |
| discount_percentage | DECIMAL(5,2) | NOT NULL, CHECK 0–100 | Applied as: effective_price = base * (1 - discount/100) |
| description | TEXT | nullable | |
| sort_order | INTEGER | NOT NULL, default 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### `shipping_tiers`

Shipping rate tier definitions.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL, UNIQUE | e.g., "Standard", "Preferred" |
| calculation_method | ENUM | NOT NULL | quantity_based / value_based |
| description | TEXT | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

### `shipping_brackets`

Rate brackets within a shipping tier.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| shipping_tier_id | UUID | FK→shipping_tiers NOT NULL | |
| range_min | DECIMAL(10,2) | NOT NULL | Inclusive lower bound (units or $) |
| range_max | DECIMAL(10,2) | nullable | NULL = no upper limit (final bracket) |
| shipping_cost | DECIMAL(10,2) | NOT NULL | 0 = free shipping |
| sort_order | INTEGER | NOT NULL | |

**Indexes**: `shipping_tier_id`
**Validation**: brackets MUST be contiguous and non-overlapping (enforced at service layer).

---

## Domain: Orders & Cart

### `orders`

Confirmed orders.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| user_id | UUID | FK→users NOT NULL | Who placed the order |
| order_number | VARCHAR(20) | NOT NULL, UNIQUE | e.g., "ORD-2026-00001" |
| po_number | VARCHAR(50) | nullable, INDEXED | Customer's purchase order number |
| status | ENUM | NOT NULL, default 'pending_payment' | pending_payment / processing / shipped / delivered / completed / cancelled |
| shipping_address_snapshot | JSONB | NOT NULL | Address at time of order |
| billing_address_snapshot | JSONB | nullable | |
| subtotal | DECIMAL(10,2) | NOT NULL | |
| shipping_cost | DECIMAL(10,2) | NOT NULL | |
| shipping_tier_name | VARCHAR(100) | NOT NULL | Snapshot of tier name |
| tax_amount | DECIMAL(10,2) | NOT NULL, default 0 | |
| total | DECIMAL(10,2) | NOT NULL | subtotal + shipping + tax |
| tracking_number | VARCHAR(100) | nullable | |
| stripe_payment_intent_id | VARCHAR(255) | nullable, INDEXED | |
| payment_status | ENUM | NOT NULL, default 'pending' | pending / paid / failed / refunded |
| internal_notes | TEXT | nullable | Admin-only |
| qb_sync_status | ENUM | NOT NULL, default 'pending' | pending / synced / failed / manual_required |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `company_id`, `user_id`, `order_number` (UNIQUE), `po_number`, `status`,
`payment_status`, `created_at`

---

### `order_items`

Line items with price snapshot.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| order_id | UUID | FK→orders NOT NULL | |
| variant_id | UUID | FK→product_variants nullable | NULL if variant deleted post-order |
| product_name_snapshot | VARCHAR(255) | NOT NULL | Historical record |
| variant_sku_snapshot | VARCHAR(100) | NOT NULL | |
| variant_size_snapshot | VARCHAR(50) | NOT NULL | |
| variant_color_snapshot | VARCHAR(100) | NOT NULL | |
| quantity | INTEGER | NOT NULL, CHECK > 0 | |
| unit_price | DECIMAL(10,2) | NOT NULL | Tier price at time of order |
| line_total | DECIMAL(10,2) | NOT NULL | quantity × unit_price |

**Indexes**: `order_id`, `variant_id`

---

### `cart_items`

Active cart — PostgreSQL-persisted for authenticated users.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users NOT NULL | |
| company_id | UUID | FK→companies NOT NULL | |
| variant_id | UUID | FK→product_variants NOT NULL | |
| quantity | INTEGER | NOT NULL, CHECK > 0 | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Unique constraint**: `(user_id, variant_id)`
**Indexes**: `user_id`, `company_id`

---

### `order_templates`

Saved reorder templates.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| name | VARCHAR(255) | NOT NULL | User-provided name |
| template_data | JSONB | NOT NULL | `[{sku, quantity}, ...]` |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `company_id`

---

### `abandoned_carts`

Snapshot of carts with no activity.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| user_id | UUID | FK→users NOT NULL | |
| company_id | UUID | FK→companies NOT NULL | |
| cart_data | JSONB | NOT NULL | Snapshot of items |
| cart_value | DECIMAL(10,2) | NOT NULL | |
| item_count | INTEGER | NOT NULL | |
| last_activity | TIMESTAMPTZ | NOT NULL | |
| notified | BOOLEAN | NOT NULL, default false | Email sent? |
| created_at | TIMESTAMPTZ | NOT NULL | |

---

## Domain: Returns

### `rma_requests`

Return merchandise authorization requests.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| user_id | UUID | FK→users NOT NULL | |
| order_id | UUID | FK→orders NOT NULL | |
| rma_number | VARCHAR(20) | NOT NULL, UNIQUE | e.g., "RMA-2026-00001" |
| status | ENUM | NOT NULL, default 'requested' | requested / under_review / approved / rejected / items_received / closed |
| reason | TEXT | NOT NULL | |
| admin_notes | TEXT | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `company_id`, `order_id`, `status`

---

### `rma_items`

Individual items in an RMA.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| rma_request_id | UUID | FK→rma_requests NOT NULL | |
| order_item_id | UUID | FK→order_items NOT NULL | |
| quantity | INTEGER | NOT NULL, CHECK > 0 | |
| reason | TEXT | nullable | |
| photos | JSONB | nullable | Array of S3 URLs |

---

## Domain: Wholesale Applications

### `wholesale_applications`

Registration applications from prospective buyers.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_name | VARCHAR(255) | NOT NULL | |
| contact_name | VARCHAR(255) | NOT NULL | |
| email | VARCHAR(255) | NOT NULL | |
| phone | VARCHAR(50) | NOT NULL | |
| tax_id | VARCHAR(50) | NOT NULL | |
| business_type | VARCHAR(100) | NOT NULL | |
| expected_order_volume | VARCHAR(100) | nullable | Approximate monthly $ or units |
| address | JSONB | nullable | |
| status | ENUM | NOT NULL, default 'pending' | pending / approved / rejected |
| admin_notes | TEXT | nullable | |
| reviewed_by | UUID | FK→users, nullable | Admin who reviewed |
| reviewed_at | TIMESTAMPTZ | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `status`, `email`, `created_at`

---

## Domain: Communication

### `messages`

Customer-to-admin support messages.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| user_id | UUID | FK→users NOT NULL | |
| subject | VARCHAR(255) | NOT NULL | |
| body | TEXT | NOT NULL | |
| status | ENUM | NOT NULL, default 'open' | open / replied / closed |
| admin_reply | TEXT | nullable | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| replied_at | TIMESTAMPTZ | nullable | |

**Indexes**: `company_id`, `status`

---

### `email_templates`

Admin-configurable transactional email templates.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| name | VARCHAR(100) | NOT NULL, UNIQUE | Human-readable name |
| trigger_event | VARCHAR(100) | NOT NULL, UNIQUE | e.g., `order.confirmed`, `wholesale.approved` |
| subject_template | VARCHAR(500) | NOT NULL | Jinja2 template |
| body_template_html | TEXT | NOT NULL | Jinja2 HTML template |
| variables | JSONB | NOT NULL | Available variable names + descriptions |
| is_active | BOOLEAN | NOT NULL, default true | |
| created_at | TIMESTAMPTZ | NOT NULL | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Trigger events**: `order.confirmed`, `order.shipped`, `order.delivered`,
`wholesale.approved`, `wholesale.rejected`, `auth.password_reset`, `auth.email_verify`,
`auth.welcome`, `user.invited`, `rma.approved`, `rma.rejected`, `cart.abandoned`

---

## Domain: System

### `settings`

Key-value system configuration.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| key | VARCHAR(100) | NOT NULL, UNIQUE | e.g., `system.moq`, `system.mov`, `guest.pricing_mode` |
| value | TEXT | NOT NULL | JSON-encoded or plain string |
| description | TEXT | nullable | |
| updated_at | TIMESTAMPTZ | NOT NULL | |

**Initial seed values**:
- `system.moq` → global minimum order quantity (integer)
- `system.mov` → global minimum order value (decimal)
- `guest.pricing_mode` → `retail` / `login_prompt` / `hidden`
- `system.tax_rate` → flat tax percentage

---

### `audit_log`

Immutable admin action log. No `updated_at` — records are never modified.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| admin_user_id | UUID | FK→users NOT NULL | |
| action_type | ENUM | NOT NULL | CREATE / UPDATE / DELETE / APPROVE / REJECT / SUSPEND |
| entity_type | VARCHAR(50) | NOT NULL | e.g., `product`, `company`, `order`, `pricing_tier` |
| entity_id | UUID | NOT NULL | |
| old_value | JSONB | nullable | State before change |
| new_value | JSONB | nullable | State after change |
| ip_address | INET | NOT NULL | |
| created_at | TIMESTAMPTZ | NOT NULL | |

**Indexes**: `admin_user_id`, `entity_type`, `entity_id`, `created_at`

---

### `qb_sync_log`

QuickBooks synchronization tracking.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| entity_type | ENUM | NOT NULL | customer / invoice |
| entity_id | UUID | NOT NULL | company_id or order_id |
| status | ENUM | NOT NULL, default 'pending' | pending / success / failed / manual_required |
| error_message | TEXT | nullable | Full error detail |
| payload | JSONB | nullable | QB API payload sent |
| retry_count | INTEGER | NOT NULL, default 0 | Max 5 |
| created_at | TIMESTAMPTZ | NOT NULL | |
| last_attempted_at | TIMESTAMPTZ | nullable | |

**Unique constraint**: `(entity_type, entity_id)` — one sync record per entity

---

### `webhook_log`

Inbound webhook idempotency log.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| source | ENUM | NOT NULL | stripe / quickbooks |
| event_type | VARCHAR(100) | NOT NULL | |
| event_id | VARCHAR(255) | NOT NULL, UNIQUE | External event ID for dedup |
| payload | JSONB | NOT NULL | Raw webhook payload |
| status | ENUM | NOT NULL, default 'received' | received / processed / failed |
| created_at | TIMESTAMPTZ | NOT NULL | |
| processed_at | TIMESTAMPTZ | nullable | |

**Indexes**: `event_id` (UNIQUE), `source`, `status`

---

### `price_list_requests`

Async price list generation tracking.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | UUID | PK | |
| company_id | UUID | FK→companies NOT NULL | |
| requested_by | UUID | FK→users NOT NULL | |
| format | ENUM | NOT NULL | pdf / excel |
| status | ENUM | NOT NULL, default 'pending' | pending / generating / complete / failed |
| file_url | TEXT | nullable | S3 URL when complete |
| created_at | TIMESTAMPTZ | NOT NULL | |
| completed_at | TIMESTAMPTZ | nullable | |

---

## Entity Relationship Summary

```
companies ──< company_users >── users
companies ──< contacts
companies ──< user_addresses
companies ──< orders ──< order_items >── product_variants
companies ──< cart_items >── product_variants
companies ──< order_templates
companies ──< rma_requests ──< rma_items >── order_items
companies ──< messages
companies ──< price_list_requests
companies ─── pricing_tiers
companies ─── shipping_tiers ──< shipping_brackets

products ──< product_variants ──< inventory >── warehouses
products ──< product_images
products ──< product_assets
products >──< categories (via product_categories)

wholesale_applications (stand-alone until converted to company)

audit_log (references any entity by entity_type + entity_id)
qb_sync_log (references company or order by entity_type + entity_id)
webhook_log (stand-alone, keyed by external event_id)
```

---

## State Machines

### Order Status

```
pending_payment → processing (on payment_intent.succeeded webhook)
processing → shipped (admin enters tracking number)
shipped → delivered (admin confirmation or carrier webhook)
delivered → completed (after return window closes)
pending_payment → cancelled (admin cancel before payment)
processing → cancelled (admin cancel, triggers refund)
```

### Wholesale Application Status

```
pending → approved (admin approves + assigns tiers → company created)
pending → rejected (admin rejects + enters reason)
```

### QB Sync Status (on qb_sync_log)

```
pending → success (sync completed)
pending → failed (sync attempt failed, retry_count < 5)
failed → success (retry succeeded)
failed → manual_required (retry_count = 5, admin notification sent)
```
