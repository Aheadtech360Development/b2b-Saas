---
id: "035"
title: Address Book Page — Full Build
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Address Book page for AF Apparels customer dashboard
labels: ["addresses","frontend","migration","account"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/account.py
  - backend/migrations/versions/e5d6991298ab_add_address_full_name_phone.py
  - frontend/src/app/(customer)/account/addresses/page.tsx
  - frontend/src/services/account.service.ts
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build complete Address Book page for AF Apparels customer dashboard (model fields, schemas, endpoints, frontend page).

## Response snapshot

**Model:** `full_name` (String 200) and `phone` (String 50) added to `UserAddress`. Migration `e5d6991298ab` applied.

**Schema:** `AddressIn` expanded with `label`, `full_name`, `phone`, `is_default`. `AddressOut` expanded with `full_name`, `phone`. Both use `validation_alias` for `address_line1/2` → `line1/line2`.

**Endpoints (account.py):**
- `create_address`: if `is_default` or first address, runs bulk `UPDATE ... SET is_default=False` then creates with `is_default=True`
- `update_address`: same unset-others logic when promoting to default
- `set_default_address` (new `PATCH /addresses/{id}/set-default`): unsets all, sets one
- `delete_address`: unchanged
- Added `update` to sqlalchemy import

**Frontend:** Full rewrite of `addresses/page.tsx`:
- Inline add/edit form (toggle, no modal) with label, full name, line1/2, city, state dropdown (50 US states), ZIP, country (US/CA), phone, is_default checkbox
- Label field auto-focused on open
- Address cards with blue ring for default, "Default" badge, Edit/Set as Default/Delete actions
- Empty state with "Add your first address" CTA
- `setDefaultAddress` added to `account.service.ts`

**Verified:** create→201, set-default→200+is_default=True, list shows correct states, delete works.

## Outcome

- ✅ Impact: Full address book CRUD with default management live at /account/addresses
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: company.py, order.py schemas, account.py routes, addresses/page.tsx, account.service.ts
