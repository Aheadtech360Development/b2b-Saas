---
id: 604
title: Sales over time charts on Home
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends Shopify's Home charts (sessions, total sales, orders, conversion rate over time) and asks for the same, on our brand, with proper formulas and filters
labels: ["home", "analytics", "charts", "dataviz"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/sales_over_time.py
 - backend/app/services/admin_home.py
 - backend/tests/test_sales_over_time.py
 - frontend/src/components/admin/SalesChart.tsx
 - frontend/src/components/admin/HomeSales.tsx
 - frontend/src/app/(admin)/admin-shell.css
 - frontend/src/__tests__/home-sales.test.tsx
tests:
 - backend tests/test_sales_over_time.py (7); with media and plan price tests 35 passed
 - local database (demo shop, read only): 30d, 90d, 7d, today (by the hour), all (from the first order), a two-year custom range (by the week): steps add up to Home's totals, the days before are the same length; ALL PASS
 - frontend home-sales.test.tsx (9) with media and plan price tests 32 passed; tsc clean in src
 - palette checked with the dataviz validator: #1D5FD6 (days chosen) and #7FA6EA (days before, dashed) pass; contrast WARN met by the legend, the box and the table view
 - screenshots at desktop and phone widths: fixed crowded dates under the chart and a breaking number in a tab
---

## Prompt

yar jani ye dekhlo proper saiha mere bhai ab mjhy na zara ye charts pe dihan dena ha dekho shopify kitne zabardast tareeky se derha ha mere bhai saihana meri jan ke tukry ab ye dekho mere ani jo brand guidelines hain usi ko follow krty hue bnega ofcourse to dekho aur proper forumulasa aur filters ke sath zara ye bnado yar achy se charts jaldi se jani ye waley zara

## Response snapshot

Home's Sales now works like Shopify's: a tab per number (Sessions, Total sales, Orders, Conversion rate, Average order) with its value, a small line and the change against the same number of days just before; the chosen one over time below (solid line for the days chosen, dashed for the days before), a box on hover or with the arrow keys giving both, a legend with both date spans, and a table of every step. Filters: Today (by the hour), 7, 30 (the default now, as Shopify), 90 days (by the day), All time (from the first order), Custom (by the week past 92 days, by the month past two years). Formulas as before: total sales = order totals with shipping and tax, cancelled and refunded left out (as Reports); conversion rate = visits that placed an order / visits. Committed locally; push waits for the owner.

## Outcome

- ✅ Impact: the owner and the manager see each number over time against the days before, in the admin's own look.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; a channel filter ("All channels") was left out: one sales channel today.
- 🧠 Reflection: the screenshot pass caught two layout faults the tests could not.
