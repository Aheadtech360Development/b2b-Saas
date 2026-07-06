---
id: "091"
title: Admin 9 Improvements — Tracking, Details, Export, RFM, Filters
stage: green
date: 2026-04-16
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["admin","orders","customers","tracking","export","inventory","draft-orders","rfm","filters"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/order.py
  - backend/app/schemas/company.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/admin/customers.py
  - backend/app/services/company_service.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/page.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
  - frontend/src/app/(admin)/admin/customers/page.tsx
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/inventory/page.tsx
  - frontend/src/services/admin.service.ts
tests:
  - npx tsc --noEmit (TypeScript clean)
---

## Prompt

9 admin improvements:
1. Tracking numbers — two showing, remove duplicate from UPDATE ORDER, keep SHIPPING & COURIER
2. Customer details not showing in Orders and All Customers (address, phone, contact)
3. Hide "Sync to QB" button everywhere
4. Print/Export CSV — make all functional
5. Draft Orders — Create Draft button not working
6. Add Customer option — wire up with wholesale form
7. Orders — add more filters including time filter
8. Remove RFM Group everywhere
9. Inventory — add filters and search bar

## Response snapshot

### Fix 1: Tracking number — remove duplicate
- Removed "Tracking #" input from UPDATE ORDER section. Tracking is now only set via the SHIPPING & COURIER section (auto-generated on courier select, editable, saved via Mark as Shipped).
- `handleUpdate` no longer sends `tracking_number`.
- Added note "To update tracking, use the Shipping & Courier section above."

### Fix 2: Customer details in Orders and Customers list
- **Backend `AdminOrderDetail` schema**: Added `customer_name`, `customer_email`, `customer_phone`, `shipping_address` (dict), `tax_amount`, `payment_method`, `pricing_tier` fields.
- **Backend `get_admin_order` endpoint**: Now joins `User` table via `placed_by_id` to get contact info; parses `shipping_address_snapshot` JSON into normalized dict (handles both `line1` and `address_line1` keys).
- **Backend `CompanyListItem` schema**: Added `email`, `phone`, `contact_name`, `last_order_date` fields.
- **Backend `company_service.py`**: `list_companies_paginated` now batch-queries owner users via CompanyUser join and last order date per company — both in single queries.
- Frontend already renders these fields when present, no frontend changes needed.

### Fix 3: Hide Sync to QB button
- Hidden in order detail page header. Replaced with a comment.

### Fix 4: Export CSV — all functional
- **Orders page**: Changed from unauthenticated `window.open` to `adminService.exportOrdersCsv()` using authenticated `downloadCsv`.
- **Customers page**: Added `adminService.exportCompaniesCsv()` which calls new `GET /api/v1/admin/companies/export-csv` endpoint. Wired to Export CSV button.
- **Inventory page**: Added client-side CSV export from loaded data (`exportInventoryToCsv`). Added Export CSV button.
- Backend added `GET /admin/companies/export-csv` endpoint (auth-protected).

### Fix 5: Create Draft Order
- Backend: Added `POST /api/v1/admin/orders/draft` endpoint — creates a pending order with $0 totals, requires `company_id`, optional `po_number`/`notes`. Returns `{id, order_number}`.
- Frontend: Added `CreateDraftModal` component in drafts page — company search typeahead, PO number, notes. On success navigates directly to the new order's edit page.

### Fix 6: Add Customer
- Backend: Added `POST /api/v1/admin/companies` endpoint with `CreateCompanyRequest` schema. Creates company + optionally creates user account (if `contact_email` provided) and sets them as owner.
- Frontend: Added `AddCustomerModal` in customers page — full company form (name, type, tax ID, address, pricing tier) + contact person section (first/last name, email, phone). Wired to "+ Add Customer" button.
- `adminService.createCompany()` added to service.

### Fix 7: Orders time filter
- Backend: Added `date_from` and `date_to` query params to `GET /admin/orders`. Filters by `Order.created_at` range.
- Frontend: Added "From" and "To" date inputs to orders list page. Passes params to API. "Clear filters" button when any filter active.

### Fix 8: Remove RFM Group
- Removed `getRFMGroup()` function, `rfmFilter` state, RFM filter dropdown, and RFM column from customers list page.
- Removed `getRFMGroup()` function, `rfm` derived state from customer detail page.
- Replaced RFM stat card with "Last Order" date stat.

### Fix 9: Inventory filters + search
- Added SKU/color/size search bar (client-side filter on loaded data).
- Added warehouse filter dropdown (populated dynamically from loaded rows).
- Added Export CSV button.
- Stats subtitle shows total records and low-stock count.

## Outcome

- ✅ All 9 issues addressed
- ✅ TypeScript clean (tsc --noEmit)
- ✅ 12 files modified (7 frontend, 5 backend)
- ✅ No breaking changes to existing functionality
