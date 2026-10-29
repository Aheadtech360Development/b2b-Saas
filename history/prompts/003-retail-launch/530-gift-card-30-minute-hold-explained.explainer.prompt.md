---
id: 530
title: The 30 minute gift card hold explained
stage: explainer
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: acha aur ye batao ye jo tumne bole adhy ghnte ka gap kuch zikr kia tha iska kia scene ha ye batao
labels: ["retail-plan", "gift-cards", "holds", "explainer"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/530-gift-card-30-minute-hold-explained.explainer.prompt.md
tests:
 - none (explanation; HOLD_MINUTES = 30 in services/gift_cards.py, settle rules in gift_card_checkout)
---

## Prompt

acha aur ye batao ye jo tumne bole adhy ghnte ka gap kuch zikr kia tha iska kia scene ha ye batao

## Response snapshot

Roman Urdu with a shop counter analogy (an item kept aside at the counter for 30 minutes while you fetch money): at the payment step the gift card's money is set aside for 30 minutes. Paid in time: it is taken and the order is made (the buyer never notices). Page closed: about 30 minutes later the money is back on the gift card by itself. Why: one code used in two places at once ($50 card, two $40 orders) would otherwise spend $80 of a $50 card; with the hold the first gets $40 and the second $10, the rest by card. Paying after 30 minutes still works if the money is still on the card; if it was spent elsewhere, no order and any card charge is refunded automatically.

## Outcome

- ✅ Impact: the owner understands the 30 minute hold and why it exists.
- 🧪 Tests: none.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's follow-up questions; push of retail-plan on the owner's word.
- 🧠 Reflection: an everyday analogy (kept aside at the counter) explains a hold better than the mechanics.
