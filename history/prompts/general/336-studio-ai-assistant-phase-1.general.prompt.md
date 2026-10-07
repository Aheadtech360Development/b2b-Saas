---
id: 336
title: Gang sheet builder audit, save fixes, AI assistant phase 1
stage: general
date: 2026-10-07
surface: agent
model: claude-sonnet-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: audit the gang sheet builder, fix the bugs, then start the customer AI assistant (budget model, Roman Urdu and English)
labels: ["gang-sheet", "studio", "audit", "copilot", "ai-assistant", "roman-urdu"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/GangSheetStudio.tsx (each filed sheet remembered as it lands; Ask AI button and panel)
 - frontend/src/lib/guestCart.ts (a re-saved sheet replaces its line instead of adding quantity)
 - frontend/src/lib/studioContext.ts (the sheet and its fits/prices, as the assistant is told)
 - frontend/src/components/storefront/StudioAssistant.tsx (chat panel)
 - backend/app/services/copilot/studio.py, agent.py, api/v1/copilot.py, core/config.py, middleware/auth_middleware.py (POST /copilot/studio, small model, per-person limits)
 - specs/002-studio-ai-assistant/spec.md
tests:
 - backend/tests/test_studio_assistant.py (7 passed, no DB)
 - frontend/src/__tests__/studio-context.test.ts (10 passed); full vitest 415 passed, 2 failed in api-client.test.ts, which fail without these changes too
---

## Prompt

dekho jani mjhy ek bhut zaroori cheez jo ha wo discuss krni ha tumse ... pehle mei chahuga ke tum mera gang sheet builder ka jo poroa studio aur behaviour hana sirf poora audit kro ek quick audit kro

(then) mjhy isi mei ai integration krni ha ... ek chatbot ho whi pe aur bs whi har sawal jawab jo bhi zaroori hon wo pooche aur gang sheet tayyar krde ... 22x10 ki sheet pe itne design lagane ... bg detect kre to wo bhi khud pooche ke hatadun ya nh

(then) ye mhy customers ke lie chayie aur dekhlo jo model budget friendly ho ... roman urdu aur english support ho dono

(then) hn tum pehle bugs fix krdo aur shru kro phir work

## Response snapshot

Audit found: multi-sheet save lost the order ids of sheets already filed when a later one failed (retry filed duplicates); guest cart added quantity on re-save. Both fixed. The suspected stale cart price was wrong — the cart line is updated server-side.

Phase 1 of the assistant: the builder builds a context (fits via its own nesting, prices, background and DPI flags) per question; a tool-free, read-only call to a small model answers in the customer's language. Limits per user/guest, plan-gated by `ai_agent`.
