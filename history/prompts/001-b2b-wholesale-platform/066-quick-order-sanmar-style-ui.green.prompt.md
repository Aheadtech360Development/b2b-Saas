---
name: "Quick Order SanMar-style UI"
description: "Built full SanMar-inspired Quick Order page with autocomplete search, color/size grid, multiple rows, and cart integration."
type: green
id: "066"
stage: green
date: "2026-04-03"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
labels: ["feature", "quick-order", "ux", "cart"]
---

## Prompt

Build a Quick Order page for AF Apparels frontend inspired by the SanMar-style quick order UI.

Features: style number search with autocomplete, color dropdown, size quantity inputs (dynamic columns per color), multiple rows (start with 3), add to cart, shipping address bar link.

## Implementation

### `frontend/src/app/(customer)/quick-order/page.tsx`

Full rewrite of the previous SKU text-area approach. New SanMar-style UI with:

- **Style search autocomplete**: Debounced input (300ms, min 2 chars) calls `productsService.listProducts({ q, page_size: 10 })`. Dropdown shows thumbnail, name, SKU, unit price.
- **Product selection**: On select, fetches full detail via `productsService.getProductBySlug(slug)`. Auto-selects first color.
- **Color dropdown**: Populated from `productDetail.variants` unique colors.
- **Size quantity grid**: Dynamic columns per color (XS/S/M/L/XL/2XL/3XL ordered). Each column shows size label + unit price. Blue-bordered input when qty > 0.
- **Row totals**: Units + price summed per row. Grand total shown in header.
- **Multiple rows**: Starts with 3 empty rows. "+ Add Style" adds more. Copy (duplicate) and delete per row.
- **Checkbox selection**: Per-row checkbox + bulk "Remove selected" toolbar.
- **Add to Shopping Box**: Calls `cartService.addMatrix(productId, items)` for each active row.
- **Status banner**: Success (with View Cart link) or error after cart submission.
- **Dropdown UX**: `onMouseDown` (not onClick) on dropdown items prevents blur race condition. Click outside (page-level onClick) closes all dropdowns.

### Sub-components (in same file)
- `AddToCartBtn` — disabled state when no quantities
- `ActionBtn` — hover state for copy/delete with danger variant

## Files Modified
- `frontend/src/app/(customer)/quick-order/page.tsx`

## TypeScript fixes applied
1. `cartService.addMatrix` expects `MatrixItem[]` with `quantity: number` (not `number | undefined`) — used `.flatMap` with explicit guard
2. Spread copy of `QuickOrderRow` triggered optional-field widening — replaced with explicit field assignment
3. `prev[idx]` possibly undefined — added `!` non-null assertion after guard

## Outcome
Build passes (48/48 pages). Committed `0322fac`, pushed to origin/main.

Header already had Quick Order link at `/quick-order` for authenticated non-admin users — no header changes needed.
