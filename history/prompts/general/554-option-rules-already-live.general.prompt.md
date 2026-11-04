---
id: 554
title: Option rules already live
stage: general
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks mid-build whether "a choice hides another field, or shows only some of its choices" was done
labels: ["configurable-products", "option-rules"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/554-option-rules-already-live.general.prompt.md
tests:
 - none (answer; both commits were already confirmed live)
---

## Prompt

oy rko isko roko wo jo mene tumhein bola tha na ke mere bhai jb mei koi field select krun to agar mei chahun ke ek field ki ekchoice select krne prdusri field poori gayab hojae ya usme kuch ek dikhana ho alag to wo hojae lekin shyd ye tumne nh kia am i right ya krdia ha?
continue

## Response snapshot

Both are built and live: "hide the field" (a choice removes another question; fixed on builder product pages in 6aa0ac3) and "show only these choices" (the other question keeps only the ticked choices, the one left is picked; d08d025). Gave the steps on the product's options page and offered to look at a product where it does not work, then continued the SanMar build.

## Outcome

- ✅ Impact: owner knows both rules are live and how to set them.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: a product name if a rule misbehaves.
- 🧠 Reflection: none.
