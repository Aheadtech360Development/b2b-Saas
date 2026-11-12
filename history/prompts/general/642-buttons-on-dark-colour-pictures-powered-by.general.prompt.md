---
id: 642
title: Buttons on dark, colour pictures, powered by
stage: general
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Sidequest product page hides Add to cart and Buy it now; manager says on some variants the colour does not change; every shop's footer should say powered by printcopilot.co, linking there
labels: ["visual-builder", "theme", "storefront", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/style.ts
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/components/storefront/PoweredBy.tsx
 - frontend/src/components/storefront/StorefrontShell.tsx
 - frontend/src/components/layout/Footer.tsx
 - frontend/src/__tests__/builder-import-design.test.ts
 - frontend/src/__tests__/builder-header-footer.test.tsx
tests:
 - all builder tests, gift card and tracking tests (68 in the changed files passed; one old word-for-word CSS check updated)
 - tsc
 - live read-only: Sidequest theme primary #1C3557, surface #FAFAF8; on the tee page each swatch selects its colour (label changes) while the picture stays (no picture tagged with a colour); Add to cart and Buy it now drawn in rgb(28,53,87) on black
---

## Prompt

ye sidequest wale mei add to cart aur buy it now ka btn nh arha plz isrey dekho yar jani aur dusra abhi manager kehra tha na ke kuch variants pr na vatriant color change nh horha ha zara dfekho aur ek aur cheez har jaga footer mei ye ana chayie powered by printcopilot.co saiha aur ye yahi isi domain pe jana chayie

(screenshot: Sidequest Low Signal Tee page: Design your own, colour swatches and sizes visible; Add to cart and Buy it now almost invisible)

## Response snapshot

Buttons: outline buttons take the brand colour, still the starter's navy on Sidequest (the import read the first button, a transparent code link). Import now takes the first filled button and derives surface, lines and quiet text from the design's page and words; the theme adds --b-on-primary (white or near-black by contrast) for solid buttons, counts, badges and drawer buttons. For the live shop: Theme, Colours, Brand #B6FF00 (and Cards & panels #181817, Lines #2E2E2E, Quiet text #979794). Colours: selection works; the picture follows a colour only when a picture is set to that colour (product, Images, the colour box under each picture); the file's photos are one colour each. Powered by PrintCoPilot linking to https://printcopilot.co at the foot of every shop.

## Outcome

- ✅ Impact: brand buttons readable on any brand colour; future dark imports bring their palette; platform credit on every shop.
- 🧪 Tests: builder suite, changed tests, tsc, live read-only checks.
- 📁 Files: style, base CSS, import, PoweredBy, shell, footer, two tests.
- 🔁 Next prompts: owner's yes to push; Sidequest Theme colours; per-colour pictures if the demo needs them.
- 🧠 Reflection: "the first button" was a code link styled as words; the brand colour is the first button the design fills.
