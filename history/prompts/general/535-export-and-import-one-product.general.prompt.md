---
id: 535
title: Export and import one product, end to end
stage: general
date: 2026-10-30
surface: agent
model: claude-opus-5-5
feature: none
branch: fix/product-export
user: Aheadtech360Development
command: aur dusri bat isme per product jake import krne ka option ku nh ha ??? jese ek specific product ko import krni to sirf usi ki fields wagera aein plz dekho proper end to end
labels: ["products", "export", "import", "csv", "shopify-format"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/product_import.py (new: read, plan, apply a products file)
 - backend/app/services/product_export.py (Options (data) column; export of chosen ids; rules loaded)
 - backend/app/api/v1/admin/products.py (POST /import-file; GET /export-csv?ids=)
 - backend/tests/test_product_import.py (new, 12), backend/tests/test_product_export.py (Options (data))
 - frontend/src/components/admin/ProductFileImport.tsx (new: preview, update toggle, import, results)
 - frontend/src/components/admin/ImportProductsModal.tsx (a products file goes to the server; onlyHandle)
 - frontend/src/services/admin.service.ts (exportProductsCsv(ids), importProductsFile, result types)
 - frontend/src/app/(admin)/admin/products/page.tsx (Export in the selection bar)
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx (Export and Import on the product)
 - frontend/src/__tests__/product-file-import.test.tsx (new, 6)
 - history/prompts/general/535-export-and-import-one-product.general.prompt.md
tests:
 - backend test_product_import + test_product_export: 20 passed; ruff clean on the new files
 - local DB, one transaction rolled back: the demo shop's export imported back with update, 29 updated, 0 changed; a new stocked product from a file (variants, prices, stock, images, categories, fields as the source); a new made to order product (options, values, prices, rules, quantity breaks, base price as the source); one product's import reads only its rows
 - through the app as the demo admin: export one product by id (200, its rows only), bad ids 422, preview of that product 200 (update, no errors), not a products file 422, signed out 401
 - frontend product-file-import 6 + product-edit-template-cards 8 passed; tsc 0 source errors
---

## Prompt

aur dusri bat isme per product jake import krne ka option ku nh ha ??? jese ek specific product ko import krni to sirf usi ki fields wagera aein plz dekho proper end to end

(then: continue plz)

## Response snapshot

End to end, as Shopify does it: Export now takes the ticked products (Export in the selection bar) and a product's own page has Export (that product alone) and Import (a products file, that product's rows only, always an update). Import reads the file Export writes or a Shopify product CSV (current or older column names), plans every product first with nothing saved (new, update, skipped, not imported, with the reason), and saves only on "Import"; a handle the shop has is updated only when "Update products that already exist" is ticked. Updates touch only the columns the file has; variants match by SKU, else colour and size; images are added by address; nothing is deleted. Made to order: a new product gets its options and rules from Options (data); an existing one keeps them (its price table points at them). Gang sheets are made in Gang sheet setup; an existing one gets its fields. Tracking stock with no quantities does not turn counting on (it would sell nothing). Found on the way: create_product never saved type, vendor or tags (Import sets them itself); a stand-in reset with mockReset made a rejecting stand-in fail its test in Vitest 4.

## Outcome

- ✅ Impact: one product, chosen products or all can go out to a file and come back in, with a preview before anything changes.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes, then try Export and Import on one product on the live admin.
- 🧠 Reflection: an import is trusted only when exporting a shop and importing it back changes nothing; that check found the tags (None → []) and the empty "Default Title" row.
