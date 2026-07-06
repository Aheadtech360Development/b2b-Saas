---
id: 081
title: Product Tabs Admin Input + Dynamic Display
stage: green
date: 2026-04-15
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: continuation
labels: ["product-tabs","admin","care-instructions","print-guide","size-chart"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/schemas/product.py
  - backend/app/services/product_service.py
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

Task 2: Product page tabs (Description, Specifications, Print Guide, Size Chart, Reviews) need admin input capability and dynamic data on the customer page.

## Response snapshot

**Backend:**
1. ProductDetail schema: added care_instructions, print_guide, size_chart_data fields
2. ProductUpdate schema: added same 3 fields so PATCH saves them
3. product_service.py get_product_detail dict: added care_instructions, print_guide, size_chart_data using getattr pattern

**Admin Edit Page — new "PRODUCT TABS CONTENT" section:**
- Care Instructions: textarea, saves to care_instructions text field
- Print Guide: checkbox grid of 8 print methods (DTF, Screen Printing, Embroidery, DTG, Heat Transfer, Sublimation, Vinyl, Laser Engraving) — saves as print_guide JSONB { methods: string[] }
- Size Chart: dynamic table editor with Add Row / delete row — columns: Size, Chest (in), Length (in), Sleeve (in) — saves as size_chart_data JSONB array
- All 3 fields included in handleSave payload

**ProductDetailClient — dynamic tabs:**
- Specifications: adds Fabric, Weight, Product Code rows from live data; appends Care Instructions box below table
- Print Guide: renders live methods from print_guide.methods; shows "coming soon" placeholder if empty
- Size Chart: renders live rows from size_chart_data array; shows "coming soon" placeholder if empty

## Outcome

- ✅ Impact: Admin can now set product tab content; customer page shows live data
- 🧪 Tests: Manual admin edit + product page verification required
- 📁 Files: 4 files modified
- 🔁 Next prompts: Task 3 (Quick Order redesign), Task 4 (Payment Methods edit)
- 🧠 Reflection: Used JSONB for print_guide/size_chart_data to allow flexible structure without schema changes
