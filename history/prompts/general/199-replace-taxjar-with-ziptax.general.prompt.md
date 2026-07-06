---
id: 199
title: Replace TaxJar with ZipTax
stage: green
date: 2026-05-18
surface: agent
model: claude-sonnet-4-6
feature: platform-fixes
branch: main
user: umeradnan7106
command: "Remove TaxJar integration and replace with ZipTax in AF Apparels backend."
labels: ["tax","ziptax","taxjar","backend","integration","requirements"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/tax_service.py
  - backend/app/services/taxjar_service.py
  - backend/app/api/v1/tax_rate.py
  - backend/requirements.txt
tests:
  - manual: Set ZIPTAX_API_KEY and hit GET /api/v1/tax-rate?region=TX&zip_code=75201&subtotal=100 → source should be "ziptax"
  - manual: Without ZIPTAX_API_KEY set → source should be "manual" or fall through to manual tax_rates table
  - manual: Tax-exempt company → source should be "exempt", tax_amount 0
---

## Prompt

Remove TaxJar integration and replace with ZipTax in AF Apparels backend.

## Response snapshot

Replaced TaxJar with ZipTax across the backend:

1. **Deleted** `backend/app/services/taxjar_service.py` — removed TaxJar SDK dependency
2. **Created** `backend/app/services/tax_service.py` — ZipTax v40 REST API using httpx; `get_ziptax_client()` reads `ZIPTAX_API_KEY` env var; `calculate_tax()` keeps identical signature and return shape `{rate (%), tax_amount, region, source}`; rate converted from ZipTax decimal (0.0825) to percentage (8.25)
3. **Updated** `backend/app/api/v1/tax_rate.py` — import changed to `tax_service`, `get_taxjar_client` → `get_ziptax_client`, source check `"taxjar"` → `"ziptax"`; fallback to manual tax_rates table untouched
4. **Updated** `backend/requirements.txt` — removed `taxjar` line (httpx already present)

## Outcome

- ✅ Impact: TaxJar dependency fully removed; ZipTax v40 REST API integrated with same endpoint behavior and fallback logic
- 🧪 Tests: Manual — set ZIPTAX_API_KEY, test TX zip code returns ziptax source; without key falls back to manual table
- 📁 Files: 4 files (1 created, 1 deleted, 2 modified)
- 🔁 Next prompts: Add ZIPTAX_API_KEY to .env and server environment
- 🧠 Reflection: ZipTax returns `taxSales` as a decimal; existing code used rate as a percentage — conversion applied (×100). Interface kept identical so no other callers needed changes.

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): null
- Next experiment: null
