---
id: 200
title: ZipTax Checkout Frontend + Backend Endpoint
stage: green
date: 2026-05-18
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Update tax calculation in frontend checkout. Find the file where tax is calculated during checkout. Replace any TaxJar API call with our new endpoint POST /api/v1/tax/calculate."
labels: ["tax","ziptax","checkout","frontend","backend","endpoint"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/tax.py
  - backend/app/main.py
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: Checkout with TX ZIP → Tax (TX 8.25%) line shows correct amount
  - manual: Checkout with non-TX state → Tax shows $0.00 (no nexus)
  - manual: Tax-exempt company → Tax shows $0.00 with source "exempt"
  - manual: No ZIPTAX_API_KEY → falls back to manual tax_rates table
  - manual: Coupon applied → taxable base = subtotal − discount
---

## Prompt

Update tax calculation in frontend checkout. Find the file where tax is calculated during checkout (likely frontend/src/app/(customer)/checkout/page.tsx or a checkout component). Replace any TaxJar API call with our new endpoint POST /api/v1/tax/calculate. Call this function whenever: 1. Shipping address state or ZIP changes 2. Cart items change (subtotal changes). Display in order summary: If taxable: "Tax (TX {rate}%): ${amount}", If not taxable: hide tax line or show "Tax: $0.00".

## Response snapshot

Tax calculation existed in two checkout files — `address/page.tsx` (primary, fires on address change) and `review/page.tsx` (fallback, fires when navigating directly to review step with no stored tax). Both called `GET /api/v1/tax-rate` with query params.

Changes made:

1. **Created `backend/app/api/v1/tax.py`** — POST `/api/v1/tax/calculate` endpoint; accepts `{ subtotal, zip_code, state, discount? }` (discount defaults 0); checks tax-exempt status; calls ZipTax service; falls back to manual tax_rates table; returns `{ tax_rate (%), tax_amount, region, taxable, source }`
2. **Updated `backend/app/main.py`** — added `tax` import + `app.include_router(tax.router, prefix=_V1)`
3. **Updated `address/page.tsx`** — replaced `apiClient.get(...tax-rate?...)` with `apiClient.post(...tax/calculate, { subtotal, zip_code, state, discount })`; removed stale TaxJar comment; response now maps `r.tax_rate → rate`, `r.tax_amount → amount`
4. **Updated `review/page.tsx`** — same GET→POST replacement in fallback useEffect; removed TaxJar comment

Display format unchanged — existing `Tax (${taxRate.region} ${taxRate.rate}%)` label already matches requested format.

## Outcome

- ✅ Impact: Checkout now calls POST /api/v1/tax/calculate backed by ZipTax; all three paths (ZipTax, manual table, exempt) covered
- 🧪 Tests: Manual — verify TX ZIP shows correct rate, non-TX shows $0.00, coupon discount reduces taxable base
- 📁 Files: 4 files (1 backend created, 1 backend modified, 2 frontend modified)
- 🔁 Next prompts: Set ZIPTAX_API_KEY in backend .env to activate live rates
- 🧠 Reflection: `apiClient.post` was already available — no fetch() needed. Kept existing `taxRate: { region, rate }` state shape so display labels needed no changes.

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
