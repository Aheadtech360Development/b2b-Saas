---
id: 475
title: Inventory page broke on a supplier-sized catalogue
stage: green
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Inventory → Products shows "Something went wrong on our side" for a shop that imported its supplier catalogue
labels: ["inventory", "performance", "postgres", "supplier-import"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/admin/inventory.py (stock joined to the listed products, no list of SKU ids)
 - backend/app/services/stock_view.py (stock and order sums MATERIALIZED, product filter as uuid)
tests:
 - local database: asyncpg refuses an IN list past 32,767 values (30,000 ok, 33,000 fails), the cause
 - local database, a product with 33,500 SKUs: Products view 3.5s (was a 500), every SKU and its stock listed, search and tabs; SKUs view filtered by product 5.5s (was 18.3s), whole list 1.3s
 - inventory tests: 22 passed (5 need the conftest client fixture, as before)
---

## Prompt

(screenshot: ezt-mart.printcopilot.co/admin/inventory in a platform support session, Products view: "Something went wrong on our side.") ye kia issue arha ha bhai dekho yar poora proper bhai supplier catalog ki inventory mei sb import krchuka hn bhai

chalo continue kro jaha pr chora tha

## Response snapshot

- Cause: the Products view asked for stock with every SKU id of the shop in one IN list; a supplier import passes 32,767 SKUs, the most values one query may carry, so the endpoint raised. Now the stock is summed by joining the same products, whatever the count.
- The SKUs view summed stock and open orders again for every SKU when filtered to one product (the planner misjudged a text cast); the sums are MATERIALIZED and the filter compares uuids.

## Outcome

- ✅ Impact: Eztmart's Inventory opens with its whole supplier catalogue.
- 🔁 Next prompts: price grid import beyond 5,000 combinations.
- 🧠 Reflection: a list of ids in a query is a limit waiting for a big customer; join instead.
