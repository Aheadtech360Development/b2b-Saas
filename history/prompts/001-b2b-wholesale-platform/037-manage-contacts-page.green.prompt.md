---
id: "037"
title: Manage Contacts Page Full Build
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Build complete Manage Contacts page for AF Apparels customer dashboard
labels: ["contacts","frontend","migration","account"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/app/schemas/account.py
  - backend/migrations/versions/886d3496e46e_add_contact_full_fields.py
  - frontend/src/app/(customer)/account/contacts/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
tests:
  - backend/tests/ (33 passing, no regressions)
---

## Prompt

Build complete Manage Contacts page for AF Apparels customer dashboard (model fields, schemas, endpoints, frontend page).

## Response snapshot

**Model:** Contact model in `company.py` expanded with 16 new fields: `department`, `time_zone`, `phone_ext`, `fax`, `web_address`, `notes`, `home_address1`, `home_address2`, `home_postal_code`, `home_city`, `home_state`, `home_country`, `home_phone`, `home_fax`, `home_email`, `alt_contacts`. `title` field dropped.

**Migration:** `886d3496e46e_add_contact_full_fields` — pre-staged migration was already in queue; `alembic upgrade head` applied it cleanly. All 16 columns added, `title` dropped.

**Schema:** `ContactCreate` expanded with all new fields. `ContactOut` now extends `ContactCreate` with just `id` added — keeps in sync automatically. Removed `company_id` and `title` from `ContactOut`.

**Endpoints:** No structural changes needed — existing POST/PATCH/GET/DELETE endpoints in `account.py` pass payloads directly to SQLAlchemy, which maps all new fields automatically.

**Frontend:** Full rewrite of `contacts/page.tsx`:
- Two-tab form: "Contact Entry" + "Contact Detail"
- Contact Entry tab: First/Last name (required), Department pill buttons (MAIN/Accounting/Purchasing/Sales/Warehouse/WEB — toggle selection), Time Zone dropdown (7 US timezones), Phone + Ext (3-col grid), Fax, Email (required), Web Address, Notes textarea, Email Notifications checkboxes (order confirmation/shipped/invoices), Primary Contact checkbox
- Contact Detail tab: Home address 1/2, ZIP auto-fill (calls zippopotam.us → fills home_city + home_state), City + State grid, Country, Home Phone + Fax grid, Home Email, Alt Contacts textarea
- Contact cards: blue ring for primary, "Primary" badge, department badge, email, phone+ext, timezone label, notification badges (Order Updates/Shipping/Invoices), Edit/Delete actions

**Sidebar:** `layout.tsx` label updated from "Contacts" → "Manage Contacts".

## Outcome

- ✅ Impact: Full contacts CRUD with department, timezone, home address, notifications at /account/contacts
- 🧪 Tests: 33/33 backend tests passing
- 📁 Files: company.py, account.py schemas, migration 886d3496e46e, contacts/page.tsx, layout.tsx
