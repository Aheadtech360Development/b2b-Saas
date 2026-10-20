---
id: 459
title: Our own message when the AI is busy
stage: general
date: 2026-10-20
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Show our own friendly message, not Gemini's red "high demand" error, when the AI model is busy or down
labels: ["copilot", "gang-sheet-assistant", "ai", "errors"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/copilot/agent.py
 - backend/app/api/v1/copilot.py
 - backend/tests/test_copilot_busy.py
 - frontend/src/lib/aiBusy.ts
 - frontend/src/components/admin/CopilotChat.tsx
 - frontend/src/components/storefront/SupportChat.tsx
 - frontend/src/components/storefront/StudioAssistant.tsx
 - frontend/src/__tests__/ai-busy.test.tsx
tests:
 - test_copilot_busy.py + test_studio_assistant.py: 82 passed
 - ai-busy.test.tsx: 7 passed; tsc clean
 - studio-assistant.test.tsx not run (test workers could not start on the busy machine)
---

## Prompt

acha abhi ek bhut bara issue ha ke abhi jb gang sheet builder mei jo ai laga hua hana aur copilot ha uska mei gemini free model chala rha to aksar high demand ka msg ata red color se bhut hi bekar lagta ha wo isey ham apna personalize msg krna ha agar model down ho to personalized apna msg dikhadein hum ke bhai abhi bhut sary log use krrhy plz bad mei try asy hi acha sa english mei plz saiha smjhgye jani

sorry sorry continue plz

## Response snapshot

- One message in all three chats (owner's Copilot, gang sheet builder assistant, customer order chat): "Sorry, our AI is helping a lot of people right now. Please try again in a few minutes."
- Busy = 429, 500, 502, 503, 504, 529, or "overloaded"/"high demand"/"resource exhausted"/"rate limit" in the provider's words, or no answer in time. Sent as {"error": {"code": "AI_BUSY", ...}} with status 502 (503 still means switched off); the provider's words stay in the log, the owner's chat included.
- An overloaded provider (5xx, 529) is asked once more after 1.5 s before giving up.
- Shown calmly, not red: admin note in blue, builder in lilac with a clock icon, order chat in grey; the question goes back into the box.

## Outcome

- ✅ Impact: nobody sees Gemini's "high demand" error in red any more.
- 🔁 Next prompts: the background review's findings, if any.
- 🧠 Reflection: 503 already meant "switched off" in two chats, so busy needed its own code, not a status.
