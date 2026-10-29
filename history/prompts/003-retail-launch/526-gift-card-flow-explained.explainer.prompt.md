---
id: 526
title: Gift card flow explained with examples
stage: explainer
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: gift card ki functionality kia bnai ha wese ye mjhy examplekesath batao pooora flow mjhy smjhna ha
labels: ["retail-plan", "gift-cards", "explainer", "package-3"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/526-gift-card-flow-explained.explainer.prompt.md
tests:
 - none (explanation; facts read from services/gift_cards.py, services/gift_card_checkout.py, core/features.py, tasks T301 to T308, spec defaults)
---

## Prompt

gift card ki functionality kia bnai ha wese ye mjhy examplekesath batao pooora flow mjhy smjhna ha

## Response snapshot

Explained in Roman Urdu, end to end, with the Stripe sitting's real numbers: the shop turns gift cards on (off by default; amounts $25/$50/$100, up to 8, optional custom $10 to $500; expiry never or 5, 7, 10 years; every plan has the feature); buying one (cart line with no shipping, tax or discount code, card only; code made when paid, emailed to the recipient in the shop's name, receipt without the code to the buyer; code stored hashed, last 4 shown, new code on request); paying with one ($86 = $50 gift card + $36 card; up to 5 cards; combines with a discount code; 30 minute holds so two $40 orders on a $50 card get $40 and $10; whole order covered needs no card; $0.50 Stripe minimum; a card spent elsewhere refuses the order and refunds the card charge); refunds (card first: $21 card + $25 gift card order, $15 then $6 card + $4 gift card; sold cards refunded only unused, then voided); admin Marketing, Gift cards (list, search, issue, history, adjust, disable/on/void, new code; Billing permission to change money); safety (wrong-code limit, same answer for unknown and disabled, shop isolation, analytics see only "Gift card"). Status: on retail-plan only, not live; no website builder block.

## Outcome

- ✅ Impact: owner has the whole gift card flow with worked examples.
- 🧪 Tests: none run for this answer.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's questions on the flow; push of retail-plan on the owner's word.
- 🧠 Reflection: real numbers from the test sitting explain the split and refund order better than rules alone.
