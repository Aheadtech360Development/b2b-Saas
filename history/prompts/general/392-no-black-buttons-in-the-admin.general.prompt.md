---
id: 392
title: No black buttons in the admin
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: remove the black buttons wherever they are, use the theme's blue button and the same font
labels: ["admin-redesign", "buttons", "gang-sheets", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/app/(admin)/admin-shell.css
tests:
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - browser engine, localhost, read only — 15 admin pages (the five gang sheet tabs, products, customers, customer tiers, taxes, shipping tiers, style sheets, product specs, a new purchase order, settings, discounts): every visible button's colour read, none left black
---

## Prompt

(with two screenshots: the gang sheet page's Sheet sizes and Settings tabs on localhost)

ye kaly buttons jaha jaha hain hatao na  jo theme ka apna blue bg wala button ha wo use kro aur font bhi same use kro bhai mere

## Response snapshot

Committed on the local branch (9d7ed60), not pushed.

- The gang sheet page's tabs take the admin's own parts: blue main buttons, white plain ones, inputs and labels as on the redone screens, titles in the display font.
- Every other old admin screen: one stylesheet rule turns its black buttons blue inside the new admin, without touching the 55 files that drew them, until each screen is redone.
- Kept: the navy Copilot button and the navy Board/List switch, which are in the owner's designs.

## Outcome

- ✅ Impact: no black button left in the admin; the gang sheet tabs read like the rest.
- 🧪 Tests: as listed.
- 📁 Files: 2.
- 🔁 Next prompts: the next screens' designs.
- 🧠 Reflection: one scoped rule is the smallest change that keeps every old screen in line until it is redone; it goes when they all are.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): tsc PASS; colour sweep PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
