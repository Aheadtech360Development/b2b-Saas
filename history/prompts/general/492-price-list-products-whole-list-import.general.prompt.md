---
id: 492
title: Price list products mixed old and new prices
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Bulk Booklets prices jump around; Yard Signs imported an 11k-row file and the price table says 74,400 combinations and shows nothing
labels: ["product-options", "price-grid", "csv-import", "pricing", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/configurator_service.py (prices_whole_lines; compute_price listed_only refuses a combination a whole-line table does not price)
 - backend/app/services/price_grid.py (plan lists the product's own choices the file does not list; listed_keys; apply replace = whole price list: removes unlisted prices, switches off unlisted choices, switches listed ones back on, file order; quantity choices smallest first)
 - backend/app/api/v1/admin/product_options.py (preview "removes"; import message; price table unpriced_choices + line_priced)
 - backend/tests/test_price_grid.py (+4)
 - frontend/src/components/admin/CombinationPricing.tsx (true message past 50,000; unpriced choices; N/A placeholder for a whole-line table)
 - frontend/src/components/admin/PriceGridImport.tsx (what the file leaves out; "This file is the whole price list")
 - frontend/src/components/admin/ProductOptionsBuilder.tsx (card text for a product sold in set quantities)
 - frontend/src/__tests__/price-table-whole-list.test.tsx (new, 3)
tests:
 - backend tests/test_price_grid.py: 36 passed, 1 skipped
 - frontend price-table-whole-list + product-edit-template-cards + builder-configured-price: 16 passed; tsc clean
 - local database (scratchpad price_grid_whole_list.py): old 2,688-row file then an 11,904-row file spelt differently = 74,400 combinations (the owner's number); mixed combination refused; preview names 12 choices and 2,688 prices; whole-list import leaves 11,904 combinations, file order, page opens on the file's price; same file again removes nothing; old file as the whole list restores it; ALL PASSED
---

## Prompt

ary jani bulk bookelts mei bhi same issue arha ha prices agy peechay horin aur ek yard signs product mei same issue wo ye ha 11 hazar kch thy jb file import kri to ye likha arha ha plz dekho

(screenshots: Products list, Bulk Booklets draft, price from $550.31; Yard Signs price table: "That is 74,400 combinations. Qty (31) × Size (Width x Height) (16) × Material (1) × Printing Sides (2) × Stakes (3) × Grommets (5) × Production Time (5) is more than anyone could fill in by hand, so the table is not shown. The amounts on each choice in step 1 still price every one of them correctly.")

## Response snapshot

- The live data could not be read from here; the numbers say what happened. 74,400 = 31 x 16 x 1 x 2 x 3 x 5 x 5, while an 11,904-row file is 31 x 8 x 1 x 2 x 2 x 3 x 4 (the old Printnoise file's shape with 31 quantities): the product kept choices the new file does not list (an earlier file or hand-made choices spelt differently). An import only added: old choices and old prices stayed, so the page mixed the old file's prices, the new file's, and for combinations neither priced the rule (base price x every item in the set, $550.31 x 25 on booklets). The table's message claimed those were priced correctly.
- Fix: a product sold in sets by a whole-line price list now refuses a combination the list does not price ("not available") instead of the rule; the import preview names the product's choices and saved prices the file does not list; "This file is the whole price list" removes those prices, switches those choices off (not deleted), switches listed ones back on and takes the file's order; quantity choices always go smallest first; the price table past 50,000 tells the truth (saved prices, choices no price names, what the rest are) instead of the false claim.
- Owner's step after the deploy: on Yard Signs and Bulk Booklets, Import CSV again with the same file and tick "This file is the whole price list".

## Outcome

- ✅ Impact: imported price lists sell exactly what the file lists, at its prices; no figure nobody set reaches a page or a cart.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; owner re-imports both files as the whole list and checks the pages.
- 🧠 Reflection: an import that only adds leaves yesterday's choices on sale; a supplier's file is usually the whole list, so the import has to be able to say so.
