---
id: 450
title: Restyle screens without a design
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Give the admin screens that had no design the new UI's look (buttons, fonts, boxes, cards), no change to what they do
labels: ["admin-redesign", "restyle", "css"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin-shell.css (rules for old parts inside the new admin)
 - frontend/src/components/admin/InventoryProducts.tsx, TrackStockSwitch.tsx, MenusManager.tsx, TrackingPanel.tsx, DomainPanel.tsx, ImportProductsModal.tsx
 - frontend/src/app/(admin)/admin/inventory/warehouses/page.tsx, media/page.tsx, purchase-orders/manufacturers/page.tsx, products/reviews/page.tsx
 - frontend/src/__tests__/inventory-count-stock.test.tsx
tests:
 - vitest 58 files 638/638, tsc clean
 - screenshots of every restyled screen and of the pages with old parts inside (product editor, order page, billing, domain, reviews, import window); no page errors, nothing written
---

## Prompt

ek kam kro na isko hum short rkhty hain ham ku isme itni lambi krein bs jo new ui ka design aur color consistensy hana jese buttons fonts boxes wagera cards wagear bs in pages ko bhi wese hi krdo na wire koi issue thori ha batao ye kesa idea ha? take poora layout design sb same page pe ajae

## Response snapshot

A good idea: only the look changes, so the risk is low. Committed as 77fd19a, local only.

**Redrawn with the new parts:**
- Inventory's Products view, which is the default;
- Warehouses, Media library, Suppliers, Menus;
- the Tracking panel.

**Fixed while there:**
- the Count stock switch is now the admin's blue;
- the Reviews status pill no longer breaks across two lines;
- the Domain card and the Import title use the new parts.

**One set of CSS rules for every other old part inside a new screen:** fonts (the old Jakarta and Bebas faces), headings, inputs, white boxes, table headers and blue buttons. Sizes are untouched, so no layout moves.

**Left alone:** pages with no link anywhere in the admin, on live either:
- Blogs, CMS pages, Style sheets, Product specs;
- Shipping tiers, the supplier catalog;
- the hidden Storefront and Product templates screens.

## Outcome

- ✅ Impact: the whole admin a brand can reach now looks like one design.
- 🧪 Tests: see above.
- 🔁 Next prompts: the push (owner's word, and the 8 held features).
- 🧠 Reflection: a broad CSS rule set inside the shell carries the long tail of old components safely when it forces only fonts and colours, never sizes. Pages worth redrawing are found by checking reachability first.
