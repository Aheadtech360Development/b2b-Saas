---
id: 632
title: Dark header menu hover and go live
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for the menu hover fixed in code (white pill hides the link on the black header); then, mid-turn, sidequest.printcopilot.co shows the default "Quality Wholesale Products" page
labels: ["visual-builder", "menu", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/builder/islands/MenuNav.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/__tests__/builder-menu-one-line.test.tsx
tests:
 - builder-menu-one-line and builder-import-design (18 passed, new: a menu with light links says data-tone dark and gets the light wash)
 - all builder tests; tsc
 - live read-only: Sidequest storefront site mode legacy; Innterflow's header menu linkColor var(--b-text) (not affected); Ikrash legacy
---

## Prompt

yar ye hover sai krke do yar bhai mere yar

(screenshot: the Sidequest header, "SHOP ALL" pointed at, white pill hiding the word)

Mid-turn: aur ye kesi ajeebsi arhi ha bhai isey to sai kro yar bhai mere

(screenshot: sidequest.printcopilot.co showing the default storefront: "Quality Wholesale Products, Direct to Your Business", Shop by Category)

## Response snapshot

Hover: the builder's menu hover pill is the theme's card colour; a menu whose own link colour is a light hex now carries data-tone="dark" and gets rgba(255,255,255,.1) instead; vertical lists keep none; Innterflow's menu (theme-coloured links) unchanged. The default page: the shop is still in its own (legacy) design; Site builder, Publish, then "Switch the shop to the builder site" in the Published dialog.

## Outcome

- ✅ Impact: the Sidequest menu stays readable on hover with no re-import or theme change.
- 🧪 Tests: 18 targeted, all builder tests, tsc.
- 📁 Files: MenuNav, render, baseCss, menu test.
- 🔁 Next prompts: owner publishes and switches the shop over; products import; designer; loyalty.
- 🧠 Reflection: a builder default that assumes a light page (card colour under a pointed link) breaks on a dark header; tie it to the element's own colours.
