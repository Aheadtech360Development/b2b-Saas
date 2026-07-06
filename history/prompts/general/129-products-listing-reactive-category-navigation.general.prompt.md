---
id: 129
title: Products listing reactive to category navigation
stage: general
date: 2026-04-29
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: fix products page not reacting to category nav clicks
labels: ["bug-fix","frontend","products","navigation","next.js"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/ProductListClient.tsx
tests:
  - manual: Click "T-Shirts" in header nav — product grid updates without page reload
  - manual: Click "Hoodies" then "Shop All" — grid updates correctly each time
  - manual: Sidebar category/color/size/gender filters update grid reactively
  - manual: Authenticated user sees wholesale prices after category switch
  - manual: Guest user sees updated products after category switch
---

## Prompt

Fix the customer-facing collection/products listing page so that clicking category links in the header navbar does not require a page reload to show filtered products.

1. The page reads category and other filters from URL search params. Currently it only reads them on initial mount, so when the URL changes (user clicks "T-Shirts", "Hoodies", "All Products" in the header), the page does not re-fetch products.

2. Fix: Use useSearchParams() hook from next/navigation to reactively read URL params. Add the searchParams values to the useEffect dependency array so that whenever the URL params change, the useEffect fires again and fetches products with the new filters.

3. Make sure page number resets to 1 when category changes.

4. Same fix for all other URL params: color, size, gender, q (search query), price_min, price_max.

5. Also fix the header navbar category links — make sure they use Next.js Link component with href="/products?category=X" so navigation happens client-side without a full page reload.

## Response snapshot

**Root cause:** `products/page.tsx` is a server component with `export const dynamic = "force-dynamic"`. On client-side navigation (Link click), Next.js re-renders the server component with new searchParams and passes new `initialProducts` props to `ProductListClient`. However, `ProductListClient` stores them in `useState(initialProducts)` — React's `useState` only uses the initializer on first mount, so subsequent prop updates from server re-renders are silently ignored.

**Header links:** Already using Next.js `<Link>` components — no change required.

**Page reset:** Already handled — `buildFilterUrl()` calls `params.delete("page")` before applying filter changes, so the URL always resets to page 1 when any filter is applied.

**Fix applied to `ProductListClient.tsx`:**

1. Removed `authedFetchDone` ref (no longer needed — auth fetch now re-runs on navigation via deps).

2. Added sync effect that fires whenever `initialProducts` changes (i.e., every navigation):
   ```tsx
   useEffect(() => {
     setProducts(initialProducts);
   }, [initialProducts]);
   ```
   This updates the grid with SSR-fetched products immediately on navigation.

3. Rewrote auth re-fetch effect with all filter params in the dependency array:
   ```tsx
   useEffect(() => {
     if (!isAuthenticated) return;
     let cancelled = false;
     // ... build params from currentCategory, currentSize, etc.
     apiClient.get(...)
       .then((res) => { if (!cancelled && res?.items?.length) setProducts(res.items); })
       .catch(() => {});
     return () => { cancelled = true; };
   }, [isAuthenticated, currentCategory, currentSize, currentColor, currentGender, currentInStock, currentPriceMin, currentPriceMax]);
   ```
   - Cancellation flag (`cancelled`) prevents stale responses from overwriting newer results when the user navigates rapidly.
   - All filter params in deps ensures the effect re-runs on every navigation for authenticated users, so wholesale prices are always correct.

4. Removed unused `useRef` import.

## Outcome

- ✅ Impact: Header category links and sidebar filters now update the product grid reactively without any page reload. Both guest and authenticated users see correct products immediately after navigation.
- 🧪 Tests: Manual golden-path testing
- 📁 Files: 1 file modified (ProductListClient.tsx)
- 🔁 Next prompts: None identified
- 🧠 Reflection: The pattern `useState(initialProp)` + parent re-renders with new prop is a common Next.js App Router gotcha — useState initializer only runs once. The fix is always a `useEffect(() => { setState(prop); }, [prop])` sync effect.

## Evaluation notes (flywheel)

- Failure modes observed: React useState not syncing with updated server component props on client-side navigation
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Consider moving product fetching entirely client-side (using useSearchParams) to avoid dual-fetch for authenticated users, but SSR provides better initial load performance so current approach is preferable
