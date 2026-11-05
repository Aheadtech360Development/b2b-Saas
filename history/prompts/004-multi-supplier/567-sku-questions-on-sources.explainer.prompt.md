---
id: 567
title: SKU questions on sources
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks whether linking a shirt to S&S and SanMar causes any SKU problem
labels: ["multi-supplier", "sku", "explainer"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/567-sku-questions-on-sources.explainer.prompt.md
tests:
 - none (from the code: variant SKUs untouched, supplier SKU kept in variant_sources by variant id, unique per shop and supplier, S&S sent its own SKU, import skips linked styles, a re-link replaces the product's link, a missing supplier SKU syncs to 0)
---

## Prompt

to isse sku ka msla nh hoga na ???? koi esa msla to nh hoga na?

## Response snapshot

No SKU problem: the shirt keeps its own SKUs; each supplier's SKU is kept separately and tied to the colour/size itself, so renaming the shop's SKU breaks nothing; S&S is sent S&S's own SKU and SanMar's list shows style, colour and size; one supplier SKU can go with one of the shop's products only; a linked style is never imported again. Three things to watch: an older S&S-imported copy of the same shirt (set it to Draft), a colour/size added later (Link again), a supplier changing its SKU (that size shows 0 from that supplier until linked again, so nothing oversells).

## Outcome

- ✅ Impact: the owner knows what is safe and what to watch.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: push of phase 2 (f102295) on the owner's yes.
- 🧠 Reflection: none.
