---
id: 634
title: Preview Design your own link
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: In the draft preview, "Design your own" lands on "We could not find that page" (route=page&slug=design) instead of the t-shirt customizer
labels: ["visual-builder", "preview", "tshirt-designer", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/previewLinks.ts
 - frontend/src/__tests__/builder-search-suggest.test.tsx
tests:
 - builder-search-suggest.test.tsx (16 passed; /design and /design?product= leave the preview)
 - live read-only: Sidequest designer catalogue available, 7 products on it; /design and /design?product= answer 200; storefront mode still legacy
---

## Prompt

design your own pe ye kia arha ha t shirt customizer ku nh arha plz check jani

(screenshot: sidequest.printcopilot.co/site-builder/preview?route=page&slug=design, "We could not find that page")

## Response snapshot

previewTarget turned every one-word shop address that is not reserved into a draft page; /design is the app's designer, so it is now among the app pages that leave the preview. On live the designer is ready: the owner had imported the 7 products and switched the designer on for all of them; /design answers. The shop still shows its old design (mode legacy) until Publish and Switch the shop to the builder site.

## Outcome

- ✅ Impact: Design your own works from the draft preview; on the live shop it already works.
- 🧪 Tests: preview link tests; live read-only checks.
- 📁 Files: previewLinks.ts, its test.
- 🔁 Next prompts: owner's yes to push; Publish and switch the shop over.
- 🧠 Reflection: the preview's map of app pages has to grow with every app page at a one-word address.
