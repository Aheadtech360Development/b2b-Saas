---
id: 307
title: Description sections accordion
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: a long product description takes half the page — detect its headings and turn them into an accordion automatically
labels: ["visual-builder", "product-page", "description", "accordion"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/descSections.ts (new: splitDescription)
 - frontend/src/components/builder/render.tsx (product_description draws sections)
 - frontend/src/lib/builder/registry.ts (two settings on the element)
 - frontend/src/lib/builder/baseCss.ts (the sections' look, a smooth open where the browser can)
 - frontend/src/__tests__/builder-desc-sections.test.tsx (new)
tests:
 - frontend vitest: builder-desc-sections 6/6, all builder suites 191/191; tsc: no new errors
 - a picture of a description like the one in the report, cut into six sections
---

## Prompt

With two pictures of the "DTF PDP" product template: the description — Product Details, Features, Specialty Film Styles, Satisfaction Guarantee, Pressing Instructions, Shipping & Returns, with rules between — running far down the page.

aby yar jani ye dekho mene prodcut mei description dala na to ye to adha page legya height mei kuke description ziada ha to ham agar isko intelligent krskein ke bhai headings ko auto detect krle aur already usko ye accordion mei bnade jani asa kch hoskta ha kia dekho zara proper kuke abhi to bhut hi bekar arha a ye dekho

## Response snapshot

The Product description element now cuts a description at its own headings, by itself:

- It cuts at the highest heading rank used at least twice (so an `h1` title used once stays above, and `h3`s under an `h2` stay inside their section). Without real headings, a line of nothing but bold words counts as one ("Features", "Care:"). Headings inside grouping boxes are found too.
- Each heading becomes a section that opens and closes (`<details>` — works before any script loads, keyboard and screen readers included). The first is open; the rest closed. Text before the first heading stays in view above them. The rules drawn between sections are dropped, since each section has its own line.
- Fewer than two headings: shown exactly as written.
- Two settings on the element: "Long descriptions" — Sections that open and close (default) / All of it, as written; and "Start with every section closed".
- A smooth open in browsers that can animate it; a plain one elsewhere.

Nothing about the description itself changes — it is the same text from the product, laid out differently. Applies to every product page template using the element, on Publish.

## Outcome

- ✅ Impact: a product page with a long description stays short; customers open what they need.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: none.
- 🧠 Reflection: cutting markup as text works the same on the server and in the browser; the cleaned markup makes that safe.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none.
