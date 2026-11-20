---
id: 696
title: Dev fix list batch one
stage: general
date: 2026-11-20
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Fix the bugs in d:\dev-fix-list.md (demo store builds) properly, end to end
labels: ["bugs", "wholesale", "gang-sheets", "checkout", "made-to-order", "suppliers", "admin"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/group_pricing.py (new) and cart_service, order_service, product_service
 - backend/migrations/versions/0080_group_discount_percent.py (new)
 - backend/app/models/discount_group.py, api/v1/admin/discount_groups.py
 - backend/app/api/v1/gang_sheets.py (public builder settings), order_service (guest sheet owner)
 - backend/app/services/theme_data.py, theme_product.py (made-to-order From price, Sale badge)
 - backend/app/services/suppliers/mapping.py, config.py, ss_products.py, jobs.py
 - backend/app/api/v1/admin/product_options.py, product_configurator.py, configurator_service.py
 - backend/app/api/v1/admin/customers.py, services/wholesale_service.py
 - frontend: CartView, GangSheetStudio, UploadOwnSheetModal, UploadBySizeModal, lib/gangSheetSettings (new)
 - frontend: checkout page, account layout, wholesale register, applications, customers/[id], pricing-tiers (new)
 - frontend: products edit and list, ProductOptionsBuilder, ProductConfigurator, ThemeProductBuy, builder render, fonts
 - frontend: customers/tiers, BrandingProvider, app/page.tsx, suppliers ProductSettings and service
 - tests: test_group_pricing, test_product_cards, test_optional_checkbox (new), test_sanmar, studio-assistant
tests:
 - pytest (no DB): 110 passed across pricing, cards, checkbox, suppliers, bulk order, upsells, gang sheets, retail plan, designer
 - vitest: 14 files 112 passed; builder-site + order files 52 passed; gang-sheet-studio 25 passed; studio-assistant sign-in 2 passed
 - tsc --noEmit clean; alembic heads: one (0080)
 - local Playwright with made-up API answers: guest gang sheet builder (text, Save & Add to Cart → guest cart; with login required → sign-in form)
---

## Prompt

pehle ye md dekhlo dev-fix-list ha ye kch bugs hain dekho yar inhein proper solve krne hain bhai warna msla hojaega mere bhai saiha jaldi se inhein fix kro dasti dasti saiha bhai take ye agy koi issue na ho isme sb lukha ha sb fix kro proper end to end

(Then "continue plz" with /workflow-authoring; ultracode on. Worked solo per the owner's saved limit on agents.)

## Response snapshot

Batch one fixed: 1 (phone checkout button in builder carts), 2 (group percent off + "-$" really an amount off, one pricing rule for cart/order/pages, cache bust), 3 (gang sheet builder and both uploaders follow "Require customer login"; guest sheets get the order's buyer), 4 and 22 (switches save at once; supplier import option for Wholesale bulk), 5 and 12 (made-to-order From price; Sale only below the shop's own compare-at), 6 (minimum order quantity for made-to-order), 7 (optional tick boxes start unticked and can be unticked), 9 (single way to pay is shown; profile fills email and address), 11 (login keeps ?next=), 21 (bulk edit template and Wholesale bulk), 23 and 24 (S&S default mapping: piecePrice, brand + style + title, no compare-at), 25 (skip reasons named), 27 (Applications All: enum status), 28 (pricing-tiers address), 29 and 35 (fonts), 31 (countries from Markets), 32 (builder colour, no AT360 name), 33 (title).

## Outcome

- ✅ Impact: most of section A and several of C and D fixed and tested.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: items 8, 10, 13, 14, 15-20, 26, 30, 34, 36, 37; owner's yes to push.
- 🧠 Reflection: "-$" in the admin was saved as a price; the database enum turned "all" into a 500.
