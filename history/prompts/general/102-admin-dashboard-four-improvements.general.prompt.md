---
id: "102"
title: Admin Dashboard Four Improvements
stage: general
date: 2026-04-22
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: admin dashboard improvements — order items edit mode, draft orders filter, shopify-style variant creation, customer tier discount groups + individual variant pricing
labels: ["admin-dashboard","orders","variants","customer-tiers","discount-groups"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
tests:
  - npm run build — PASS
---

## Prompt

Four admin dashboard changes:
1. All Orders → Order detail: hide "Add product" by default; add Edit button in ORDER ITEMS header; clicking Edit shows options AND a ✕ to close; Edit button visible only for status pending/confirmed/processing (not after)
2. Draft Orders — do not show regular pending orders; only show orders created by "Create Draft Order" button
3. All Products → Product edit → Variants: Shopify-style variant addition (add multiple colors at once, sizes auto-apply); add checkboxes before each variant for selective "Apply to selected"
4. Customer Tier dropdown — add two new tabs/sections: Discount Groups (heading + Create button, list with search/sort; Create form has Title, Customer Tag, Applies To, Minimum Requirements, Shipping Rate, Status toggle) and Individual Variant Pricing (products × tiers grid with price + % inputs per cell)

## Response snapshot

All 4 changes implemented:

**Order Items Edit Mode** (`admin/orders/[id]/page.tsx`):
- Added `editingItems: boolean` state
- Added Edit/✕ Done Editing button in ORDER ITEMS header, visible only for `["pending","confirmed","processing"]` statuses
- Add Product section now only shows when `editingItems === true`
- Remove item (✕) button now only visible when `editingItems === true`

**Draft Orders filter** (`admin/orders/drafts/page.tsx`):
- After fetching `?status=pending`, filters client-side: `.filter(o => o.order_number.startsWith("DRAFT-"))`
- Regular checkout pending orders no longer appear in Draft Orders

**Shopify-style variant creation** (`admin/products/[slug]/edit/page.tsx`):
- Replaced single-variant modal with multi-variant modal
- Color input: comma-separated field with chip preview
- Size input: checkbox grid (XS–One Size) with Select All/Clear
- Preview: "Will create N variants (X colors × Y sizes)"
- Creates all N×M combinations in sequence
- Added `selectedVariantIds: Set<string>` state with per-row checkboxes
- Added group-level "select all" checkbox in table header
- Renamed "Apply" → "Apply to All" + added "Apply to Selected (N)" button (green)

**Customer Tier tabs** (`admin/customers/tiers/page.tsx`):
- Complete page rewrite with 3-tab navigation: Customer Tiers | Discount Groups | Individual Variant Pricing
- Discount Groups tab: search bar, list table (Title/Tag/AppliesTo/MinReq/Shipping/Status), full Create/Edit modal with: Title, Customer Tag, Applies To (radio: store/collections/products), Min Requirements (radio: none/amount/quantity with inline input), Shipping Rate (Store Default/Flat Rate with amount field), Status toggle
- Individual Variant Pricing tab: products × tiers spreadsheet-style grid with $ price + % discount inputs per cell, search filter, Save Pricing button

## Outcome

- ✅ Impact: All 4 admin dashboard improvements delivered
- 🧪 Tests: npm run build PASS
- 📁 Files: 4 files modified
- 🔁 Next prompts: Backend endpoints needed for `/api/v1/admin/discount-groups` and `/api/v1/admin/variant-pricing` to make those two tabs functional
- 🧠 Reflection: Draft orders filter is purely client-side; a backend `is_draft` query param would be cleaner for pagination at scale
