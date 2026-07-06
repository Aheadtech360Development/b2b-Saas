---
id: 142
title: TaxJar Integration for Checkout Tax Calculation
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Integrate TaxJar API for automatic zip-level tax calculation; fallback to manual tax_rates table; pass zip/city/subtotal/shipping from address page"
labels: ["backend","frontend","checkout","tax","taxjar"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/taxjar_service.py
  - backend/app/api/v1/tax_rate.py
  - backend/requirements.txt
  - frontend/src/stores/checkout.store.ts
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - manual: With TAXJAR_API_KEY set, GET /api/v1/tax-rate?region=TX&zip_code=75201&city=Dallas&subtotal=100&shipping=10 returns taxjar source
  - manual: Without TAXJAR_API_KEY, falls back to manual tax_rates table
  - manual: If zip_code missing or subtotal=0, skips TaxJar and uses manual table
  - manual: TaxJar error falls back to manual table lookup
  - manual: Address page sends zip/city/subtotal/shipping to endpoint
  - manual: Tax amount from TaxJar persists through to review page
  - manual: Review page total includes TaxJar-calculated tax_amount
---

## Prompt

Integrate TaxJar for automatic sales tax calculation at checkout. Manual taxes remain as fallback.

## Response snapshot

**`taxjar_service.py`** (new): `get_taxjar_client()` reads `TAXJAR_API_KEY` env var, returns None if not set. `calculate_tax()` is async — runs sync taxjar library in `asyncio.to_thread()`. Returns `{ rate (%), tax_amount ($), region, source: "taxjar" }`. Any exception returns `{ rate: 0, tax_amount: 0, source: "fallback", error: "..." }`.

**`tax_rate.py`** (rewritten): New params: `region` (required), `zip_code`, `city`, `subtotal`, `shipping` (all optional). Decision tree:
1. If `zip_code` present AND `subtotal > 0` AND TaxJar client configured → call `calculate_tax()`, return if `source == "taxjar"`
2. Else → query `tax_rates` table for enabled rate matching region, return manual calc
3. If neither found → return `{ rate: 0, tax_amount: 0, source: "none" }`

**`requirements.txt`**: Added `taxjar` (no version pin — latest stable).

**`checkout.store.ts`**: Added `taxAmount: number` field (default 0). `setTaxInfo(region, rate, amount?)` now accepts optional `amount`. Persists TaxJar-calculated amount to store.

**`address/page.tsx`**:
- Derives `activeZip` and `activeCity` alongside `activeState` (from form or saved address)
- Tax useEffect builds URLSearchParams with all fields, re-fetches on `[activeState, activeZip, subtotal]`
- Stores returned `tax_amount` in local `apiTaxAmount` state + checkout store
- `taxAmount` display: prefers `apiTaxAmount > 0` from API, falls back to `rate × subtotal`

**`review/page.tsx`**:
- Reads `storedTaxAmount` from checkout store
- `taxAmount` calculation: prefers `storedTaxAmount > 0`, falls back to `taxRate.rate × subtotal`
- Fallback API call also passes `zip_code`, `city`, `subtotal`, `shipping`

## Outcome

- ✅ TaxJar provides zip-level accurate tax when TAXJAR_API_KEY is set
- ✅ Graceful fallback to manual rates table when TaxJar unavailable/errors
- ✅ TaxJar amount persists from address step through to order placement
- ✅ Manual Taxes & Duties admin page remains fully functional
- 🧪 Tests: Manual
- 📁 Files: 6 files modified/created

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
