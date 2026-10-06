---
id: 301
title: Footer on every page
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: the footer shows on the home page only, not on product or collection pages — it should be on the whole site
labels: ["visual-builder", "footer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/doc.ts (strayFooterOf, moveToFooter; isColumnsFooter shares one check)
 - frontend/src/components/builder/editor/SiteEditor.tsx (the "Footer" block becomes the site's footer; a footer sitting in a page gets "Show it on every page")
 - frontend/src/lib/builder/registry.ts (the block's description)
 - frontend/src/__tests__/builder-header-footer.test.tsx
tests:
 - frontend vitest builder-header-footer 44/44; tsc: no new errors
---

## Prompt

With a picture of the editor: the five-column footer selected on the home page, the Add panel open beside it:

ye sirf home page pe arha ha thruuout nh arha ha product pages wagera collection pages pr bhai poori site pe ana chayie na mere bhai yar

## Response snapshot

The cause: the footer in the picture was the "Footer" block from the Add panel, dropped into the home page. That made it a section of the home page — so the shop showed it there and nowhere else. The site's own footer (the one every page shows) was untouched.

Now the "Footer" block never goes into a page: clicking it, dragging it or picking it from the "+" sets the site's footer — five columns, the old footer's menus and look kept — and it shows on every page: home, products, collections, cart.

For the footer already sitting in the home page: select anything in it and a bar says it is on this page only, with "Show it on every page". One press takes it off the home page and makes it the site's footer, exactly as built (it replaces the footer the other pages show; asked first; Ctrl Z undoes it).

## Outcome

- ✅ Impact: one footer for the whole site, however it is added.
- 🧪 Tests: as listed; no browser run.
- 📁 Files: as listed.
- 🔁 Next prompts: press "Show it on every page" on the Innterflow draft, publish.
- 🧠 Reflection: a ready-made block offered in the Add panel was the site footer's twin, and nothing said where it would land.

## Evaluation notes (flywheel)

- Failure modes observed: a site-wide part offered as an ordinary page block.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the same for a header block, if one is ever offered.
