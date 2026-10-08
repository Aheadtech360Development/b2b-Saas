---
id: 356
title: Mobile app card removed from settings
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: remove the "Mobile app" card (shop code and QR) from the admin's Settings, General and mails
labels: ["admin", "settings", "removal"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin/settings/page.tsx (the card and its import gone)
 - frontend/src/components/admin/ShopCodePanel.tsx (removed; nothing else used it)
tests:
 - tsc clean; nothing else in the website refers to the panel
---

## Prompt

With a picture of the "Mobile app" card in the admin's settings — "Your shop code CGGFP6", Copy, "Issue a new code", and a QR to scan:

ye cheez delete krdo saiha jani iski zaroorat nh ha setting smei jakr general and mails mei ha

## Response snapshot

The "Mobile app" card is gone from Settings, with the panel behind it (the shop code, Copy, Issue a new code, the QR).

Left in place on the server, on purpose: the shop codes themselves and the address the mobile app looks a shop up by. Nothing in the admin shows a code any more, but a code already given out still opens its shop in the app; taking that away too would be a second, separate removal.

## Outcome

- ✅ Impact: one card fewer in Settings.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: whether the server side of shop codes should go as well.
- 🧠 Reflection: the card was the only place a brand could read or change its code, so removing it also removes the way to issue a new one; said so rather than left to be found.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
