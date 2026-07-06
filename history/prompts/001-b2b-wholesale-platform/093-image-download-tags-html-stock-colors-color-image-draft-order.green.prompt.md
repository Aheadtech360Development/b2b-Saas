---
id: "093"
title: Image Download, Tags, HTML Desc, Stock, Colors, Draft Order Rebuild
stage: green
date: 2026-04-17
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
command: /sp.green
labels: ["product-page","image-download","tags","html","stock","color-codes","draft-order","multi-step"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/app/(admin)/admin/orders/drafts/page.tsx
tests:
  - npx tsc --noEmit (TypeScript clean)
---

## Prompt

1. Image library download opens image in new tab instead of downloading
2. Tags added in admin product edit not being saved / not showing on product page at the top
3. `<p>` tags appearing literally in product page description instead of rendering HTML
4. Show stock count below each size input for selected color — green if >10, orange if 5-9, red if <5
5. Color codes missing — most swatches show gray. Add color codes for all defined colors
6. Clicking a color should update the main product image to that color's image (Shopify-style)
7. Rebuild Create Draft Order as multi-step: Step 1 company, Step 2 browse/add products, Step 3 review + notes

## Response snapshot

### Fix 1: Image download
- Replaced `<a download target="_blank">` (broken for cross-origin) with a fetch→blob→programmatic click approach
- Falls back to `window.open` if fetch fails
- Image click now also closes modal and sets that image as active

### Fix 2: Tags display on product page
- Tags already save correctly via `handleSave` → `adminService.updateProduct` → backend `ProductUpdate.tags`
- Added tags display at the top of ProductDetailClient: all non-"bestseller" tags rendered as gray pills alongside the "Best Seller" and "In Stock" badges

### Fix 3: HTML description rendering
- Changed `{product.description}` text rendering → `dangerouslySetInnerHTML={{ __html: product.description }}`
- TipTap-stored HTML now renders properly (paragraphs, bold, lists, etc.)

### Fix 4: Stock count below size inputs
- Added color-coded stock count `<div>` below each quantity input in the accordion:
  - Green (#059669) if stock > 10
  - Orange (#D97706) if stock 5–10
  - Red (#E8242A) if stock < 5
- Uses `variant.stock_quantity`

### Fix 5: Color codes
- Expanded COLOR_MAP in ProductDetailClient.tsx to ~50 entries
- Added: Sport Grey, Heather Grey, Athletic Heather, Dark Heather, Forest, Mustard, Stonewash Blue, Dark Navy, Indigo, Cardinal, Crimson, Carolina Blue, Columbia Blue, Silver, Ash, Stone, Mocha, Chocolate, Caramel, Camo, and more

### Fix 6: Click color → update image
- Updated `toggleColor` function: when expanding a new color, searches `images` array for one whose `alt_text` contains the color name (case-insensitive)
- If found, sets `activeImageIdx` to that image's index

### Fix 7: Rebuild Create Draft Order (3-step)
- Complete rewrite of `CreateDraftModal` in `drafts/page.tsx`
- **Step 1**: Company search typeahead (same as before), shows green confirmation when selected
- **Step 2**: Two-column layout — left: product search + browse list (click to expand variants with qty inputs) + "Add to Order" button; right: running order items sidebar with remove button and running total
- **Step 3**: Review table (product, variant, qty, unit price, total), PO number, notes, "Create Draft Order" button
- On submit: calls `POST /admin/orders/draft` then loops `POST /admin/orders/{id}/items` for each line item
- Step indicators with colored circles and check marks

## Outcome

- ✅ TypeScript clean (tsc --noEmit — only pre-existing test errors)
- ✅ 2 files modified
- ✅ No breaking changes
