# Tasks: AF Apparels B2B Wholesale Platform

**Feature**: 001-b2b-wholesale-platform
**Branch**: `001-b2b-wholesale-platform`
**Input**: specs/001-b2b-wholesale-platform/ (plan.md, spec.md, data-model.md, contracts/, research.md, quickstart.md)
**Total Stories**: 20 (11 P1 / 8 P2 / 1 P3)
**Tests**: Not generated (not requested in spec)

## Format: `- [ ] T### [P?] [US#?] Description with file path`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[US#]**: Which user story this task belongs to
- No story label = Setup or Foundational task

---

## Phase 1: Setup

**Purpose**: Project scaffolding, monorepo structure, Docker, CI/CD, NGINX, environment config.

- [x] T001 Create monorepo root structure: docker-compose.yml, .env.example, .gitignore, README.md
- [x] T002 [P] Initialize FastAPI backend project: backend/requirements.txt, backend/pyproject.toml, backend/alembic.ini, backend/celeryconfig.py
- [x] T003 [P] Initialize Next.js 15 App Router project: frontend/package.json, frontend/tsconfig.json, frontend/next.config.ts, frontend/tailwind.config.ts, frontend/vitest.config.ts, frontend/playwright.config.ts
- [x] T004 Configure docker-compose.yml with PostgreSQL 16 and Redis 7 services (ports 5432, 6379)
- [x] T005 [P] Configure GitHub Actions backend CI pipeline in .github/workflows/backend-tests.yml (pytest, coverage check)
- [x] T006 [P] Configure GitHub Actions frontend CI pipeline in .github/workflows/frontend-tests.yml (vitest, playwright)
- [x] T007 [P] Configure GitHub Actions deploy workflow in .github/workflows/deploy.yml (staging on develop merge, prod on main merge)
- [x] T008 [P] Configure NGINX reverse proxy for frontend (port 3000) and backend (port 8000) in nginx/nginx.conf
- [x] T009 Create comprehensive backend .env.example documenting all required environment variables (DATABASE_URL, REDIS_URL, JWT keys, Stripe, QB, SendGrid, AWS, Sentry)

**Checkpoint**: Both services scaffold successfully; Docker Compose starts PostgreSQL and Redis.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core backend infrastructure — database models, migrations, auth, middleware, Celery, API client. MUST complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T010 Create SQLAlchemy Base model mixin with UUID primary key, created_at, updated_at in backend/app/models/base.py
- [x] T011 [P] Configure async SQLAlchemy engine, session factory, and dependency injection in backend/app/core/database.py
- [x] T012 [P] Configure async Redis connection pool with helper get/set/delete/expire functions in backend/app/core/redis.py
- [x] T013 [P] Configure Celery application with Redis broker and result backend in backend/app/core/celery.py and backend/celeryconfig.py
- [x] T014 [P] Load and validate all environment variables using Pydantic Settings in backend/app/core/config.py
- [x] T015 [P] Define custom exception classes (NotFound, Unauthorized, Forbidden, ValidationError, ConflictError) mapped to HTTP status codes in backend/app/core/exceptions.py
- [x] T016 Implement bcrypt password hashing and JWT access/refresh token creation and validation in backend/app/core/security.py
- [x] T017 [P] Create SQLAlchemy models for identity domain: companies, company_users, contacts, user_addresses in backend/app/models/company.py
- [x] T018 [P] Create SQLAlchemy models for users domain: users (with is_admin, role, email_verified, last_login) in backend/app/models/user.py
- [x] T019 [P] Create SQLAlchemy models for products domain: categories, products (with tsvector search_vector), product_variants, product_images, product_assets, product_categories in backend/app/models/product.py
- [x] T020 [P] Create SQLAlchemy models for inventory domain: warehouses, inventory, inventory_adjustments in backend/app/models/inventory.py
- [x] T021 [P] Create SQLAlchemy models for pricing and shipping domains: pricing_tiers in backend/app/models/pricing.py; shipping_tiers, shipping_brackets in backend/app/models/shipping.py
- [x] T022 [P] Create SQLAlchemy models for orders domain: orders, order_items, cart_items, abandoned_carts, order_templates in backend/app/models/order.py
- [x] T023 [P] Create SQLAlchemy models for returns domain: rma_requests, rma_items in backend/app/models/rma.py
- [x] T024 [P] Create SQLAlchemy models for wholesale domain: wholesale_applications in backend/app/models/wholesale.py
- [x] T025 [P] Create SQLAlchemy models for communication domain: messages, email_templates in backend/app/models/communication.py
- [x] T026 [P] Create SQLAlchemy models for system domain: settings, audit_log, qb_sync_log, webhook_log, price_list_requests in backend/app/models/system.py
- [ ] T027 Generate initial Alembic migration with all 25 tables, FK constraints, and indexes (GIN on search_vector, btree on slug, sku, email, po_number, event_id) in backend/migrations/versions/001_initial_schema.py
- [x] T028 Implement JWT auth middleware (decode Bearer token, inject user_id/company_id/role/pricing_tier_id into request.state, raise 401 on invalid) in backend/app/middleware/auth_middleware.py
- [x] T029 [P] Implement audit middleware skeleton (intercept admin write operations, auto-log to audit_log with entity, old/new values, admin user, IP) in backend/app/middleware/audit_middleware.py
- [x] T030 Create FastAPI app instance, register all routers under /api/v1/, add CORS, global error handler with standard error format, and mount middleware in backend/app/main.py
- [x] T031 Create health check endpoint (GET /health returning db+redis status) in backend/app/main.py
- [x] T032 Create seed data script for admin user, default pricing tiers, default shipping tiers, and all 11 email templates in scripts/seed_data.py
- [x] T033 [P] Create TypeScript type definitions for API responses in frontend/src/types/product.types.ts, frontend/src/types/order.types.ts, frontend/src/types/user.types.ts, frontend/src/types/api.types.ts
- [x] T034 Create centralized API client with Authorization header injection, automatic token refresh on 401, and standard error parsing in frontend/src/lib/api-client.ts
- [x] T035 [P] Create app-wide constants (API base URL, pagination defaults, image sizes) in frontend/src/lib/constants.ts
- [x] T036 [P] Create shared utility functions (currency formatter, date formatter, slug generator) in frontend/src/lib/utils.ts

**Checkpoint**: `docker compose up -d` starts PG + Redis; `alembic upgrade head` applies schema; `uvicorn app.main:app` starts and `/health` returns `{"status":"ok","db":"ok","redis":"ok"}`; `npm run dev` starts frontend.

---

## Phase 3: US-1 — Wholesale Registration & Approval (P1) 🎯 MVP

**Goal**: Prospective buyers submit wholesale applications; admin approves/rejects with tier assignment; approved buyers log in and see tier pricing.

**Independent Test**: Submit application → admin approves with pricing + shipping tier → buyer logs in → sees tier-specific discounted prices on products.

### Implementation

