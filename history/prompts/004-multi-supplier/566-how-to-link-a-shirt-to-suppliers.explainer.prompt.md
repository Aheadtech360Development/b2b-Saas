---
id: 566
title: How to link a shirt to suppliers
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks how to tell the system a shirt is also at SanMar or S&S
labels: ["multi-supplier", "explainer", "admin"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/566-how-to-link-a-shirt-to-suppliers.explainer.prompt.md
tests:
 - none (read the live labels in 66c0109: Sources, + Add a supplier, Style number or name, Search, Choose, Link N to <supplier>; login fields in words.ts)
---

## Prompt

system ko kese bataon ke ye shirt sanmar ke pass bhi ha ya ssactiewaear ya kaha se hoga

## Response snapshot

Two steps in Roman Urdu with the live labels: once, connect the supplier in Products → Suppliers (S&S: Username = account number + API Key; SanMar: FTP Username + Password); then on the shirt: Products → the product → Variants and stock → Sources → + Add a supplier → pick the supplier → type the style number (e.g. 5000) → Search → Choose → check what matched → Link; repeat for the other supplier. If a supplier's search shows the style, that supplier has the shirt. Limits: only the shop's own stocked products (imported ones need "Make it my own product", next update), not on Retail; picking a colour by hand also comes with the next update.

## Outcome

- ✅ Impact: the owner can link a shirt to S&S and SanMar themselves.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: push of phase 2 (f102295) on the owner's yes.
- 🧠 Reflection: none.
