---
id: 354
title: Build with AI switched off
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: 002-studio-ai-assistant
branch: main
user: Aheadtech360Development
command: switch off "Build with AI" in the gang sheet builder for now
labels: ["gang-sheet-builder", "ai-assistant", "feature-switch"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(customer)/gang-sheets/page.tsx (the switch for the shop: BUILD_WITH_AI = false)
 - frontend/src/components/storefront/GangSheetStudio.tsx (an `assistant` prop: no button, no panel, no opening by itself when false; true when not given, so the assistant's own tests are as they were)
 - backend/app/core/config.py, backend/app/api/v1/copilot.py, backend/.env.example (the switch for the server: COPILOT_STUDIO_ENABLED, false; the route refuses with 503 while it is)
 - backend/tests/test_studio_assistant.py (one check for the server's switch)
tests:
 - backend, no database — test_studio_assistant.py and test_commission.py, 56 passed; two files compile
 - frontend — tsc clean
 - NOT run — the builder's vitest files (slow; the owner has asked for no long runs on a change like this). The prop defaults to on, so they see the builder as before
---

## Prompt

aur bs abhi ke lie jo gang sheet builder mi build with ai hana isable krdo filhal plz

## Response snapshot

"Build with AI" is off, in the shop and on the server:

- In the builder: the button is gone from the top bar, the panel is not drawn, and it no longer opens by itself on an empty sheet. Everything else in the builder is untouched.
- On the server: the assistant's route refuses every question while it is off. Hiding a button is not the same as switching something off — the route is open to guests, so it could still have been called, and each answer is paid for.

Nothing was removed. To put it back, two switches, both needed and each pointing at the other in its comment: `BUILD_WITH_AI = true` in the frontend's gang-sheets page, and `COPILOT_STUDIO_ENABLED=true` in the server's environment. With only the first, the panel opens and says the assistant isn't available.

## Outcome

- ✅ Impact: customers do not see the assistant, and it cannot be used or billed while it is off.
- 🧪 Tests: as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: the other session, which is still working on the assistant, needs to know it is off and how to turn it on to try its work.
- 🧠 Reflection: the switch is a prop the page sets rather than a constant inside the builder, so the twenty-odd tests that open the assistant did not have to learn about it.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): one switch instead of two — the builder asking the server whether the assistant is on.
