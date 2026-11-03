---
id: 546
title: Push show only rule
stage: general
date: 2026-11-02
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's yes to push the "show only these choices" rule
labels: ["configurable-products", "option-rules", "deploy"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/546-push-show-only-rule.general.prompt.md
tests:
 - none new (pushed commit d08d025 as tested in record 545)
---

## Prompt

hn push krdo bhai

## Response snapshot

Fetched main (6aa0ac3), fast-forward checked, pushed d08d025 to main, deploy watched until the website and the backend ran it. Owner's next step: on the live product remove the old 14 pt "hide the field" and "grey out one choice" rules, add one "show only these choices" rule (Paper Type 14 pt, Coating, tick No Coating), save, and check 14 pt and 16 pt on the shop page.

## Outcome

- ✅ Impact: "show only these choices" on main.
- 🧪 Tests: none new.
- 📁 Files: this record.
- 🔁 Next prompts: owner sets the rule on the live product.
- 🧠 Reflection: none.