- [x] T037 [P] [US1] Create Pydantic schemas for wholesale applications (Submit, ApplicationOut, ApproveRequest, RejectRequest) in backend/app/schemas/wholesale.py
- [x] T038 [P] [US1] Create Pydantic schemas for auth (LoginRequest, LoginResponse, RegisterWholesaleRequest, TokenRefreshResponse, ForgotPasswordRequest, ResetPasswordRequest) in backend/app/schemas/auth.py
- [x] T039 [US1] Implement WholesaleApplicationService (submit_application, list_applications, get_application, approve_with_tiers, reject_with_reason) in backend/app/services/wholesale_service.py
- [x] T040 [US1] Implement AuthService (login, logout_blacklist_refresh_token, refresh_access_token, send_password_reset, reset_password, verify_email) in backend/app/services/auth_service.py
- [x] T041 [US1] Implement auth router: POST /api/v1/auth/register-wholesale, POST /api/v1/auth/login, POST /api/v1/auth/logout, POST /api/v1/auth/refresh, POST /api/v1/auth/forgot-password, POST /api/v1/auth/reset-password in backend/app/api/v1/auth.py
- [x] T042 [US1] Implement admin wholesale-applications router: GET /api/v1/admin/wholesale-applications, POST /api/v1/admin/wholesale-applications/{id}/approve, POST /api/v1/admin/wholesale-applications/{id}/reject in backend/app/api/v1/admin/customers.py
- [x] T043 [US1] Create stub email task functions (send_welcome_email, send_approval_email, send_rejection_email, send_password_reset_email) called during approval/rejection in backend/app/tasks/email_tasks.py
- [x] T044 [US1] Create stub QuickBooks task function (sync_customer_to_qb) called on company approval in backend/app/tasks/quickbooks_tasks.py
- [x] T045 [P] [US1] Create Zustand auth store (access token in memory, user profile, login/logout actions) in frontend/src/stores/auth.store.ts
- [x] T046 [P] [US1] Create auth service functions (login, logout, registerWholesale, refreshToken, forgotPassword, resetPassword) in frontend/src/services/auth.service.ts
- [x] T047 [US1] Create wholesale registration form page (company name, tax ID, business type, contact info, expected order volume) at frontend/src/app/(auth)/wholesale/register/page.tsx
- [x] T048 [US1] Create application pending status page (under review message, contact info) at frontend/src/app/(auth)/wholesale/pending/page.tsx
- [x] T049 [US1] Create login page with email/password form, JWT handling, and redirect on success at frontend/src/app/(auth)/login/page.tsx
- [x] T050 [US1] Create forgot-password and reset-password pages at frontend/src/app/(auth)/forgot-password/page.tsx and frontend/src/app/(auth)/reset-password/page.tsx

**Checkpoint**: Submit application via form → admin approves → buyer logs in → JWT contains pricing_tier_id.

---

## Phase 4: US-10 — Tier-Based Pricing Engine (P1)

**Goal**: Every product price displayed reflects the customer's company pricing tier discount; order line items snapshot the price at purchase time.

**Independent Test**: Admin creates "Tier Gold" at 25% off, assigns to Company A; Company A user sees $75 for a $100 product; order item records $75 as unit_price.

### Implementation

- [x] T051 [P] [US10] Create Pydantic schemas for pricing tiers (PricingTierCreate, PricingTierOut) in backend/app/schemas/pricing.py
- [x] T052 [US10] Implement PricingService (calculate_effective_price, apply_tier_to_product_list, get_tier_by_id, invalidate_tier_cache) in backend/app/services/pricing_service.py
- [x] T053 [US10] Implement pricing middleware (read pricing_tier_id from request.state, attach tier discount % to request context for downstream services) in backend/app/middleware/pricing_middleware.py
- [x] T054 [US10] Implement admin pricing-tiers router: GET /api/v1/admin/pricing-tiers, POST /api/v1/admin/pricing-tiers, PATCH /api/v1/admin/pricing-tiers/{id} (with Redis cache invalidation on update) in backend/app/api/v1/admin/pricing.py
- [x] T055 [US10] Implement PriceListService (trigger async generation, poll status) and Celery task (generate PDF/Excel with tier prices for all products, upload to S3) in backend/app/services/pricelist_service.py and backend/app/tasks/pricelist_tasks.py
- [x] T056 [US10] Implement price list account endpoints: GET /api/v1/account/price-list?format=pdf|excel (202 accepted + request_id), GET /api/v1/account/price-list/{request_id} (status + file_url) in backend/app/api/v1/account.py

**Checkpoint**: Pricing tier CRUD works; effective_price field in product responses reflects tier discount; price list generation queues a Celery task.

---

## Phase 5: US-11 — Tier-Based Shipping Calculation (P1)

**Goal**: Shipping cost at checkout reflects the company's assigned shipping tier brackets or fixed per-company override.

**Independent Test**: Admin assigns "Standard" shipping tier (100–499 units → $50) to Company A; Company A with 120 units in cart sees $50 shipping at checkout.

### Implementation

- [x] T057 [P] [US11] Create Pydantic schemas for shipping tiers and brackets (ShippingTierCreate, ShippingBracketIn, ShippingTierOut) in backend/app/schemas/shipping.py
- [x] T058 [US11] Implement ShippingService (calculate_shipping_cost, get_applicable_bracket, apply_company_override) in backend/app/services/shipping_service.py
- [x] T059 [US11] Implement admin shipping-tiers router: GET /api/v1/admin/shipping-tiers, POST /api/v1/admin/shipping-tiers, PATCH /api/v1/admin/shipping-tiers/{id} (replaces brackets entirely on update) in backend/app/api/v1/admin/shipping.py

**Checkpoint**: Shipping tier CRUD works; ShippingService.calculate_shipping_cost returns correct cost for any quantity/tier combination including override.

---

## Phase 6: US-2 — Product Catalog Browsing (P1)

**Goal**: Customers browse, search (full-text), and filter products; see tier-appropriate pricing; product detail shows all images, variants with availability.

**Independent Test**: Logged-in customer filters by category + size; search for "polo" returns matching products; product detail shows tier price and variant stock.

### Implementation

