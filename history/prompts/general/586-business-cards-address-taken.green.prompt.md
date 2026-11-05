---
id: 586
title: Business Cards address taken
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends Add product → Basics "Business Cards" failing with "Something went wrong on our side", and the list with "Standard Business Cards"; push both fixes together
labels: ["products", "add-product", "slug", "deploy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/admin/products.py
tests:
 - local database (scratchpad product_slug_check.py): renamed product keeps /x, new one gets /x-2, a taken address at write time is retried (3/3)
 - local database (scratchpad price_table_rules_check.py): table 6 of 8 with dashes, save, buyer price 12.50 with and without a stale answer, download dash (6/6)
---

## Prompt

ye kia issue ha jani hn wo wala bhi push krdo blke dono sath hi push krdena ye hal krne ke bad saiha jani proepr

## Response snapshot

Cause: a product made as "Business Cards" and renamed "Standard Business Cards" keeps /business-cards; a new "Business Cards" asks for the same address, the database refuses, and the create route let the error out as a 500, so Add product never tried another address. Now the route takes the next free address of the shop (/business-cards-2) and, if one is taken at the moment of writing, retries with a short suffix; anything else is a clear 409. Pushed with the price table fix (7d0d22c) on the owner's yes.

## Outcome

- ✅ Impact: products with a used name save; prices for every buyable combination.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: none.
- 🧠 Reflection: a 500 hid an ordinary "address taken" the page already knew how to handle.
