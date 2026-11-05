---
id: 564
title: Simple explainer and manager sheet
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner finds the multi-supplier flow too complex; the manager wants a CSV / product sheet to look at
labels: ["multi-supplier", "explainer", "spreadsheet", "manager"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - Multi-supplier example - Gildan 5000.xlsx (project root, not committed)
 - Multi-supplier example - Gildan 5000 (product sheet).csv (project root, not committed)
tests:
 - formulas evaluated by a script (no LibreOffice on this machine): every customer total, column total and order split checked (scratchpad check_multi_supplier_sheet.py, all good)
---

## Prompt

sai bolun jani blkl smjh nh arha ha yar kia scene chlra ha ye bhut complex ha kuke manager bhi mjhy kehra pata nh ke csv do product sheet do ye wo usko dekhna ha to plz kro na jani

## Response snapshot

A five-line plain explanation (one product, stock added up from three places, own stock first, then the cheapest supplier, S&S sent its part, SanMar's part ordered by hand) and an example workbook for the manager: How it works (7 steps), Product sheet (Gildan 5000 by colour and size with own, S&S and SanMar stock and cost, and the total the customer sees, by formula), Order examples (6 orders and where each one's stock comes from, with a check that each adds up), Where in the admin (what is live now and what comes with the next update). The product sheet also as a CSV. Every number is an example, said so in the file.

## Outcome

- ✅ Impact: the owner has something simple to hand the manager.
- 🧪 Tests: formula check above.
- 📁 Files: the workbook and CSV in the project root.
- 🔁 Next prompts: push of phase 2 (f102295) on the owner's yes; a "download this sheet" button on a product, if the manager wants it from the system.
- 🧠 Reflection: a non-technical reader needs one worked example in a table, not a list of rules.
