---
id: 339
title: Builder assistant builds the sheet on one press
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: the assistant only advises — make it build the sheet, simple enough for anybody
labels: ["gang-sheet", "studio", "copilot", "ai-assistant", "roman-urdu", "propose-plan"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/studioBuild.ts (planBuild, betterSize, plan types)
 - frontend/src/lib/studioContext.ts (designs named d1…, sizes, unknown backgrounds left unsaid)
 - frontend/src/components/storefront/StudioAssistant.tsx (plan card, one-press run, 📎 upload, add-to-cart tap)
 - frontend/src/components/storefront/GangSheetStudio.tsx (preview/run a plan, background removal in place, chat upload, opens itself on an empty builder, "Build with AI" label on the running-border button)
 - backend/app/services/copilot/studio.py (propose_plan tool, validate_plan, prompt for building)
 - backend/app/api/v1/copilot.py (returns the checked plan)
tests:
 - backend/tests/test_studio_assistant.py (20 passed)
 - frontend/src/__tests__/studio-assistant.test.tsx (11, real builder), studio-context.test.ts (21), gang-sheet-studio.test.tsx (22) — all passed; full vitest 437 passed, 2 failed in api-client.test.ts as before
---

## Prompt

(screenshot: the assistant replying that it cannot arrange the sheet and telling the customer to add copies and press Auto Nest)

abhi shyd ye sirf read only mode pe ha kch kr nh rha ha ye ispe dekho zara isey proper

continue plz bus main concept yad rkhna ke isko itna easy krdena ha ke koi bhi jahil user bhi ai se bat krke apna jo ha gang sheet ready krwale saiha

## Response snapshot

The assistant now builds. The model proposes a plan (designs by ref, total copies, width or height, sheet size, backgrounds to remove, add to cart); the server checks it against the sheet; the builder shows it as a card with its own Auto Nest layout and the shop's price, offers one bigger sheet when it overflows, and runs it on one press — backgrounds, then the build, then the cart — with one undo to put it back. Designs can be handed to the chat with 📎 and the assistant asks about them straight away. The builder opens the assistant itself when it starts empty.
