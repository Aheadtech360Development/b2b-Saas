---
id: 472
title: A CSV import for configurable product price grids
stage: general
date: 2026-10-23
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Read the yard sign price grid CSV and say whether an import button for option products can be built, and what it would do
labels: ["product-options", "configurable", "price-table", "csv-import"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read: printnoise_yard_sign_grid_2688.csv, backend/app/models/product_option.py, services/configurator_service.py, services/combinations.py, api/v1/admin/product_options.py, frontend components/storefront/ProductConfigurator.tsx, components/admin/CombinationPricing.tsx)
tests:
 - the CSV parsed: 2688 rows = 7 Qty x 8 Size x 1 Material x 2 Printing Sides x 2 Stakes x 3 Grommets x 4 Production Time, no duplicates; price always cost + $15; 96 rows N/A (Qty 30 with Next Day)
---

## Prompt

(screenshot: printnoise_yard_sign_grid_2688, CSV, 263 KB) acha ab mei dekho ek csv file lagara jitny matlab ase productshain na yard signs wagera wale jisme combinations ziada bnty hain to ek ek krke ab prices kese dalun yar mei saiha to mene file dera usko dekho aur dekho import ka button bn skta kia zara poora dekhna saiha jaldi kro phir mjhy batao kia outcome hoskta iska proper kia import ka ek button bn sktakia isesi product options wali prpoduct ke lie jani zara

## Response snapshot

- The file is a full price grid: every combination of 7 options with its supplier cost and the brand's price (cost + $15); 96 combinations are N/A.
- The option engine already has a price table (product_option_combinations: one price per combination, a switch for "not available", up to 5000 cells, saved a page at a time by hand). An import fills it in one upload: options and choices made from the headers and cells if missing, the price column chosen, N/A saved as not available, a preview with row errors before saving, re-upload to update; a Download CSV for the round trip.
- One engine change: the table holds one price per unit for every quantity, while this file prices each quantity separately (volume pricing). Recommended: a Quantity option whose choice is the line's quantity (1, 5, 10 ... 30), priced by the table, the separate quantity box hidden for such products.
- Also offered: N/A that always comes from two choices together (30 with Next Day) becomes a rule that greys Next Day out when 30 is picked.

## Outcome

- ✅ Impact: the owner knows the import is possible and what it needs.
- 🔁 Next prompts: the owner's (or the manager's) yes to build it.
- 🧠 Reflection: the price table already existed; the gap was only getting 2688 prices into it and a quantity that changes the unit price.
