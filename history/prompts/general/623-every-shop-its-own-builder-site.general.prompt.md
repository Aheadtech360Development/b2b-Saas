---
id: 623
title: Every shop its own builder site
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner says push, and make sure every store has its own website builder and site
labels: ["visual-builder", "multi-tenant", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/models/builder.py
 - backend/app/services/builder/site.py
 - backend/migrations/versions/0078_builder_site_unique.py
 - backend/tests/test_builder_one_site_per_shop.py
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/components/builder/editor/ImportDesign.tsx
 - frontend/src/__tests__/builder-import-design.test.ts
tests:
 - backend/tests/test_builder_one_site_per_shop.py (3 passed)
 - frontend/src/__tests__/builder-import-design.test.ts and builder-site (42 passed)
 - local two-shop walk through the real API (demo and walk-prints): own site, draft, versions, menus, fonts and live page each; A's token naming B in the header works on A only; 20/20, all put back
 - local five-tabs-at-once walk on a shop with no site: one site made
 - migration 0078 run on printcopilot_local first: added the rule there; its "already has the rule" check finds it after
 - next build passed
---

## Prompt

hn push krdo saiha meri jan aur ek cheez ye make sure krlena har stpre kka apne website builder apni site ha saiha bhai ye lazmi dekhlena meri jan kahi agy jake msla hojae bhai mere

## Response snapshot

Pushed 52cac15 (Import a design), live on the website. Checked that every shop has its own builder and site: each site row carries its shop (tenant_id, NOT NULL), row level security is on and forced for builder sites, versions, fonts and menus, the builder always works on the shop in the signed-in token (a header naming another shop changes nothing), the storefront reads the shop of its address, and the version cache is keyed by shop. A two-shop walk through the real API passed 20/20. One gap found: the one-site-per-shop rule (UNIQUE tenant_id) was missing from the local database (made from the models), so two first openings at the same moment could make two sites for one shop. Fixed: the model declares the rule, migration 0078 adds it where missing (deletes nothing; skips if a shop already has two), opening the builder handles the race (one site), and every reader picks the same site. Also: the import dialog warns and stops when the site would pass the 3,000-element publish limit.

## Outcome

- ✅ Impact: one builder site per shop, kept by the database as well as the code; isolation walked end to end.
- 🧪 Tests: 3 backend, 42 frontend, two local walks, local migration run, next build.
- 📁 Files: builder model, site service, migration 0078, two test files, import converter and dialog.
- 🔁 Next prompts: the owner's yes to push (a migration: runs at deploy, only adds the rule).
- 🧠 Reflection: the isolation was right; the uniqueness rested on a migration that only applied when it created the table, which a database made from the models never had.
