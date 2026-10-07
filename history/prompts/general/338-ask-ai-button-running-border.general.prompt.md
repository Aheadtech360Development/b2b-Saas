---
id: 338
title: Ask AI button running border
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: 002-studio-ai-assistant
branch: main
user: Aheadtech360Development
command: make the gang sheet builder's "Ask AI" button stand out with a running border, so it is seen the moment the builder opens — a quick fix
labels: ["gang-sheet-builder", "ai-assistant", "top-bar", "animation"]
links:
  spec: specs/002-studio-ai-assistant/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/storefront/GangSheetStudio.tsx (the Ask AI button and its border)
tests:
 - one picture of the top bar with the button at four moments of the loop, open, and enlarged; tsc clean
---

## Prompt

With a picture of the DTF Studio's top bar — Sheets, Ask AI, Preview, Save & Add to Cart, Save, Close — where Ask AI looks like every other plain button:

ek basic cheez krdo asi ai ka button thora sa standout hona chayie na take logo ki nazar pare thory ispe running borders achy se lagado take builder kholty hi dikhe ye jani asy to pata hi nh chlra jani bs jaldi ye quick fix krdo ek

## Response snapshot

The Ask AI button now has a border with two lights running round it — violet into pink into amber — over a soft violet edge with a faint halo, and its label is violet and bolder. It is the same height as its neighbours, so the bar does not shift.

- While the assistant is open the border stands still, solid violet: the button reads as "on".
- For a visitor whose device asks for less motion, the lights do not move; the coloured border stays.
- The movement is a turn of one layer behind the button — nothing is re-laid-out, so it costs the builder nothing while a sheet is being worked on.

## Outcome

- ✅ Impact: the assistant's button is the first thing seen in the bar.
- 🧪 Tests: as listed.
- 📁 Files: one.
- 🔁 Next prompts: none.
- 🧠 Reflection: the bar scrolls sideways on a narrow screen, which also clips above and below — the halo is kept to three pixels so it fits inside the bar.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
