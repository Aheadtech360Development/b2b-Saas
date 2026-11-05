---
id: 589
title: Trial publish step
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner at Add product → Publish for Test Gildan 5000 with "Before it sells: out of stock"
labels: ["multi-supplier", "test-plan"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/589-trial-publish-step.explainer.prompt.md
tests:
 - none
---

## Prompt

(screenshot: Add product · Test Gildan 5000, Ready to publish?, Stocked, /products/test-gildan-5000, $12.00, 1 image, "Before it sells: out of stock") ?????

## Response snapshot

Expected: no stock typed yet. Press Keep as draft, open the product → Variants and stock → Count stock on, own stock S 5 / M 0 / L 2, then Sources → + Add a supplier → S&S → 5000 → Choose → Link; the warning goes once stock is in; then set it Active and place the test orders. If Eztmart is a real brand with buyers, do the trial on the dummy shop instead.

## Outcome

- ✅ Impact: the owner knows the next click.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the Sources screen.
- 🧠 Reflection: none.
