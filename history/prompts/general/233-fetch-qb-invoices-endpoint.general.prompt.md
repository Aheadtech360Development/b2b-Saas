---
id: 233
title: Fetch Invoices from QuickBooks Endpoint
stage: general
date: 2026-06-07
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "yes, build it"
labels: ["quickbooks","invoices","backend","api"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
tests:
  - none
---

## Prompt

yes, build it

(Referring to: build GET /api/v1/account/invoices — fetch invoices from QuickBooks for the authenticated customer instead of generating from local order data)

## Response snapshot

Added `GET /api/v1/account/invoices` endpoint to `backend/app/api/v1/account.py` (lines 1978–2055).

Logic:
1. Resolves `company_id` from `request.state`; returns 403 if missing
2. Looks up `Company.qb_customer_id`; returns `[]` if not linked
3. Calls `QuickBooksService().get_access_token()` for a fresh Bearer token
4. Queries QB API: `SELECT * FROM Invoice WHERE CustomerRef = '{qb_customer_id}' ORDER BY TxnDate DESC MAXRESULTS 100`
5. Maps each raw QB invoice to: `id, doc_number, txn_date, due_date, total_amt, balance, status (open/partial/paid), email_status, customer_memo`
6. Returns `[]` on any QB error (graceful degradation)

Committed and pushed: `0930375 feat: fetch invoices from QuickBooks — GET /api/v1/account/invoices`

## Outcome

- ✅ Impact: New endpoint lets frontend display live QB invoice data per customer
- 🧪 Tests: Manual — requires QB sandbox with linked customer
- 📁 Files: 1 file modified (+84 lines)
- 🔁 Next prompts: Wire frontend invoices page to consume this endpoint
- 🧠 Reflection: Pattern copied directly from existing payments sync at line ~1486; consistent style throughout
