---
id: 132
title: Five Platform Updates — MOQ, Pages, Taxes, Sidebar
stage: general
date: 2026-05-03
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "5-task platform update: remove MOQ UI, 7 new customer pages + contact backend, admin taxes page, fix approval modal, restructure admin sidebar"
labels: ["feature","frontend","backend","admin","customer","pages","taxes","sidebar","moq"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/products/ProductCard.tsx
  - frontend/src/components/products/VariantMatrix.tsx
  - frontend/src/components/home/BestSellers.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(customer)/quick-order/page.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(admin)/admin/products/new/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/settings/page.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/contact/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/privacy-policy/page.tsx
  - frontend/src/app/(customer)/style-sheets/page.tsx
  - frontend/src/app/(customer)/product-specs/page.tsx
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/(admin)/admin/settings/taxes/page.tsx
  - backend/app/api/v1/admin/taxes.py
  - backend/migrations/versions/q0r1s2t3u4v5_add_tax_rates_table.py
  - backend/app/api/v1/contact.py
  - frontend/src/components/admin/ApprovalModal.tsx
  - frontend/src/services/admin.service.ts
  - backend/app/schemas/wholesale.py
  - frontend/src/components/layout/AdminSidebar.tsx
  - backend/app/main.py
tests:
  - manual: MOQ badges no longer appear on product cards or product detail page
  - manual: Admin product create/edit forms no longer show MOQ field
  - manual: Cart does not show MOQ violation warnings
  - manual: /about page loads with hero, stats, values, timeline, CTA
  - manual: /contact form submits and shows success state
  - manual: /private-label page loads with 5-step process
  - manual: /print-guide page loads with all 5 decoration methods
  - manual: /privacy-policy page loads with sidebar nav and 4 policy sections
  - manual: /style-sheets and /product-specs show Coming Soon
  - manual: Footer links point to new pages
  - manual: Header Resources dropdown includes new pages
  - manual: /admin/settings/taxes shows CRUD table
  - manual: Add/Edit/Delete/Toggle tax rate works
  - manual: Approval modal shows Discount Group + Notes (no Pricing Tier)
  - manual: Admin sidebar Settings section is now a dropdown with sub-items
  - manual: Analytics, Users, Audit Log appear under Settings sub-menu
---

## Prompt

Read the wireframe file at C:\Users\RT\Desktop\AF Apparel\AF-Apparels-Wireframe-COMPLETE.html and use it as the exact design reference for all pages. Then make the following 5 updates:

1. Remove all MOQ (Minimum Order Quantity) references from the entire codebase: Remove MOQ badge/label from product cards on listing page, Remove MOQ badge from product detail page, Remove "Minimum order quantity: X units" text from product detail page, Remove MOQ field from admin product create/edit forms, Remove MOQ validation from cart (MOQ violations check), Remove MOQ from cart validation response and CartValidation schema, Remove MOQ warnings from cart page UI, Keep the moq column in database but just don't display or enforce it anywhere in the UI

2. Create 7 new customer-facing pages and update the navigation/footer to include them. Also create a POST /api/v1/contact endpoint in the FastAPI backend that sends an email to the admin when someone submits the contact form.
   - about, contact, private-label, print-guide, privacy-policy, style-sheets (Coming Soon), product-specs (Coming Soon)

3. Create a new Taxes & Duties admin page at /admin/settings/taxes. Create a tax_rates table in the database with CRUD endpoints at /api/v1/admin/taxes. Build the frontend CRUD UI page with a table of tax rates, toggle enabled/disabled, add/edit modal, and delete confirmation.

4. On the wholesale application approval modal (the ApprovalModal component used in /admin/customers/applications), remove the "Pricing Tier" dropdown. Keep only: Discount Groups dropdown, Admin Notes textarea, and Approve button.

5. Restructure the admin sidebar: Move Analytics, Audit Log, and Users from top-level items to sub-items under a Settings dropdown. Settings section should be expandable and contain: General, Taxes & Duties, QuickBooks, Analytics, Users, Audit Log.

## Response snapshot

**Task 1 — MOQ Removal:**
- Removed MOQ badge from ProductCard.tsx
- Removed MOQ prop, moqWarnings useMemo, warning banner, belowMoq styling from VariantMatrix.tsx
- Removed 3 MOQ references from ProductDetailClient.tsx (badge, two "Minimum order quantity" texts, Min Order Qty in specs table)
- Removed MOQ indicator from quick-order page
- Removed MOQ line from BestSellers.tsx
- Removed MOQ import, checkout disabled check, hasViolation, and warning block from cart/page.tsx
- Removed moq from admin product new/edit forms and submit payloads
- Removed MOQ setting from admin settings page

**Task 2 — 7 Customer Pages:**
- Created about/page.tsx: hero + stats grid, values section, story + timeline, CTA
- Created contact/page.tsx: 2-col layout with form, info cards, hours, FAQ
- Created private-label/page.tsx: hero, who it's for, 5-step process, options + specs, CTA
- Created print-guide/page.tsx: hero, 5 decoration method cards with pros/cons/compatibility, matrix
- Created privacy-policy/page.tsx: sidebar nav + 4 policy sections (Shipping, Returns, Terms, Privacy)
- Created style-sheets/page.tsx: Coming Soon placeholder
- Created product-specs/page.tsx: Coming Soon placeholder
- Updated Footer.tsx with real links to all new pages
- Updated Header.tsx Resources dropdown with 6 links (About, Reviews, Print Guide, Private Label, Style Sheets, Contact)
- Created backend/app/api/v1/contact.py: POST /api/v1/contact → sends email via Resend in background task

**Task 3 — Taxes & Duties:**
- Created backend/app/api/v1/admin/taxes.py with TaxRate model + CRUD (list, create, patch, delete)
- Created migration q0r1s2t3u4v5_add_tax_rates_table.py
- Registered router in main.py
- Created frontend/src/app/(admin)/admin/settings/taxes/page.tsx: full CRUD table with toggle, edit modal, delete confirm

**Task 4 — Approval Modal Fix:**
- Removed Pricing Tier state, fetch, and UI from ApprovalModal.tsx
- Made pricing_tier_id optional in admin.service.ts and backend wholesale.py schema

**Task 5 — Sidebar Restructure:**
- Rewrote AdminSidebar.tsx: removed Analytics NavLink from Overview; added Settings as expandable dropdown with sub-items: General, Taxes & Duties, QuickBooks, Analytics, Users, Audit Log

## Outcome

- ✅ Impact: MOQ fully hidden from UI; 7 new customer pages live; Taxes CRUD admin page; cleaner approval flow; consolidated Settings sidebar
- 🧪 Tests: Manual
- 📁 Files: 27 files created/modified
- 🔁 Next prompts: None
- 🧠 Reflection: Contact form backend uses background task to avoid blocking response; TaxRate model defined inline in taxes.py to minimize file count; sidebar Settings dropdown auto-expands when any sub-route is active

## Evaluation notes (flywheel)

- Failure modes observed: none anticipated
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
