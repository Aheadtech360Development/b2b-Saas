---
id: 687
title: Where cart settings and upsells live
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks where in the admin the cart customisation and the upsells are set up
labels: ["cart", "checkout", "upsells", "admin", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (answer only)
tests:
 - none (read MarketingFrame, SettingsFrame, AdminSidebar, the cart settings and upsells pages for the exact labels)
---

## Prompt

cart aur checkout wala jo ka kia ha wo csutimize wagera upsell wala kam kaha se hoga uska

## Response snapshot

Cart look: Settings → Cart and checkout (button colour: theme colour or own colour, cart button text, checkout button text, order note on/off, live preview). Fonts follow the shop's theme by themselves, nothing to set. Upsells: Marketing → Upsells → New offer (name, product to offer and which option, headline and one line for the cart, price: usual / percent off / amount off, when it shows: any cart / these products / these collections, cart value from and up to, priority, on/off). At most 2 offers show in the cart; the free shipping line comes from the shop's own shipping rules. Staff need the Settings permission for the first and the Discounts permission for the second.

## Outcome

- ✅ Impact: owner knows where both screens are.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: owner tries an offer on a test shop.
- 🧠 Reflection: none.
