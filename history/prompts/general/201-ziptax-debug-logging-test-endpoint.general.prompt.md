---
id: 201
title: ZipTax debug logging and test endpoint
stage: general
date: 2026-05-18
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: debug ZipTax tax calculation showing $0.00 for Texas customer
labels: ["tax","ziptax","debug","backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/tax_service.py
  - backend/app/api/v1/tax.py
tests:
  - GET /api/v1/tax/test-ziptax?zip_code=75215
---

## Prompt

Debug ZipTax tax calculation — tax showing $0.00 for Texas customer. Test case: ZIP 75215, State TX, should return tax > 0. Add verbose logging to tax_service.py and tax.py, add a GET /api/v1/tax/test-ziptax debug endpoint to test the ZipTax API directly.

## Response snapshot

Added comprehensive logging to tax_service.py (raw ZipTax response, taxSales value, rate calculation) and tax.py (API key presence, decision path taken). Added GET /api/v1/tax/test-ziptax?zip_code= debug endpoint that calls ZipTax directly and returns key_status + raw HTTP response without going through checkout flow.

## Outcome

- ✅ Impact: Debug visibility into ZipTax API key status and raw response
- 🧪 Tests: Manual — GET /api/v1/tax/test-ziptax?zip_code=75215
- 📁 Files: 2 files modified
- 🔁 Next prompts: Check Railway ZIPTAX_API_KEY env var
- 🧠 Reflection: Most likely root cause is ZIPTAX_API_KEY not set in Railway environment

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): verify env var in Railway dashboard
