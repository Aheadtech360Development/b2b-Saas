---
id: 646
title: Milepost products and import fixes
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's yes to push 9c9179d; "saw another bug"; a fifth and last demo brand (milepost, trade print shop) needs its products
labels: ["visual-builder", "import", "demo-store", "products"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/__tests__/builder-import-design.test.ts
 - C:\Users\hp\Desktop\milepost-products.csv (for the owner to import; not in git)
tests:
 - 9c9179d pushed and live (Sidequest's demo bar links to https://www.printcopilot.co/)
 - the Milepost folder through the converter before and after: menu "Exit 1Cards & mail" became "Exit 1 Cards & mail"; fonts Overpass and Overpass Mono with no warning (was "Sep"); orders, quick-buy, quote mapped to /account/orders, /quick-order, /quote
 - builder-import-design, builder-platform-link, builder-header-footer (63 passed); tsc
 - the products file planned by services/product_import (no writes): 6 products, 18 variants, 0 errors; photos answer 200
---

## Prompt

hn push kro jani aur yar ek bug aur dekha ha mene yar  aur ye naya brand dala ha jani iska bhi zara na wo krdo tum meri jan jese ke na iske bhi na tum prodcuts dedo meri jan saiha bs ye akhri store ha saiha meri jan jaldi se dedo

(screenshot: milepost.printcopilot.co site builder: logo "Milepos / t", menu "Exit 1Cards & mail", "Exit 2Signs"…, hero cards "Exit 1Cards & mailBusiness cards, postcards")

## Response snapshot

Pushed 9c9179d (live). The bug read from the screenshot: block-level words joined without spaces (readText now spaces boxes apart and skips hidden words) and the logo breaking because the font stack's first name "Sep" is a local helper font (familyOf now takes the first font in the stack the site can have). Trade pages orders, quick-buy, quote go to the shop's own pages. Desktop\milepost-products.csv: Business Cards, Postcards & Mailers, Aluminum Signs, Hanging Blade Signs, Vinyl Banners, Foam Board Posters, three sizes each at the design's base prices, collections Cards & mail, Signs, Banners & displays. Quantity breaks not in the file (made-to-order only).

## Outcome

- ✅ Impact: Milepost's labels and logo read right on the next import; a trade demo's account pages are the real ones.
- 🧪 Tests: converter runs, 63 tests, tsc, importer plan.
- 📁 Files: importHtml, its test; the products file.
- 🔁 Next prompts: owner's yes to push; re-import Milepost after it (delete the old pages first).
- 🧠 Reflection: textContent is not reading; boxes are apart and hidden words are not there.
