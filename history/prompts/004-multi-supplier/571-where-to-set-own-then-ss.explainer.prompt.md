---
id: 571
title: Where to set own stock then S&S
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks where to set "this is my Gildan, after it take from S&S"
labels: ["multi-supplier", "explainer", "admin"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/571-where-to-set-own-then-ss.explainer.prompt.md
tests:
 - none (read the product page: Count stock switch, per-size Stock box saved on leaving it; Sources box)
---

## Prompt

to ye set kaha krunga mei ke bhae ye meri gildan ha uske bad ssactivewear se aein sari wagera and all

## Response snapshot

Two places on the same product page, no separate setting: Variants and stock → Count stock on, then each size's own number in its Stock box (saved when you click away) = "my Gildan"; below it Sources → + Add a supplier → S&S Activewear → 5000 → Choose → Link = "then S&S". Own stock always goes first by itself. Only with both S&S and SanMar linked does "S&S always before SanMar" need the choice, which comes with the next update (live today: the cheaper one).

## Outcome

- ✅ Impact: the owner knows the two places to set it.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: push of phase 2 (f102295) on the owner's yes.
- 🧠 Reflection: none.
