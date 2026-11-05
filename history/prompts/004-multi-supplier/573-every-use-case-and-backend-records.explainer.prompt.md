---
id: 573
title: Every use case and backend records
stage: explainer
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: 004-multi-supplier
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for every use case of a brand with own Gildan plus S&S and SanMar, and how stock and SKUs sit on the backend
labels: ["multi-supplier", "explainer", "backend", "sku", "inventory"]
links:
  spec: specs/004-multi-supplier/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/004-multi-supplier/573-every-use-case-and-backend-records.explainer.prompt.md
tests:
 - none (tables follow the code: products, product_variants, warehouses.supplier, inventory, variant_sources, order_items, order_item_sources, supplier_orders)
---

## Prompt

ab mjhy tum sary use case batao jese ek brand ayauske pass apna bhi gildan ka stock ha use ssactivewear aur sanmar jo hana bhi dalne saiha to wo kia krwega aur backend pe stock sku wagera ki cheezein kis tarah horin hongin mjhy ye dekhna ha

## Response snapshot

One brand's journey step by step, each step with what the brand clicks and the backend rows it makes, in small tables: own product and stock (variants with the brand's SKUs, the Main location), connecting suppliers (logins only), linking S&S and SanMar (a location per supplier, a source row per size with the supplier's SKU and cost, the supplier's stock in its location), what the buyer sees (sum), two orders (stock taken, the line with the brand's SKU, the supplier share rows, S&S's order with S&S's SKU, SanMar's list), a sync, typing own stock, a return, an import of the same style. Then the other cases in one table, marking what comes with the next update (make an imported product the shop's own, picking by hand, the supplier-first choice, SanMar's Orders to place, each part's cost).

## Outcome

- ✅ Impact: the owner can see where every number and SKU lives.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: push of phase 2 (f102295, 18fe6c8) on the owner's yes; a Backend tab in the manager's workbook if wanted.
- 🧠 Reflection: none.
