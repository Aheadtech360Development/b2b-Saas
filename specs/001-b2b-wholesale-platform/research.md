# Research: AF Apparels B2B Wholesale Platform

**Branch**: `001-b2b-wholesale-platform` | **Date**: 2026-03-06
**Phase**: Phase 0 — Outline & Research

All NEEDS CLARIFICATION items resolved. No open unknowns.

---

## Decision 1: Image Processing Location — Backend (Python/Pillow)

**Decision**: Process images server-side in the FastAPI backend using Pillow (Python).

**Rationale**:
- All media uploaded to S3 goes through the backend API (`POST /api/v1/admin/products/images`).
- Backend has direct S3 access credentials; processing in-place avoids a separate service.
- Pillow is well-maintained, supports WebP conversion and all common image formats.
- Sharp (Node.js) would require running a separate image processing service or embedding
  in the Next.js server, which creates a tight coupling and violates the two-service
  architecture boundary.

**Alternatives considered**:
- **Sharp (Node.js)**: Faster for throughput, but requires frontend server access to S3
  or a third service — violates Article I.
- **Lambda + S3 trigger**: Serverless option with better scalability, but over-engineered
  for a 100–5,000 product catalog; adds operational complexity.

**Output convention**: Each uploaded image produces:
- `{s3_key}_thumbnail.webp` (150px wide)
- `{s3_key}_medium.webp` (400px wide)
- `{s3_key}_large.webp` (800px wide)
- `{s3_key}_original.jpg/png` (lossless backup)
- WebP served by default; JPEG `<source>` fallback in `<picture>` tags.

---

## Decision 2: Full-Text Search — PostgreSQL tsvector (MVP)

**Decision**: Use PostgreSQL native full-text search via `tsvector` column on `products`.
Elasticsearch/Meilisearch deferred to post-launch if search quality is insufficient.

**Rationale**:
- Product catalog is 100–5,000 products at MVP — PostgreSQL FTS handles this range well.
- Eliminates a third data store, reducing operational complexity.
- Trigger-based auto-update of `search_vector` on product save keeps index fresh.
- GIN index on `search_vector` gives sub-10ms query times at this scale.

**Alternatives considered**:
- **Elasticsearch**: Powerful but adds deployment complexity, another service to monitor.
  Deferred to post-launch if needed.
- **Meilisearch**: Simpler than ES, still requires a separate service. Not justified at MVP.

**Implementation**: `search_vector` column updated by PostgreSQL trigger combining
`products.name` (weight A), `products.description` (weight B), and all associated
`product_variants.sku` (weight A) values.

---

## Decision 3: Cart Persistence — PostgreSQL + Redis hybrid

**Decision**: Cart items stored in PostgreSQL (`cart_items` table) for authenticated users;
guest carts stored in Redis (7-day TTL) keyed by session cookie.

**Rationale**:
- Authenticated carts persist across devices and sessions — requires durable storage.
- Guest carts are temporary and high-churn — Redis is ideal.
- On login, guest cart items are merged into the authenticated cart.
- Cart sync between tabs handled by revalidation on focus (Next.js `revalidatePath` or
  SWR `revalidateOnFocus`).

**Alternatives considered**:
- **All Redis**: Fast but guest cart would be lost if Redis is flushed; authenticated carts
  would be lost on Redis restart without AOF — not durable enough for order-critical data.
- **All PostgreSQL**: Correct but creates table bloat from abandoned guest sessions;
  cleanup jobs add complexity.

---

## Decision 4: Tier Pricing Application Point — Service Layer

**Decision**: Pricing is applied exclusively in `pricing_service.py` via a helper
`calculate_tier_price(base_price, tier_discount_pct)`. All product list and detail
API responses include `effective_price` calculated server-side.

**Rationale**:
- Frontend never calculates prices — prevents manipulation and ensures consistency.
- JWT payload includes `pricing_tier_id`, allowing the service to apply the correct tier
  without a separate DB lookup on every request (tier details cached in Redis for 1 hour).
- Guest requests use the retail price (base_price) or a configurable "login for pricing"
  sentinel value.

**Implementation**: `pricing_middleware.py` injects `effective_price` into product
responses. OrderItems snapshot `unit_price` at creation time, immune to future tier changes.

---

## Decision 5: QuickBooks Sync Pattern — Outbound-only Celery Queue

**Decision**: One-way sync to QuickBooks Online via Celery tasks. Order processing never
waits for QB sync. All sync state tracked in `qb_sync_log`.

