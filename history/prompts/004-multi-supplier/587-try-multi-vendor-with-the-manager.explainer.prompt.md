---
id: 587
title: Try multi vendor with the manager
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Manager wants to try S&S + SanMar multi-vendor on one product; owner asks for the full scenario
labels: ["multi-supplier", "test-plan", "explainer"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/587-try-multi-vendor-with-the-manager.explainer.prompt.md
tests:
 - none (labels read from the code: Stocked item, Sources, + Add a supplier, Test mode, Orders to place, Cash on delivery)
---

## Prompt

done hogya bhai ab mei gya tha apne manager ke pass saiha bhai aur wo kehra jo sanmar wala kam kia hana ssactivewear multivendor wpo kehra ha ek bnake try krty hain to batao kese krun poora scenario batana saiha jani

## Response snapshot

A safe trial on the dummy shop (not a real brand, not Retail): connect S&S and SanMar; S&S Order Settings Test mode on; Cash on delivery on; one Stocked item "Test Gildan 5000" Black S/M/L at $12 with own stock 5/0/2; Sources → link S&S 5000 and SanMar 5000; publish; test orders in a row (3 S all own; 10 S = 2 own + 8 supplier; 20 M all supplier; after "S&S first", 10 L = 2 own + 8 S&S); what to check on each order page, S&S Send now in test mode, SanMar Orders to place + CSV + Mark as ordered, a Sync; cleanup (cancel orders, product to Draft, Test mode stays on, Cash on delivery off).

## Outcome

- ✅ Impact: the owner and manager can try every part once without real orders or charges.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: what they see during the trial.
- 🧠 Reflection: none.
