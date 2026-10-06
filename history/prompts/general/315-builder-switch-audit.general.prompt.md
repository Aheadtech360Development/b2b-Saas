---
id: 315
title: Builder switch-over audit
stage: explainer
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: quick audit — when the builder site is published, nothing of the old imported theme should show, and search should work
labels: ["visual-builder", "imported-theme", "publish", "audit", "search"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read only: frontend/src/components/storefront/StorefrontShell.tsx, ThemeChrome.tsx, ThemeWrittenPage.tsx, frontend/src/lib/builder/load.ts, every page under frontend/src/app/(customer)/ and frontend/src/app/page.tsx, backend/app/api/v1/storefront.py theme-active and page endpoints, backend/app/services/builder/resolve.py, site.py, starter.py, frontend/src/components/builder/editor/SiteEditor.tsx)
tests:
 - none (no code changed)
---

## Prompt

dekho mei bataon kia chahta hn ek to live site ha wo jugar se mene keri thi import theme krke admin sidebar mei edit theme ka option ha waha tumhein dikh jaega saiha aur uske bad ye scene krna ha ke mere bhai abhi to mene poora website builder bnadia ha waha poori full fledge shop bhi create krdi ha saiha mere bhai to bs mei tumhein ye kehra hn ye dekhlo jb meo wo publish krunga to yaha kch purani theme na dikhe jo abhi live ha saiha ye bs dekhlo bad mei search wagera ka msla kch na horhy hon saiha meri jan ek quick audit krlo usko zara

## Response snapshot

Audit of what a shopper sees once the builder site is published and the shop switched over (Publish → "Switch the shop to the builder site"):

Clean:
- Header, announcement bar and footer: the builder's on every page, cart/checkout/account included; the imported theme's chrome is not drawn at all (`theme-active` returns the builder and no theme chrome; StorefrontShell takes the builder branch).
- Home, product pages (gang sheet "Start designing" included), collections, cart, search, builder pages, 404: all builder.
- Switching back to the imported theme is one click in the editor's ••• menu.

Gaps:
1. `/products` ("Shop all", which the builder's own starter links to) has no builder version: it shows the app's catalogue with apparel filters (Gender, Size, Color) inside the builder header — the page in the earlier screenshot.
2. `/quote` and `/policies/*` are drawn with the imported theme's CSS classes (`.wrap`, `.btn-primary`), which a builder shop does not load: they come out unstyled. Only matters where linked (the starter home has "Get a quote" → `/quote`).
3. `/about`, `/contact`, any `/<slug>` with no builder page by that address falls back to the older page editor's page.
4. App pages (blog, reviews, quick order, track order, print guide, private label, product specs, style sheets) keep the app's look inside the builder header; only matters if linked.
5. Search: works after the switch (builder search page with results); still no suggestions as you type, and in the draft preview it leaves for the live shop.

Proposed, waiting for go-ahead: `/products` drawn by the builder (all products, sort, pages); `/quote` and policies styled for a builder shop; search suggestions and search inside preview.

## Outcome

- ✅ Impact: user knows what will and will not change at switch-over.
- 🧪 Tests: none; nothing changed.
- 📁 Files: this record only.
- 🔁 Next prompts: go-ahead on the fixes.
- 🧠 Reflection: the shop's live draft (its menus' links) is in production data and was not seen; gaps 2–4 only matter if something links there.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
