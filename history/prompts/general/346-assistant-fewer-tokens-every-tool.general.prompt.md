---
id: 346
title: Assistant burns fewer tokens and reaches every tool
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: make sure the assistant doesn't burn tokens, and that it knows every builder tool and can carry it out on the canvas without mistakes
labels: ["copilot", "prompt-caching", "cost", "tools", "studio"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: https://github.com/Aheadtech360Development/b2b-Saas/pull/4
files:
 - backend/app/services/copilot/agent.py (cache marks on the system prompt and the turn before the newest question; context_note on the newest question; stop_when ends the answer after an accepted plan)
 - backend/app/services/copilot/studio.py (system prompt = instructions + what stays the same; studio_sheet for what changes; add_designs, add_text, open_editor, save validated)
 - backend/app/api/v1/copilot.py (context_note and stop_when for the builder)
 - frontend/src/lib/studioContext.ts, studioBuild.ts (shop designs and gallery as s1…/g1…, no pixel sizes; plan and preview fields)
 - frontend/src/components/storefront/GangSheetStudio.tsx (adds ready-made, gallery and text designs; opens the editor; saves; image load gives up after 10 s)
 - frontend/src/components/storefront/StudioAssistant.tsx (card lines for the new steps; told what was added, it builds next)
tests:
 - backend/tests/test_studio_assistant.py (51 passed)
 - frontend studio-assistant (29), studio-context, gang-sheet-studio: passed; full vitest 468 passed, 2 failed in api-client.test.ts as before
---

## Prompt

saiha mei lagarah hn antrhopic ki key saiha bhai jb tk tum bs ek cheeez confirm krlo ke tumhari side se agar esa kch hposkta ke tokens ziada burn na ho esi technique proper dekhlo take ziada toekns burn na ho users jb ai assistant use kre aur dusra proper dekhlo har jo jo gang sheet mei tool ha ai assistant ko uska pata ho aur wo proper usse canvas mei execute krsky koi gunjaish nh ha galti ki

## Response snapshot

Tokens: the system prompt now holds only what stays the same all session and is cached with the tool; the sheet rides on the newest question, and the earlier conversation is cached too; an accepted plan ends the answer without a second call; pixel sizes are no longer sent. About 3,000 tokens a question come from the cache and 750 at full price, roughly $0.08 a sheet instead of $0.20. Tools: the assistant can add the shop's ready-made designs, gallery designs and text, open the image editor at any tab, and save, on top of backgrounds, builds, layout, margins, fill, sets and the cart; new designs are added first and built with their real sizes next.
