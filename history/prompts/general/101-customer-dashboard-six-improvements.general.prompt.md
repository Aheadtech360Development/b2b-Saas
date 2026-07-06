---
id: "101"
title: Customer Dashboard Six Improvements
stage: general
date: 2026-04-21
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: customer dashboard improvements — price list, profile consistency, contacts, users, messages, sales history
labels: ["customer-dashboard","price-list","contacts","users","sales-history","profile"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/account/price-list/page.tsx
  - frontend/src/app/(customer)/account/profile/page.tsx
  - frontend/src/app/(customer)/account/contacts/page.tsx
  - frontend/src/app/(customer)/account/users/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(customer)/account/page.tsx
  - frontend/src/app/(customer)/account/sales-history/page.tsx (new)
tests:
  - npm run build — PASS
---

## Prompt

Six customer dashboard changes:
1. Price List: add inline generate like inventory listing — show product prices (SKU/color/size/retail/your price)
2. Account Profile vs wholesale form consistency: num_employees/num_sales_reps/how_heard → dropdowns; state_province → US states select; country → US/CA select; primary_business options aligned to wholesale form options
3. Manage Contacts: remove Department and Email Notifications from Contact Entry tab
4. Manage Users: owner (role=owner) cannot be removed/edited/assigned user group — shows Owner + Full Access badges; remove Role field from add/edit form; remove "Users" from user group options
5. Remove Messages from sidebar nav and overview quick links
6. Sales History: new page with year dropdown, display (Sales by Product / Sales by Price), Generate Report + Export CSV buttons, results table below

## Response snapshot

All 6 changes implemented:

**Backend** (`account.py`):
- Added `GET /account/price-list-report` — returns products with variant prices (discount applied from tier)
- Added `GET /account/sales-history?year=&display=` — returns order data grouped by product (units+revenue) or itemized by price

**Frontend changes**:
1. Price list page fully redesigned — inline table showing retail vs your price, grouped by product, Export CSV
2. Profile: added EMPLOYEE_OPTIONS, SALES_REP_OPTIONS, HOW_HEARD_OPTIONS, US_STATES constants; replaced text inputs with selects for num_employees/num_sales_reps/how_heard/state_province/country; aligned primary_business options with wholesale form
3. Contacts: removed DEPARTMENTS const, removed `department` from form/EMPTY_FORM/handleEdit; removed Department pill UI and Email Notifications block from Entry tab; removed department badge from list cards
4. Users: removed ROLES const and `role` from EMPTY_FORM/handleEdit/submit; removed Role dropdown from form; "Users" removed from USER_GROUPS; table now detects `role==="owner"` — owner row shows Owner/Full Access badges and no action buttons; added user group assignment for non-owner form
5. Layout: replaced Messages with Sales History in NAV_ITEMS; overview page adds Sales History to quick links grid
6. New `sales-history/page.tsx` — year dropdown (current 5 years), radio for display mode, Generate + Export CSV, results table with totals row

## Outcome

- ✅ Impact: All 6 customer dashboard improvements delivered
- 🧪 Tests: npm run build PASS; manual verification needed after backend restart
- 📁 Files: 8 files modified/created
- 🔁 Next prompts: Further user group permission functionality (user mentioned "I will explain later")
- 🧠 Reflection: Owner protection is purely frontend UI for now — the backend /users DELETE endpoint should also guard against owner removal for full security
