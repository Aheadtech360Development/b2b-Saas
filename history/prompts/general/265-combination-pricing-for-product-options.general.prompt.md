---
id: 265
title: Combination Pricing For Product Options
stage: green
date: 2026-09-22
surface: agent
model: claude-opus-5
feature: product-options
branch: main
user: development.aheadtech360@gmail.com
command: manual implementation
labels: ["product-options", "configurable-products", "combination-pricing", "pricing", "security", "performance", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/0041_option_combinations.py
  - backend/app/services/combinations.py
  - backend/app/services/configurator_service.py
  - backend/app/models/product_option.py
  - backend/app/models/__init__.py
  - backend/app/api/v1/admin/product_options.py
  - frontend/src/components/admin/CombinationPricing.tsx
  - frontend/src/components/admin/ProductOptionsBuilder.tsx
tests:
  - scratchpad/t_combinations.py — 46 checks: generation (2 options, 3 options, uneven counts, options excluded from the table), a price for all 16 of the brief's combinations, non-separable prices, missing combination falls back, adding an option, adding/removing values, removing an option, invalid combinations, switched-off combinations, price tampering, 1.7M-combination performance, key determinism
  - scratchpad/t_combo_api.py — 27 checks: the real admin save round trip, grid paging, saving/clearing prices, page isolation, negative price refused, non-UUID refused, unknown option refused, cleanup on value removal, too-large grid, tenant isolation
  - npx tsc --noEmit — clean (two pre-existing errors in src/__tests__/api-client.test.ts)
  - npm run build — compiled successfully
---

## Prompt

(Two Shopify variant-screen screenshots were attached.)

I need you to improve the product options system.

There is one very important requirement: the system must support ALL possible
combinations of product options.

Think about how Shopify product variants work. […] if we have Size: Small,
Medium / Quantity: 1,2,3,4 / Rounded Corners: Yes, No then the system must
support pricing for every possible combination […] The number of combinations
must automatically increase when the admin adds another option. […] Do NOT
hardcode a fixed number of options or combinations.

The admin must have a clear and easy way to set a price for every combination.
Small + 1 + Rounded Corners Yes = $10, Small + 1 + Rounded Corners No = $8,
Medium + 1 + Rounded Corners Yes = $12, Medium + 1 + Rounded Corners No = $10.

Requirements 1–10 covered any number of options and values, automatic
combination generation, per-combination prices, correct updates when options
change, existing products not breaking, safe handling of empty/missing/invalid
combinations, a clean admin frontend, backend validation, and backend
validation of the price the customer selected.

Very important security rule: never trust the price sent by the frontend.

Performance: be careful with a large number of options and values; do not
create unnecessary database records.

Explain the current implementation, limitations, proposed data model,
generation, storage, admin UI, customer pricing and large sets before
implementing. Then implement, run the Feature Quality Gate (requirements,
security, testing, performance, code quality) and add tests for combination
generation and pricing covering the listed cases.

## Response

### What was already there

`product_options` → `product_option_values` (each with `price_delta` and a
`price_mode` of flat / per_unit / percent), `product_qty_tiers`,
`product_option_rules`, and `configurator_service.price_configuration`, which
is already server-authoritative: `/cart/add-configured` accepts only
`product_id`, `selections` and `quantity`, and cart, checkout and the copilot
all re-price through the same function.

### The limitation that mattered

The formula was separable — `price(A,B,C) = f(A) + g(B) + h(C)` — so
price(Small, Rounded) was forced to equal price(Small) + price(Rounded). The
brief's own example is exactly what that cannot express once rounded corners
cost more on a larger card.

### What was built

Migration 0041 adds a **sparse** `product_option_combinations` table and
`product_options.in_price_matrix`. Combinations are generated lazily by
`services/combinations.py` and never stored; only a combination somebody
priced becomes a row, so a 1.7-million-combination product holds zero.

A stored row's choices need only be a **subset** of the selection, most
specific winning. Adding an option therefore keeps every existing price
working, applying to each value of the new option until overridden. A matched
`unit_price` replaces the deltas of the options inside the match rather than
adding to them; anything matching no row is priced by the original formula,
which is what leaves existing products untouched (the new column defaults to
false).

`enabled = false` marks an impossible combination, checked *before* pricing
and ahead of any longer row — otherwise pricing one impossible configuration
more precisely would silently put it back on sale.

Admin: a paged price table in the options builder, with a tick per option for
"price changes with this", inherited prices shown as placeholders, and a grid
that refuses to render when it would be too large, naming the number instead.

Two bugs fixed on the way: saving a product's first options answered with none
of them (identity-map collection, fixed with `populate_existing`), and an
oversized selection raised a 500 rather than a refusal.

### Quality gate

73 checks across two suites, all passing; typecheck and production build clean.
Pricing loads only the stored rows overlapping the buyer's chosen values, via a
GIN index, so it stays flat as a product accumulates priced combinations.