**Rationale**:
- QB API rate limit: 500 requests/minute per realm. Token bucket rate limiter enforced
  in `quickbooks_service.py`.
- Async queue prevents QB outages from blocking order creation (Article VIII).
- `qb_sync_log.entity_id` used for idempotency — re-syncing the same entity is safe.
- Exponential backoff: 30s → 2m → 8m → 32m → 2h (max 5 attempts).
- After 5 failures, status set to `manual_required`; admin notified.

**Events that trigger QB sync**:
1. Wholesale application approved → `sync_customer_to_qb.delay(company_id)`
2. Order payment confirmed (Stripe webhook) → `sync_order_invoice_to_qb.delay(order_id)`

---

## Decision 6: Stripe Integration Pattern — Payment Intents + Webhooks

**Decision**: Use Stripe Payment Intents API with Stripe Elements for card capture. Order
status updated exclusively via webhook (not via direct API response), ensuring reliability.

**Rationale**:
- PCI compliance: Stripe Elements handles card input entirely in Stripe's iframe. Card
  data never reaches the server — complies with Article V.
- Idempotency: Each checkout session creates a Payment Intent with idempotency key
  `order_{order_id}` to prevent duplicate charges on retry.
- Webhook-first: `payment_intent.succeeded` webhook is the authoritative signal to
  update `orders.payment_status = 'paid'` and trigger QB sync + confirmation email.
  This handles browser close / network failure edge cases.

**Flow**:
1. Checkout step 3: `POST /api/v1/checkout/payment-intent` → backend creates Stripe
   Payment Intent, returns `client_secret`
2. Frontend uses Stripe Elements `confirmCardPayment(client_secret)`
3. Stripe webhook `payment_intent.succeeded` → backend marks order paid → triggers
   QB sync + email tasks

---

## Decision 7: Email Template System — DB-Stored with SendGrid Delivery

**Decision**: Email templates stored in `email_templates` table (admin-editable).
Jinja2 used server-side to render templates with event-specific variables.
Rendered HTML sent via SendGrid API from Celery tasks.

**Rationale**:
- Admin can edit templates without code deployments (Article X compliant).
- Jinja2 is Python's standard templating engine — no additional dependency.
- SendGrid provides delivery tracking and bounce handling via webhook.
- Celery queue ensures email failures don't block primary operations (Article VIII).

**Supported variables**: `{{customer_name}}`, `{{company_name}}`, `{{order_number}}`,
`{{po_number}}`, `{{order_total}}`, `{{tracking_number}}`, `{{items}}` (list),
`{{pricing_tier}}`, `{{rejection_reason}}`, `{{reset_link}}`, `{{invite_link}}`.

---

## Decision 8: Data Migration — Python Script with Shopify API

**Decision**: One-time migration script (`scripts/migrate_products.py`,
`migrate_customers.py`) using Shopify Admin REST API. Run on staging first, validated,
then run on production.

**Rationale**:
- Shopify Admin REST API provides all needed data (products, customers, orders,
  images).
- Python scripts integrate naturally with the backend's SQLAlchemy models and Pillow
  for image processing.
- Staging-first approach allows 100% validation without risk to production.

**Validation steps**:
1. Count products, variants, customers, orders in Shopify export
2. Run migration
3. Count matching records in PostgreSQL
4. Verify random sample of 20 products: images load at all 3 sizes, prices correct,
   variants present
5. Verify 5 customer accounts: login works, order history visible
6. Zero discrepancies required before production run

---

## Decision 9: 301 Redirects — NGINX Configuration

**Decision**: Shopify-to-new-platform URL redirects managed in NGINX configuration, not
application code.

**Rationale**:
- NGINX handles redirects at the server level before hitting Next.js — zero application
  overhead.
- Shopify URL patterns are predictable (`/products/{handle}` → `/products/{slug}`).
- Bulk redirect rules generated by a script from the product migration manifest.

**Pattern**: `rewrite ^/products/(.*)$ /products/$1 permanent;` with product-specific
overrides for URL slug changes.

---

## Open Items / Post-MVP Research

- **Automated tax calculation**: TaxJar / Avalara evaluation deferred to post-launch.
  MVP uses admin-configured flat tax rate per state.
- **Search scaling**: If PG full-text search proves insufficient at 5,000+ products,
  evaluate Meilisearch integration (single additional service).
- **Two-way QB sync**: Payment status sync from QB back to platform deferred per spec
  out-of-scope.
- **Mobile app**: API-first architecture already supports this; React Native evaluation
  for post-launch Phase 2.