- [x] T060 [P] [US2] Create Pydantic schemas for product list/detail responses (ProductListItem, ProductDetail, VariantOut, CategoryOut, FilterParams) in backend/app/schemas/product.py
- [x] T061 [US2] Implement ProductService (list_with_filters_and_search, get_by_slug_with_variants, apply_tier_pricing_to_list, get_category_tree) with Redis caching (5-min listings, 10-min detail, 1-hr categories) in backend/app/services/product_service.py
- [x] T062 [US2] Add PostgreSQL tsvector trigger for products.search_vector column update on product insert/update in backend/migrations/versions/002_search_vector_trigger.py
- [x] T063 [US2] Implement products router: GET /api/v1/products (filters: category, size, color, price_range, q, page), GET /api/v1/products/{slug} in backend/app/api/v1/products.py
- [x] T064 [US2] Implement categories router: GET /api/v1/products/categories (full tree) in backend/app/api/v1/products.py
- [x] T065 [P] [US2] Create products service functions (listProducts, getProductBySlug, getCategories) in frontend/src/services/products.service.ts
- [x] T066 [US2] Create product listing page (grid layout, pagination) at frontend/src/app/(customer)/products/page.tsx
- [x] T067 [US2] Create FilterSidebar component (category tree, size checkboxes, color swatches, price range slider — updates URL query params on change) at frontend/src/components/products/FilterSidebar.tsx
- [x] T068 [US2] Create ProductCard component (Next.js Image, product name, tier price display) at frontend/src/components/products/ProductCard.tsx
- [x] T069 [US2] Create product detail page with image gallery (multiple images, zoom), variant availability table, tier price, and add-to-cart actions at frontend/src/app/(customer)/products/[slug]/page.tsx
- [x] T070 [US2] Add Next.js metadata generation (meta title, description, Schema.org Product JSON-LD) to product detail page at frontend/src/app/(customer)/products/[slug]/page.tsx
- [x] T071 [US2] Create mobile-responsive filter toggle (filters slide-in panel on mobile viewports) at frontend/src/components/products/FilterSidebar.tsx
- [x] T072 [US2] Handle guest pricing display mode (show retail / show login prompt / hidden) based on settings API response in product listing and detail pages

**Checkpoint**: Product listing renders with tier pricing; full-text search returns results; Lighthouse Performance ≥ 90 on product listing page.

---

## Phase 7: US-3 — Bulk Ordering via Variant Matrix (P1)

**Goal**: Customers enter quantities across size × color grid on a product page; row/column subtotals update live; all non-zero quantities added to cart in one action.

**Independent Test**: Open variant matrix for a 24-variant product; enter quantities in 8 cells; totals update in real-time; "Add All to Cart" adds 8 line items.

### Implementation

- [x] T073 [P] [US3] Create Pydantic schemas for cart operations (CartItemAdd, MatrixAddRequest, CartItemOut, CartResponse) in backend/app/schemas/cart.py
- [x] T074 [US3] Implement CartService (get_cart_with_pricing, add_matrix_items, update_item_quantity, remove_item, clear_cart) in backend/app/services/cart_service.py
- [x] T075 [US3] Implement cart router: GET /api/v1/cart, POST /api/v1/cart/add-matrix, PATCH /api/v1/cart/items/{id}, DELETE /api/v1/cart/items/{id} in backend/app/api/v1/cart.py
- [x] T076 [P] [US3] Create Zustand cart store (items, add, updateQuantity, remove, clear, total helpers) in frontend/src/stores/cart.store.ts
- [x] T077 [P] [US3] Create cart service functions (getCart, addMatrix, updateItem, removeItem) in frontend/src/services/cart.service.ts
- [x] T078 [US3] Create VariantMatrix component (color rows × size columns grid, quantity inputs per cell, sticky headers on mobile, row/column subtotals, grand total) at frontend/src/components/products/VariantMatrix.tsx
- [x] T079 [US3] Add real-time subtotal calculation (debounced, <300ms render for 60 variants) and MOQ warning display to VariantMatrix component at frontend/src/components/products/VariantMatrix.tsx
- [x] T080 [US3] Wire VariantMatrix into product detail page with "Add All to Cart" action and success feedback at frontend/src/app/(customer)/products/[slug]/page.tsx

**Checkpoint**: VariantMatrix renders for a product with 60+ variants within 300ms; "Add All to Cart" adds correct items; cart item count updates in header.

---

## Phase 8: US-5 — Shopping Cart with MOQ & MOV Enforcement (P1)

**Goal**: Cart page shows all items with live MOQ/MOV validation warnings; checkout is blocked with clear reason if requirements not met.

**Independent Test**: Cart with 5 units of MOQ-12 product shows warning; cart total below MOV shows warning and disables checkout button; meeting both enables checkout.

### Implementation

- [x] T081 [US5] Extend CartService with validate_cart (check MOQ per product from settings, check MOV from settings, estimate shipping, return validation result object) in backend/app/services/cart_service.py
- [x] T082 [US5] Add cart template save endpoint: POST /api/v1/cart/save-template (save current cart as named OrderTemplate) in backend/app/api/v1/cart.py
- [x] T083 [US5] Create cart page (item rows with image, variant details, inline quantity input, line totals, remove button) at frontend/src/app/(customer)/cart/page.tsx
- [x] T084 [US5] Create CartSummary component (subtotal, estimated shipping, estimated tax, grand total) at frontend/src/components/cart/CartSummary.tsx
- [x] T085 [US5] Create MOQWarning component (per-product minimum quantity warning with current vs required units) at frontend/src/components/cart/MOQWarning.tsx
- [x] T086 [US5] Add MOV warning banner and conditional "Proceed to Checkout" enable/disable with specific reason message to cart page at frontend/src/app/(customer)/cart/page.tsx
- [x] T087 [US5] Add "Save as Template" dialog (name input, save action) to cart page at frontend/src/app/(customer)/cart/page.tsx

**Checkpoint**: Cart with MOQ violation shows per-product warning; cart below MOV shows banner and disabled checkout button; resolving both enables checkout.

---

## Phase 9: US-6 — Multi-Step Checkout with PO Number (P1)

**Goal**: Customers complete 4-step checkout (address → order details → payment → review); server-side validates stock/MOQ/MOV at order creation; confirmation page and email sent.

**Independent Test**: Complete all 4 checkout steps with valid cart; order is created; confirmation page shows order number and PO number; confirmation email queued.

### Implementation

