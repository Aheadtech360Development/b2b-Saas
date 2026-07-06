---
id: 121
title: Five Platform Improvements
stage: general
date: 2026-04-27
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: manual
labels: ["pricing","bulk-delete","image-gallery","discount-groups","cart-badge"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/ProductListClient.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
  - frontend/src/components/admin/ApprovalModal.tsx
  - frontend/src/services/admin.service.ts
  - backend/app/schemas/wholesale.py
  - backend/app/services/wholesale_service.py
  - frontend/src/app/(customer)/checkout/review/page.tsx
tests:
  - none
---

## Prompt

On the collection page, the product card is showing the retail price even for logged-in users. For logged-in users, the wholesale price should be shown, and for logged-out users, the MSRP (retail) price should be shown. In All Products, there is an option for bulk edit, but there is no option for bulk delete, so add that. Okay, if I add 3 to 4 images for one color in products, how will I display those same color images in a line? I mean, all images of the same color should appear together. In Customers → Applications, when I approve an application, in Shipping Tier it is showing the old tiers, not the Discount Group tiers, so fix this as well. Also, replace Shipping Tier with Discount Groups and show its tiers/groups there. After completing checkout and placing the order, the cart icon is still showing the old quantity even though the order has already been placed.

## Response snapshot

**Issue 1 — Collection page pricing for logged-in users** — `frontend/src/app/(customer)/products/ProductListClient.tsx`:
- Root cause: Next.js SSR server component fetches products without auth token; backend returns MSRP via `effective_price` for all server-side requests
- Added `products` state initialized from `initialProducts`; `authedFetchDone` ref
- Added `useEffect` that triggers when `isAuthenticated` becomes true: re-fetches `/api/v1/products?{currentFilters}` using `apiClient.get()` (auto-attaches in-memory access token), updates `products` state with wholesale prices
- All render references changed from `initialProducts` to `products` state

**Issue 2 — Bulk delete in All Products** — Already implemented; `handleBulkDelete` and Delete button existed in the codebase. No changes made.

**Issue 3 — Images grouped by color in product detail** — `frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx`:
- Added `lastExpandedColor` derived from `expandedColors[expandedColors.length - 1]`
- Added `orderedImages`: when a color is expanded, images matching that color's name in `alt_text` float to the front; non-matching images follow
- Replaced `images` with `orderedImages` in main image display and thumbnail strip
- `toggleColor()`: on new color expansion, sets `activeImageIdx(0)` (first image is now the first matching image)

**Issue 4 — Applications: Discount Groups** — 4 files:
- `frontend/src/services/admin.service.ts`: Added `listDiscountGroups()` → `GET /api/v1/admin/discount-groups`; updated `approveApplication` signature to accept `discount_group_id` instead of `shipping_tier_id`
- `frontend/src/components/admin/ApprovalModal.tsx`: Replaced `ShippingTier` interface/state/dropdown with `DiscountGroup`; fetches from `listDiscountGroups()`; sends `discount_group_id` (optional) instead of `shipping_tier_id` (required); Approve button requires only `pricing_tier_id`
- `backend/app/schemas/wholesale.py`: Added `discount_group_id: uuid.UUID | None = None`; made `shipping_tier_id` optional (`uuid.UUID | None = None`)
- `backend/app/services/wholesale_service.py`: Imported `DiscountGroup` model; after company flush, if `discount_group_id` provided, loads `DiscountGroup`, reads `customer_tag`, sets `company.tags = [customer_tag]`

**Issue 5 — Cart badge after checkout** — `frontend/src/app/(customer)/checkout/review/page.tsx`:
- After `clearCart()`, dispatches `window.dispatchEvent(new Event("cart_updated"))` so Header re-fetches cart count and resets badge to 0

## Outcome

- ✅ Issue 1: Product list now re-fetches with auth token on login; wholesale prices shown for authenticated users
- ✅ Issue 2: Bulk delete already existed — no change needed
- ✅ Issue 3: Product detail thumbnail strip re-orders to show selected color's images first
- ✅ Issue 4: Approval modal now shows Discount Groups dropdown; assigns `company.tags` with the group's `customer_tag` on approval
- ✅ Issue 5: Cart badge resets to 0 immediately after order placement
- 🧪 Tests: None automated
- 📁 Files: 7 files modified
- 🔁 Next prompts: None identified
- 🧠 Reflection: SSR auth gap (Issue 1) is a recurring pattern — client-side re-fetch on auth is the standard fix for this stack

## Evaluation notes (flywheel)

- Failure modes observed: replace_all on ProductListClient clobbered interface prop name (self-introduced, self-fixed)
- Graders run and results: none
- Prompt variant: null
- Next experiment: null
