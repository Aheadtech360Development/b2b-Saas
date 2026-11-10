---
id: 620
title: Header menu on one line
stage: general
date: 2026-11-10
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner shows Innterflow's header; a sixth menu link runs onto a second line
labels: ["visual-builder", "storefront", "header", "menu"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/components/builder/islands/MenuNav.tsx
 - frontend/src/__tests__/builder-menu-one-line.test.tsx
tests:
 - frontend/src/__tests__/builder-menu-one-line.test.tsx (6 passed)
 - builder-header-footer, builder-auth-buttons, builder-site, builder-announcement (passed)
 - live Innterflow header in a headless browser with the new rules injected and a sixth link added in the page (nothing saved): one line at 1519, 1366 and 1280, the menu button at 1100
 - tsc clean; next build passed
---

## Prompt

ye menu ha saiha bhai mere ab msla ye ha isme ek aur menu add krrha na to ye next line mei jarhi jo ke achi nh lagri to plz dekho yar zara isko ek hi line mei adjust hoke aein yar meri jan plz

(screenshot: Innterflow's header: logo, DTF & UV DTF, Ready to Print Designs, Promotional Material, Blanks, Help Center, search, cart, Log in, Sign up)

## Response snapshot

Measured the live header: the row is 1200px (contained), the menu has about 755px, five links take 727px, a sixth ("Contact Us") needs 833px, so the menu list (flex-wrap: wrap) ran onto a second line. A header menu (horizontal, drawer on a phone) now never wraps: MenuNav measures it (on load, when the header's width changes, when fonts arrive) and steps down: links closer (8px), then closer with text 6% smaller, then 13% smaller, and only when even that does not fit, the menu button as on a tablet. Before it measures, one line clipped rather than a second line. Footer and inline menus unchanged. On the live header with a sixth link: one line at 1519/1366/1280 (Contact Us: closer + 6% smaller; Custom Apparel: 13% smaller), the menu button at 1100.

## Outcome

- ✅ Impact: every brand's header menu stays on one line; more links fit before it turns into the button.
- 🧪 Tests: 6 new, builder tests, a live-page check with screenshots, tsc, next build.
- 📁 Files: base CSS, MenuNav island, one test file.
- 🔁 Next prompts: the owner's yes to push; then add the sixth link in Site builder → Menus.
- 🧠 Reflection: CSS cannot tell whether a row overflows, so a small measurement in the island decides; the steps stay in CSS.
