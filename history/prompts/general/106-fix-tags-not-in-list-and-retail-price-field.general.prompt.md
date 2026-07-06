---
id: 106
title: Fix Tags Missing in Company List and retail_price Field
stage: general
date: 2026-04-23
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["bug-fix","tags","company-list","variant-pricing","retail-price"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/company.py
  - backend/app/services/company_service.py
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - null
---

## Prompt

1. Assigned customers not persisting — added 2 customers, but on reopening edit modal shows "No customers assigned yet"
2. Individual Variant Pricing: entered discount amount not being used to calculate %, and % not displayed

## Response snapshot

**Issue 1 root cause:** `CompanyListItem` schema had no `tags` field, and `list_companies_paginated` in CompanyService did not include `tags` in the built dict. So `c.tags` was always `undefined` when filtering by tag, causing zero matches.

**Fix 1a** — `backend/app/schemas/company.py`: Added `tags: list[str] = []` + `coerce_tags` validator to `CompanyListItem` (mirrors the same pattern already present on `CompanyDetail`).

**Fix 1b** — `backend/app/services/company_service.py`: Added `"tags": company.tags or []` to the dict built in the `list_companies_paginated` loop.

**Issue 2 root cause:** `VariantOut` schema exposes `retail_price`, not `price`. Frontend VP fetch used `p.variants?.[0]?.price` which was always `undefined`, so `base_price` was always `null`, and the discount % formula `discountAmt / bp * 100` produced `null`.

**Fix 2** — `frontend/.../tiers/page.tsx`: Changed `variants?: Array<{ price?: ... }>` → `retail_price` and `p.variants[0].price` → `p.variants[0].retail_price`.

## Outcome

- ✅ Impact: Assigned customers now load correctly when reopening the edit modal. VP % discount now calculates and displays when a discount amount is entered.
- 🧪 Tests: Manual verification needed
- 📁 Files: 3 files modified
- 🔁 Next prompts: Restart backend after schema change; test modal and VP table
- 🧠 Reflection: CompanyListItem was a subset of CompanyDetail intentionally omitting tags — this was the wrong decision once tag-based group assignment was introduced.

## Evaluation notes (flywheel)

- Failure modes observed: Schema field missing in list endpoint; wrong field name assumption (price vs retail_price)
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
