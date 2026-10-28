---
id: 497
title: Booklet price table count and download refusal
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Bulk Booklets shows 64,584 combinations, Download CSV refuses past 50,000, price check $27,515.50 for 50
labels: ["product-options", "price-grid", "csv-import", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/price_grid.py (a file may run to 200,000 rows; only rows with a price or N/A count against the table's 50,000; download allowed up to 200,000)
 - backend/tests/test_price_grid.py (+2)
 - frontend/src/components/admin/CombinationPricing.tsx (says what the count is, and to import the supplier's file as it is)
tests:
 - backend tests/test_price_grid.py: 38 passed, 1 skipped
 - frontend price-table-whole-list: 3 passed; tsc clean
 - scratchpad booklet_template_timing.py (no database): the booklet shape downloads 64,584 rows, 4.8 MB, 3.2 s; half filled reads and plans back in 2.6 s, 32,292 priced, 0 errors
---

## Prompt

ye kia issue ha jani itne combinations to hain hi nh mere bhai yar

(screenshots: Bulk Booklets, price table "64,584 combinations: too many to list here. Size (13) × Quantity (6) × Pages (23) × Paper for inside Pages (3) × Cover Paper (3) × Binding (1) × Binding Placement (2) × Production Time (2). None of them has a saved price yet."; save bar "64,584 combinations is more than a price table can hold (50,000)."; Pricing tab, base price per item 550.31, "Price check: 50 items = $27515.50 ($550.31 each)", platform support session)

## Response snapshot

- The count is right: 13 x 6 x 23 x 3 x 3 x 1 x 2 x 2 = 64,584, every way of answering the questions, not a list to fill. The real fault: Bulk Booklets has no saved price at all, so every price is the rule's, $550.31 a booklet x 50 = $27,515.50 (the "prices jump" report).
- The download refused anything past 50,000 combinations, which left a big product with no template. Now a file may run to 200,000 rows and only rows with a price or N/A count against the table's 50,000, so a downloaded template comes back with the unsold combinations empty; the download goes up to 200,000. The table's note says what the number is and to import the supplier's file as it is.
- Asked for the booklet price file to check it imports before the owner runs it on live.

## Outcome

- ✅ Impact: a product whose questions multiply past 50,000 can download its table and import what it sells.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; the booklet price file.
- 🧠 Reflection: a cap meant for what a file writes was applied to what it lists; count the rows that write.
