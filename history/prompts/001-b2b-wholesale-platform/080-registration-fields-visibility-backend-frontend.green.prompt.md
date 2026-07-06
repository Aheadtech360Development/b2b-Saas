---
id: 080
title: Registration Fields Visibility — Backend + Frontend
stage: green
date: 2026-04-15
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: continuation
labels: ["registration-fields","wholesale","admin","customer-profile","migrations"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/wholesale.py
  - backend/migrations/versions/j3k4l5m6n7o8_add_wholesale_application_fields.py
  - backend/app/services/auth_service.py
  - backend/app/services/wholesale_service.py
  - backend/app/schemas/auth.py
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(customer)/account/profile/page.tsx
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
tests:
  - none
---

## Prompt

All registration fields should be visible/editable in:
- Admin > Customers > [id]
- Admin > Orders > [id]
- Customer Account Profile (with edit)
- Customer Order Status
Also provide DB migration instructions for production DB.

## Response snapshot

**Backend:**
1. Added 16 new fields to `WholesaleApplication` model (company_email, address_line1-2, city, state_province, postal_code, country, how_heard, num_employees, num_sales_reps, secondary_business, estimated_annual_volume, ppac_number, ppai_number, asi_number, fax)
2. Created new migration `j3k4l5m6n7o8_add_wholesale_application_fields.py` for `wholesale_applications` table
3. Updated `auth_service.register_wholesale()` to save all new fields onto WholesaleApplication using `getattr(data, field, None)` pattern
4. Updated `wholesale_service.approve()` to copy all new fields from application to Company when approving
5. Updated `RegisterWholesaleRequest` schema to include fax, secondary_business, estimated_annual_volume, ppac, ppai, asi fields

**Frontend:**
1. Admin Customer Detail: Added new fields to `Customer` interface, added "Registration Information" card in right sidebar showing address, business numbers, employee counts, how_heard
2. Admin Order Detail: Added `CompanyRegistration` interface, fetches company detail on load, displays "Company Registration Info" section inside CUSTOMER card
3. Customer Profile: Added new fields to interface and companyForm state, added "Address & Registration" section to the edit form
4. Customer Order Status: Fetches profile/full on load, shows "Billing / Company Address" card when data available

## Outcome

- ✅ Impact: All new registration fields flow from signup form → WholesaleApplication → Company → visible in admin and customer pages
- 🧪 Tests: Manual verification required after migration
- 📁 Files: 9 files modified/created
- 🔁 Next prompts: Task 2 (product tabs admin input), Task 3 (Quick Order redesign), Task 4 (Payment Methods edit)
- 🧠 Reflection: Used getattr(..., None) pattern throughout for production safety before migration runs

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
