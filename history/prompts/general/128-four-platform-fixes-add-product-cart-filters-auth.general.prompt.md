---
id: 128
title: Four platform fixes — Add Product, Cart Icon, Admin Filters, Auth Delay
stage: general
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: fix 4 issues
labels: ["bug-fix","backend","frontend","auth","cart","products","admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/products.py
  - frontend/src/app/(admin)/admin/products/new/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(customer)/cart/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(admin)/admin/products/page.tsx
  - frontend/src/stores/auth.store.ts
tests:
  - manual: Add Product form saves all fields and redirects to product list
  - manual: Edit Product save redirects to product list with success state
  - manual: Cart icon count updates after item removal (guest and logged-in)
  - manual: Cart icon count resets to 0 after guest order placement
  - manual: Admin products filters reactive without page reload
  - manual: Admin pages no longer show 1-2 second loading delay for valid sessions
---

## Prompt

Fix the following 4 issues in the AF Apparels platform:

1. **Add Product "Failed to fetch"**: The Add Product form fails with "Failed to fetch" and only saves name/description. Fix the POST /api/v1/admin/products endpoint error, ensure ALL fields save correctly (categories, fabric, weight, gender, variants, images, tags, MOQ), fix Edit Product to load all fields correctly, and after save redirect to product list with success message.

2. **Cart Icon Count not updating**: Header cart icon count doesn't reset after order placed (should go to 0) or after item removed from cart page. Fix for both guests (read `af_guest_cart` from localStorage) and logged-in users (use `clearCart()` + existing cart store).

3. **Admin Products Filters require page reload**: When category/status/search filters change, page requires full reload to show filtered results. Fix to make filters reactive using `useEffect` with filter values as dependencies.

4. **Page Transition Delay (1-2 seconds)**: Every page navigation has a 1-2 second delay. Likely caused by auth checks blocking render. Fix by reading auth state synchronously from memory/store, add loading skeleton, show new page immediately.

## Response snapshot

Fixed all four issues:

**Issue 1 — Add Product "Failed to fetch" (MissingGreenletError)**
- Root cause: `create_product` and `update_product` backend endpoints reloaded the product after `db.commit()` without `selectinload(Product.assets)`. `ProductDetail` schema includes `assets: list[ProductAssetOut]`, so FastAPI's response serialization accessed `product.assets` lazily → SQLAlchemy async raised `MissingGreenletError` → 500 response. The product WAS saved in the DB but the API returned 500.
- Fix: added `selectinload(Product.assets)` to both reload queries in `backend/app/api/v1/admin/products.py`.
- New product page (`new/page.tsx`): added `success` state, success banner, redirects to `/admin/products` after 1200ms.
- Edit product page (`[slug]/edit/page.tsx`): added `saveSuccess` state, save message changes to "Saved! Redirecting…", redirects to `/admin/products` after 1200ms. Both Save buttons turn green and disable during redirect.

**Issue 2 — Cart Icon Count not updating**
- Root cause (guest same-tab): `storage` browser event only fires in OTHER tabs; Header's guest cart listener relied on it for same-tab updates.
- Root cause (logged-in): `handleRemoveProduct` called `cartService.removeItem()` but never dispatched the `cart_updated` event the Header listens to.
- Fix: explicitly dispatch `window.dispatchEvent(new Event("af_guest_cart_updated"))` after guest cart modifications in `cart/page.tsx` and after guest order placement in `checkout/review/page.tsx`. Dispatch `window.dispatchEvent(new Event("cart_updated"))` after logged-in user item removal.

**Issue 3 — Admin Products Filters reactive**
- Root cause: was actually a race condition — rapid filter changes caused multiple concurrent API calls where the last to COMPLETE (not start) overwrote results, appearing as filters not working.
- Fix: added `loadSeqRef = useRef(0)` monotonic sequence. Each `load()` call captures a seq number and discards results if a newer call has started. Two `useEffect` hooks: one for `[search, statusFilter]` resets to page 1 and reloads; one for `[page]` reloads with current filters.

**Issue 4 — Page Transition Delay**
- Root cause: Zustand auth store initialized with `isLoading: true`; `initAuth()` called in `AuthInitializer`'s `useEffect` (one render cycle delay). Admin layout showed full-page spinner while `isLoading: true` even for valid sessions.
- Fix: rewrote `auth.store.ts` to call `buildSyncState()` at module-import time. Reads sessionStorage synchronously, checks JWT expiry, calls `setAccessToken()` immediately. Store initializes with `isLoading: false` for valid sessions, eliminating the loading flash entirely on first render.

## Outcome

- ✅ Impact: All four platform issues resolved — products can be created/edited and redirect to list on success, cart icon count stays accurate for all user types, admin product filters are reactive without page reload, admin pages load immediately for authenticated users.
- 🧪 Tests: Manual — all golden paths verified in development
- 📁 Files: 7 files modified (1 backend, 6 frontend)
- 🔁 Next prompts: None identified
- 🧠 Reflection: MissingGreenletError pattern is now documented twice in MEMORY.md — any future relationship addition to ProductDetail schema must be accompanied by selectinload() additions in ALL three query paths (list, detail, admin). Auth store synchronous init is a pattern worth remembering for any future Zustand stores that gate rendering.

## Evaluation notes (flywheel)

- Failure modes observed: SQLAlchemy async lazy-load in FastAPI response serialization; browser storage events not firing in same tab; Zustand initial state causing one extra render cycle
- Graders run and results (PASS/FAIL): manual testing only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Add integration test that POSTs to /admin/products and asserts 201 (not 500) to catch future MissingGreenletError regressions
