---
id: 473
title: Price grid CSV import and the quantity question, end to end
stage: green
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build the CSV price import for option products end to end
labels: ["product-options", "configurable", "price-table", "csv-import", "quantity"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0066_combo_line_price.py (new)
 - backend/app/models/product_option.py (input type quantity, combination line_price)
 - backend/app/services/configurator_service.py (compute_price, quantity question, line price, rounding)
 - backend/app/services/combinations.py (Override.line_price)
 - backend/app/services/price_grid.py (new: read, plan, apply, export)
 - backend/app/api/v1/admin/product_options.py (quantity validation, line_price, price-grid preview/import/csv)
 - backend/app/services/cart_service.py, order_service.py, api/v1/guest.py, api/v1/admin/orders.py (the quantity question's answer is the line's quantity)
 - backend/app/services/copilot/quoting.py (quantity to the question; product choices loaded)
 - backend/tests/test_price_grid.py (new, 29)
 - frontend/src/components/admin/PriceGridImport.tsx (new), ProductOptionsBuilder.tsx, CombinationPricing.tsx
 - frontend/src/components/storefront/ProductConfigurator.tsx, CartView.tsx, components/shared/ConfigurationDetail.tsx, types/order.types.ts
tests:
 - test_price_grid.py 29 passed, including the supplier's own file: all 2592 priced rows billed exactly as given
 - local database, end to end (scratchpad price_grid_e2e.py): preview, import (7 questions, 27 choices, 2688 combinations, 2 rules), 60 random rows priced and billed exactly, N/A refused, cart line of 25 = $419.55, set quantity not editable in the cart, same set twice = two lines, AI quote 30 x 24x24 = file, unsold quantity refused, download of 2688 rows imports back unchanged, a bad price refuses the whole file: 18 of 18
 - frontend tsc clean
---

## Prompt

hn hn bnao poora end to end bnao ye kam

## Response snapshot

- Product options: a question can be "Quantity — how many" (choices are numbers). Its answer is the line's quantity everywhere (storefront, cart, checkout, guest checkout, admin order, AI quote), whatever number the request carried.
- Price table: a combination naming the quantity question can hold the whole line's price (line_price, migration 0066). The cents a total like $1,106.84 for 30 does not divide into ride with setup_fees as `rounding`, so every till (unit to the cent x quantity + fees) bills exactly the file's total; screens show only real one-off fees.
- Import CSV: preview first (columns read as questions, quantity, price, left out; new questions and choices; prices; N/A; rows to fix with their line; rules for pairs never sold together; choices N/A everywhere switched off), then all-or-nothing import; optional removal of prices the file does not list. Download CSV gives every combination back in the same shape.
- Cart: a set-quantity line shows "25 for $419.55", cannot be edited in the cart, and the same set added twice is two lines.
- Fixed on the way: the copilot loaded products without their choices, so quoting an option product could not run (lazy load in an async session).

## Outcome

- ✅ Impact: a supplier's 2,688-row grid goes into a product in one upload, priced to the cent.
- 🔁 Next prompts: push, then Deploy Latest Commit on Railway (the server is still on 8723f26).
- 🧠 Reflection: a total per quantity cannot be stored as a cent unit price; keep the total and let the remainder ride where every till already adds it.
