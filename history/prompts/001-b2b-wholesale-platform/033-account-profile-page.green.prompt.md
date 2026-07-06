---
id: "033"
title: Account Profile Page — Full Build
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build Account Profile page for AF Apparels customer dashboard
labels: ["profile","company","frontend","migration","account"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/app/schemas/account.py
  - backend/app/api/v1/account.py
  - backend/migrations/versions/90b0e29cf676_add_company_profile_fields.py
  - frontend/src/app/(customer)/account/profile/page.tsx
  - frontend/src/services/account.service.ts
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build Account Profile page for AF Apparels customer dashboard. Steps:
1. DB migration — add 7 new fields to Company model (fax, tax_id_expiry, secondary_business, estimated_annual_volume, ppac_number, ppai_number, asi_number)
2. Add CompanyProfileUpdate schema to account.py
3. Add 3 new endpoints: GET /account/profile/full, PATCH /account/profile/user, PATCH /account/profile/company
4. Replace frontend profile page with full company+user form
5. Add 3 methods to account.service.ts
6. Run migration and restart

## Response snapshot

**Backend:**
- Company model: added 7 new varchar fields (fax, tax_id_expiry, secondary_business, estimated_annual_volume, ppac_number, ppai_number, asi_number)
- Alembic migration 90b0e29cf676 applied successfully
- `CompanyProfileUpdate` schema added to `schemas/account.py`
- `account.py` imports updated; 3 new endpoints added before `/change-password`:
  - `GET /profile/full` → returns `{web_user: {first_name,last_name,email}, company: {...all fields...}|null}`
  - `PATCH /profile/user` → updates first_name/last_name/phone; returns `{message}`
  - `PATCH /profile/company` → updates all editable company fields; returns `{message}`
- Account Number computed as `str(company.id)[:8].upper()` — read-only
- Email — read-only

**Frontend:**
- `profile/page.tsx` replaced: Web User Profile section + Customer Account Profile section (conditionally shown when company exists) + Change Password section (preserved from original)
- `Field` helper component for consistent label/input layout
- Dropdowns for Primary Business, Secondary Business (shared options), Estimated Annual Volume
- `account.service.ts`: added `getFullProfile()`, `updateUserProfile()`, `updateCompanyProfile()`

**Verified end-to-end:**
- login → GET /profile/full → 200 with `['web_user', 'company']`
- PATCH /profile/user → 200 `{message: 'User profile updated'}`
- PATCH /profile/company with `{fax: '555-1234', ppac_number: 'PPAC-001'}` → 200; fields persisted on re-fetch

## Outcome

- ✅ Impact: Full account profile page with user + company editing
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: company.py, account.py schemas, account.py routes, profile/page.tsx, account.service.ts
- 🔁 Next: Test in browser at /account/profile; verify account_number read-only, email read-only
