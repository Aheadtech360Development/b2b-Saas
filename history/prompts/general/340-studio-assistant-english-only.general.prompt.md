---
id: 340
title: Builder assistant in English only
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: remove Roman Urdu everywhere it was added; English only
labels: ["gang-sheet", "studio", "ai-assistant", "copy", "language"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: https://github.com/Aheadtech360Development/b2b-Saas/pull/2
files:
 - frontend/src/components/storefront/StudioAssistant.tsx (greeting, suggestions, buttons, notes, placeholder in English)
 - frontend/src/components/storefront/GangSheetStudio.tsx (button title)
 - backend/app/services/copilot/studio.py (always reply in plain English)
 - backend/tests/test_studio_assistant.py, frontend/src/__tests__/studio-assistant.test.tsx (English wording)
 - specs/002-studio-ai-assistant/spec.md
tests:
 - backend/tests/test_studio_assistant.py (20 passed)
 - studio-assistant, studio-context, gang-sheet-studio (54 passed); tsc clean apart from api-client.test.ts as before
---

## Prompt

acha ab suno ye roman urdu hatado yar sirf english chayie ab mjhy plz jaha jaha roman urdu tumne lagai ha usko english kro plz

## Response snapshot

Every Roman Urdu string added for the builder's assistant is now English: greeting, suggestion chips, "Do it", "Working on it…", "Add to cart", the done note, the placeholder, the header line and the button's tooltip. The assistant's prompt now says to always reply in plain English whatever the customer writes. The owner copilot and order-support chat still answer in Roman Urdu when written to in it; those lines predate this work and were left as they are.