- [x] T088 [P] [US6] Create Pydantic schemas for checkout and order operations (CreateOrderRequest, OrderOut, OrderItemOut, CheckoutConfirmRequest) in backend/app/schemas/order.py
- [x] T089 [US6] Implement OrderService (create_order with full server-side validation — stock check, MOQ, MOV, price snapshot; get_order; list_orders_for_company) in backend/app/services/order_service.py
- [x] T090 [US6] Implement PaymentService (create_stripe_payment_intent, save_payment_method, list_saved_payment_methods, detach_payment_method) in backend/app/services/payment_service.py
- [x] T091 [US6] Implement checkout router: POST /api/v1/checkout/intent (create Stripe PaymentIntent), POST /api/v1/checkout/confirm (create order record after client-side payment) in backend/app/api/v1/checkout.py
- [x] T092 [US6] Implement orders router: GET /api/v1/orders, GET /api/v1/orders/{id} in backend/app/api/v1/orders.py
- [x] T093 [US6] Implement Stripe webhook handler: POST /api/v1/webhooks/stripe — verify Stripe-Signature, idempotency check via webhook_log.event_id, handle payment_intent.succeeded (update order, queue email + QB sync, clear cart), payment_intent.payment_failed, charge.refunded in backend/app/api/v1/webhooks.py
- [x] T094 [US6] Implement account address endpoints: GET /api/v1/account/addresses, POST /api/v1/account/addresses, PATCH /api/v1/account/addresses/{id}, DELETE /api/v1/account/addresses/{id} in backend/app/api/v1/account.py
- [x] T095 [US6] Implement account payment-method endpoints: GET /api/v1/account/payment-methods, DELETE /api/v1/account/payment-methods/{id}, POST /api/v1/account/payment-methods/{id}/set-default in backend/app/api/v1/account.py
- [x] T096 [P] [US6] Create orders service functions (createPaymentIntent, confirmOrder, getOrders, getOrder) in frontend/src/services/orders.service.ts
- [x] T097 [US6] Create checkout layout with 4-step progress indicator at frontend/src/app/(customer)/checkout/layout.tsx
- [x] T098 [US6] Create Step 1 — Shipping Address (select saved address or add new inline) at frontend/src/app/(customer)/checkout/address/page.tsx
- [x] T099 [US6] Create Step 2 — Order Details (PO number field, order notes, PO required/optional from settings) at frontend/src/app/(customer)/checkout/details/page.tsx
- [x] T100 [US6] Create Step 3 — Payment with Stripe Elements (select saved card or new card form, save card checkbox) at frontend/src/app/(customer)/checkout/payment/page.tsx
- [x] T101 [US6] Create Step 4 — Review (full order summary, cost breakdown, edit links to each step) at frontend/src/app/(customer)/checkout/review/page.tsx
- [x] T102 [US6] Create order confirmation page (order number, PO number, estimated delivery, summary) at frontend/src/app/(customer)/orders/confirmation/[id]/page.tsx

**Checkpoint**: Full checkout flow completes; order record created with price snapshots; webhook fires; confirmation email queued; cart cleared.

---

## Phase 10: US-13 — Admin Product Management (P1)

**Goal**: Admin manages full product catalog — create/edit products, upload/reorder images, bulk-generate variants, bulk actions, CSV import/export.

**Independent Test**: Admin creates product with 6 variants (2 colors × 3 sizes), uploads 3 images, sets MOQ, publishes; product appears in customer catalog at correct tier price.

### Implementation

- [ ] T103 [P] [US13] Extend Pydantic schemas for admin product operations (ProductCreate, ProductUpdate, ImageUploadResponse, BulkGenerateRequest, BulkActionRequest, ImportResult) in backend/app/schemas/product.py
- [ ] T104 [US13] Extend ProductService with admin methods (create_product, update_product, delete_variant, bulk_generate_variants, apply_bulk_action, import_from_csv, export_to_csv) in backend/app/services/product_service.py
- [ ] T105 [US13] Implement image processing pipeline (Pillow: resize to 150/400/800px, convert to WebP, upload to S3, return URLs) as part of POST /api/v1/admin/products/{id}/images in backend/app/api/v1/admin/products.py
- [ ] T106 [US13] Implement admin products router: GET /api/v1/admin/products, POST /api/v1/admin/products, PATCH /api/v1/admin/products/{id}, POST /api/v1/admin/products/{id}/images, PATCH /api/v1/admin/products/{id}/images/reorder, POST /api/v1/admin/products/{id}/variants/bulk-generate, PATCH /api/v1/admin/products/{id}/variants/{variant_id}, POST /api/v1/admin/products/bulk-action, POST /api/v1/admin/products/import-csv, GET /api/v1/admin/products/export-csv in backend/app/api/v1/admin/products.py
- [ ] T107 [US13] Implement InventoryService admin methods (adjust_stock, bulk_import_from_csv, get_inventory_by_variant) in backend/app/services/inventory_service.py
- [ ] T108 [US13] Implement admin inventory router: GET /api/v1/admin/inventory, POST /api/v1/admin/inventory/adjust, POST /api/v1/admin/inventory/import-csv in backend/app/api/v1/admin/inventory.py
- [ ] T109 [P] [US13] Create admin service functions (product CRUD, image upload, variant bulk-generate, bulk-action, CSV import/export, inventory adjust) in frontend/src/services/admin.service.ts
- [ ] T110 [US13] Create admin products list page (data table with search, category/status/stock-level filters, bulk select, bulk actions) at frontend/src/app/(admin)/products/page.tsx
- [ ] T111 [US13] Create admin product editor page (name, description, category multi-select, SEO fields, status, MOQ override) at frontend/src/app/(admin)/products/[id]/edit/page.tsx
- [ ] T112 [US13] Create ImageManager component (drag-drop upload, reorder handles, primary/alt-text editing) at frontend/src/components/admin/ImageManager.tsx
- [ ] T113 [US13] Create VariantGenerator component (color multi-input × size multi-input matrix preview, generate button) at frontend/src/components/admin/VariantGenerator.tsx
- [ ] T114 [US13] Create admin inventory management page (per-variant per-warehouse data table, adjust stock button) at frontend/src/app/(admin)/inventory/page.tsx

**Checkpoint**: Admin creates product → variants generated → images uploaded at 3 sizes → product visible in customer catalog with correct pricing.

---

## Phase 11: US-15 — Admin Customer & Wholesale Management (P1)

**Goal**: Admin manages wholesale company accounts (view, tier-assign, suspend, reactivate) and processes the wholesale approval queue.

**Independent Test**: Admin views pending application queue; approves application with pricing + shipping tier; company activates; admin suspends the company and users cannot log in.

### Implementation

- [x] T115 [P] [US15] Create Pydantic schemas for company admin operations (CompanyListItem, CompanyDetail, CompanyUpdate, SuspendRequest) in backend/app/schemas/company.py
- [x] T116 [US15] Implement CompanyService admin methods (list_companies_paginated, get_company_detail, update_company_tiers, suspend, reactivate, generate_price_list) in backend/app/services/company_service.py
- [x] T117 [US15] Implement admin companies router: GET /api/v1/admin/companies, GET /api/v1/admin/companies/{id}, PATCH /api/v1/admin/companies/{id}, POST /api/v1/admin/companies/{id}/suspend, POST /api/v1/admin/companies/{id}/reactivate in backend/app/api/v1/admin/customers.py
- [x] T118 [US15] Add company status check to auth middleware (return 403 if company.status == 'suspended' on login attempt) in backend/app/middleware/auth_middleware.py
- [x] T119 [US15] Create admin companies list page (data table with search, tier filter, order count, last order date) at frontend/src/app/(admin)/customers/page.tsx
- [x] T120 [US15] Create admin company detail page (profile, tier dropdowns, user list, contacts, recent orders, stats) at frontend/src/app/(admin)/customers/[id]/page.tsx
- [x] T121 [US15] Create admin wholesale applications queue page (list pending applications, approve/reject actions) at frontend/src/app/(admin)/customers/applications/page.tsx
- [x] T122 [US15] Create approval modal (pricing tier select + shipping tier select + admin notes) at frontend/src/components/admin/ApprovalModal.tsx

**Checkpoint**: Approval queue shows pending applications; approving activates company; suspending blocks login; company detail shows all sub-data.

---

## Phase 12: US-18 — Email Notification System (P1)

