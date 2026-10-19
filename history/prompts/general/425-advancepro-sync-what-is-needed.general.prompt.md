---
id: 425
title: AdvancePro sync what is needed
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: List what is needed from the platform owner and the brand to build the AdvancePro inventory sync
labels: ["integrations", "inventory", "advancepro", "requirements"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/425-advancepro-sync-what-is-needed.general.prompt.md
tests:
 - none (clarification only, no code changed)
---

## Prompt

abhi tumhein mjhse kia chayie ye batao na jani ?

## Response snapshot

From the platform owner:
- Allow advanceware.net (and help.advanceprotech.com) under the environment's Network access, Allowed domains, or send the swagger.json or screenshots
- Put the AdvancePro test-company credentials in the environment as ADVANCEPRO_USERNAME / ADVANCEPRO_PASSWORD, never in chat
- Decide v1 pull-only or v2 (also push orders into AdvancePro)
- Name the brand (tenant) on the platform

From the brand:
- Request API access from AdvancePro support, with test-company credentials
- Confirm the API base URL (shared advanceware.net/restapibeta, or their own server)
- Send 10 to 20 sample SKUs, to check that they match the platform's variant SKUs
- List their AdvancePro warehouses and say which platform location each should feed
- Say how fresh stock must be (sync interval) and whether a safety-stock buffer is wanted

## Outcome

- ✅ Impact: Clear checklist of blockers before spec and build
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: once the inputs arrive, read the swagger spec, then /sp.specify the AdvancePro inventory sync
- 🧠 Reflection: Credentials go through environment secrets, never chat

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
