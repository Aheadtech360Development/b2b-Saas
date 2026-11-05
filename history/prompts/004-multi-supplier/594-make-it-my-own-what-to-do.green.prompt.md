---
id: 594
title: Make it my own, what to do
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks what pressing "Make it my own product" on the shop's imported Gildan 5000 means and what to do after
labels: ["multi-supplier", "convert", "explainer"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/suppliers/sourcing.py
tests:
 - local database (scratchpad convert_clash_check.py): refused while Test Gildan 5000 holds the sizes, nothing changed (stock 12,000, still imported); after removing S&S there, converted 3 of 3, buyer sees 15,000
 - sourcing_local_check2.py re-run 18/18
---

## Prompt

aur agar mei abhi jo 5000 gildan ha usme jake make itmy own prodcut dabaon to kia krna parega mjhy jani

## Response snapshot

Found a trap first: the trial product already holds S&S's Black S/M/L, so converting the real Gildan 5000 would have left those sizes without S&S and at 0 (sold out). Now converting refuses with the other product's name and changes nothing (local check). Steps: remove S&S from Test Gildan 5000 (or delete it), then on the imported Gildan 5000 → Variants and stock → Sources → Make it my own product; check the linked sizes; type own stock; afterwards S&S stock and cost still sync, but the selling price, texts, photos and new S&S colours no longer update by themselves; no one-click undo. Guard committed locally; push on the owner's yes.

## Outcome

- ✅ Impact: converting can no longer sell a real product out by accident.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push of the guard.
- 🧠 Reflection: walking the owner's next click caught a real-product harm the plan missed.
