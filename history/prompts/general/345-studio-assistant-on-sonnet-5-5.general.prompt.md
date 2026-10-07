---
id: 345
title: Builder assistant on Claude Sonnet 5.5
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/happy-goldberg-nqabe7
user: Aheadtech360Development
command: go with Sonnet 5.5 rather than Haiku; make the code ready for it
labels: ["copilot", "anthropic", "sonnet-5-5", "effort", "fallback", "cost"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/copilot/agent.py (Sonnet 5.5 default for the builder and the admin chats; effort low where the model takes it; max_tokens 8000; fallbacks "default"; refusal answered plainly; fallback turns echoed without the declined model's thinking and calls)
 - backend/app/core/config.py, backend/.env.example (COPILOT_STUDIO_EFFORT, COPILOT_EFFORT)
 - backend/tests/test_studio_assistant.py
 - specs/002-studio-ai-assistant/spec.md
tests:
 - backend/tests/test_studio_assistant.py (34 passed)
---

## Prompt

dekho agar haiku pr results achy nh aein to faida nh na sonnet pr h chlty hain na kia kehty ho tum

## Response snapshot

Agreed: Sonnet 5.5. The Anthropic call now sends effort low to models that take it (not Haiku 4.5, which rejects it), allows 8000 output tokens since thinking counts towards them, opts into the server-side refusal fallback ("default"), answers a final refusal with a plain sentence, and echoes a fallback turn without the declined model's thinking and tool calls. Sonnet 5.5 is the default for the builder and the admin chats on Claude. Railway needs only ANTHROPIC_API_KEY and COPILOT_PROVIDER=anthropic.
