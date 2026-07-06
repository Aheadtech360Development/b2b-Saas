---
id: 105
title: VP Discount Amount Field + Customer Assignment Panel
stage: general
date: 2026-04-23
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: continue
labels: ["variant-pricing","discount-groups","customer-assignment","ux"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - null
---

## Prompt

1. In Individual Variant Pricing, in the price field the value entered should be the amount subtracted from the actual product price, and the percentage should be auto-calculated (not an input field).
2. In Discount Group modal, assigned customers are not showing. Always display assigned customers. Add an "Add" button that reveals all customers to select from. Show Remove button next to already-assigned customers.

## Response snapshot

**VP table (Issue 1):**
- Changed field label from `$` to `-$` (discount amount)
- Changed placeholder from "Price" to "0.00"
- Changed auto-calc formula from `((bp - enteredPrice) / bp * 100)` → `(discountAmt / bp * 100)` — now the entered value is the amount OFF, not the final price
- Removed the `discount %` input field entirely; percentage is now display-only
- Shows `— %` placeholder when no amount entered

**Customer assignment (Issue 2):**
- Removed `customerSearchResults` state and `searchCustomers()` function
- Added `showAddPanel` boolean state (reset in openCreateGroup + openEditGroup)
- "Assigned Customers" section always rendered with Remove buttons per row
- "+ Add" / "✕ Close" toggle button opens/closes the add panel
- Add panel: search input (autofocus) + scrollable list of all customers NOT already assigned, each with "Add" button
- When a customer is added via panel, they immediately appear in the assigned list (no panel close required)

## Outcome

- ✅ Impact: VP field now takes discount amount; % is auto-displayed. Customer assignment panel replaces the old inline search; assigned customers always visible.
- 🧪 Tests: Manual verification needed
- 📁 Files: 1 file modified
- 🔁 Next prompts: Run pending SQL queries; test modal flows end-to-end
- 🧠 Reflection: Showing the add panel without closing after each add improves UX for bulk assignments

## Evaluation notes (flywheel)

- Failure modes observed: None
- Graders run and results (PASS/FAIL): null
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Verify allCustomers loads correctly from adminService.listCompanies in the panel
