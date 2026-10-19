---
id: 443
title: Count stock per product, and the signed-in cart refusal
stage: general
date: 2026-10-16
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Give every product a proper inventory switch and screen across product types; fix "sign in" shown to a signed-in buyer of a blank tee
labels: ["inventory", "track-inventory", "cart", "plans", "sign-in"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/features.py
 - backend/app/models/product.py
 - backend/migrations/versions/0063_product_track_inventory.py (new)
 - backend/app/services/inventory_service.py
 - backend/app/services/order_service.py
 - backend/app/api/v1/guest.py
 - backend/app/services/cart_service.py
 - backend/app/services/product_service.py
 - backend/app/services/theme_product.py
 - backend/app/services/suppliers/ss_products.py
 - backend/app/api/v1/admin/products.py
 - backend/app/api/v1/admin/inventory.py
 - backend/app/schemas/product.py
 - backend/tests/test_cart_not_plan_gated.py (new)
 - backend/tests/test_track_inventory.py (new)
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/components/admin/TrackStockSwitch.tsx (new)
 - frontend/src/components/admin/InventoryProducts.tsx (new)
 - frontend/src/components/admin/InventoryByWarehouse.tsx (new, the old screen moved)
 - frontend/src/app/(admin)/admin/inventory/page.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/types/product.types.ts
 - frontend/src/__tests__/inventory-count-stock.test.tsx (new)
 - frontend/src/__tests__/sign-in-comes-back.test.ts
tests:
 - backend: test_track_inventory, test_stock_check, test_cart_not_plan_gated and the cart, checkout, thank-you and tracking tests that run without conftest, 62 passed (21 need conftest's client)
 - throwaway Postgres built from the full migration chain: 0063 backfill, checkout rule, in-stock filter, Inventory endpoint, default warehouse, 15/15
 - frontend: tsc 0; inventory-count-stock, product-edit-template-cards, builder-gallery-colour, sign-in-comes-back 31/31
---

## Prompt

aby meri jan ab gorse sunna blkl gor se na koi track inventory krne ka opt ha mere pass kisi product mei aur mere pass different type ki products hain gang sheets se leke yar signs wagera aur blank tees aur inka koi proper track quanitity ka sceeen hi nh ha yar stock 0 ha phir bhi order arha ha plz isey check kro yar meri jan proper isey kro yar har product type dekho yar iska aur iske bad ajeeb ek bug aur ha user sign in ha already lekin jb wo premium blank tee  kjareeda likha arha need sign in jb sign in form pe jake sign in krta to wo user dashboard khul jata yar plz ye bhi dekho yar kia krrhy ho plz yar jani pooora proper fix o manager gussa horha ha

## Response snapshot

**"Sign in" for a signed-in buyer:**
- Cause: `/api/v1/cart/add-matrix` was gated behind the wholesale-plan feature "matrix ordering grid". That path is the ordinary add to cart for every sized product.
- At a Starter shop a signed-in buyer therefore got 403. The product page read it as "sign in again" and sent them to /login without a way back, which opened their account page. A guest bought the same tee.
- Fixed:
  - the gate is gone (net terms and invoices stay gated);
  - only a 401 asks to sign in, and it comes back to the product;
  - a 403 shows the shop's words.

**Stock 0 but orders still coming:**
- Cause: counting was inferred from stock records. A variant with no record sold without a limit while the admin drew it as 0.
- Now `products.track_inventory` (migration 0063) decides:
  - on: a size sells only what it has, none is sold out;
  - off: no limit.
- Backfill: every product with any stock record is on, the rest off. S&S imports count S&S stock. Gang sheets and option-built products are made to order.
- Admin:
  - a Count stock switch in the product editor;
  - an Inventory screen per product with the switch and each size's count (the old list kept as "By warehouse");
  - a default warehouse when none exists;
  - cached product pages cleared after stock edits.

## Outcome

- ✅ Impact: signed-in shoppers can buy sized products on every plan; every brand decides which products count stock, and sees it.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: the owner's GitHub sign-in for the push; turning Count stock on for the products that need it; the redesign's Products editor and Inventory screen at the merge.
- 🧠 Reflection: a plan gate on a shared path blocks whatever else uses that path; a status read as "sign in" hides the real refusal.

## Evaluation notes (flywheel)

- Failure modes observed: the first push stopped at GitHub sign-in on this machine (no credential), not at a check.
- Graders run and results (PASS/FAIL): tests above PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
