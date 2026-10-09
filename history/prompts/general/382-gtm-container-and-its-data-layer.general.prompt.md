---
id: 382
title: GTM container and its data layer
stage: general
date: 2026-10-09
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: where does the Google Tag Manager snippet go, the screen only takes an ID; check end to end that it works as it does on Shopify or WordPress
labels: ["tracking", "gtm", "analytics", "storefront", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/tracking.ts
 - frontend/src/__tests__/tracking-datalayer.test.ts (new)
tests:
 - read in the live code — the Container ID field puts Google's own container script on every page of that shop (root layout); the ID GTM-KQ984BCJ fits the field's format; a whole pasted snippet is cut down to its ID since 9f580f6
 - live server, read-only — the shop's storefront is told to load GA4 by its ID and, in the custom code box, the whole GA4 snippet again for the same ID
 - frontend tests, in a clean copy of main — tracking-datalayer.test.ts 5 passed, tracking-scripts.test.tsx 2 passed
 - frontend type-check — clean but for the two old errors in src/__tests__/api-client.test.ts
 - NOT done — the container was not connected by me (that is a setting on the live shop, the owner's to save); nothing was looked at in Tag Manager's preview or in a browser on the live shop; a production build was not run
---

## Prompt

(a screenshot of Admin, Tracking & Analytics: GA4 switched on with a Measurement ID, Google Tag Manager off with an empty Container ID field)

(pasted: Google Tag Manager's install snippet for container GTM-KQ984BCJ, the script for the head and the noscript iframe for the body)

 bhai mere usme tracking anad analytics ke ye tag kaha dalun jese abhi ga4 ka bhit scripts thin wo mei kaha dalun yar mere bhai yar ye dekho yar mere bhai proper ab seo wala bolrha ha ye header mei dalo poori site ke ab mei ye kaha dalun tracking and analyztics mei to id ka option ha poora end to end dekho ise ye work krna chayie jese shopify ya wordpress mei ye cheez work krti bhai

## Response snapshot

- The snippet goes in the Google Tag Manager box as its Container ID, GTM-KQ984BCJ, switched on. The platform then puts Google's own container script on every page of the shop; the snippet itself is not pasted anywhere.
- One thing was missing for it to work as on Shopify or WordPress: shopping events went to tools by name and none to the data layer, so a shop with only its container had nothing to build a purchase tag on. View item, add to cart, begin checkout and purchase now also go to the data layer in the standard shape, when a container is connected.
- The shop's GA4 is set twice today (by ID and again as pasted code in the custom box), which counts a landing twice; and GA4 should be set either here or inside the container, not both.
- Told plainly: the script is added once the page runs, so it is not in "view source"; the noscript part is not added; "begin checkout" is not sent from the checkout yet.

## Outcome

- ✅ Impact: a shop can hand its SEO or ads person one container and they can build every tag in it, purchases included.
- 🧪 Tests: as listed, with what was not done.
- 📁 Files: two.
- 🔁 Next prompts: sending "begin checkout" from the checkout; add to cart from the gang sheet builder; whether the container script should be in the page's first HTML.
- 🧠 Reflection: the field existed and loaded the right script, so "where do I paste this" had a one-line answer. Following one purchase through to the container is what showed that nothing a container could use ever arrived.

## Evaluation notes (flywheel)

- Failure modes observed: a tool wired by name works; the one tool whose whole point is to be generic was handed nothing generic.
- Graders run and results (PASS/FAIL): unit tests PASS (7 in the two tracking files); type-check PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the owner saves the container, open Tag Manager's preview on the shop and watch for the purchase event on a test order.
