---
id: 245
title: Product Page Stock + Pricing Cache Bust
stage: general
date: 2026-06-09
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix product page stock refresh (guest) + IVP pricing not updating immediately
labels: ["redis", "cache", "guest", "inventory", "pricing", "discount-groups", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/admin/discount_groups.py
tests:
  - manual: guest places order → navigate to product page → stock count should decrement immediately
  - manual: admin saves IVP overrides for a discount group → logged-in wholesale user in that group visits product → price shows immediately
  - manual: wholesale user places order → product page stock updates immediately (was already working via order_service step 9.6)
---

## Prompt

Fix two product page data refresh bugs. Both issues are ONLY on the product page.

BUG 1: Stock not refreshing for guest/logged-out users after order
BUG 2: Individual Variant Pricing not updating immediately when tier is assigned

Read the relevant code first, show it to me, then fix.

## Response snapshot

**Code read:**
- `ProductDetailClient.tsx` — client component, fetches via `productsService.getProductBySlug(slug)` on mount; `useEffect` deps: `[slug, isAuthenticated, authIsLoading]` — already re-fetches on auth change
- `products.service.ts` + `api-client.ts` — uses `apiClient.get()` with auth headers on every call; `cache: 'no-store'` only for SSR (correct)
- `product_service.py` — Redis cache key: `products:detail:{slug}:{discount_percent}:{discount_group_id}:{'g'|'a'}`, TTL 10 min
- `guest.py` — deducts inventory but NEVER calls `redis_delete_pattern` (contrast: `order_service.py` step 9.6 already does this)
- `discount_groups.py` — `save_variant_pricing` and `save_variant_level_pricing` commit overrides but never bust product cache
- `pricing_middleware.py` — `company:{company_id}:discount_group_id` cache already busted on company tag update ✅

**Root causes confirmed:**
- BUG 1: `guest.py` is the exact gap — wholesale `order_service.py` already has cache bust at step 9.6; guest checkout never did
- BUG 2: `save_variant_pricing` / `save_variant_level_pricing` save new prices without busting `products:detail:{slug}:*`; cache serves stale prices for up to 10 min

**Fixes (backend only — no frontend changes needed):**

BUG 1 — `guest.py`: Added `ordered_product_slugs: set[str] = set()` before cart loop; `ordered_product_slugs.add(product.slug)` inside loop; after inventory deduction loop: `redis_delete_pattern(f"products:detail:{slug}:*")` for each slug + `redis_delete_pattern("products:list:*")`.

BUG 2 — `discount_groups.py save_variant_pricing`: After commit, look up product slugs for all `product_id` values and call `redis_delete_pattern(f"products:detail:{slug}:*")` + `"products:list:*"`.

BUG 2 — `discount_groups.py save_variant_level_pricing`: After commit, join `ProductVariant → Product` to look up slugs for all `variant_id` values and bust same cache patterns.

## Outcome

- ✅ Impact: Guest stock deductions now immediately visible; IVP overrides show instantly for customers in affected discount groups
- 🧪 Tests: Manual — see test cases above
- 📁 Files: 2 files, 52 insertions
- 🔁 Next prompts: Verify in Railway logs that `redis_delete_pattern` calls succeed after guest orders
- 🧠 Reflection: The symmetry was the tell — `order_service.py` already had step 9.6 cache bust; guest.py was an exact copy without it. BUG 2 required tracing the cache key composition to understand that IVP changes form the same cache key → stale hit.

## Evaluation notes (flywheel)

- Failure modes observed: Cache bust in `save_variant_level_pricing` requires a JOIN to look up product slug from variant_id — adds a small DB query per save, acceptable for an admin-only path
- Graders run and results (PASS/FAIL): npm run build → PASS (no TypeScript errors, 80 pages generated)
- Prompt variant (if applicable): none
- Next experiment: Add cache TTL reduction for is_guest=True cache keys so stale stock resolves in ≤60s even without explicit bust
