---
id: 659
title: AdvancePro email for manager
stage: general
date: 2026-11-13
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for a basic email to send the manager, so the manager can ask the AdvancePro team about API access
labels: ["integrations", "advancepro", "draft"]
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

mjhy ek basic si mail likhdo mei manager ko bhjdun take wo advanced pro ki team se poochle saiha jaldi kro

## Response snapshot

A short English email draft (not sent) for the manager to pass to the AdvancePro team: the REST login with EZ Mart's desktop login answers "Invalid login credentials"; asks whether the REST API (APConnects, 11.2+) is on for EZ Mart's company and their desktop version, whether a separate API user is needed (two-factor off), which API address to use (currently https://advanceware.net/restapibeta), whether a Brand ID or company ID must be sent on login, and read access to warehouses, variants and warehouse inventory (customer orders later). No password by email or chat. Reminder to the owner: EZ Mart changes the shared password once it works.

## Outcome

- ✅ Impact: the manager has a ready email to get API access answers from AdvancePro.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: AdvancePro's answer (API user, address, Brand ID).
- 🧠 Reflection: none.