**Goal**: System sends transactional emails for all defined trigger events via Celery async queue with DB-stored Jinja2 templates and SendGrid delivery.

**Independent Test**: Order confirmed event queues email task; task renders template with order data; email arrives within 60 seconds.

### Implementation

- [x] T123 [P] [US18] Create Pydantic schemas for email template operations (EmailTemplateOut, EmailTemplateUpdate, PreviewRequest, PreviewResponse) in backend/app/schemas/email.py
- [x] T124 [US18] Implement EmailService (load_template_from_db, render_jinja2_template, send_via_sendgrid, queue_email_task) in backend/app/services/email_service.py
- [x] T125 [US18] Implement all email Celery tasks with 3-retry exponential backoff: send_order_confirmation_email, send_order_shipped_email, send_wholesale_approved_email, send_wholesale_rejected_email, send_password_reset_email, send_email_verification, send_user_invitation_email, send_rma_status_email, send_payment_failed_email in backend/app/tasks/email_tasks.py
- [x] T126 [US18] Implement admin email-templates router: GET /api/v1/admin/email-templates, GET /api/v1/admin/email-templates/{id}, PATCH /api/v1/admin/email-templates/{id}, POST /api/v1/admin/email-templates/{id}/preview, POST /api/v1/admin/email-templates/{id}/test in backend/app/api/v1/admin/settings.py
- [x] T127 [US18] Seed all 11 email templates with Jinja2 variable placeholders in scripts/seed_data.py (order_confirmation, order_shipped, wholesale_approved, wholesale_rejected, password_reset, email_verification, welcome, user_invitation, rma_approved, rma_rejected, payment_failed)
- [x] T128 [US18] Create admin email templates management page (list all templates, edit subject + body, variable reference) at frontend/src/app/(admin)/settings/email-templates/page.tsx
- [x] T129 [US18] Create EmailTemplateEditor component (rich text area for body, variable insertion button, preview pane) at frontend/src/components/admin/EmailTemplateEditor.tsx

**Checkpoint**: Order confirmation event triggers email task; Celery worker sends email via SendGrid; admin can preview and edit template.

---

## Phase 13: US-19 — Data Migration from Shopify (P1)

**Goal**: All Shopify products, customers, and historical orders are migrated with 100% count validation; 301 redirects and sitemap configured.

**Independent Test**: Run migration on staging; product count and image count match Shopify export; all 301 redirects return correct status; sitemap.xml contains all product URLs.

### Implementation

- [x] T130 [P] [US19] Implement Shopify product migration script (Shopify Admin API, map products→variants→categories, insert to DB) in scripts/migrate_products.py (supports --dry-run flag)
- [x] T131 [P] [US19] Implement Shopify customer migration script (fetch customers, map to companies + users, assign default pricing tier) in scripts/migrate_customers.py
- [x] T132 [US19] Implement image processing script (download Shopify CDN images, Pillow resize to 150/400/800px + WebP, upload to S3) in scripts/process_images.py
- [x] T133 [US19] Implement migration validation script (count products/variants/images/customers, check duplicate SKUs, output pass/fail report) in scripts/validate_migration.py
- [x] T134 [US19] Add 301 redirect map for all Shopify /products/slug and /collections/slug URLs in nginx/nginx.conf
- [x] T135 [US19] Implement sitemap.xml generation (all active products + categories with canonical URLs) in frontend/src/app/sitemap.ts
- [x] T136 [US19] Add Schema.org Product JSON-LD structured data to product detail page at frontend/src/app/(customer)/products/[slug]/page.tsx

**Checkpoint**: `python migrate_products.py --dry-run` reports correct counts; `python validate_migration.py` outputs all ✅; 301 redirects tested via curl; sitemap.xml validates.

---

## Phase 14: US-4 — Quick Order by SKU (P2)

**Goal**: Experienced buyers paste SKU,Quantity pairs or upload CSV; system validates against catalog and stock; valid items added to cart.

**Independent Test**: Paste 10 SKU/qty pairs with 2 invalid; validation shows 8 valid, 2 invalid; "Add Valid Items" adds only the 8 valid items.

### Implementation

- [x] T137 [P] [US4] Create Pydantic schemas for quick-order (SkuQuantityPair, QuickOrderRequest, QuickOrderResult, ValidationResultItem) in backend/app/schemas/cart.py
- [x] T138 [US4] Implement quick-order endpoint: POST /api/v1/cart/quick-order (validate each SKU — not found / insufficient stock / valid, return categorized results, add valid items to cart) in backend/app/api/v1/cart.py
- [x] T139 [US4] Extend CartService with validate_sku_list and bulk_add_validated_items methods in backend/app/services/cart_service.py
- [x] T140 [P] [US4] Create quick order page with SKU text area and CSV upload at frontend/src/app/(customer)/quick-order/page.tsx
- [x] T141 [US4] Create SkuInput component (multi-line textarea parsing SKU,Qty format + CSV file upload) at frontend/src/components/cart/SkuInput.tsx
- [x] T142 [US4] Create SkuValidationResults table (valid / invalid / insufficient stock columns with product info) at frontend/src/components/cart/SkuValidationResults.tsx

**Checkpoint**: Paste mixed valid/invalid/insufficient SKUs; validation categorizes correctly; "Add Valid Items" adds only valid items to cart.

---

## Phase 15: US-7 — Customer Account Dashboard (P2)

**Goal**: Comprehensive self-service dashboard with orders, profile, address book, user management, payment methods, statements, messages, templates, inventory report, price list.

**Independent Test**: Logged-in buyer navigates all 15 dashboard sections; each section loads correct data and allows edits.

### Implementation

