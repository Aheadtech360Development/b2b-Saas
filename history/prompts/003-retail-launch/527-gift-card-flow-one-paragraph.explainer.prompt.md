---
id: 527
title: Gift card flow in one paragraph
stage: explainer
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: yar short krke ek para mei smjhado na take poora clear hojae yar bhai
labels: ["retail-plan", "gift-cards", "explainer", "package-3"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/527-gift-card-flow-one-paragraph.explainer.prompt.md
tests:
 - none (explanation)
---

## Prompt

yar short krke ek para mei smjhado na take poora clear hojae yar bhai

## Response snapshot

One Roman Urdu paragraph: the shop turns gift cards on and sets amounts; a card is bought by card and its code is emailed to the recipient in the shop's name; at checkout the gift card pays what it can and the card pays the rest ($86 = $50 + $36); the gift card's money is held 30 minutes at payment so one code is not spent twice, taken when the order is made or given back; the balance stays for next time; refunds go to the card first, then the gift card; admin sees, issues, adjusts and disables cards under Marketing, Gift cards; repeated wrong codes are blocked; all on retail-plan, live after the push.

## Outcome

- ✅ Impact: the owner has the gift card flow in one short paragraph.
- 🧪 Tests: none.
- 📁 Files: listed above.
- 🔁 Next prompts: owner's follow-up questions; push of retail-plan on the owner's word.
- 🧠 Reflection: the owner wants the short version first; details only when asked.
