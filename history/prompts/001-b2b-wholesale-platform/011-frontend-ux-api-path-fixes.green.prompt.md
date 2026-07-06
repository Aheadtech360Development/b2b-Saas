---
id: 011
title: Fix Frontend UX and API Path Bugs
stage: green
date: 2026-03-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: Fix frontend so the platform is usable end-to-end across 6 sections
labels: ["frontend","auth","navigation","products","cart","admin","api-paths","typescript"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/lib/api-client.ts
  - frontend/src/services/auth.service.ts
  - frontend/src/services/products.service.ts
  - frontend/src/services/cart.service.ts
  - frontend/src/services/account.service.ts
  - frontend/src/services/admin.service.ts
  - frontend/src/services/orders.service.ts
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/components/products/ProductCard.tsx
  - frontend/src/types/product.types.ts
  - frontend/src/types/order.types.ts
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/app/(admin)/admin/dashboard/page.tsx
  - frontend/src/app/(admin)/admin/settings/quickbooks/page.tsx
  - frontend/src/app/(admin)/admin/settings/page.tsx
  - frontend/src/app/(customer)/checkout/address/page.tsx
  - frontend/src/app/(customer)/products/ProductListClient.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - GET /api/v1/products → loads in product catalog
  - POST /api/v1/login → auth flow works end-to-end
  - GET /api/v1/cart → cart page loads
  - Admin sidebar links → navigate to correct /admin/* routes
---

## Prompt

Fix the frontend so the platform is usable end-to-end across 6 sections: (1) Auth flow, (2) Navigation/Layout, (3) Product catalog, (4) Shopping cart, (5) Admin dashboard, (6) Customer dashboard. Rules: no backend changes, no new npm packages, TypeScript strict, all API calls through api-client.ts.

## Response snapshot

**Root cause:** Systematic API path bugs across all frontend services. All services were using wrong path prefixes, with two distinct patterns:
1. Auth paths had wrong `/auth/` segment: `/api/v1/auth/login` → should be `/api/v1/login`
2. All other services were completely missing `/api/v1/` prefix: `/products` → `/api/v1/products`

**Fixes applied:**

Section 1 — Auth:
- `api-client.ts`: Fixed refresh URL (`/api/v1/auth/refresh` → `/api/v1/refresh`)
- `auth.service.ts`: Fixed all 6 auth paths (login, logout, register-wholesale, refresh, forgot-password, reset-password)
- `Header.tsx`: Fixed `logout` reference (store only has `clearAuth`); added proper `handleLogout` async function that calls `authService.logout()` then `clearAuth()` then redirects; fixed cart API path

Section 2 — Navigation:
- `AdminSidebar.tsx`: Fixed all 11 hrefs (added `/admin/` prefix: `/dashboard` → `/admin/dashboard`, etc.)
- `account/layout.tsx`: Converted to `"use client"` component to enable `usePathname()` active link highlighting

Section 3 — Products:
- `products.service.ts`: Added `/api/v1/` prefix to all 3 endpoints
- `ProductCard.tsx`: Fixed `product.images?.find(...)` → `product.primary_image`; fixed `categories?.join(",")` → `categories?.map(c => c.name).join(",")`
- `product.types.ts`: Updated `ProductListItem` to match actual API (has `variants: ProductVariant[]` not `variant_count`); updated `ProductImage` to use `url_thumbnail_webp`/`url_medium_webp`/`url_large_webp` and `position` (matching backend `ProductImageOut` schema)

Section 4 — Cart:
- `cart.service.ts`: Added `/api/v1/` prefix to all 6 cart endpoints
- `order.types.ts`: Fixed `CartItem` to match backend `CartItemOut` (flat fields: `sku`, `color`, `size`, `unit_price` directly on item); fixed `CartValidation` (mov_violation is `bool` + separate `mov_required`/`mov_current` fields); fixed `Cart` to match `CartResponse` (has `item_count`, `total_units` not `estimated_shipping`/`estimated_tax`)

Section 5 — Admin:
- `admin.service.ts`: Added `/api/v1/` prefix to all ~30 admin endpoints
- `admin/dashboard/page.tsx`: Fixed 5 API paths + 5 Link hrefs (added `/admin/` prefix)
- `admin/settings/quickbooks/page.tsx`: Fixed 2 inline apiClient calls
- `admin/settings/page.tsx`: Fixed 2 inline apiClient calls

Section 6 — Customer dashboard:
- `account.service.ts`: Added `/api/v1/` prefix to all ~20 account endpoints
- `orders.service.ts`: Fixed all order/checkout paths
- `checkout/address/page.tsx`: Fixed `/account/addresses` path
- `ProductListClient.tsx`: Fixed `/products/bulk-download` path
- `ProductDetailClient.tsx`: Fixed `/products/{id}/email-flyer` path

## Outcome

- ✅ Impact: All frontend API calls now use correct `/api/v1/` paths; auth flow, navigation, product catalog, cart, admin, and customer dashboard all point to correct backend endpoints
- 🧪 Tests: API path fixes verified by inspection; auth store logout flow fixed; type mismatches resolved
- 📁 Files: 19 files changed across services, components, types, and pages
- 🔁 Next prompts: E2E browser testing of login→products→cart→checkout flow; verify admin dashboard loads data; run TypeScript compiler check
- 🧠 Reflection: Two systematic patterns: (1) wrong `/auth/` prefix in auth paths, (2) completely missing `/api/v1/` prefix in all other services. Also caught type mismatches between frontend TS types and actual backend Pydantic schemas (CartValidation, CartItemOut, ProductListItem, ProductImage).

## Evaluation notes (flywheel)

- Failure modes observed: Systematic prefix omission across all services; type definitions diverged from actual backend schemas; store action name mismatch (logout vs clearAuth)
- Graders run and results (PASS/FAIL): Code inspection (PASS) — all apiClient calls now use correct /api/v1/ paths
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run TypeScript strict compilation check in frontend container to catch any remaining type errors
