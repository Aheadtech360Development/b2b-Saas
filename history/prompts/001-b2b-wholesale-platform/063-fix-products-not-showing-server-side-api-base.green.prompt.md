---
name: "Fix products not showing — server-side API_BASE fallback"
description: "Root cause: server-side api-client used INTERNAL_API_URL (unset on Vercel) instead of falling back to NEXT_PUBLIC_API_URL, so products fetch silently returned empty. Also added force-dynamic to products page."
type: green
id: "063"
stage: green
date: "2026-03-30"
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
labels: ["bug-fix", "deployment", "products", "next.js", "vercel"]
---

## Prompt

Find if there's any stock filter being applied that hides products with stock_quantity = 0. If found, remove the stock filter OR change it to show all active products regardless of stock.

## Investigation

Traced the full stack — no stock filter found anywhere:
- `products/page.tsx` — no filter, passes all active products
- `ProductListClient.tsx` — no filter, renders all `initialProducts`
- `ProductCard.tsx` — no filter, renders each product as-is
- `products.service.ts` — no filter, sends only category/size/color/q/page params
- `backend/app/api/v1/products.py` — no filter, delegates to ProductService
- `backend/app/services/product_service.py` — filters only by `Product.status == "active"`; `_attach_pricing_and_stock` adds stock_quantity to variants but does NOT exclude zero-stock products

**Real root cause:** `frontend/src/lib/api-client.ts` line 3-5 uses `INTERNAL_API_URL` for server-side requests (Next.js server components running on Vercel). That env var was never set on Vercel, so it fell back to `http://localhost:8000` — no backend exists there — fetch failed silently, and `Promise.allSettled` caught the error and returned `{ items: [], total: 0 }`.

## Changes

### `frontend/src/lib/api-client.ts`
- Server-side `API_BASE` now falls back to `NEXT_PUBLIC_API_URL` when `INTERNAL_API_URL` is not set:
  ```typescript
  const API_BASE =
    typeof window === "undefined"
      ? (process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000")
      : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000");
  ```

### `frontend/src/app/(customer)/products/page.tsx`
- Added `export const dynamic = "force-dynamic"` to prevent static rendering at build time (would fetch from wrong URL during Vercel build).

## Files Modified
- `frontend/src/lib/api-client.ts`
- `frontend/src/app/(customer)/products/page.tsx`

## Outcome
Products will now load correctly on production (Vercel). Server components fall back to `NEXT_PUBLIC_API_URL` (the Railway backend URL) when `INTERNAL_API_URL` is not configured.
