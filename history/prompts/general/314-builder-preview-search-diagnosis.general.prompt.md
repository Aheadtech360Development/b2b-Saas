---
id: 314
title: Builder preview search diagnosis
stage: explainer
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: the search button in the draft's preview opens a strange page — identify the issue first
labels: ["visual-builder", "search", "preview", "diagnosis"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (read only: frontend/src/components/builder/render.tsx, frontend/src/components/builder/islands/MenuNav.tsx, frontend/src/app/site-builder/preview/page.tsx, frontend/src/app/(customer)/search/page.tsx, backend/app/services/builder/resolve.py, frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx)
tests:
 - none (no code changed)
---

## Prompt

With two pictures: the builder editing the Innterflow home page ("Theme is live" — the imported theme — with this design a draft), and the page that opened after the search button: innterflow.printcopilot.co/products, "All Products" with Gender / Availability / Category filters, under a different header (Blanks, Signs & Banners, Promo Material, Business Cards, Shop Now).

ye dekho ye mera customizer ha saiha abhi to imported theme live pe chlri ye draft ha saiha to iska search biutton pe jb click krrha na preview krke jani   to ye ajeebsa hi page khulra halake mjhy to simple jo mere mei backend mei products wagera hain wo yaha search horhy hongy na jese mei likha rha hn gang to gang sheet builder suggest hoke ata rhe simple is tarah hona chayie na mere bhai to plz isko dekho yar kia issue ha pehle identify krna kia issue ha phir mei go ahead dunga apko saiha bhai

## Response snapshot

Diagnosis only, no change:

1. The preview (`/site-builder/preview`) renders the draft but its links are ordinary links. The header search icon is `<a href="/search">` (render.tsx, and MenuNav.tsx in the phone menu), so a click leaves the preview for the live shop's `/search`. The live shop is not on the builder, so `/search` finds no builder search page and redirects to `/products` — the old catalogue, with apparel filters, in the imported theme's header. That is the page in the second picture. The same is true of every other link in the preview (menu, product cards, cart).
2. There is no search-as-you-type anywhere in the builder: the icon goes to a search page, the box only searches on Enter. The backend search (`_search_ids` in resolve.py: name, code, description, type, brand, tags; this shop, active products) already finds the right products, so suggestions can use it.
3. The gang sheet builder opens per product (`/gang-sheets?product=<id>`), so a gang-sheet product found for "gang" can link straight to its builder.

Proposed fix, waiting for the go-ahead: keep search inside the preview; a suggestions dropdown under the search box (pictures, names, prices; gang-sheet products open the builder; "see all results"); the header icon opens that box in place instead of leaving the page.

## Outcome

- ✅ Impact: cause identified; fix proposed, not made.
- 🧪 Tests: none; nothing changed.
- 📁 Files: this record only.
- 🔁 Next prompts: go-ahead, and whether a gang-sheet suggestion opens the builder or the product page.
- 🧠 Reflection: it only looks broken because the draft is not live; once published, `/search` shows the builder's search page — but still with no suggestions.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
