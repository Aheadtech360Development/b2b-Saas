---
id: "029"
title: Full Backend Audit and Fix 500 Endpoints
stage: green
date: 2026-03-18
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: full backend A-Z audit and fix
labels: ["audit","bug-fix","500-errors","categories","warehouses","reports","sql"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/product_service.py
  - backend/app/schemas/inventory.py
  - backend/app/services/inventory_service.py
  - backend/app/api/v1/admin/inventory.py
  - backend/app/api/v1/admin/reports.py
tests:
  - curl all 29 customer+admin endpoints — all 200 verified post-fix
---

## Prompt

You are doing a complete A-Z audit and fix of the AF Apparels B2B platform backend. Work systematically through these phases.

PHASE 1: GET TOKEN AND TEST ALL ENDPOINTS — get customer token (john@downtownretail.com) and admin token (admin@afapparels.com), test every listed endpoint, record WORKING (200) or BROKEN (4xx/5xx).

PHASE 2: READ ALL RELEVANT FILES FOR BROKEN ENDPOINTS

PHASE 3: FIX ALL BROKEN ENDPOINTS

PHASE 4: SPECIFIC KNOWN ISSUES TO CHECK

PHASE 5: AFTER ALL FIXES — restart backend, check logs, re-run all curls to verify 200.

## Response snapshot

Tested all 29 endpoints. Found 4 broken (HTTP 500):

1. GET /api/v1/products/categories — MissingGreenlet: `c.children = []` triggered lazy load on `children` relationship in async context
2. GET /api/v1/admin/warehouses — ResponseValidationError: WarehouseOut schema had a single `address` field but Warehouse model has `address_line1`, `city`, `state`, `postal_code`, `country`
3. GET /api/v1/admin/reports/sales — SQL ProgrammingError: `cat_q` started FROM `Category` but joined `Order` only via `where()`, so PostgreSQL emitted `missing FROM-clause entry for table "orders"`
4. GET /api/v1/admin/reports/customers — SQL GroupingError: `func.date_trunc("day", Company.created_at)` was re-instantiated 3 times (SELECT, GROUP BY, ORDER BY) producing 3 different parameter placeholders ($1, $4, $5) that PostgreSQL could not deduplicate, causing `column "companies.created_at" must appear in GROUP BY`

Fixes applied:

- product_service.py `get_category_tree`: added `selectinload(Category.children)` to the query; removed the mutating `c.children = []` loop that triggered MissingGreenlet; simplified to filter root categories directly from eager-loaded result.
- schemas/inventory.py `WarehouseOut`: replaced single `address: str | None` with `address_line1`, `city`, `state`, `postal_code`, `country`, `is_active` fields matching model.
- schemas/inventory.py `WarehouseCreate`: same field alignment.
- services/inventory_service.py `create_warehouse`: updated signature and constructor call to use individual address fields.
- api/v1/admin/inventory.py `create_warehouse` route: updated to pass individual address fields from payload.
- api/v1/admin/reports.py `sales_report` `cat_q`: added `.select_from(Order)` so `Order` is in the FROM clause before JOIN chain.
- api/v1/admin/reports.py `customer_report` `reg_q`: assigned `func.date_trunc("day", Company.created_at)` to a single variable `reg_trunc` and reused it in SELECT, GROUP BY, ORDER BY — ensuring same SQLAlchemy object = single parameter placeholder.

All 29 endpoints return 200 after restart.

## Outcome

- Impact: 4 broken endpoints fixed; 29/29 endpoints return HTTP 200
- Tests: Full curl suite run pre- and post-fix; all green post-fix
- Files: 5 backend files modified
- Next prompts: Run frontend integration tests to verify UI flows against these now-working endpoints
- Reflection: The PostgreSQL GROUP BY parameterization issue (same function expression instantiated 3x) is a subtle SQLAlchemy trap — reusing a single expression object is the correct pattern

## Evaluation notes (flywheel)

- Failure modes observed: lazy-load in async, schema-model field mismatch, missing FROM clause, GROUP BY parameter deduplication failure
- Graders run and results (PASS/FAIL): curl 29-endpoint sweep — PASS (29/29 200)
- Prompt variant (if applicable): null
- Next experiment: add selectinload to all other relationships accessed in async routes to prevent future MissingGreenlet errors
