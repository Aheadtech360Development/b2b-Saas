---
id: "047"
title: Fix QB Payments Card Save URL and Body
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Debug and fix card saving in QB Payments — URL mismatch and wrong body format
labels: ["bug-fix","qb-payments","card-save","tokenize"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/qb_payments_service.py
  - backend/app/api/v1/checkout.py
tests:
  - backend/test_cards.py (run in Docker, then removed) — Cards found: 1 ✅
---

## Prompt

Debug and fix card saving in QB Payments. list_saved_cards 404ing, save_card 404ing, need to diagnose and fix.

## Diagnostic findings (from test_cards.py)

1. Token creation ✅ — `POST /quickbooks/v4/payments/tokens` works fine
2. list_saved_cards ❌ (404) → URL was wrong: `/quickbooks/v4/payments/customers/{id}/cards`
3. save_card ❌ (400 "number is required") → two bugs:
   - URL bug: should be `/quickbooks/v4/customers/{id}/cards` (NOT under `/payments/`)
   - Body bug: QB Payments saved-card endpoint requires **raw card data** (`number`, `expMonth`, `expYear`, `cvc`), NOT a charge token. Charge tokens are one-time-use for charges only.

## Changes

### `qb_payments_service.py`
- Added `_customer_url(path)` → builds URLs from `QB_CUSTOMERS_BASE` (`/quickbooks/v4/customers`)
- Added `_do_request(method, url, label)` → shared 401-refresh logic (DRY)
- Updated `_request()` and added `_customer_request()` using respective URL helpers
- Updated `save_card()` signature: now accepts `card_number, exp_month, exp_year, cvc, name` (raw fields), not `token`
- Updated `list_saved_cards`, `delete_saved_card` to use `_customer_request`

### `checkout.py` — tokenize_card endpoint
- Added `db: AsyncSession = Depends(get_db)` parameter
- After creating the charge token, immediately saves raw card data to QB customer wallet (raw data is available at tokenize time)
- Creates QB customer profile if `company.qb_customer_id` is NULL
- Sets saved card as default if company has no default yet
- Failure is non-fatal — token is still returned for checkout

### `checkout.py` — confirm_checkout
- Removed the broken "save card from token" block — tokens cannot be used to save cards

## Test result (docker exec afapparel_backend python test_cards.py)
```
[4] Saving card to QB customer (raw card data)...
   Card saved: {'id': '101145111135506734521111', 'cardType': 'VISA', 'number': 'xxxxxxxxxxxx1111', 'status': 'ACTIVE', ...}

[2] Listing saved cards... Cards found: 1 ✅
```

## Outcome

- ✅ QB Payments customer/card endpoints now use correct base URL (`/quickbooks/v4/customers`)
- ✅ `save_card` uses raw card fields — body format matches QB Payments API
- ✅ Card auto-saved during tokenize (raw data available there)
- ✅ Card appears in `list_saved_cards` after save
- ✅ `default_payment_method_id` set on company for first card
- 📁 Files: qb_payments_service.py, checkout.py
