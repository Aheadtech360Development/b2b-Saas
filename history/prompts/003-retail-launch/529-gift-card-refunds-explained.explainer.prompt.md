---
id: 529
title: How refunds work with gift cards
stage: explainer
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: gift cards ka refund scene kia hoga
labels: ["retail-plan", "gift-cards", "refunds", "returns", "explainer"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/529-gift-card-refunds-explained.explainer.prompt.md
tests:
 - none (explanation; read gift_card_checkout.refund_to_cards / split_refund and returns_portal store credit)
---

## Prompt

gift cards ka refund scene kia hoga

## Response snapshot

Simple Roman Urdu with the hoodie example ($70 = $50 gift card + $20 card): money goes back where it came from, card part first ($20 to the card, $50 back onto the gift card; a $30 refund = $20 card + $10 gift card; an order paid all by gift card goes all back onto it); gift card money never turns into cash. A bought gift card can be refunded only while wholly unused, the whole amount to the buyer's card, and the card is closed; buyers cannot return one from the returns page (final sale), only the shop from the order page. Store credit (off by default in returns settings): a return refunded as a new gift card emailed to the buyer, so the money stays in the shop.

## Outcome

- ✅ Impact: the owner knows every refund case with gift cards.
- 🧪 Tests: none.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's follow-up questions; push of retail-plan on the owner's word.
- 🧠 Reflection: one rule (money goes back where it came from) carries most of it.
