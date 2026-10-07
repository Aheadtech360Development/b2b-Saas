---
id: 348
title: Builder assistant bigger text no dashes
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: 002-studio-ai-assistant
branch: main
user: Aheadtech360Development
command: make the gang sheet builder's assistant panel look better — bigger text, and take out the dash between sentences that makes it read like AI slop
labels: ["gang-sheet-builder", "ai-assistant", "ui", "copy"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/StudioAssistant.tsx (sizes, icons in place of emoji, wording, the model's long dashes taken out before its words are shown)
 - frontend/src/components/storefront/GangSheetStudio.tsx (seven messages the assistant shows, without the dash or the middle dot)
 - backend/app/api/v1/copilot.py, backend/app/services/copilot/agent.py (two fixed sentences)
 - backend/app/services/copilot/studio.py (one line in the assistant's instructions: no long dashes)
 - frontend/src/__tests__/studio-assistant.test.tsx (seven assertions follow the new wording; one new)
tests:
 - tsc clean; the three backend files compile
 - NOT run — the assistant's vitest file; the owner stopped the run. Its seven changed assertions and the new one were checked against the component by reading
---

## Prompt

With a picture of the "Build with AI" panel in the DTF Studio — small text, and lines such as "✓ Done — 8 on a 22×10 sheet", "Ready — press the button on the card below." and "8 designs on 1 × 22×10 — $7.35":

jani iska na thora sa interface behtar kro font thory increase kro aur - jo symbol arha hana har senetence ke beech isko hatao yar ye ai slop lagra poora plz isko dekho in cheezon ko jani plz

Then, after stopping a test run:

continue plz

## Response snapshot

**Bigger and calmer.** Messages go from 13 to 15 px, the cards' lines from 12.5 to 14.5, the buttons to 15.5; the panel is a little wider and taller so the lines do not get shorter for it. Buttons and the box you type in use the builder's own font instead of the browser's.

**No dash between two thoughts, anywhere.**
- Everything the panel says of its own is rewritten as plain sentences: "Your sheet is updated. Not right? Press Undo (Ctrl+Z) or tell me what to change.", "Background found on logo.jpg. It would print as a solid box. Remove it?", "Ready. Press the button on the card below."
- A price sits in brackets on a button — "Do it on 2 sheets ($14.70)" — and at the right-hand end of the card's total line, in bold.
- The model's own words: one line in its instructions tells it to write the way a person at the shop would type, and whatever it writes anyway has its long dashes turned into commas before it is shown — the plan's title too.
- "Done" is said once: on the card, with what was done. The green note under it no longer repeats it.

**Icons in place of emoji and symbols.** Each line of a card starts with a small drawn icon for what it is about (add, text, remove background, fill, layout, spacing, edges, the total, a warning, save, cart); the Do it, Add to cart and upload buttons have theirs. The lines the builder sends to the assistant on your behalf ("📎 Uploaded logo.jpg. …") are left as they are — the assistant's instructions are written around them.

## Outcome

- ✅ Impact: the panel reads like something a person typed, at a size that can be read.
- 🧪 Tests: as listed — the test file was not run.
- 📁 Files: as listed.
- 🔁 Next prompts: the other session should fetch main before its next round: this commit changes StudioAssistant.tsx's drawing and styles top to bottom.
- 🧠 Reflection: taking the "⚠" off a note made its words the same as a line already in the conversation, so a test that found the note by its words would have found two. It now finds the note by what it is.

## Evaluation notes (flywheel)

- Failure modes observed: a test run was started for a wording-and-size change; the owner stopped it. Their standing ask is one cheap check for a small change.
- Graders run and results (PASS/FAIL): tsc PASS; vitest not run.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): the same no-dash rule for the owner's copilot and the order chat, if they ask.
