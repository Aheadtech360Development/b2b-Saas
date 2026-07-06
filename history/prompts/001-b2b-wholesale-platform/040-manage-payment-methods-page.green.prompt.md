---
id: "040"
title: Manage Payment Methods Page Full Build
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Manage Payment Methods page for AF Apparels customer dashboard using QuickBooks Payments
labels: ["payment-methods","qb-payments","frontend","migration","account"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/migrations/versions/55fb5336e213_add_default_payment_method.py
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build complete Manage Payment Methods page for AF Apparels customer dashboard. Uses QuickBooks Payments API for card storage (tokenization).

## Response snapshot

**Model:** Added `default_payment_method_id: Mapped[str | None] = mapped_column(String(255), nullable=True)` to `Company`. Migration `55fb5336e213` applied.

**Endpoints (account.py) — full rewrite of payment methods section:**

- `GET /payment-methods`: Loads `Company` from DB, returns `[]` if no `qb_customer_id`. Creates `QBPaymentsService()` (sync — no await), calls `svc.list_saved_cards(company.qb_customer_id)`. Maps each card to `{id, brand, last4, exp_month, exp_year, name, billing_address, is_default, created}`. `is_default` = `card.id == company.default_payment_method_id`. Returns `[]` on any exception.

- `POST /payment-methods`: Accepts `{token, set_as_default}`. Creates QB customer via `httpx.AsyncClient` if `company.qb_customer_id` is null (uses `QBPaymentsService._qb.get_access_token()` for bearer token). Calls `svc.save_card(qb_customer_id, token)` (sync). Sets `company.default_payment_method_id` if `set_as_default`. Returns card summary.

- `PATCH /payment-methods/{id}/set-default`: Sets `company.default_payment_method_id = payment_method_id`, commits.

- `DELETE /payment-methods/{id}`: Calls `svc.delete_saved_card(qb_customer_id, id)` (sync). Clears `default_payment_method_id` if deleted card was default.

**Key technical note:** `QBPaymentsService` is synchronous (uses `httpx.request()`, not `AsyncClient`). No `await` on its methods — called directly in async endpoints.

**Frontend (`payment-methods/page.tsx` — full rewrite):**
- Add Card form: Card number (auto-formatted with spaces, 16 digits max), Name on Card, Exp Month/Year dropdowns, CVC input, Billing Address section with ZIP auto-fill (zippopotam.us), City+State grid, Country, Set as Default checkbox, security note with lock SVG icon
- Two-step tokenization: POST `/api/v1/checkout/tokenize` → get token → POST `/api/v1/account/payment-methods` with token
- Card list: card SVG icon, brand + last4, expiry, name, Default badge (blue ring), Set Default / Remove actions
- Empty state with card SVG illustration and "Add your first card" CTA

**Sidebar:** "Payment Methods" → "Manage Payment Methods"

## Outcome

- ✅ Impact: Full QB Payments card wallet at /account/payment-methods — add, set default, remove
- ✅ Migration 55fb5336e213 applied cleanly
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: company.py, migration, account.py, payment-methods/page.tsx, layout.tsx
