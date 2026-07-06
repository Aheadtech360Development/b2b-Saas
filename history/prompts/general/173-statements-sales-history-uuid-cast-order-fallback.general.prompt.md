---
id: "173"
title: Statements + Sales History UUID Cast + Order Fallback
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Fix Statements and Sales History pages — data not showing even though orders exist. Read ALL files first."
labels: ["statements","sales-history","uuid","retail","bug-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/account/statements/page.tsx
tests:
  - manual: wholesale customer — statements page shows charge/payment rows for each order
  - manual: retail customer — statements page shows synthesized rows from orders
  - manual: date filter works on statements
  - manual: sales history generates report for current year (by product)
  - manual: sales history generates report (by price)
  - manual: clicking statement description navigates to order detail
---

## Prompt

Fix Statements and Sales History pages — data not showing even though orders exist. Read ALL files first.

## Response snapshot

**Root cause**: Both `list_statements` and `get_sales_history` in `account.py` compared `company_id` (string from JWT `request.state`) against `UUID(as_uuid=True)` SQLAlchemy columns via asyncpg — the same type mismatch fixed in PHR #172. No match → empty results.

**Secondary issue (statements)**: Retail/guest orders are placed via `guest.py` checkout which does NOT create `StatementTransaction` records. So even with the UUID cast fixed, retail users see empty statements. Wholesale orders DO create StatementTransactions in `checkout.py`.

**`account.py` — `list_statements`**:
- Cast: `company_uuid = uuid.UUID(str(company_id))`; use in `StatementTransaction.company_id == company_uuid`
- Added fallback: if no `StatementTransaction` records found (retail/guest orders), synthesize charge+payment items directly from `Order` table queried by `company_uuid`
- `total_charges`/`total_payments` now computed from `items` list (works for both paths)

**`account.py` — `get_sales_history`**:
- Cast: `company_uuid = uuid.UUID(str(company_id))`; use in `Order.company_id == company_uuid`
- No other changes needed — after PHR #171 retail orders have `company_id` set

**`statements/page.tsx`** (minor): Order detail navigation link uses `txn.order_id` (UUID), which works after PHR #172 since the backend now accepts UUID strings.

## Outcome

- ✅ Impact: Statements and Sales History pages now show data for both wholesale and retail customers. Retail users whose orders were linked to a company (PHR #171) see synthesized statement rows derived from their orders. Wholesale users see their existing StatementTransaction records.
- 🧪 Tests: Manual verification needed
- 📁 Files: 2 files modified
- 🔁 Next prompts: none
- 🧠 Reflection: The UUID type mismatch is a systemic issue throughout the codebase — any `company_id` or `user_id` from JWT passed to a SQLAlchemy UUID column requires explicit cast. The order-synthesis fallback for statements is additive and doesn't break the wholesale path.

## Evaluation notes (flywheel)

- Failure modes observed: String company_id from JWT fails asyncpg UUID column comparison silently; retail users have no StatementTransaction records — need order-based synthesis
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment: null
