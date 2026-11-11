---
id: 625
title: Push one site per shop and folder import
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's yes to push 671e7b5 (one site per shop) and e90f068 (Import a design, a whole folder)
labels: ["visual-builder", "import", "deploy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (push only)
tests:
 - live read-only checks after deploy: website and backend on e90f068; /health schema 0078_builder_site_unique; Innterflow and Ikrash home pages 200; Innterflow storefront site still its published builder site (version 41)
---

## Prompt

hn krdo

## Response snapshot

Pushed 52cac15..e90f068 to main (fast-forward). Both commits live: website and backend on e90f068, migration 0078 applied (schema 0078_builder_site_unique), Innterflow and Ikrash open fine and Innterflow still shows its own published site. The folder import (Site builder, Pages, Import a design, Choose the design's folder) is ready on live for the new demo brand.

## Outcome

- ✅ Impact: one builder site per shop is enforced by the database on live; folder import available to every shop.
- 🧪 Tests: read-only live checks only (no writes to production).
- 📁 Files: none changed in this step.
- 🔁 Next prompts: the owner makes the demo brand and imports the Sidequest folder.
- 🧠 Reflection: whether 0078 added the rule or found it already there is only visible in Railway's deploy log; the code is safe either way.
