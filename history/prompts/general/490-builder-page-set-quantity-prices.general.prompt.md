---
id: 490
title: Builder product page showed price table products wrong
stage: general
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Debug Business Flyer (imported price table) showing a wrong base price, then cents, then a different price back on the defaults
labels: ["product-options", "price-grid", "storefront", "guest-cart", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/lib/guestCart.ts
 - frontend/src/components/storefront/CartView.tsx
 - frontend/src/app/(customer)/checkout/address/page.tsx
 - frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/__tests__/builder-configured-price.test.tsx
tests:
 - frontend/src/__tests__/builder-configured-price.test.tsx (new, 5) + builder-gallery-colour + guest-cart-adopt: 17 passed
 - backend tests/test_price_grid.py: 32 passed, 1 skipped (the server prices a set's whole line right)
 - tsc --noEmit clean
---

## Prompt

ek issue arha ha bhae jo product options wali jitne bhi products hain na jese abhi ek prodcut thi business flyer mene draft krdi usme mene wo prices import hi krain thin saha lekin ab jo issue arha ha wo ye arha ha ke bhai mere isme na ke prices ajeeb se hi arhy base price kch arhi ha phir kch dusra select kro to centds mei price jarhy phir wapsi by default krrha to base price phir galat arhi jo initially arhi thi to plz bhar isko dekho aur mjhy batao yar ye cheez dekh ke plz bhai mere proper jaldi se mere bhai ye properly debug kro issue

## Response snapshot

- The server prices right (price table tests pass); the builder product page (ThemeProductBuy, used by shops on the website builder) showed it wrong:
  1. It opened on the product's base price (theme_product from_price = base_price for a product with no variants) and never priced its pre-selected first choices.
  2. On a choice it showed `unit_price` when the page's own quantity box said 1; a set quantity's unit price is the set's price over every piece (500 flyers $120 → $0.24), hence cents; back on the first choices it showed that, not the opening price.
  3. A slower answer for an earlier click could land on top of the latest one; a combination the table marks N/A kept the last price.
  4. A guest's cart kept 1 flyer at $0.24 (checkout then charged the set's $120).
- Fix: price the first choices on load; show the set's total for a set quantity (configuredPriceText), the total for one, "each · total" for several; only the latest answer is written; "Not available" for a refused combination; hide the page's quantity box when the product asks how many itself; guest line for a set quantity = the set (quantity 500, line_total = server total, never merged, shown "500 for $120.00", not editable), and every guest total (cart, shipping estimate, checkout address and review) adds `guestLineTotal`.

## Outcome

- ✅ Impact: every option-priced product on a builder page shows the price of what is chosen; guest carts carry the right set and total.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's yes to push; publish Business Flyer again after the deploy and check the three steps.
- 🧠 Reflection: a page that prices by the unit breaks the moment a product is sold by the set; show the line total.
