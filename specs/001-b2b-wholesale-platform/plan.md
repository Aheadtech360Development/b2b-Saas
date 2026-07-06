# Implementation Plan: AF Apparels B2B Wholesale Platform

**Branch**: `001-b2b-wholesale-platform` | **Date**: 2026-03-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-b2b-wholesale-platform/spec.md`

---

## Summary

Build a custom B2B wholesale e-commerce platform to replace an existing Shopify store. The
platform provides wholesale buyers with tier-based pricing, bulk variant-matrix ordering,
MOQ/MOV enforcement, and multi-step checkout with PO number support — while giving the
AF Apparels admin team full control over products, inventory (multi-warehouse), orders,
pricing tiers, shipping tiers, QuickBooks sync, and transactional emails. A one-time
Shopify data migration with 100% validation and SEO redirects is included.

**Technical Approach**: Two-service architecture — Next.js 15 (App Router, TypeScript) frontend
+ FastAPI (Python 3.11+) backend — communicating exclusively via versioned REST API. PostgreSQL
for persistence, Redis for sessions/caching/queue-broker, Celery for async jobs (QB sync, email,
price list generation). Stripe for payments, QuickBooks Online API for one-way accounting sync,
SendGrid for transactional email, AWS S3 + Cloudflare CDN for media.

---

## Technical Context

**Language/Version**: Python 3.11+ (backend), TypeScript 5.x strict (frontend)
**Primary Dependencies**: FastAPI + SQLAlchemy 2.x + Celery (backend); Next.js 15 App Router + shadcn/ui + Zustand (frontend)
**Storage**: PostgreSQL 16/17 (primary), Redis 7.x (sessions/cache/broker)
**Testing**: pytest + pytest-asyncio + FastAPI TestClient + Factory Boy (backend); Vitest + React Testing Library + Playwright (frontend)
**Target Platform**: Ubuntu 24.04 LTS VPS (DigitalOcean), NGINX reverse proxy
**Project Type**: web
**Performance Goals**: < 3s page load (Lighthouse ≥ 90), < 200ms API p95, 500 concurrent users
**Constraints**: PCI compliance via Stripe Elements (card data never touches server), 99.9% uptime, mobile-responsive
**Scale/Scope**: 5,000+ products, 50,000+ potential products, 500,000+ orders over lifetime

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Article | Requirement | Status | Evidence |
|---|---|---|---|
| I — Architecture | Two-service: Next.js frontend + FastAPI backend | ✅ PASS | Strict API boundary at `/api/v1/`; no direct DB access from frontend |
| I — Architecture | All endpoints versioned under `/api/v1/` | ✅ PASS | All routes defined under `backend/app/api/v1/` |
| I — Architecture | Redis not used as primary data store | ✅ PASS | Redis used only for sessions, cache, broker |
| I — Architecture | Celery jobs idempotent and retryable | ✅ PASS | Idempotency via webhook_log event_id dedup, exponential backoff |
| II — Technology | Latest stable versions | ✅ PASS | Verified at implementation time per constitution |
| II — Technology | TypeScript strict mode | ✅ PASS | Enforced in `tsconfig.json` |
| II — Technology | Dependencies pinned in lock files | ✅ PASS | `package-lock.json` and `requirements.txt` with pinned versions |
| III — Code Quality | Business logic in service layer | ✅ PASS | `backend/app/services/` holds all business logic |
| III — Code Quality | No direct fetch in components | ✅ PASS | All API calls via `lib/api-client.ts` → `services/` |
| III — Code Quality | Pydantic v2 for all request/response | ✅ PASS | `backend/app/schemas/` |
| III — Code Quality | All writes in DB transactions | ✅ PASS | SQLAlchemy async session context managers |
| IV — Testing | Coverage targets defined | ✅ PASS | 70% overall, 90% critical paths (auth/checkout/payment/pricing) |
| IV — Testing | Factory Boy for test data | ✅ PASS | `backend/tests/factories/` |
| IV — Testing | External services mocked in unit/integration tests | ✅ PASS | Stripe, QB, SendGrid mocked; E2E uses sandbox |
| V — Security | bcrypt passwords, JWT 15-min TTL, refresh 7-day httpOnly | ✅ PASS | `backend/app/core/security.py` |
| V — Security | Rate limiting 100 req/min public endpoints | ✅ PASS | Redis-backed rate limiter middleware |
| V — Security | PCI via Stripe Elements | ✅ PASS | Card data never touches server |
| VI — Database | id + created_at + updated_at on all tables | ✅ PASS | Base model mixin applied to all models |
| VI — Database | All monetary values DECIMAL(10,2) | ✅ PASS | Verified in data model |
| VI — Database | All datetimes UTC | ✅ PASS | Python datetime.utcnow() / timezone-aware |
| VI — Database | Soft deletes for business entities | ✅ PASS | `status` field on products, companies, users |
| VI — Database | Alembic upgrade() + downgrade() | ✅ PASS | Migration discipline enforced |
| VII — Phase-Based | 8 phases with quality gates | ✅ PASS | Phases 1–8 defined with explicit quality gates |
| VIII — Error Handling | Consistent error format | ✅ PASS | `{"error": {"code": ..., "message": ..., "details": [...]}}` |
| IX — Performance | Lighthouse ≥ 90, API < 200ms p95, < 3s page load | ✅ PASS | Redis caching, CDN, eager loading |
| X — Documentation | OpenAPI auto-generated | ✅ PASS | FastAPI auto-generates at `/docs` |

**Constitution Gate: ✅ ALL PASS — Proceed to Phase 0.**

---

## Project Structure

### Documentation (this feature)

```text
specs/001-b2b-wholesale-platform/
├── plan.md              # This file (/sp.plan command output)
├── research.md          # Phase 0 output (/sp.plan command)
├── data-model.md        # Phase 1 output (/sp.plan command)
├── quickstart.md        # Phase 1 output (/sp.plan command)
├── checklists/
│   └── requirements.md  # Spec quality checklist
├── contracts/           # Phase 1 output (/sp.plan command)
│   ├── auth.md
│   ├── products.md
│   ├── cart-checkout.md
│   ├── orders.md
│   ├── account.md
│   ├── wholesale.md
│   ├── admin.md
│   ├── inventory.md
│   ├── pricing-shipping.md
│   ├── quickbooks.md
│   ├── email.md
│   └── webhooks.md
└── tasks.md             # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
af-apparels/
├── frontend/                          # Next.js 15 App Router application
│   ├── src/
│   │   ├── app/                       # App Router pages
│   │   │   ├── (auth)/                # login, register, forgot-password
│   │   │   ├── (customer)/
│   │   │   │   ├── products/          # catalog list + [slug] detail + bulk-order
│   │   │   │   ├── cart/
│   │   │   │   ├── checkout/          # 4-step checkout flow
│   │   │   │   ├── account/           # dashboard, orders, profile, addresses...
│   │   │   │   └── wholesale/         # registration form, pending status
│   │   │   ├── (admin)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── products/
│   │   │   │   ├── inventory/
│   │   │   │   ├── orders/
│   │   │   │   ├── customers/
│   │   │   │   ├── pricing/
│   │   │   │   ├── shipping/
│   │   │   │   ├── reports/
│   │   │   │   └── settings/
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── ui/                    # shadcn/ui primitives
│   │   │   ├── layout/
│   │   │   ├── products/              # ProductCard, VariantMatrix, FilterSidebar
│   │   │   ├── cart/                  # CartItem, CartSummary, MOQWarning
│   │   │   ├── checkout/              # CheckoutSteps, AddressSelector, PaymentForm
│   │   │   ├── account/
│   │   │   └── admin/
│   │   ├── lib/
│   │   │   ├── api-client.ts          # Centralized API client with JWT auto-refresh
│   │   │   ├── utils.ts
│   │   │   └── constants.ts
│   │   ├── services/                  # One service file per backend domain
│   │   │   ├── auth.service.ts
│   │   │   ├── products.service.ts
│   │   │   ├── cart.service.ts
│   │   │   ├── orders.service.ts
│   │   │   ├── account.service.ts
│   │   │   └── admin.service.ts
│   │   ├── stores/                    # Zustand (cart + auth only)
│   │   │   ├── auth.store.ts
│   │   │   └── cart.store.ts
│   │   └── types/
│   │       ├── product.types.ts
│   │       ├── order.types.ts
│   │       ├── user.types.ts
│   │       └── api.types.ts
│   ├── tests/
│   │   ├── components/
│   │   ├── services/
│   │   └── e2e/                       # Playwright E2E tests
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── tsconfig.json                  # strict: true
│   ├── vitest.config.ts
│   ├── playwright.config.ts
│   └── package.json
│
├── backend/                           # FastAPI application
│   ├── app/
│   │   ├── api/
│   │   │   └── v1/                    # All routes versioned
│   │   │       ├── auth.py
│   │   │       ├── products.py
│   │   │       ├── cart.py
│   │   │       ├── checkout.py
│   │   │       ├── orders.py
│   │   │       ├── account.py
│   │   │       ├── wholesale.py
│   │   │       ├── admin/
│   │   │       │   ├── products.py
│   │   │       │   ├── inventory.py
│   │   │       │   ├── orders.py
│   │   │       │   ├── customers.py
│   │   │       │   ├── pricing.py
│   │   │       │   ├── shipping.py
│   │   │       │   ├── rma.py
│   │   │       │   ├── reports.py
│   │   │       │   ├── settings.py
│   │   │       │   └── quickbooks.py
│   │   │       └── webhooks.py
│   │   ├── models/                    # SQLAlchemy ORM models
│   │   │   ├── company.py
│   │   │   ├── user.py
│   │   │   ├── product.py
│   │   │   ├── inventory.py
│   │   │   ├── order.py
│   │   │   ├── pricing.py
│   │   │   ├── shipping.py
│   │   │   ├── rma.py
│   │   │   └── system.py
│   │   ├── schemas/                   # Pydantic v2 request/response models
│   │   │   ├── auth.py
│   │   │   ├── product.py
│   │   │   ├── order.py
│   │   │   ├── company.py
│   │   │   ├── inventory.py
│   │   │   ├── pricing.py
│   │   │   └── shipping.py
│   │   ├── services/                  # All business logic here
│   │   │   ├── auth_service.py
│   │   │   ├── product_service.py
│   │   │   ├── cart_service.py
│   │   │   ├── order_service.py
│   │   │   ├── pricing_service.py
│   │   │   ├── shipping_service.py
│   │   │   ├── inventory_service.py
│   │   │   ├── payment_service.py
│   │   │   ├── quickbooks_service.py
│   │   │   ├── email_service.py
│   │   │   └── pricelist_service.py
│   │   ├── middleware/
│   │   │   ├── auth_middleware.py
│   │   │   ├── pricing_middleware.py
│   │   │   └── audit_middleware.py
│   │   ├── tasks/                     # Celery tasks
│   │   │   ├── email_tasks.py
│   │   │   ├── quickbooks_tasks.py
│   │   │   ├── pricelist_tasks.py
│   │   │   ├── inventory_tasks.py
│   │   │   └── cart_tasks.py
│   │   ├── core/
│   │   │   ├── config.py
│   │   │   ├── database.py
│   │   │   ├── redis.py
│   │   │   ├── security.py
│   │   │   └── exceptions.py
│   │   └── main.py
│   ├── migrations/
│   │   ├── versions/
│   │   └── env.py
│   ├── tests/
│   │   ├── factories/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── conftest.py
│   ├── alembic.ini
│   ├── requirements.txt
│   ├── celeryconfig.py
│   └── pyproject.toml
│
├── scripts/
│   ├── migrate_products.py
│   ├── migrate_customers.py
│   ├── process_images.py
│   └── seed_data.py
│
├── docker-compose.yml
├── .env.example
├── .github/
│   └── workflows/
│       ├── backend-tests.yml
│       ├── frontend-tests.yml
│       └── deploy.yml
└── README.md
```

**Structure Decision**: Web application (Option 2) — `frontend/` for Next.js, `backend/` for
FastAPI. This is the canonical two-service layout required by Article I of the constitution.

---

## Complexity Tracking

> No constitution violations detected. No complexity tracking required.

---

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Frontend Framework | Next.js 15 (App Router, TypeScript) | SSR for SEO, built-in image optimization, mature e-commerce ecosystem |
| UI Library | Tailwind CSS + shadcn/ui | Rapid styling, accessible components, consistent design system |
| Client State | Zustand | Lightweight; used only for cart and auth state per constitution |
| Backend Framework | FastAPI (Python 3.11+) | Async support, automatic OpenAPI docs, mature QB/Stripe libraries |
| ORM | SQLAlchemy 2.x + Alembic | Type-safe async queries, migration rollback support |
| Database | PostgreSQL 16/17 | Complex relational model, full-text search via tsvector |
| Cache/Broker | Redis 7.x | Sessions, cart, rate limiting, Celery broker, read caching |
| Background Jobs | Celery + Redis broker | Email, QB sync, price lists, bulk imports, abandoned cart detection |
| Payments | Stripe (Payment Intents + Elements) | PCI compliance via Elements, idempotency keys, webhooks |
| Accounting | QuickBooks Online API (one-way MVP) | Client requirement; customer + invoice sync |
| Email | SendGrid API | Transactional delivery, template support, tracking |
| File Storage | AWS S3 + Cloudflare CDN | Product images, flyers, PDFs; global edge delivery |
| Image Processing | Pillow (Python, backend) | Resize to 3 sizes + WebP on upload; consistent processing path |
| Testing FE | Vitest + RTL + Playwright | Fast unit tests, user-centric component tests, E2E |
| Testing BE | pytest + asyncio + TestClient + Factory Boy | Async test support, built-in API testing, realistic data |
| CI/CD | GitHub Actions | PR tests, staging on develop merge, production on main merge |
| Hosting | DigitalOcean VPS (Ubuntu 24.04 LTS) | Full control, cost-effective, staging + production |
| Web Server | NGINX | Reverse proxy for frontend (:3000) and backend (:8000), SSL termination |
| Monitoring | Sentry + UptimeRobot | Error tracking, 5-min uptime checks, alerting |
| SSL | Let's Encrypt + certbot | Auto-renewal every 90 days |
| CDN | Cloudflare (free tier) | Static asset caching, DDoS protection, global edge |

---

## Authentication & Authorization

### Flow

1. `POST /api/v1/auth/login` → validate credentials + account status
2. Issue JWT access token (15-min TTL; payload: `user_id`, `company_id`, `role`,
   `pricing_tier_id`, `is_admin`) + refresh token (7-day TTL, httpOnly cookie, one-time use)
3. Frontend stores access token in Zustand auth store (memory only)
4. All API calls attach `Authorization: Bearer <token>`
5. On 401 → `api-client.ts` auto-calls `POST /api/v1/auth/refresh`
6. New access token + rotated refresh token returned; original request retried
7. Logout → refresh token blacklisted in Redis; access token expires naturally (15 min)

### Role Enforcement

RBAC enforced via FastAPI middleware and dependencies:
- `require_authenticated()` — any logged-in user
- `require_customer()` — non-admin user with active approved company
- `require_owner()` — company_users.role == 'owner'
- `require_admin()` — user.is_admin == True

---

## Caching Strategy

| Data | Store | TTL | Invalidation Trigger |
|---|---|---|---|
| User sessions | Redis | 24 hours | Logout, password change |
| Guest carts | Redis | 7 days | Checkout, manual clear |
| Product listings (paginated) | Redis | 5 min | Product create/update/delete |
| Search results | Redis | 2 min | Product create/update/delete |
| Product detail | Redis | 10 min | Product update |
| Category tree | Redis | 1 hour | Category create/update/delete |
| Pricing tier data | Redis | 1 hour | Tier update |
| Shipping tiers + brackets | Redis | 1 hour | Tier or bracket update |
| System settings (MOQ, MOV) | Redis | 1 hour | Settings update |

Invalidation pattern: service layer deletes cache keys immediately after successful write.

---

## Webhook Infrastructure

### Inbound Webhooks

| Source | Endpoint | Events | Security |
|---|---|---|---|
| Stripe | `POST /api/v1/webhooks/stripe` | `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded` | Stripe-Signature header HMAC |

### Processing Pattern (idempotent)

1. Validate signature immediately → 400 if invalid
2. Check `webhook_log.event_id` for duplicates → 200 OK if already processed
3. Insert `webhook_log` record with status `received`
4. Return 200 OK immediately
5. Dispatch to Celery task for processing
6. Task updates `webhook_log.status` to `processed` or `failed`

---

## API Error Format

All error responses follow:

```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Product not found",
    "details": []
  }
}
```

Standard error codes: `UNAUTHORIZED`, `FORBIDDEN`, `VALIDATION_ERROR`,
`RESOURCE_NOT_FOUND`, `CONFLICT`, `PAYMENT_FAILED`, `OUT_OF_STOCK`,
`MOQ_NOT_MET`, `MOV_NOT_MET`, `INTERNAL_ERROR`.

---

## Implementation Phases

### Phase 1: Foundation & Infrastructure
**Objective**: Servers, database schema, dev environment, CI/CD pipeline, tooling.
**Prerequisites**: Shopify API access, domain access, branding assets, pricing/shipping tier
structure, warehouse list, MOQ/MOV values.
**Quality Gate**: Both services start locally, DB schema deployed via Alembic, CI runs green,
NGINX configured, Docker Compose starts PostgreSQL + Redis.
**Manual Test**: `docker compose up`, run `alembic upgrade head`, both services start without
errors, test suite runs green.

### Phase 2: Core Backend Development
**Objective**: All REST API endpoints — auth, catalog, cart, checkout, orders, pricing,
shipping, wholesale registration, payments (Stripe), email notifications, audit logging.
**Quality Gate**: pytest coverage ≥ 85% overall, ≥ 90% on auth/checkout/payment/pricing
endpoints. All endpoints documented in OpenAPI (`/docs`).
**Manual Test**: Full Postman flow: register → login → browse products → add to cart →
checkout → create order → verify in DB and QB sandbox.

### Phase 3: Frontend Development
**Objective**: All customer-facing pages — catalog, product detail, variant matrix, quick
order, cart, checkout (4 steps), account dashboard (all sections).
**Quality Gate**: Vitest coverage ≥ 65% components, Playwright E2E passing, Lighthouse ≥ 90
on product listing and detail, mobile responsive (375px viewport tested).
**Manual Test**: Browse catalog, use variant matrix, place test order through full checkout,
verify customer dashboard on mobile viewport.

### Phase 4: Admin Panel & Integrations
**Objective**: Complete admin panel — product management, inventory, orders, customers,
pricing/shipping tiers, reports. QuickBooks integration (customer sync + invoice creation).
**Quality Gate**: All admin workflows functional, QB sandbox sync verified, audit log
captures all admin writes.
**Manual Test**: Create product, approve wholesale customer, process order, verify QB
sandbox invoice, review audit log.

### Phase 5: Data Migration & SEO
**Objective**: Migrate all Shopify data (products, customers, orders), process images
(3 sizes + WebP), configure 301 redirects, generate sitemap.
**Quality Gate**: 100% data count validation (products, variants, images), all redirects
return 301, sitemap submitted to Google Search Console.
**Manual Test**: Verify migrated products display correctly, test 5 old Shopify URLs
redirect to correct new URLs, verify customer accounts work post-migration.

### Phase 6: Testing & Hardening
**Objective**: Full regression testing, load testing (500 concurrent users), security
audit, performance optimization, client UAT on staging.
**Quality Gate**: All tests pass, Lighthouse ≥ 90, load test at 500 users shows API p95
< 200ms, security scan clean, client sign-off.
**Manual Test**: Full E2E staging walkthrough: guest → registration → approval → bulk order
→ checkout → admin processing → QB sync → email verification.

### Phase 7: Deployment & Launch
**Objective**: Production deployment, DNS cutover, go-live, monitoring activation, team
training.
**Quality Gate**: Platform live, first real orders processed, no critical errors in 48 hours,
admin team trained and independently managing the platform.
**Manual Test**: Place a real order on production, verify Stripe payment, verify QB invoice,
verify email delivery to buyer.

### Phase 8: Post-Launch Support
**Objective**: Bug fixes, stabilization, final handover.
**Deliverable**: Stable platform, all documentation delivered, full source code and access
credentials handed over.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| QuickBooks API rate limits / sync failures | Medium | High | Token bucket (400 req/min), Celery queue, exponential backoff (max 5), manual sync fallback |
| Shopify migration data issues | Medium | High | Test migration on staging first, 100% count validation, keep Shopify live as backup |
| Stripe payment failures in production | Low | Critical | Test-mode regression suite, idempotency keys, webhook retry logic |
| Performance under load | Medium | High | Load test at 500 users, Redis caching, DB indexing, CDN |
| Scope creep | High | High | Spec sign-off enforced, change request process, deferred features documented |
| SEO ranking drop post-migration | Medium | High | 100% redirect coverage, sitemap submitted, Search Console monitoring |
| Client decision delays | Medium | High | Prerequisites checklist collected before Phase 1 |
| DB migration rollback needed | Low | High | `downgrade()` in every migration, pg_dump before each migration, WAL archiving |
| Third-party service outages | Low | Medium | Graceful degradation, retry queues, monitoring alerts |

---

## Prerequisites Checklist (Collect Before Phase 1)

- [ ] Shopify admin credentials + API access keys
- [ ] QuickBooks Online login + admin access
- [ ] Domain registrar access (for DNS changes)
- [ ] High-resolution logo + brand color codes (hex)
- [ ] Payment gateway confirmed (Stripe)
- [ ] Pricing tier structure (tier names + discount percentages)
- [ ] Shipping tier structure (tier names + brackets + rates)
- [ ] Global MOQ value (units)
- [ ] Global MOV value (dollar amount)
- [ ] Tax rates (flat % per state for MVP, or single flat rate)
- [ ] Legal pages content (Terms of Service, Privacy Policy)
- [ ] Warehouse list (name, code, address for each)
- [ ] PO number field policy: required or optional?
- [ ] Guest pricing display mode: retail / login prompt / hidden?
- [ ] Admin notification email recipients
- [ ] AWS S3 bucket name + region + IAM credentials
- [ ] SendGrid API key
- [ ] Sentry DSN
