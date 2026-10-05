---
id: 287
title: Prompt for a second opinion
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: write a prompt the owner can give to ChatGPT asking which background-removal and upscaling tool is best
labels: ["gang-sheet-builder", "background-removal", "upscale", "prompt"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - none
---

## Prompt

tum mjhy ek prompt likh ke do mei gpt se poochleta sb se ziada kia sai rhega use krna

## Response snapshot

A self-contained prompt for ChatGPT, in English, ready to paste: what the product is and what its artwork looks like, the stack, what is wrong with the current tools, the requirements (the platform pays; free or no card to start; seconds, not minutes; full print resolution; an upscaler that does not change the design), the options and prices already found with the date they were checked, and what to answer — verify each price with a link and date, say what could not be verified, one pick to start free and one for volume, cost at three volumes, and the risks. It asks for the reply in Roman Urdu.

Offered to check the answer against what was verified here.

## Outcome

- ✅ Impact: the owner can get a second opinion without restating the context.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the answer pasted back; then a go-ahead.
- 🧠 Reflection: the prices are given to be checked, not to be taken on trust.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