- [x] T143 [P] [US7] Create Pydantic schemas for account operations (ProfileOut, ProfileUpdate, ContactCreate, UserInvite, RoleUpdate, StatementOut) in backend/app/schemas/account.py
- [x] T144 [US7] Implement account profile endpoints: GET /api/v1/account/profile, PATCH /api/v1/account/profile, PATCH /api/v1/account/change-password in backend/app/api/v1/account.py
- [x] T145 [US7] Implement account user management endpoints: GET /api/v1/account/users, POST /api/v1/account/users/invite, PATCH /api/v1/account/users/{id}, DELETE /api/v1/account/users/{id} (Owner role required) in backend/app/api/v1/account.py
- [x] T146 [US7] Implement account contacts endpoints: GET /api/v1/account/contacts, POST /api/v1/account/contacts, PATCH /api/v1/account/contacts/{id}, DELETE /api/v1/account/contacts/{id} in backend/app/api/v1/account.py
- [x] T147 [US7] Implement account statements endpoints: GET /api/v1/account/statements (filterable by date), GET /api/v1/account/statements/{id}/pdf (returns application/pdf) in backend/app/api/v1/account.py
- [x] T148 [US7] Implement account messages endpoints: GET /api/v1/account/messages, POST /api/v1/account/messages in backend/app/api/v1/account.py
- [x] T149 [US7] Implement account inventory-report endpoint: GET /api/v1/account/inventory-report (paginated variant stock, filterable by q/category/stock_level) in backend/app/api/v1/account.py
- [x] T150 [US7] Implement reorder endpoint: POST /api/v1/orders/{id}/reorder (copy order items to new cart, validate stock, apply current tier pricing) in backend/app/api/v1/orders.py
- [x] T151 [P] [US7] Create account service functions (getProfile, updateProfile, inviteUser, getOrders, getStatements, getMessages, sendMessage, getInventoryReport) in frontend/src/services/account.service.ts
- [x] T152 [P] [US7] Create account dashboard layout with sidebar navigation at frontend/src/app/(customer)/account/layout.tsx
- [x] T153 [US7] Create dashboard overview page (recent 5 orders, YTD spend, tier name, quick action links) at frontend/src/app/(customer)/account/page.tsx
- [x] T154 [US7] Create orders list page (status/date/PO number filters, click to order detail) at frontend/src/app/(customer)/account/orders/page.tsx
- [x] T155 [US7] Create order detail page (line items, tracking number, reorder button) at frontend/src/app/(customer)/account/orders/[id]/page.tsx
- [x] T156 [US7] Create profile edit page (personal info + company info sections) at frontend/src/app/(customer)/account/profile/page.tsx
- [x] T157 [US7] Create address book page (list addresses with labels, add/edit/delete, set default) at frontend/src/app/(customer)/account/addresses/page.tsx
- [x] T158 [US7] Create contacts management page (list contacts, notification preferences toggles) at frontend/src/app/(customer)/account/contacts/page.tsx
- [x] T159 [US7] Create user management page (Owner only: invite form, role dropdown, deactivate button) at frontend/src/app/(customer)/account/users/page.tsx
- [x] T160 [US7] Create payment methods page (list saved cards, add new, set default, remove) at frontend/src/app/(customer)/account/payment-methods/page.tsx
- [x] T161 [US7] Create statements page (date-filtered list, PDF download per statement) at frontend/src/app/(customer)/account/statements/page.tsx
- [x] T162 [US7] Create messages page (inbox with reply history, new message form) at frontend/src/app/(customer)/account/messages/page.tsx
- [x] T163 [US7] Create inventory report page (filterable table, CSV/PDF download buttons) at frontend/src/app/(customer)/account/inventory/page.tsx
- [x] T164 [US7] Create price list download section (PDF / Excel format buttons, poll status then download) at frontend/src/app/(customer)/account/price-list/page.tsx

**Checkpoint**: All 15 dashboard sections load and are functional; Owner-only sections enforce role check.

---

## Phase 16: US-8 — Reorder & Order Templates (P2)

**Goal**: Customers load past orders or saved templates into a new cart with current pricing and stock validation.

**Independent Test**: Click "Reorder" on a past order; new cart populates with current tier prices; out-of-stock item is flagged and excluded.

### Implementation

- [x] T165 [P] [US8] Implement account templates endpoints: GET /api/v1/account/templates, DELETE /api/v1/account/templates/{id}, POST /api/v1/account/templates/{id}/load in backend/app/api/v1/account.py
- [x] T166 [US8] Implement TemplateService (load_template_to_cart: validate each SKU, apply current pricing, flag discontinued) in backend/app/services/order_service.py
- [x] T167 [P] [US8] Create order templates management page (list templates, load button, delete button) at frontend/src/app/(customer)/account/templates/page.tsx
- [x] T168 [US8] Add "Reorder" button to order detail page that calls POST /api/v1/orders/{id}/reorder and redirects to cart at frontend/src/app/(customer)/account/orders/[id]/page.tsx

**Checkpoint**: Reorder populates cart with current prices; discontinued items excluded with message; saved templates load correctly.

---

## Phase 17: US-12 — Warehouse-Based Inventory Management (P2)

**Goal**: Admin tracks stock per variant per warehouse; customers see summed availability; every adjustment is logged; low-stock alerts fire.

**Independent Test**: Admin creates 2 warehouses; sets stock on same variant in each; customer sees summed total; admin adjusts stock with reason; audit log entry created.

### Implementation

- [x] T169 [P] [US12] Create Pydantic schemas for warehouse and inventory admin operations (WarehouseCreate, WarehouseOut, InventoryAdjustRequest, AdjustmentResult, BulkImportResult) in backend/app/schemas/inventory.py
- [x] T170 [US12] Extend InventoryService with (get_summed_stock_by_variant, adjust_stock_with_log, bulk_import_csv, get_low_stock_variants) in backend/app/services/inventory_service.py
- [x] T171 [US12] Implement admin warehouses router: GET /api/v1/admin/warehouses, POST /api/v1/admin/warehouses, PATCH /api/v1/admin/warehouses/{id} in backend/app/api/v1/admin/inventory.py
- [x] T172 [US12] Implement low-stock detection Celery task (periodic: scan all variants below threshold, add alert to admin dashboard) in backend/app/tasks/inventory_tasks.py
- [x] T173 [P] [US12] Create admin inventory management page (variant/warehouse grid, adjust stock button, low-stock filter) at frontend/src/app/(admin)/inventory/page.tsx
- [x] T174 [US12] Create admin warehouses management page (list warehouses, create/edit form) at frontend/src/app/(admin)/inventory/warehouses/page.tsx
- [x] T175 [US12] Create StockAdjustmentModal component (reason code dropdown: Received/Damaged/Returned/Correction/Sold, old qty display, new qty input) at frontend/src/components/admin/StockAdjustmentModal.tsx

**Checkpoint**: Create 2 warehouses; set inventory; customer sees summed total; admin adjustment creates audit log entry; low-stock Celery task runs on schedule.

---

## Phase 18: US-14 — Admin Order Management (P2)

**Goal**: Admin views, searches, updates, cancels orders; enters tracking numbers (triggers email); exports CSV; manages RMAs.

**Independent Test**: Admin searches by PO number; updates status to Shipped with tracking number; customer receives shipping email; manual QB sync triggered.

### Implementation

- [x] T176 [P] [US14] Extend Pydantic schemas for admin order operations (AdminOrderListItem, AdminOrderDetail, OrderUpdateRequest, CancelOrderRequest, SyncResult) in backend/app/schemas/order.py
- [x] T177 [US14] Implement admin orders router: GET /api/v1/admin/orders (search + filters), GET /api/v1/admin/orders/{id}, PATCH /api/v1/admin/orders/{id} (status/tracking/notes), POST /api/v1/admin/orders/{id}/cancel, POST /api/v1/admin/orders/{id}/sync-quickbooks, GET /api/v1/admin/orders/export-csv in backend/app/api/v1/admin/orders.py
- [ ] T178 [US14] Extend OrderService with admin methods (update_order_status, cancel_with_refund, trigger_manual_qb_sync, export_csv) in backend/app/services/order_service.py
- [x] T179 [US14] Implement RMA router: GET /api/v1/account/rma, POST /api/v1/account/rma, GET /api/v1/account/rma/{id} in backend/app/api/v1/account.py
- [x] T180 [US14] Implement admin RMA router: GET /api/v1/admin/rma, PATCH /api/v1/admin/rma/{id} (approve/reject with notes) in backend/app/api/v1/admin/orders.py
- [x] T181 [P] [US14] Create admin orders list page (search bar, status/payment/date/company filters, export CSV button) at frontend/src/app/(admin)/orders/page.tsx
- [x] T182 [US14] Create admin order detail page (customer info, line items, cost breakdown, payment + QB status, action buttons: update status, enter tracking, cancel, manual QB sync) at frontend/src/app/(admin)/orders/[id]/page.tsx
- [x] T183 [US14] Create admin RMA management page (list RMAs, approve/reject actions with notes) at frontend/src/app/(admin)/returns/page.tsx
- [x] T184 [US14] Create RMA submission form in customer account at frontend/src/app/(customer)/account/rma/page.tsx (select order, select items with reason + photos)

