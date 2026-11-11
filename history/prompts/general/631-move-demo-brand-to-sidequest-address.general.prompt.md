---
id: 631
title: Move demo brand to sidequest address
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner wants the demo brand's address changed from sharifabad-federal-b-area-karachi.printcopilot.co to sidequest.printcopilot.co
labels: ["platform", "domain", "demo-store"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - live read-only GET /api/v1/signup/availability: sidequest available; innterflow "Already taken" (the check works)
---

## Prompt

ay ye name change krke sidequest.printcopilot krna ha bhai

(screenshot: the address bar at sharifabad-federal-b-area-karachi.printcopilot.co)

## Response snapshot

sidequest is free and not reserved. The move is the super admin's: console, Brands, the brand, Domain tab, Platform address, Move, type sidequest. The shop, its site, products and settings stay (they belong to the brand, not the address); the old address stops working at once; the new one works at once (wildcard certificate); signing in again at the new address may be needed.

## Outcome

- ✅ Impact: the demo store's address no longer names a city outside the US.
- 🧪 Tests: read-only availability check on live.
- 📁 Files: none.
- 🔁 Next prompts: owner moves the address, then products, designer and rewards steps.
- 🧠 Reflection: the sign-up form's address field was filled with a postal address; worth a clearer label later if it repeats.
