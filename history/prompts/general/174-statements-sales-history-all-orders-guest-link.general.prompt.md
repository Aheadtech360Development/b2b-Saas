---
id: "174"
title: Statements + Sales History — All Orders Including Pre-Activation Guest Orders
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix statements and sales history — must include ALL orders linked to user (both pre-login guest orders and post-login orders)."
labels: ["statements","sales-history","guest-orders","activate-account","retail","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/auth.py
  - backend/app/api/v1/account.py
tests:
  - manual: retail user activates — all prior guest orders (placed_by_id already set, company_id NULL) get company_id assigned
  - manual: statements page shows ALL orders for retail user including pre-activation guest orders
  - manual: sales history shows ALL order items including from pre-activation guest orders
  - manual: wholesale user statements and sales history unchanged
---

## Prompt

Fix statements and sales history — must include ALL orders linked to user (both pre-login guest orders and post-login orders). Read files first.

Root cause: guest orders placed via guest.py step 7 already have placed_by_id set on the Order at checkout time. When activate_account runs, the UPDATE only matches `placed_by_id == None` — missing orders where placed_by_id was already set but company_id is NULL. Those orders never get company_id assigned, so they don't appear in company-scoped queries (statements, sales-history).

## Response snapshot

**Root cause confirmed**: `auth.py` `activate_account` UPDATE condition:
```python
.where(Order.guest_email == user.email, Order.placed_by_id == None)
```
This misses orders where `guest.py` step 7 already set `placed_by_id = retail_user.id` during checkout. Those orders have `placed_by_id = user.id` but `company_id = NULL`, so they fall outside all company-scoped queries.

**`auth.py` — `activate_account`**: Added a second UPDATE statement after the existing one:
- Statement 1 (existing): `guest_email == user.email AND placed_by_id IS NULL` → sets both `placed_by_id` and `company_id`
- Statement 2 (new): `guest_email == user.email AND placed_by_id == user.id AND company_id IS NULL` → sets `company_id` only (these were already linked by guest.py but missed company assignment)

**`account.py` — `list_statements`**:
- Added `user_uuid` from `request.state.user_id`
- Changed order fallback query to use `or_(company_id == company_uuid, (placed_by_id == user_uuid) & (company_id == None))` so pre-activation orders with no company_id also appear

**`account.py` — `get_sales_history`**:
- Added `user_uuid` from `request.state.user_id`
- Changed `Order.company_id == company_uuid` filter to same OR condition covering `placed_by_id == user_uuid AND company_id == None`

## Outcome

- ✅ Impact: All orders placed by a retail user (before and after account activation) now appear in statements and sales history. The activate_account fix ensures future activations also properly assign company_id to all guest orders. The OR-condition fallback in queries handles any pre-existing data where company_id was never backfilled.
- 🧪 Tests: Manual verification needed
- 📁 Files: 2 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The activate_account two-statement approach is safer than a single OR-based UPDATE — each statement has a clear semantic meaning. The query OR condition is a defensive measure for historical data; going forward the fix in auth.py ensures company_id is always set at activation time.

## Evaluation notes (flywheel)

- Failure modes observed: guest.py step 7 sets placed_by_id during checkout but activate_account only clears orders with placed_by_id == None — company_id assignment silently skipped; statements/sales-history queries only filter by company_id so these orders are invisible
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
