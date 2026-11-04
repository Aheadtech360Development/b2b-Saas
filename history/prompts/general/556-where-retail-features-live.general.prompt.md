---
id: 556
title: Where the Retail features live
stage: general
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks where to see the four new Retail features
labels: ["retail-launch", "admin", "storefront", "explainer"]
links:
  spec: specs/003-retail-launch/tasks.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/556-where-retail-features-live.general.prompt.md
tests:
 - none (read the admin menus in code: MarketingFrame tabs, OrdersFrame tabs, SettingsFrame, each page's switch)
---

## Prompt

ye jo 4 naye features hain ye kaha se dekhun mei

## Response snapshot

From the code: order tracking = Settings → Shipping and pickup → "Order tracking page" (on for every shop) + the Parcels panel on an order, buyers at /track-order; gift cards = Marketing → Gift cards → Settings → turn on sales, buyers at /gift-cards and /gift-cards/balance plus the checkout box; returns = Orders → Returns and reprints → "Returns portal" switch "Buyers start returns online", buyers at /returns and in their account; loyalty = Marketing → Loyalty → Settings → "Rewards on", buyers' Rewards page in their account and a points line in the cart. Gift cards, returns and loyalty stay off until a shop switches them on; the buyer pages can be linked from the website builder's menus.

## Outcome

- ✅ Impact: owner can find and show each feature.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: none.
- 🧠 Reflection: none.
