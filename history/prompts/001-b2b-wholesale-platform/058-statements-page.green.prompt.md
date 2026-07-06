---
id: "058"
title: Build Statements Page Customer Dashboard
stage: green
date: 2026-03-27
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Statements page for AF Apparels customer dashboard — DB model, migration, auto-create on order, 4 API endpoints, frontend page.
labels: ["feature","statements","pdf","quickbooks","customer-dashboard","alembic"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/statement.py
  - backend/app/models/__init__.py
  - backend/migrations/versions/b1c2d3e4f5a6_add_statement_transactions.py
  - backend/app/services/order_service.py
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/account/statements/page.tsx
tests:
  - alembic upgrade head (applies b1c2d3e4f5a6 migration)
  - docker compose restart backend frontend
  - Place order → statement charge auto-created
  - Visit /account/statements → shows transactions + summary cards
  - Sync QB Payments → pulls QB Payment objects
  - Download PDF → ReportLab statement downloads
  - Email Statement → sent to primary contacts
  - Date filter applies correctly
  - Click order description → navigates to /account/orders/{id}
---

## Prompt

Build complete Statements page for AF Apparels customer dashboard.
Steps: DB model, migration, auto-create from orders, 4 backend endpoints (list, sync-qb, pdf, email), frontend page.

## Response snapshot

**STEP 1 — Model:** Created `StatementTransaction` with `company_id`, `transaction_date` (String ISO), `transaction_type` (Enum: charge/payment/credit/refund), `amount`, `reference_number`, `order_id` FK, `qb_transaction_id`, `notes`.

**STEP 2 — Migration:** `b1c2d3e4f5a6` with `down_revision="a1b2c3d4e5f6"`. Creates `statement_transactions` table + `transaction_type` enum + company_id index.

**STEP 3 — Auto-create on order:** Added step 12 to `order_service.py` `create_order()` — inserts a `charge` transaction for every new order. Wrapped in try/except to never break checkout.

**STEP 4 — Backend endpoints (4) in `account.py`:**
- `GET /account/statements` — list with running balance + summary (total_charges, total_payments, current_balance)
- `POST /account/statements/sync-qb` — query QB Accounting API `Payment` objects by customer, insert missing transactions
- `GET /account/statements/pdf` — ReportLab PDF with date/ref/charges/credits/balance columns + summary footer
- `POST /account/statements/email` — send to primary contacts (max 3) via `send_raw`

**STEP 5 — Frontend page:** Full rewrite of existing stub. Features: 3 summary cards (charges/payments/balance with orange/green coloring), date range filter form, transactions table with clickable order descriptions, PDF download via fetch+blob, Email/Sync QB buttons, message banner.

**Key corrections vs spec:**
- Order creation is in `order_service.py`, not `checkout.py` — transaction added there
- `send_raw(to_email=..., body_html=...)` not `send_raw(to=..., html=...)` — correct param names used
- `QuickBooksService.get_access_token()` is sync, not `get_valid_access_token()` — used correctly
- Sidebar already had "Statements" entry — no layout change needed

## Outcome

- ✅ Impact: Full statement lifecycle: auto-charge on order → running balance view → QB payment sync → PDF download → email to contacts
- 🧪 Tests: alembic upgrade head; docker compose restart backend frontend; place order → check /account/statements
- 📁 Files: 6 files (1 new model, 1 migration, 1 updated service, 1 updated router, 1 updated frontend page + __init__.py)
- 🔁 Next prompts: Add admin view of company statements; trigger credit/refund transactions from RMA approvals
- 🧠 Reflection: Order transaction creation belongs in the service layer (order_service.py), not in the API layer (checkout.py), keeping the service the single source of truth for order side-effects.

## Evaluation notes (flywheel)

- Failure modes observed: spec had wrong send_raw param names (to/html vs to_email/body_html); spec pointed to checkout.py but logic is in order_service.py
- Graders run and results (PASS/FAIL): manual review of all imports and method signatures — PASS
- Prompt variant (if applicable): null
- Next experiment: Add paginated statement export with multi-month date range
