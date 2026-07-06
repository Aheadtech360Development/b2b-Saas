---
id: "092"
title: Draft Items, Phone, Image Fix, Text Sizes, Dark BG, Best Sellers Cards
stage: green
date: 2026-04-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["draft-orders","phone","images","typography","dark-bg","best-sellers","ui"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/orders.py
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/customers/page.tsx
  - frontend/src/app/globals.css
  - frontend/src/components/home/BestSellers.tsx
  - frontend/src/components/home/WhoWeServe.tsx
  - frontend/src/components/home/CtaSection.tsx
  - frontend/src/components/home/HowItWorks.tsx
  - frontend/src/components/home/WhyChooseUs.tsx
  - frontend/src/components/home/CategoryGrid.tsx
  - frontend/src/components/home/FaqSection.tsx
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/app/(customer)/products/ProductListClient.tsx
tests:
  - npx tsc --noEmit (TypeScript clean)
---

## Prompt

1. Draft order — add items properly (currently no way to add products to a draft)
2. Customer phone number still not visible anywhere
3. Product/category card images cut from top and bottom — full image not visible
4. Black background sections: gray subtext should be #d3d0d0, headings white
5. 13px text → 15px; 15px text → 17px; non-bold text → font-weight 500
6. Home page Best Sellers cards should match collection page card style

## Response snapshot

### Fix 1: Draft order — add items
- Backend: Added `POST /api/v1/admin/orders/{id}/items` — takes `variant_id`, `quantity`, optional `unit_price`; creates OrderItem and recalculates order subtotal/total. Only works on pending/confirmed orders.
- Backend: Added `DELETE /api/v1/admin/orders/{id}/items/{item_id}` — removes item and recalculates totals.
- Frontend: Added "Add Product" section to ORDER ITEMS card in order detail, only shown for pending/confirmed orders. Features: product name/SKU search with debounced autocomplete, variant list dropdown (color/size/price), quantity input, "+ Add" button. Each existing item now has an "✕" remove button for draft orders.

### Fix 2: Phone display
- Admin customers list Contact column now shows `📞 {co.phone}` in addition to name and email.
- Phone data flows from owner user via company service enrichment (fixed in PHR #091).

### Fix 3: Image objectFit
- Changed `objectFit: "cover"` → `"contain"` in:
  - `ProductListClient.tsx` (collection page product cards)
  - `CategoryGrid.tsx` (category cards)
  - `BestSellers.tsx` (best sellers cards — now uses Next.js Image `fill` + contain)
- Full product images now visible without top/bottom cropping.

### Fix 4: Dark background text → #d3d0d0
- **WhoWeServe**: subheading `#555` → `#d3d0d0`; card descriptions already had `#d3d0d0` (confirmed)
- **CtaSection**: "Browse Catalog" link `#888` → `#d3d0d0`; border `#2a2a2a` → `#444`
- **Footer**: body text `#666` → `#d3d0d0`; links `#888` → `#d3d0d0`; copyright `#444` → `#d3d0d0`; column headings → `#fff`; payment method colors → `#d3d0d0`
- **Login page**: "Access your wholesale account" `#555` → `#d3d0d0`

### Fix 5: Font sizes + font-weight
- `globals.css`: Added `font-weight: 500` and `font-size: 15px` to `body` — covers all non-inline text globally
- **HowItWorks**: step descriptions `13px→15px`, `fontWeight: 500`
- **WhyChooseUs**: row descriptions `13px→15px`; subheading `14px→15px`
- **WhoWeServe**: descriptions `13px→15px`; subheading `14px→15px`
- **CategoryGrid**: descriptions `13px→15px`; "Shop →" links `13px→15px`
- **FaqSection**: question `14px→15px`; answer `14px→15px`
- **CtaSection**: CTA text `15px→17px`; button text `15px→17px`
- **Footer**: body `13px→15px`; links `13px→15px`

### Fix 6: Best Sellers cards → collection card style
- Complete rewrite using Next.js `Image` with `fill`+`contain` (same as ProductListClient)
- Added: color swatches (matching collection page), "In Stock" green badge, product code/fabric label
- Auth-gated pricing: shows price if logged in, "🔒 Login for pricing" if not (via `useAuthStore`)
- Same card hover class `prod-card-hover` as collection page

## Outcome

- ✅ TypeScript clean (tsc --noEmit)
- ✅ 14 files modified
- ✅ No breaking changes
