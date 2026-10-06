---
id: 308
title: Logo link
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: give the logo element an option to change its link URL
labels: ["visual-builder", "logo", "header"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/registry.ts ("Goes to" and "Open in a new tab" on the logo)
 - frontend/src/components/builder/render.tsx (the logo and its shop-name fallback use them)
 - backend/app/services/builder/schema.py (the logo's href is checked as a link)
 - frontend/src/__tests__/builder-header-footer.test.tsx (one new)
tests:
 - frontend vitest: builder-header-footer + builder-site 77/77; tsc: no new errors; backend builder schema 61/61
---

## Prompt

With a picture of the builder, the header's logo selected:

aby ye logo pe url change krne ka option bhi to do yar meri jan jaldi se yar mere bhai

## Response snapshot

The Logo element has two new settings: **Goes to** (a path like /collections/dtf or a full web address; empty means the home page, as before) and **Open in a new tab**. The shop's name, shown when there is no logo picture, follows the same link. Anything that is not a safe link (javascript: and the like) falls back to the home page, in the browser and in the check before publishing.

## Outcome

- ✅ Impact: the logo can link anywhere.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: none.
- 🧠 Reflection: none.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): all PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none.