**Checkpoint**: Admin finds order by PO number; entering tracking number triggers shipping email; export returns valid CSV; RMA submitted and approved.

---

## Phase 19: US-16 — Admin Reporting & Analytics (P2)

**Goal**: Admin views sales, inventory, and customer reports with date range filters; all reports exportable as CSV within 10 seconds.

**Independent Test**: Admin opens sales report for Q1 2026; sees revenue by week, by category, top 10 products; exports CSV successfully.

### Implementation

- [x] T185 [P] [US16] Implement admin sales report endpoint: GET /api/v1/admin/reports/sales (period_data, by_category, top_products grouped by day|week|month) in backend/app/api/v1/admin/reports.py
- [x] T186 [P] [US16] Implement admin inventory report endpoint: GET /api/v1/admin/reports/inventory (stock_levels, low_stock, movement filtered by warehouse) in backend/app/api/v1/admin/reports.py
- [x] T187 [P] [US16] Implement admin customer report endpoint: GET /api/v1/admin/reports/customers (new_registrations, approval_rate, avg_order_value_by_tier) in backend/app/api/v1/admin/reports.py
- [x] T188 [US16] Implement report CSV export endpoint: GET /api/v1/admin/reports/{type}/export-csv in backend/app/api/v1/admin/reports.py
- [x] T189 [P] [US16] Create admin reports dashboard with date range picker at frontend/src/app/(admin)/reports/page.tsx
- [x] T190 [US16] Create sales report page (revenue by period line chart, by category bar chart, top products table) at frontend/src/app/(admin)/reports/sales/page.tsx
- [x] T191 [US16] Create inventory report page (stock levels table, low stock alerts, movement history) at frontend/src/app/(admin)/reports/inventory/page.tsx
- [x] T192 [US16] Create customer report page (registrations trend, approval rate, AOV by tier) at frontend/src/app/(admin)/reports/customers/page.tsx

**Checkpoint**: All 3 report types load; date range filter updates data; CSV export downloads within 10 seconds.

---

## Phase 20: US-17 — QuickBooks Integration (P2)

**Goal**: Customer records and order invoices sync to QuickBooks Online asynchronously with exponential backoff retry; admin monitors sync status.

**Independent Test**: Approve a company; within 60 seconds a customer record exists in QB sandbox; place and pay an order; QB invoice created with correct line items and PO number.

### Implementation

