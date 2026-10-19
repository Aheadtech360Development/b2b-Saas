---
id: 384
title: GTM is on the shop product view was not
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the owner says Tag Manager has been put on innterflow.com; check it
labels: ["tracking", "gtm", "analytics", "storefront", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/tracking.ts
 - frontend/src/components/storefront/ThemeProductBuy.tsx
 - frontend/src/__tests__/tracking-datalayer.test.ts
tests:
 - live server, read-only — the shop's saved tools are now the container GTM-KQ984BCJ and nothing else; GA4 by ID is off; the custom code box is empty
 - Google, read-only — the container is published (version 2) and holds no tag: no GA4 ID, no Ads ID, only built-in variables
 - a browser engine on the live shop, pages opened and nothing clicked through to a cart — the container script is on the home page and on a product page and has started (gtm.js, gtm.dom, gtm.load); no request went to Google Analytics; no product view reached the data layer, whether the product was reached by a link or landed on
 - frontend tests, in a clean copy of main — tracking-datalayer.test.ts 9 passed, tracking-scripts.test.tsx 2 passed
 - frontend type-check — clean but for the two old errors in src/__tests__/api-client.test.ts
 - NOT done — add to cart and purchase were not exercised on the live shop (they need a cart and an order); Tag Manager's preview was not opened; a production build was not run
---

## Prompt

gtm lagadia innterflow.com pr

## Response snapshot

- The container is on every page looked at and running. That part works.
- The published container has no tag in it, and GA4 by ID was switched off on the shop when the container went on. So at this moment nothing is being measured: GA4 needs to be added inside the container and published, or switched back on by ID until it is.
- A product view never reached any tool on this shop: its product pages are drawn by the website builder, and only the older product page sent the view. It is sent from there now. An event sent before the shop's settings have been read (the page a visitor lands on) is kept and sent when they arrive, not dropped.

## Outcome

- ✅ Impact: on a builder shop a product view reaches the data layer, including on the page a visitor lands on.
- 🧪 Tests: as listed, with what was not done.
- 📁 Files: three.
- 🔁 Next prompts: add to cart from the gang sheet builder; begin checkout from the checkout; what preview shows once GA4 is in the container.
- 🧠 Reflection: the first check after "it is installed" was whether the script loads. Reading what the published container holds, and watching what the page asks Google for, is what showed that a loaded container can still be measuring nothing.

## Evaluation notes (flywheel)

- Failure modes observed: an event wired on one of two product pages; an event gated on settings that arrive after it; a tool switched off here on the understanding that the container would carry it, before the container did.
- Graders run and results (PASS/FAIL): unit tests PASS (11 in the two tracking files); type-check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the deploy, open the live product page and read the data layer for view_item.
