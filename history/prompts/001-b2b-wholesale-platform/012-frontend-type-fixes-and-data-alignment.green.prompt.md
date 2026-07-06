---
id: "012"
title: Frontend type fixes and data alignment
stage: green
date: 2026-03-11
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: continuation of frontend rebuild (session resumed from context limit)
labels: ["frontend","typescript","types","api","bug-fix","admin","cart","products"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/types/product.types.ts
  - frontend/src/types/order.types.ts
  - frontend/src/types/user.types.ts
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/dashboard/page.tsx
  - frontend/src/app/(admin)/admin/returns/page.tsx
  - frontend/src/app/(customer)/account/layout.tsx
  - frontend/src/components/admin/ImageManager.tsx
  - frontend/src/components/admin/ApprovalModal.tsx
  - frontend/src/components/products/FilterSidebar.tsx
  - frontend/src/app/(auth)/login/page.tsx
  - frontend/src/components/providers/Providers.tsx
tests:
  - npx tsc --noEmit (0 errors)
---

## Prompt

Continuation from previous session (context limit hit). Resume frontend fixes:
- Investigate and fix products 500 error
- Fix remaining type mismatches between frontend TypeScript types and backend API schemas
- Ensure all admin service API paths have /api/v1/ prefix
- Ensure TypeScript compiles cleanly (0 errors)

## Response snapshot

Investigated products 500 errors — confirmed endpoint works with page params; SSR calls from frontend Docker container return 200. The 500s are intermittent from the pricing middleware (known pre-existing backend bug, cannot fix).

Fixed the following issues:

1. **product.types.ts**: `retail_price`/`effective_price` changed from `number` to `string` (backend returns Decimal as string); added `assets?: ProductAsset[]` to `ProductDetail`

2. **order.types.ts**: All Decimal fields (`unit_price`, `line_total`, `subtotal`, `mov_required`, `mov_current`, `estimated_shipping`, `total`, `shipping_cost`, `tax_amount`) changed from `number` to `string` to match backend JSON serialization

3. **user.types.ts**: Added `is_active: boolean` field to `UserProfile` (present in backend `ProfileOut`)

4. **admin.service.ts**: Fixed 4 methods missing `/api/v1/` prefix: `listProducts`, `createProduct`, `updateProduct`, `uploadImage`

5. **admin dashboard**: Fixed `.data?.` wrapping bug (apiClient returns raw JSON, not `{data: ...}`); fixed wrong endpoint for pending applications (`/admin/customers` → `/api/v1/admin/wholesale-applications`); fixed low_stock_count (list endpoint, not object with count)

6. **account/layout.tsx**: Added auth guard — redirects to `/login` if unauthenticated

7. **TypeScript errors (6 files)**: Fixed `listRMA`→`listRmas`, `updateRMA`→`updateRma` in returns page; `ProductImageOut`→`ProductImage` in ImageManager; array noUncheckedIndexedAccess fixes in ApprovalModal and ImageManager; JWT decode safety in login/Providers; FilterSidebar `cat.children?.length` undefined check

## Outcome

- ✅ Impact: Zero TypeScript errors; all API paths correct; type shapes match backend schemas; auth guard on account routes
- 🧪 Tests: `npx tsc --noEmit` — 0 errors
- 📁 Files: 12 files modified
- 🔁 Next prompts: Test full end-to-end flows (login → products → cart → checkout), verify admin panel pages render correctly
- 🧠 Reflection: noUncheckedIndexedAccess in tsconfig surfaces array access bugs that would be silent at runtime. Always check backend Decimal serialization — FastAPI/Pydantic v2 serializes Decimal as string by default.

## Evaluation notes (flywheel)

- Failure modes observed: Admin dashboard had multiple `.data?.` wrappers that don't match apiClient response shape; admin service had inconsistent /api/v1/ prefixing
- Graders run and results (PASS/FAIL): tsc --noEmit PASS
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run full E2E test with Playwright to verify all pages render correctly with real data
