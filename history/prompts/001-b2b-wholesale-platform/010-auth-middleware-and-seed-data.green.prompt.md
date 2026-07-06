---
id: 010
title: Fix Auth Middleware and Comprehensive Seed Data
stage: green
date: 2026-03-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: Fix AuthMiddleware public path bug + create comprehensive seed script
labels: ["auth","middleware","seed","products","companies","inventory","bugfix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/auth_middleware.py
  - backend/scripts/seed_data.py
  - backend/app/models/product.py
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
tests:
  - POST /api/v1/register-wholesale (no auth) → 201
  - POST /api/v1/login admin@afapparels.com/Admin123! → 200 + token
  - GET /api/v1/products → 200 (23 products returned)
  - GET /api/v1/companies (with admin token) → 200 (3 companies)
  - DB counts: 23 products, 284 variants, 852 inventory records, 3 companies, 5 orders
---

## Prompt

Problem 1: AuthMiddleware blocks public endpoints — /api/v1/register-wholesale returns 401.
Fix middleware to skip auth for: POST /api/v1/register-wholesale, POST /api/v1/login,
POST /api/v1/refresh, POST /api/v1/forgot-password, POST /api/v1/reset-password,
GET /api/v1/products, GET /health, GET /docs, GET /redoc, GET /openapi.json.

Problem 2: DB has no seed data. Create comprehensive idempotent sync seed script at
backend/scripts/seed_data.py. Must seed: admin user, pricing tiers (Bronze 15%/Silver 25%/Gold 35%),
shipping tiers (Standard/Premium Wholesale with brackets), 3 warehouses, 10 categories,
23 products with 284 variants, 852 inventory records across 3 warehouses, 3 company accounts
with users, 5 sample orders, system settings.

Problem 3: Rebuild and restart backend after fixes. Verify all endpoints.

## Response snapshot

**Auth Middleware Fix:**
ROOT CAUSE: `PUBLIC_PATHS` had `/api/v1/auth/login`, `/api/v1/auth/register-wholesale`, etc.
but auth router is mounted at `/api/v1` (not `/api/v1/auth`). Actual paths are `/api/v1/login`,
`/api/v1/register-wholesale`, etc.
FIX: Removed the `/auth/` segment from all entries in PUBLIC_PATHS.

**Seed Script:**
Created `backend/scripts/seed_data.py` with sync SQLAlchemy (psycopg2 via DATABASE_URL_SYNC).
Smart path detection: works both inside Docker (`/app/scripts/`) and from project root.
Uses passlib directly (avoids app config side-effects). Fully idempotent: all sections
check for existing data before inserting, upserts pricing tiers if discount_percent differs.

Seeded:
- 1 admin user (admin@afapparels.com / Admin123!)
- 3 pricing tiers: Bronze 15%, Silver 25%, Gold 35%
- 2 shipping tiers: Standard Wholesale (1-99=$25, 100-499=$15, 500+=$0) and Premium
- 3 warehouses: East Coast, West Coast, Central
- 10 categories
- 23 products with 284 variants (size × color combos)
- 852 inventory records (random 50-500 per variant per warehouse)
- 3 company accounts (Downtown Retail, Metro Distributors, Elite Fashion)
- 5 test users across companies
- 5 sample orders (delivered/shipped/processing/confirmed/pending)
- 7 system settings

**Additional bugs fixed during verification:**
1. `product_service.py` used `Product.product_categories` → renamed to `Product.category_links`
2. `Product` model missing `primary_image` and `categories` properties → added computed properties
3. `ProductImage` model field name mismatches vs schema (`sort_order`/`position`, `url_webp_*`/`url_*_webp`) → added alias properties
4. `ProductListItem.categories: list[str]` → changed to `list[CategoryOut]` to match computed property

**Verification:**
- POST /api/v1/register-wholesale (no auth) → 201 ✓
- POST /api/v1/login Admin123! → 200 + JWT ✓
- GET /api/v1/products → 200 (23 active products) ✓
- GET /api/v1/companies (with token) → 200 (3 companies) ✓

## Outcome

- ✅ Impact: Public endpoints accessible without auth; database fully seeded with realistic test data
- 🧪 Tests: All 4 verification curl checks passing; DB counts match expected values
- 📁 Files: 5 files changed (middleware, seed script, product model, product schema, product service)
- 🔁 Next prompts: Frontend end-to-end testing; run pytest; seed verification script
- 🧠 Reflection: The route prefix bug (PUBLIC_PATHS with wrong `/auth/` segment) was the key middleware fix. Product model/schema mismatches were pre-existing design issues requiring computed properties and schema type corrections.

## Evaluation notes (flywheel)

- Failure modes observed: Route path mismatch in PUBLIC_PATHS (wrong prefix); ORM model/schema field name mismatches; bash history expansion escaping `!` in passwords corrupting JSON
- Graders run and results (PASS/FAIL): register-wholesale 201 (PASS), login 200 (PASS), products 200 (PASS), companies 200 (PASS), DB counts (PASS)
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run pytest on auth_service tests to verify login flow
