---
id: 588
title: Trial with S&S only
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner has only S&S connected, no SanMar, for the multi-vendor trial
labels: ["multi-supplier", "test-plan"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/588-trial-with-ss-only.explainer.prompt.md
tests:
 - none
---

## Prompt

sanmar nh ha abhi sirf ssactiewear ha saiha bhai mere

## Response snapshot

The trial works with S&S alone: own stock + S&S on one product. Same set-up (dummy shop, S&S Test mode on, Cash on delivery on, Stocked item with own stock S 5 / M 0 / L 2), link only S&S, orders 3 S (own), 10 S (2 own + 8 S&S), 20 M (all S&S), S&S Send now in test mode, Sync now, cleanup. Skip SanMar, the supplier-first choice and Orders to place; they can be tried once SanMar is connected.

## Outcome

- ✅ Impact: the trial fits what the shop has.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: trial results.
- 🧠 Reflection: none.
