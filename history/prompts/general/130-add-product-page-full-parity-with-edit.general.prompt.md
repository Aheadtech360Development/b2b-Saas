---
id: 130
title: Add Product page full parity with Edit Product
stage: general
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: add all missing fields to Add Product page
labels: ["feature","frontend","admin","products"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/products/new/page.tsx
tests:
  - manual: Add Product page shows all sections matching Edit Product page
  - manual: Bulk variant generator modal works (colors + size checkboxes)
  - manual: Product Tabs Content (care instructions, print guide, size chart) saves on create
  - manual: SEO section with edit/preview toggle works
  - manual: Marketing flyer PDF uploads after product creation
  - manual: Rich text editor loads for description
---

## Prompt

On the Admin page in All Products, when we click +Add Product, all the fields are not appearing that we see when we open an already added product. So in Add Product, we need exactly the same things that are visible in an already created product. For example, right now the Add Variant section is not there, and things like marketing flyer etc. are also not included — only basic fields are present. So all those things need to be added.

## Response snapshot

Full rewrite of `new/page.tsx` to match the Edit Product page layout. Sections added:

**Rich text editor**: Replaced plain `<textarea>` with the same dynamic `RichTextEditor` component used in the edit page.

**Bulk Variant Generator**: Replaced the simple row-table with the Shopify-style modal (same as Edit page) — comma-separated colors input, size checkboxes with Select All/Clear, price field, preview count. Variants are staged in `pendingVariants[]` state and created via API after the product is saved. Displayed grouped by color in collapsible rows with delete buttons.

**Product Tabs Content** (new section in right sidebar):
- Care Instructions textarea
- Print Guide checkboxes (8 print methods, same as edit page)
- Size Chart table editor with Add/Remove row
All three fields sent in the creation payload as `care_instructions`, `print_guide`, `size_chart_data`.

**SEO section** (new): Edit/Preview toggle with meta_title, meta_description fields and live character counters. Sent in creation payload.

**Marketing Flyer** (new): File picker stores flyer as `pendingFlyer` state. After product creation and variant creation, flyer is posted to `/api/v1/admin/products/{id}/upload-flyer`.

**Status sidebar button**: Added a second "Create Product" button in the Status card (mirrors edit page pattern).

**Removed** the "After creation you can add..." advisory note (replaced with actual sections).

## Outcome

- ✅ Impact: Add Product page now has feature parity with Edit Product page — all fields visible and functional
- 🧪 Tests: Manual
- 📁 Files: 1 file rewritten (new/page.tsx)
- 🔁 Next prompts: None
- 🧠 Reflection: Staging pattern (collect → create product → batch upload images/variants/flyer) works well for new product creation where the product ID is needed for sub-resource endpoints.

## Evaluation notes (flywheel)

- Failure modes observed: none anticipated
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
