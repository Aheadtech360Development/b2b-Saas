---
id: 443
title: Stock for every product type
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Build stock for every product type, with a Track stock switch for blanks and per size/option stock for gang sheets and configurable products
labels: ["inventory", "gang-sheets", "configurable-products", "checkout", "migration", "admin-ui"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0063_stock_for_every_product.py (new)
 - backend/app/models/product.py, backend/app/models/product_option.py, backend/app/api/v1/gang_sheets.py
 - backend/app/services/inventory_service.py, configurator_service.py, cart_service.py, order_service.py, product_service.py, theme_product.py
 - backend/app/api/v1/guest.py, checkout.py, product_configurator.py, admin/product_options.py, backend/app/schemas/product.py
 - backend/tests/test_stock_check.py
 - frontend admin: gang-sheets/page.tsx, products/[slug]/edit/page.tsx, products/page.tsx, ProductOptionsBuilder.tsx
 - frontend storefront: ProductConfigurator.tsx, ThemeProductBuy.tsx, GangSheetStudio.tsx, UploadOwnSheetModal.tsx, services/gangSheets.service.ts
tests:
 - backend tests/test_stock_check.py 17 passed; with related suites 67 passed
 - migration 0063 upgrade, downgrade and upgrade on local Postgres 16
 - real-DB end-to-end: blanks (track on/off), yard sign per-choice stock + take-down, gang sheet size stock, concurrent last-sheet race (one wins, one refused), product-level stock, signed-in cart pre-payment check
 - frontend vitest 586 passed, tsc clean
---

## Prompt

(AskUserQuestion answers) Blanks: "Track stock switch (Recommended)". Gang sheets / yard signs: "Har size/option ka stock".

## Response snapshot

- Migration 0063 adds four columns. products.track_inventory (default true): with it on, a variant with no stock
  entered is sold out; with it off, unlimited. products.stock (nullable): the whole-product count, used by
  upload-by-size. gang_sheet_sizes.stock (nullable). product_option_values.stock (nullable). NULL means no limit.
- inventory_service gets stock_on_hand(tracked=), counted_stock (an atomic conditional UPDATE when taking),
  gang_sheet_stock and configured_stock.
- Enforced in: add to cart, cart quantity change, the signed-in payment intent (before charging), signed-in
  create_order (also variant/product status), guest pricing (also used by the guest payment intent) and guest
  checkout. price_configuration raises OutOfStockError. The builder submit and upload-by-size refuse early.
- Storefront: tracked variants with no stock show 0. Sold-out sizes and choices come back with sold_out and are
  greyed out in the configurator, theme pages, the builder dropdown and own-sheet upload.
- Admin: Track stock switch on the product page; stock per gang sheet size (product editor and Sheet Sizes tab);
  product stock for upload-by-size and configurable products; stock per option choice. The products list says
  "Not tracked", "Stock by sheet size/option" or "Sold out" instead of a misleading "0 in stock".

## Outcome

- ✅ Impact: Orders at zero stock are refused for every product type
- 🧪 Tests: unit, real-DB e2e, migration up/down, frontend suite all green
- 📁 Files: 25 (2 new)
- 🔁 Next prompts: deploy; after the migration, blanks with no stock entered show sold out until stock is entered or Track stock is turned off
- 🧠 Reflection: Asking which stock model to use before building avoided a second wrong fix

## Evaluation notes (flywheel)

- Failure modes observed: tests/test_upload_own_sheet.py and test_builder_integration.py fail in their own raw-SQL seed (products.allow_design_upload NOT NULL), which is pre-existing and unrelated
- Graders run and results (PASS/FAIL): pytest PASS, vitest PASS, tsc PASS, ruff no new issues beyond the file's existing Optional style
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): return stock on order cancellation
