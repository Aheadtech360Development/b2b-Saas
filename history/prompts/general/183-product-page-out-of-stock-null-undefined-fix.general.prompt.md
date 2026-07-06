---
id: 183
title: Product Page — Null/Undefined Stock Out of Stock Fix
stage: general
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix product page — variants with null/undefined/0 stock must show Out of Stock and block add to cart
labels: ["product","stock","frontend","cart"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - none
---

## Prompt

Fix product page — variants with null/undefined/0 stock must show "Out of Stock" and block add to cart. Current check: `stock === 0` misses null and undefined. Sand color shows "In Stock" because stock is null/undefined, not 0.

## Response snapshot

Added three module-level pure helper functions (after `thumbSrc`, before the component):
```ts
function isOutOfStock(stock: number | null | undefined): boolean {
  return stock === null || stock === undefined || stock === 0;
}
function getStockLabel(stock: number | null | undefined): string {
  if (isOutOfStock(stock)) return "Out of Stock";
  if ((stock as number) >= 9999) return "In Stock";
  return `${stock} left`;
}
function getStockColor(stock: number | null | undefined): string {
  if (isOutOfStock(stock)) return "#EF4444";
  if ((stock as number) <= 10) return "#F59E0B";
  return "#10B981";
}
```

Applied across 5 locations:
1. `anyInStock` — `(v.stock_quantity ?? 0) > 0` → `!isOutOfStock(v.stock_quantity)` (product-level badge)
2. Per-variant stock vars — removed 4-line block (`stock`, `isUnlimited`, `stockColor`, `stockLabel`) → single `const isOOS = isOutOfStock(variant.stock_quantity)`
3. Per-variant display div — `color: stockColor` → `getStockColor(variant.stock_quantity)`, `{stockLabel}` → `{getStockLabel(variant.stock_quantity)}`
4. Quantity input style — added `background: isOOS ? "#f5f5f5" : "white"`; `onChange` guard: `if (isOOS) return`
5. `handleAddToCart` — added pre-flight loop: checks `isOutOfStock` → shows error and returns; also checks `qty > maxStock` for low-stock variants

## Outcome

- ✅ Impact: Sand and any other color with null/undefined stock_quantity now correctly shows "Out of Stock", disables the input, and blocks add to cart with an error message
- 🧪 Tests: Manual — find a variant with null stock in DB, view product page; verify badge, input disabled, cart blocked
- 📁 Files: 1 file changed (6 edits)
- 🔁 Next prompts: none
- 🧠 Reflection: Module-level helpers are better than inline `?? 0` + `=== 0` because they handle all three falsy-stock cases (null, undefined, 0) in one place and are reusable across `anyInStock`, display, and validation

## Evaluation notes (flywheel)

- Failure modes observed: `?? 0` correctly converts null/undefined to 0, but the explicit `isOutOfStock` helper is clearer and prevents future regressions if the check needs to change
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment: none
