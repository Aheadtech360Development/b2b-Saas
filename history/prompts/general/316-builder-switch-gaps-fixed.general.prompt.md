---
id: 316
title: Builder switch-over gaps fixed
stage: green
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: fix all three — /products on the builder, quote and policy pages, search suggestions (and search in the preview)
labels: ["visual-builder", "search", "suggestions", "preview", "all-products", "written-pages"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/resolve.py (route "products": All products in the collection template, old ?category= links kept; suggest())
 - backend/app/services/theme_data.py (cards_in_order: one fetch for a page of cards)
 - backend/app/api/v1/builder_public.py (GET /storefront/search/suggest)
 - backend/tests/test_builder_integration.py (suggestions and All products, 21 checks)
 - frontend/src/app/(customer)/products/page.tsx (builder shop: All products; ?q= to /search)
 - frontend/src/components/builder/islands/SearchBox.tsx (new: suggestions while typing; header icon opens a search panel)
 - frontend/src/components/builder/render.tsx (search element uses it; Load more keeps ?category=)
 - frontend/src/lib/builder/previewLinks.ts (new: shop addresses to preview addresses)
 - frontend/src/app/site-builder/preview/page.tsx (links, search, sort and Load more stay in the preview)
 - frontend/src/services/builder.service.ts (preview takes page and sort)
 - frontend/src/components/storefront/ThemeWrittenPage.tsx (builder look for quote and policies)
 - frontend/src/app/(customer)/quote/page.tsx, frontend/src/app/(customer)/policies/[slug]/page.tsx
 - frontend/src/lib/builder/baseCss.ts (suggestion list, search panel, no blue ring)
 - frontend/src/__tests__/builder-search-suggest.test.tsx, frontend/src/__tests__/builder-written-pages.test.tsx (new)
tests:
 - backend builder integration 158/159 (21 new pass; the 1 failure, "the imported theme renders today", fails the same without these changes in this environment)
 - backend builder schema 64/64, builder security 35/35
 - frontend builder tests 214/214 (20 new); full suite 356/358 (the 2 failures are api-client refresh tests that fail the same without these changes)
 - tsc: no new errors (2 existing in api-client.test.ts); next build: passes
 - browser (local demo shop on the builder): All products, search panel with "gang" suggestions, Enter to the search page, quote page, phone; preview: search, Shop all, a product, sort, Load more all stay in the preview
---

## Prompt

hn 3no krdo ek sath meri jan 3no krdo proper

## Response snapshot

All three from the switch-over audit:

1. `/products` on a builder shop is drawn with the shop's collection template as "All products": every product on sale, newest first or A–Z, Load more. `?q=` goes to the search page; an old `?category=` link shows that category (and those under it) in the same template; an unknown one is the shop's page-not-found. Gender/size/colour filters are gone from builder shops.
2. `/quote` and `/policies/*` on a builder shop use the builder's own classes (type, colours, the builder's form) instead of the imported theme's, which a builder shop does not load. Same form, same submission.
3. The search box suggests up to 6 products after two letters (same search as the search page): picture, name, price; a gang sheet made in the builder opens the gang sheet builder itself; upload-by-size products open their own page; "See all N results"; arrow keys, Enter, Escape. The header icon opens the box in a panel across the top instead of leaving the page. In the draft's preview, search, Shop all, products, collections, pages, sort and Load more now stay in the preview; links it does not draw (checkout, account, gang sheet builder, quote) open in a new tab.

Found and fixed while checking in a browser: Enter in the header panel did not search (the panel closed and took the form off the page before it was sent); the app's form styles drew a blue ring inside the builder's search box.

## Outcome

- ✅ Impact: after the switch, "Shop all", search, quote and policy pages all wear the builder design; typing "gang" suggests the gang sheet builder.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: publish and switch the Innterflow shop over; the live shop's own menus may link to old addresses — those keep working.
- 🧠 Reflection: the preview could only be made faithful by mapping links, since the live shop is still on the imported theme.

## Evaluation notes (flywheel)

- Failure modes observed: a form removed from the page during its own submit is not sent.
- Graders run and results (PASS/FAIL): PASS (tests above).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