- [x] T193 [P] [US17] Implement QuickBooksService (oauth_token_management, create_customer, create_invoice_with_line_items, refresh_token_if_expired, token_bucket_rate_limiter at 400 req/min) in backend/app/services/quickbooks_service.py
- [x] T194 [US17] Implement QuickBooks Celery tasks: sync_customer_to_qb, sync_order_invoice_to_qb — both with exponential backoff (max 5 retries), log all attempts to qb_sync_log in backend/app/tasks/quickbooks_tasks.py
- [x] T195 [US17] Implement admin QB dashboard router: GET /api/v1/admin/quickbooks/status (last_sync_at, synced_today, failed_syncs list), POST /api/v1/admin/quickbooks/retry/{log_id} in backend/app/api/v1/admin/quickbooks.py
- [x] T196 [US17] Create admin QuickBooks sync dashboard page (last sync time, today's count, failed syncs table with retry buttons) at frontend/src/app/(admin)/settings/quickbooks/page.tsx

**Checkpoint**: Company approval triggers QB customer sync task; order payment triggers QB invoice sync task; failures logged and retryable from admin UI.

---

## Phase 21: US-20 — Audit Logging (P2)

**Goal**: All admin write operations automatically logged with old/new values, admin user, timestamp, and IP; searchable audit log viewer in admin panel.

**Independent Test**: Admin changes a product price; audit log shows action=UPDATE, entity=Product, old/new values, admin user, timestamp, and IP address.

### Implementation

- [x] T197 [US20] Verify audit middleware (T029) intercepts all admin PATCH/POST/DELETE routes and correctly captures old value (pre-update DB fetch), new value, action type, entity type, entity ID, IP address in backend/app/middleware/audit_middleware.py
- [x] T198 [US20] Implement admin audit-log router: GET /api/v1/admin/audit-log (filterable by admin_user_id, entity_type, entity_id, date_from, date_to, paginated) in backend/app/api/v1/admin/settings.py
- [x] T199 [P] [US20] Create admin audit log viewer page (date range filter, user filter, entity type filter, paginated table) at frontend/src/app/(admin)/settings/audit-log/page.tsx
- [x] T200 [US20] Create AuditLogDetail component (diff view: old value fields vs new value fields side-by-side) at frontend/src/components/admin/AuditLogDetail.tsx

**Checkpoint**: Edit product price → audit log entry created; admin searches by entity type → matching entries appear; detail view shows field-level diff.

---

## Phase 22: US-9 — Product Asset Access (P3)

**Goal**: Wholesale customers can download product images as ZIP and marketing flyers as PDF; bulk download across multiple products.

**Independent Test**: Customer clicks "Download Images" on product detail; ZIP downloads containing all high-resolution images.

### Implementation

- [x] T201 [P] [US9] Implement product asset download endpoints: GET /api/v1/products/{id}/download-images (stream ZIP of S3 images), GET /api/v1/products/{id}/download-flyer (redirect to S3 PDF), POST /api/v1/products/{id}/email-flyer (queue email task) in backend/app/api/v1/products.py
- [x] T202 [US9] Implement bulk asset download endpoint: POST /api/v1/products/bulk-download (accept list of product_ids, queue Celery ZIP generation task, return task_id) in backend/app/api/v1/products.py
- [x] T203 [US9] Implement ZIP generation Celery task (collect all images/flyers for selected products from S3, create ZIP, upload to S3, return download URL) in backend/app/tasks/inventory_tasks.py
- [x] T204 [P] [US9] Add "Download Images" and "Download Flyer" and "Email Flyer" buttons to product detail page at frontend/src/app/(customer)/products/[slug]/page.tsx
- [x] T205 [US9] Add bulk product selection checkboxes and "Bulk Download" button to product catalog page at frontend/src/app/(customer)/products/page.tsx

**Checkpoint**: Download Images returns valid ZIP; Download Flyer downloads PDF; bulk download for 3 products returns ZIP with all assets.

---

## Phase 23: Polish & Cross-Cutting Concerns

**Purpose**: System settings, admin dashboard home, shared layout components, rate limiting, error monitoring, performance, and launch readiness.

- [x] T206 [P] Implement admin settings endpoints: GET /api/v1/admin/settings, PATCH /api/v1/admin/settings (MOV, MOQ, guest pricing mode, tax rate, low-stock threshold) with Redis cache invalidation in backend/app/api/v1/admin/settings.py
- [x] T207 [P] Create admin system settings page (MOV, MOQ, guest pricing mode selector, tax rate, notification email) at frontend/src/app/(admin)/settings/page.tsx
- [x] T208 [P] Implement abandoned cart detection Celery task (periodic: flag cart_items inactive >24h, snapshot to abandoned_carts) in backend/app/tasks/cart_tasks.py
- [x] T209 [P] Add Redis-backed rate limiting middleware (100 req/min per IP on all unauthenticated endpoints) in backend/app/middleware/auth_middleware.py
- [x] T210 [P] Initialize Sentry error tracking in backend/app/main.py and frontend/src/app/layout.tsx
- [x] T211 [P] Create admin dashboard home page (sales summary widget, pending applications count, low-stock alert count, recent QB sync failures) at frontend/src/app/(admin)/dashboard/page.tsx
- [x] T212 [P] Create shared layout components (Header with cart count + user menu, Footer, AdminSidebar, CustomerSidebar, Breadcrumb) at frontend/src/components/layout/
- [x] T213 Ensure all product images use Next.js Image component with Cloudflare CDN base URL across all frontend pages
- [x] T214 [P] Configure Let's Encrypt SSL certificate and HTTPS redirect in nginx/nginx.conf with certbot auto-renewal
- [x] T215 [P] Create k6 load test script for product listing endpoint (500 VUs, 60s duration, assert p95 < 200ms, error rate < 1%) in scripts/load-tests/product-listing.js
- [x] T216 Run all quickstart.md phase validation flows (Phase 1–6) and verify all gates pass

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Requires Phase 1 complete — **BLOCKS all user stories**
- **US-1 (Phase 3)**: Requires Foundational — first story to implement (login/auth gates all buyer features)
- **US-10 (Phase 4)**: Requires Foundational — pricing engine needed for all product displays
- **US-11 (Phase 5)**: Requires Foundational — shipping needed for checkout
- **US-2 (Phase 6)**: Requires US-1 (login) + US-10 (tier pricing)
- **US-3 (Phase 7)**: Requires US-2 (product detail page) + US-10 (pricing)
- **US-5 (Phase 8)**: Requires US-3 (cart must have items) + US-11 (shipping estimate)
- **US-6 (Phase 9)**: Requires US-5 (cart validation) + US-11 (shipping cost) + US-18 stubs (confirmation email)
- **US-13 (Phase 10)**: Requires Foundational (products/inventory models)
- **US-15 (Phase 11)**: Requires US-1 (company/user creation flow)
- **US-18 (Phase 12)**: Requires Foundational (Celery + email templates seeded)
- **US-19 (Phase 13)**: Requires US-13 (product models exist for import)
- **US-4 (Phase 14)**: Requires US-5 (cart endpoints exist)
- **US-7 (Phase 15)**: Requires US-6 (order history exists) + US-1 (user management)
- **US-8 (Phase 16)**: Requires US-7 (order detail page)
- **US-12 (Phase 17)**: Requires Foundational (inventory models)
- **US-14 (Phase 18)**: Requires US-6 (orders exist) + US-17 stubs (QB sync trigger)
- **US-16 (Phase 19)**: Requires US-14 (order data)
- **US-17 (Phase 20)**: Requires US-1 (company approval) + US-6 (orders)
- **US-20 (Phase 21)**: Requires Foundational (audit middleware stub from T029)
- **US-9 (Phase 22)**: Requires US-13 (product assets exist)
- **Polish (Phase 23)**: Requires all desired stories complete

### User Story Dependencies (Graph)

```
Setup → Foundational → US-1 → US-10 → US-2 → US-3 → US-5 → US-6 (critical path)
                   ↓         ↓         ↓
                 US-11 ────────────────┘
                 US-13 → US-19
                 US-15 (uses US-1 company flow)
                 US-18 (stubs in US-1, full in Phase 12)
                 US-17 (stubs in US-1, full in Phase 20)
                 US-6 → US-7 → US-8
                 US-5 → US-4
                 US-14 → US-16
                 Foundational → US-12 → US-14
                 US-13 → US-9
```

### Parallel Opportunities Per Story

```bash
# Phase 3 (US-1) — parallel backend schemas + frontend store:
T037: Pydantic wholesale schemas
T038: Pydantic auth schemas
T045: Zustand auth store
T046: Auth service functions (frontend)

# Phase 2 (Foundational) — all models can be created in parallel:
T017: company.py, T018: user.py, T019: product.py,
T020: inventory.py, T021: pricing.py, T022: order.py,
T023: rma.py, T024: wholesale.py, T025: communication.py, T026: system.py

# Phase 10 (US-13) — frontend + backend in parallel after schemas:
T109: admin service functions (frontend)
T110: admin products list page
T111: admin product editor
T112: ImageManager component
T113: VariantGenerator component
```

---

## Implementation Strategy

### MVP First (US-1 Only — Phases 1–3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: US-1 — Wholesale Registration & Approval
4. **STOP and VALIDATE**: Submit application → approve → log in → verify JWT contains pricing_tier_id
5. Can demo: registration form, admin approval queue, buyer login

### Core Commerce MVP (Phases 1–9)

1. Setup + Foundational (Phases 1–2)
2. US-1 Registration (Phase 3)
3. US-10 Pricing Engine (Phase 4)
4. US-11 Shipping (Phase 5)
5. US-2 Catalog (Phase 6)
6. US-3 Variant Matrix (Phase 7)
7. US-5 Cart (Phase 8)
8. US-6 Checkout (Phase 9)
9. **Platform can process real wholesale orders**

### Full Platform Delivery (All 23 Phases)

Complete Phases 10–23 after core commerce MVP is validated.

---

## Notes

- **[P]** tasks operate on different files with no dependencies on incomplete tasks in the same phase
- **[US#]** label maps tasks to specific user stories for traceability
- Tests not included (not requested in spec — add `/sp.tasks --tdd` for TDD variant)
- Commit after each task or logical group using conventional commit format (feat:, fix:, chore:)
- Each phase checkpoint validates that story is independently functional before proceeding
- Stubs created in early phases (email_tasks.py, quickbooks_tasks.py) are completed in their dedicated phases
- All monetary values use DECIMAL(10,2) — never float — per constitution Article VI
- All admin write endpoints automatically trigger audit middleware (T029) from Phase 2
