---
id: 561
title: Multi vendor is it ready
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks whether "one product, many sources" is the better way and whether it is ready
labels: ["suppliers", "multi-supplier", "planning", "decisions"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/561-multi-vendor-is-it-ready.general.prompt.md
tests:
 - none (read services/suppliers/orders.py: S&S orders ship to the store or to the buyer, per the brand's setting)
---

## Prompt

to yahi behtar tareeka ha multi vendour ke lie kia krna parega ya yahi good to go ha?

## Response snapshot

Yes, one product with several sources is the right way (separate products per supplier duplicate the listing and split the stock), but it is a plan, not built. Needed first: the manager's five decisions (order of sources, splitting an order and who it ships to, one price for the buyer, a stock buffer, the SKU format). Then four parts: sources under each colour/size matched by GTIN with imports attaching to the existing product; routing with a PO per supplier and fallback; SanMar orders (needs SanMar's order access and an EDEV test; S&S already sends); admin screens and reports. Recommended start: part 1 with simple routing (own stock first, then one preferred supplier), each part pushed on its own after a local DB check.

## Outcome

- ✅ Impact: the owner knows it is not ready and what to ask the manager.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's decisions, then a spec under specs/.
- 🧠 Reflection: none.
