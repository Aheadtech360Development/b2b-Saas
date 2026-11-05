---
id: 570
title: Simplest explainer
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner still finds the multi-supplier idea and the sheet complex
labels: ["multi-supplier", "explainer"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/570-simplest-explainer.explainer.prompt.md
tests:
 - none
---

## Prompt

yar complex ha abhi bhi smjh nh arha ha kch ez krke smjh skte ho kia tum ye mjhy?

## Response snapshot

One worked example only, no rules list: 7 shirts at the shop, 300 at S&S, 4500 at SanMar, the website shows 4807; a customer buys 100: 7 from the shop, 93 from SanMar because it is cheaper. The sheet is just a picture of that for the manager; send it and ask "is this what you want?"; the owner does not have to understand every column.

## Outcome

- ✅ Impact: one example the owner can repeat.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's yes or changes; push of phase 2 (f102295).
- 🧠 Reflection: when someone is overwhelmed, give one example and one action, nothing else.
