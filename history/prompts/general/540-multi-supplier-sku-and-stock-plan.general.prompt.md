---
id: 540
title: Multi-supplier SKU and stock plan
stage: general
date: 2026-11-02
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's question on SKUs and which stock is taken when the same blank comes from own stock, S&S, SanMar and more suppliers
labels: ["suppliers", "inventory", "sku", "ss-activewear", "sanmar", "order-routing", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/540-multi-supplier-sku-and-stock-plan.general.prompt.md
tests:
 - none (planning answer; code read: services/suppliers/ss_products.py, suppliers/orders.py, order_service.py step 9.5, guest.py step 6, inventory model)
---

## Prompt

acha to ab ek case scenario aya ha ek wo ye ha ke bhai dekho meri jan usme ye scene ha ke abhi hamne suppliers catalogue mei sirf ssactivewear ki integration ki ha kl kanako sanmar bhi krdein hum saiha aur 3 4 aur to jo product ka sku hoga wo kia hoga aur for example agar admin ka apne warehouse mei apna gildan bhi ha aur ssactivewear ka gildan aur sanmar ka gildan bhi ha to phir kia case sceanrio hoga konsi inventory deduct hogi???? ye poora dekho aur mjhy batao kia plan hga har use case dekho jese mene ye pakra ha

## Response snapshot

Today: every S&S style becomes its own store product (supplier=ss_activewear, variant SKU = S&S's SKU by default, unique per shop); S&S stock is copied into the brand's store location(s) and overwritten on every sync; an order takes stock from whichever location holds most; lines of S&S products are forwarded to S&S. So own Gildan, S&S Gildan and a future SanMar Gildan would be three separate products. Risk now: own stock entered on an S&S product in a location S&S feeds is erased by the next sync.

Plan: one product per style with one store SKU per colour/size (the brand's, e.g. G5000-BLK-M), and per variant a list of sources (own warehouses; each supplier with its own SKU, cost, stock, priority), matched across suppliers by UPC/GTIN or brand+style+colour+size. Shown stock = own + enabled suppliers (less buffer). At order time an allocation per line: own stock first, then suppliers by the brand's rule (priority, cheapest, one supplier per order, never split); own stock deducted, each supplier gets a PO for its share, fallback to the next source when a supplier refuses. Use cases covered: own only, one supplier, own+supplier, two suppliers, order larger than any source, mixed lines, stale stock, discontinued colour, no UPC, colour name differences, cost/profit per source, returns, cancels, forwarding off, existing S&S products kept on their SKU. Phases: sources + SKU split, routing, a supplier connector (S&S behind it, then SanMar), admin screens and reports.

## Outcome

- ✅ Impact: the owner has the model to take to the manager before any build.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's or the manager's yes on the plan, then a spec under specs/ and phase 1.
- 🧠 Reflection: the store SKU must not be a supplier's SKU, or the second supplier has nowhere to attach.
