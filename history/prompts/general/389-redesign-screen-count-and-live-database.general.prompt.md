---
id: 389
title: Redesign screen count and the live database
stage: general
date: 2026-10-12
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: how many redesign screens are done; remember the new UI must be connected to the live database straight after, it shows dummy data now
labels: ["admin-redesign", "status", "go-live", "live-database"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - read only, git — the admin has 61 pages; 6 differ from main on the branch (Home, Orders list, Order page, Drafts, Returns, Shipments); the branch changes no migration and no model
---

## Prompt

acha ab zara ye batana ke kitni ui wale kam mei kitni screens hogyin thin aur ek bat yad rkhna jani hamein na proper foran ui change krke isko live database se jorna hoga saiha abhi to dummy data ha saiha got it

## Response snapshot

- Three of the owner's designs are done (1. Home, 2. Orders list, 3. Order detail); Drafts, Returns and reprints and Shipments were rebuilt as tabs in the same Orders frame. Six of the 61 admin pages have the new look; the other 55 sit in the new sidebar and top bar with their old look inside.
- Noted: once the UI is done it goes onto the live database straight away. Nothing extra is needed for the database itself: the redesign changes no table, so the deploy shows the real orders and customers.
- Recommended before the deploy: run the new screens once against a copy of the live data on localhost (never against the live database itself, where every test click changes a real order); it is the owner's call, since it brings customer data onto this machine. Main has to be merged into the branch before the deploy.

## Outcome

- ✅ Impact: the owner has the count and the go-live rule is kept in memory.
- 🧪 Tests: read only, as listed.
- 📁 Files: none.
- 🔁 Next prompts: the next screens' designs; a yes or no on trying the redesign with a copy of the live data.
- 🧠 Reflection: "screens" counted two ways (the owner's designs, and admin pages in the new look), both given, so the number is not flattered.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
