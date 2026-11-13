---
id: 658
title: Open client AdvancePro desktop
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks whether he can open the client's AdvancePro (desktop) on his own computer
labels: ["integrations", "advancepro"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

mei apne desktop pr unka khol skta hn kia advanced pro?

## Response snapshot

Not on his own machine: the desktop AdvancePro runs on the client's computer or server with their database and licence; an install elsewhere would not reach their data without remote access set up by their IT. Instead a screen-share with the client (Zoom, Meet, AnyDesk, with permission) to check the version (Help, About, 11.2+), any API / APConnects / Integrations setting, and a few SKUs against the shop's. The API user is usually made by the AdvancePro advisor, so that request still stands. Do not use the client's login on his machine without their written OK.

## Outcome

- ✅ Impact: a practical way to check the client's setup without moving their login around.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the screen-share findings and the advisor's answer.
- 🧠 Reflection: none.
