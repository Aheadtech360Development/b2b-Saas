---
id: 648
title: Dead links, dark cart, 404, logo
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Every button in the owner's demo brands (not Innterflow, EZ Mart) must go somewhere; cart and checkout look wrong on dark-theme brands; Milepost logo still breaks
labels: ["visual-builder", "storefront", "cart", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/whereWordsGo.ts
 - frontend/src/components/builder/render.tsx
 - frontend/src/components/builder/islands/MenuNav.tsx
 - frontend/src/app/globals.css
 - frontend/src/app/(customer)/not-found.tsx
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/lib/builder/style.ts
 - frontend/src/__tests__/builder-dead-links.test.tsx
tests:
 - live read-only: dead "#" links on each home page (Sidequest 5, Hue & Wick 11, Titre 19, Fixer 12, Milepost 2, Innterflow 0); guest screenshots of Sidequest cart (white cards, unreadable name and totals), /checkout (404 with two headers and footers), sign-up and sign-in (fine)
 - builder suite 302 passed (new dead-links test); tsc
 - the dark cart drawn with the new colours (screenshot looked at)
 - Milepost and Sidequest re-imported through the converter: header columns auto 1fr auto (phone 1fr auto 1fr)
---

## Prompt

zabardast yar ab bs ek kam krdo meri jan tum bs wo ye krdo innterflow aur eztmart brands ke ilawa jitney bhi mene brands bnae hain na ofcourse uske theme different ha ok? jani ab tum bs ek cheez krdo bs un brands mei jitny bhi buttons wagera hain na kahi na kahi connect ho kahi bhi asa link na ho# bs ye dekhlena proper aur abhi mene ek brand dekha ke dark theme wale brand pe cart page aur checkout ajeeb lagra to wo esa universal kro ke proper to are kuke dekho ye basics hain yar ajeeb lagra impression acha nh ha aur ye dekho ye bhi sb proper krdo baki sb hochuka ha

(screenshot: Milepost header in the builder, logo "Milepos / t")

## Response snapshot

Dead links: render-time fallback for button, link and menu items with no address (whereWordsGo by their words), no data change; Innterflow has none, EZ Mart is not on the builder. Dark cart: --ui-* tokens and ui-card/field/button colours inside .bsite mixed from the site's words and page colours, buttons in --b-primary with --b-on-primary. 404 inside the shop: (customer)/not-found.tsx draws only the page. Logo: import keeps declared content-sized grid columns (auto 1fr auto); Milepost needs one more import for it. Checkout steps are the app's own light pages and sign-in/sign-up are clean; not changed.

## Outcome

- ✅ Impact: no dead buttons on the demo stores, a readable cart on dark sites, a single header on a 404, logos that keep their room on the next import.
- 🧪 Tests: 302 builder tests, tsc, screenshots, converter runs.
- 📁 Files: whereWordsGo, render, MenuNav, globals.css, not-found, importHtml, style, a test.
- 🔁 Next prompts: owner's yes to push; Milepost re-import for the logo.
- 🧠 Reflection: a fix drawn at render time reaches stores already imported; a converter fix reaches only the next import.
