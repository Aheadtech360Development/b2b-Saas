---
id: 636
title: Hue & Wick products file
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner imported a second demo store (Hue & Wick, candles, hue-wick.printcopilot.co); asks for its products file like Sidequest's, and to check track order and gift cards
labels: ["demo-store", "products", "gift-cards", "track-order"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - C:\Users\hp\Desktop\hue-wick-products.csv (for the owner to import; not in git)
tests:
 - the file planned by services/product_import's own code (no writes): 12 products to create (7 scents by jar size, 3 extras, 2 gift sets with compare-at prices), 0 errors
 - photo addresses answer 200
 - live read-only: Hue & Wick 0 products, mode legacy; gift cards not on sale (both demo shops); tracking endpoint answers (422 on an empty body) on both; /gift-cards, /track-order, /rewards pages 200; Sidequest now live on its builder site (v2)
---

## Prompt

acha ab ye ek store mene import kra ha saiha dekhlo iske hisab se bhi prodcuts csv bnado take wo bs yaha front pe show hojaein plz saiha meri jan jaldi se krdo ye bhi merir jan saiha aur baki track order wagera gift cards ye bhi dekhlena jaldi krdo jani jaldi urgent ha ye aj khatam krna ha

(screenshot: hue-wick.printcopilot.co draft preview: Hue & Wick header, "214 Salt Harbor" hero, empty "Flip the deck" grid)

## Response snapshot

Found the design at Desktop\hueandwick. Made Desktop\hue-wick-products.csv from its assets/data.js: seven scents (No. 214 Salt Harbor … No. 509 Hearth Pine) with 4/8/14 oz jars at the design's $16/$34/$48 (Hearth Pine 8 and 14 oz only), Long Safety Matches, Wax Melt Bar, Jar Refill Pour, The Starter Deck and The Full Fan (compare-at 48 and 104), collections Everyday scents, Seasonal, Gift sets, Matches & more, photos from its CREDITS. Track order works on both shops; gift cards are off on both (Marketing, Gift cards, Turn on sales); Hue & Wick still needs Publish and Switch the shop to the builder site.

## Outcome

- ✅ Impact: one import fills the Hue & Wick shop with the design's products and photos.
- 🧪 Tests: importer's own plan of the file; live read-only checks.
- 📁 Files: the products file (Desktop, not in git).
- 🔁 Next prompts: owner imports, turns on gift cards (and Loyalty for the Pour Club), publishes and switches.
- 🧠 Reflection: these demo designs keep their products in assets/data.js and their photo sources in img/CREDITS.txt; a products file per design is a few minutes.
