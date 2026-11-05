---
id: 560
title: Multi vendor same style explainer
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Manager asks how one style (a 5000 tee) from own stock, S&S and SanMar is handled, and about Innterflow's 5000 product
labels: ["suppliers", "multi-supplier", "ss-activewear", "sanmar", "inventory", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/560-multi-vendor-same-style-explainer.general.prompt.md
tests:
 - none (read-only GETs on Innterflow's live catalogue: 27 active products, all own, no supplier; "5000 Adult Super Comfort Overdyed" once, 7 colours x 8 sizes = 56 variants, stock 1000 each, no repeated colour/size, no product_code twice; plan from PHR 540)
---

## Prompt

bhai mere ek msla agya ha kl managetr ne mjy bola ha ke bhai mere jo tumne sanmar ssactivwear aur apna brand jese agar gildan 5000 apna bhi ha ssactivewear lka ha aur yani multi vendours ka ha to wo kis tarah manage horha hoga mjhy smhhao to meri jan jaldi se bhai mere aur dusra ye batao mjhy ke bhai kuke kl manager ka msg aya ha ke bhai peechay prodcut level pre innterflow pr ek 5000 prodcut ha usme to wi purana pattern arha ha multi vendours jese ek hi brand ki shirt 3 jaga se arhi multiple jaga se arhi ha to kese hoga ye jani jaldi batao yar

## Response snapshot

Today each source makes its own product (own, S&S import, SanMar import), each with its own stock, SKU and price; an S&S product's order goes to S&S, SanMar takes no orders yet; so one tee could show three times, and own stock typed on an S&S product is overwritten by the next sync. Innterflow live (read-only): 27 products, all its own, the 5000 product once (56 sizes/colours, 1000 each), nothing repeated; asked for the manager's screenshot if they saw something else. The plan (PHR 540): one product per style with the brand's own SKU per colour/size, sources under each (own warehouse, S&S, SanMar with stock, cost, priority), matched by GTIN or brand+style+colour+size; shown stock = own + suppliers; orders take own stock first, then the brand's rule, a PO per supplier for its share, next source on refusal. A new feature: needs the manager's yes, then a spec and phase 1.

## Outcome

- ✅ Impact: the owner can answer the manager.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's yes, then specs for the multi-supplier build.
- 🧠 Reflection: check the live shop before agreeing a duplicate exists.
