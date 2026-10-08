---
id: 373
title: Assistant knows every sheet and asks which one
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: last check before the Anthropic key — the assistant must know the whole canvas (designs, copies, every sheet, sizes) and, asked to clear the sheet when there are several, ask which
labels: ["gang-sheet", "studio", "ai-assistant", "sheets", "audit"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/studioContext.ts (sheets, total, selected design, issues)
 - frontend/src/lib/studioBuild.ts (plan: sheet incl. "new", clear_sheets, delete_sheets; preview fields)
 - frontend/src/components/storefront/GangSheetStudio.tsx (any sheet's view; plans on another sheet or a new one; empty and delete sheets)
 - frontend/src/components/storefront/StudioAssistant.tsx (card rows and Undo warnings)
 - backend/app/services/copilot/studio.py (sheet models; which-sheet rule; clear/delete validation; prompt without long dashes)
tests:
 - backend/tests/test_studio_assistant.py (62 passed)
 - frontend studio-assistant (37), studio-context: passed; full vitest 488 passed, 2 failed in api-client.test.ts as before
---

## Prompt

acha isme na ek cheez bs tum proper check krlo wo ye ha mei bs claude mei credits dalwa kr claude api key se testing krunga saiha bus tum ek last bar jo ha wo ye cheez check krlo bs ke jo gang sheet ai asiistant hana uske pass har knowlege ho matlab wo har cheez pe question kre jese for example sheets pe already kitne design hain usko pata ho kitni copies hain gang sheets ki usko pata ho poore canvas ki knowledge ho sari sheet ki sizes pata hon saiha proper har cheez each and everthing agar mei use bolun ke sheet khali krdo sb designas hatado to wo itna intelliegent ho ke poochna chayie pehle ke agar multiple sheets hain to wo pooche konsi sheets saiha ye proper hona chayie sb cheez proper krdo phir mei anthropic ki keys lagaon saiha meri bhai proper ek bar quick audit krlo  saiha bhai

## Response snapshot

The audit found the assistant saw only the open sheet. It is now told every sheet (name, size, length, how many are printed, which designs with copies and sizes, price), the total, the design clicked on and each design's problems. With several sheets a change has to name its sheet, and the assistant is told to ask which when the customer didn't say. It can empty sheets (Undo brings back the open one; the card warns otherwise), delete sheets (never the last; the card warns Undo can't bring them back), work on another sheet, or start a new one.
