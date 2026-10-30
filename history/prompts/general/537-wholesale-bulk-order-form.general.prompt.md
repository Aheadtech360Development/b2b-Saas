---
id: 537
title: Wholesale bulk order form and product type
stage: general
date: 2026-10-30
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's request with two screenshots of a colour-card picker (multi-select up to 10, a Price/Stock/Qty grid per colour)
labels: ["storefront", "product-page", "wholesale", "bulk-order", "add-product", "website-builder"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0072_bulk_order.py (new: products.bulk_order, products.bulk_cards)
 - backend/app/models/product.py, backend/app/schemas/product.py (create, update, detail)
 - backend/app/services/product_service.py (create writes both; a null on update leaves them)
 - backend/app/services/theme_product.py (bulk, bulk_cards, moq, image thumb for the builder page)
 - backend/app/services/product_catalog.py (list row says bulk)
 - backend/app/services/product_export.py, backend/app/services/product_import.py ("Bulk order form" column)
 - backend/tests/test_bulk_order.py (new, 5)
 - frontend/src/components/storefront/BulkOrderPicker.tsx (new: the form)
 - frontend/src/components/builder/render.tsx (buy box draws the form; price line "From")
 - frontend/src/components/storefront/ThemeProductBuy.tsx (binds nothing for a bulk product)
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx (older page draws the form; gallery follows the colour)
 - frontend/src/lib/productKinds.ts (Wholesale bulk choice, card options, names)
 - frontend/src/app/(admin)/admin/products/new/page.tsx (Wholesale bulk card, Colour cards, picture colours)
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx (switch + Colour cards on the side card)
 - frontend/src/app/(admin)/admin/products/page.tsx (Type column says Wholesale bulk)
 - frontend/src/types/product.types.ts
 - frontend/src/__tests__/bulk-order-picker.test.tsx (new, 15), add-product-bulk.test.tsx (new, 3), product-kinds.test.ts (+2)
 - history/prompts/general/537-wholesale-bulk-order-form.general.prompt.md
tests:
 - backend test_bulk_order 5 + product export/import + brand logos: 34 passed; ruff: no new findings (12 old ones in the touched files)
 - frontend bulk-order-picker 15, add-product-bulk 3, product-kinds 5 passed; tsc 0 source errors
 - migration on a throwaway local database: 0071 → 0072, down one and up again, one head; local and test databases at 0072
 - through the app on the local demo shop: made as Wholesale bulk (201), variants, cards to swatches, null leaves them, "photos" refused 422, list row bulk, products file carries Swatches, builder page data bulk/swatches/moq 12, off again gives the usual buy box, test product deleted
---

## Prompt

acha ab na mjhy wholesale bulk mei jo item sell out krty na unke lie mjhy ek option variantpicker bnana ha esa jese dekho colick krun to dekho kese ye kulra ha by default simple same esa hi design mei bnado option dedena khali swatches dikhane hon ya backend mei variant ke sath image lagado to wo same ese ajaegi jese pic mei ha saiha bhai  aur jb ham apne platform pe jake add product krty haon na waha option ajae wholesale ya ese hi kch ke bnda foran smjh jae ke han ye bulk item wala scene ki bathori jese pic mei ha saiha ye dekhlo kro isko jaldi janu

(two screenshots: a row of colour cards with model pictures, "Click to select multiple colors (max 10). Click again to deselect."; a picked card with a tick and a number, and under it the colour's panel with Remove and a grid of sizes S to 5XL: PRICE, STOCK, QTY, sizes it lacks greyed)

## Response snapshot

A product can now be sold in bulk. Add product's first step has a sixth card, "Wholesale bulk" (right after Stocked item): it makes a stocked product (colours × sizes, as before) whose page is the bulk order form, and asks what the colour cards show: Pictures (each colour's own picture; a colour without one shows its swatch) or Swatches only. On the Images step each picture can be given its colour. On an existing stocked product the same switch and choice sit on the side card ("Wholesale bulk"); the products list calls it Wholesale bulk; the products file has a "Bulk order form" column (Pictures, Swatches or blank). On the store (builder page and older page alike) the form is the one in the screenshots: a sliding row of colour cards with arrows, up to 10 picked (tick and order number, a second click or Remove puts one back), each opening its grid of sizes with the price, the stock and a quantity box (a size the colour lacks is a dash, a sold-out one cannot be ordered, more than the stock is cut with a note), a total, and one Add to cart for everything (signed in: one request; guest: the guest cart), reported to the shop's tracking tools.

## Outcome

- ✅ Impact: bulk blanks are bought the way the owner's reference shows, and a brand sees "Wholesale bulk" when adding a product.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes (migration 0072 runs on live start); then switch an Innterflow blank to Wholesale bulk to see it.
- 🧠 Reflection: bulk is a page for a stocked product, not a sixth kind; every "stocked" rule (stock, export, import, list) stays as it was.
