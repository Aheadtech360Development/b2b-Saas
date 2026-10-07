---
id: 342
title: Assistant asks on every upload and knows sizes
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: ask before putting an upload on the sheet, ask yes/no on a background, know how many copies fit at each size, fill the sheet, full control
labels: ["gang-sheet", "studio", "ai-assistant", "upload", "capacity", "fill"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/studioBuild.ts (capacity, fillCount, plan fields place/fill/gap_in/sets)
 - frontend/src/lib/studioContext.ts (size_now and copies_that_fit per design)
 - frontend/src/components/storefront/StudioAssistant.tsx (upload card: background yes/no, put on sheet yes/not yet; plan card shows fill, spacing, sets)
 - frontend/src/components/storefront/GangSheetStudio.tsx (uploads routed to the assistant while it is open; fill, spacing, sets, place)
 - backend/app/services/copilot/studio.py (fill, gap_in, sets validated; prompt reads sizes and room before advising)
tests:
 - backend/tests/test_studio_assistant.py (27 passed)
 - frontend studio-assistant (19), studio-context (29): passed; full vitest 453 passed, 2 failed in api-client.test.ts as before
---

## Prompt

(screenshot: the builder with eight large copies of a logo on a 22x10 sheet)

dekho agar for example isko itna inteeligent to bnana ha mjhy apne ai assistant for gang sheet builder ko ye na jese mei design upload krrha na meri jan to yue foran upload krdera sheet pe jese mei design upload krun to pehle poche ke kia ye mei sheet pe daldun ya nh aur dusra abhi jo ss dia ha isme dekho designs bary hain saiha isko itna inteeligent bnaon ke agar mei bolun na isko sizes ka bhi sari knowldge ho ke agar mei kisi design ka size chota krke full sheet uski copy krun to aramse fit hojaegi wo agar size barhao to overflow hogi ye sb cheezein proper assistant ko in cheez ki knowlegde honi chayie proper aur har image upload pe do option de agar uska bg detect ho to yes or no pooche yes ho to bg remove kre warna nh saiha mei chahta hn iske pass full control hona chayie saiha matlab easily ye manage krrha ho phir mei model ki bhi bat krta hn

## Response snapshot

Every upload while the assistant is open now gets a card: background found — remove it? yes/no (only when there is one), put it on the sheet now? yes/not yet. Nothing is done until both are answered; then the assistant is told and asks for copies and size. Each design is sent with how many copies fit on the open sheet at each common width (and the dpi there), so the assistant warns of overflow and suggests a size that fits. "Fill the sheet" is counted exactly by laying it out. The assistant can also set the spacing and the number of sets.
