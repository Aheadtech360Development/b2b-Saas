---
id: 585
title: Price table follows the rules
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner: Standard Business Cards cannot be made; with rules (grey out / show only), the specific combinations get no price box in the price grid; check every use case
labels: ["product-options", "price-grid", "rules", "pricing"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/combinations.py
 - backend/app/services/price_grid.py
 - backend/app/services/configurator_service.py
 - backend/app/api/v1/admin/product_options.py
 - backend/tests/test_price_table_rules.py
 - frontend/src/components/admin/CombinationPricing.tsx
 - frontend/src/__tests__/price-table-rules.test.tsx
tests:
 - backend test_price_table_rules (9) + test_option_rules + test_price_grid: 55 passed, 1 skipped
 - frontend price-table-rules, price-table-whole-list, options-builder-only-values: 8 passed
 - rule walk timed without a database (scratchpad buyable_bench.py): 6,000 → 0.2 s, 40,000 → 1.4 s, 200,000 → 6.7 s first, cached after; same counts as a walk through evaluate_rules
 - tsc: no errors in src
---

## Prompt

suno isko choro ek issue agya ha wo ye ke pehle to bhai ye jo platform ha mera usme jese standard business cards ha to mei jb product bnara standard card to ye ku nh bnane dera ha bhai mere? ye kia msla ha pehle to ye batao aur dusra ye batao mjhy kenbhai isme ye ia ossue ha jese yad hana mei ne tumse wo kraya tha ke bhai jese agar koi field select ho to baki grey out krani aur specific dikhani saiha to wo krna tha wo ho to gya lekin jo specific set krani ha usme prices grid mei uska price set krne ke option nh arha ha yar jani plz isey bhi dekhlo yar proper urgent ha sary use cases dekhlo warna agy msle na aein

continue plz dekho yar jani

## Response snapshot

Second issue found and fixed: the price table (and its CSV) listed every combination of every choice and ignored the rules, so the combination a buyer actually makes when a choice hides a question (14 pt hides Coating) had no row and no price box, and ruled-out combinations cluttered it. Now `combinations.buyable` walks the rules (fast path, cached) and the table, download and checkout follow what a buyer can choose: hidden question = shorter row with "—" in its column, priced on its own; greyed-out and not-shown choices are not listed; the file writes "-" and the import reads it back as "this row leaves the question out" (never a choice; all-dash rows and a dashed quantity refused); checkout ignores a stale answer to a hidden question (`combinations.settle`). First issue: nothing in the code blocks a product by that name; asked for a screenshot of the error and the step. Committed locally; push on the owner's yes.

## Outcome

- ✅ Impact: every combination a buyer can make can be priced, in the table and in the file.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the Standard Business Cards error screenshot; push.
- 🧠 Reflection: a table of "every combination" stops being right the moment rules exist; the rules decide which combinations there are.
