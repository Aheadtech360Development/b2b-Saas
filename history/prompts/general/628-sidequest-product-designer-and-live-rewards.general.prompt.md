---
id: 628
title: Sidequest product, designer and live rewards
stage: general
date: 2026-11-11
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner made the Sidequest brand on live and imported the theme; asks for a product with the T-shirt customizer opening, and the header's Rewards etc. wired to the system's own features, before midnight
labels: ["visual-builder", "import", "demo-store", "loyalty", "tshirt-designer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/builder/importHtml.ts
 - frontend/src/__tests__/builder-import-design.test.ts
tests:
 - frontend/src/__tests__/builder-import-design.test.ts (11 passed, new: the rewards page keeps its title and gets the live program)
 - the Sidequest folder imported again in a real browser: rewards page = lime bar, page head, loyalty_program, loyalty_referral; menu Shop all and Drop 08 to /products, Rewards /rewards, Gift cards /gift-cards, Track order /track-order
 - tsc
---

## Prompt

continue kro jani sidequest krke dekhlo brand bnadia ha theme bhi import krdi dekho hosky to ek prodcut bhi iske andar bnado bs jo motive hana wo ye krna ha ke proper isme na mere pass bs t shirt customizer khul jae thats it aur jo uperrewards wagera bhi jo hain nawo bhi already sb bna hua system mei dekho ye bhi tum bnado aur proper wire krdo take mera kam khatam hojae 12 se pehle jani plz

## Response snapshot

Wired in the import: the design's rewards page keeps its title and intro, and its pretend member's balance, referral link, tiers and points are replaced by the builder's live Rewards program and Refer a friend (the program from Marketing, Loyalty; a signed-in customer's own points and link). Gift cards and Track order already go to the shop's own pages. Committed with the scrollbar and header icon fixes; push needs the owner's yes. Product creation and switches on the live brand are the owner's (no access to the live shop, and live data is not touched from here): plan or Features (T-shirt designer is not in Retail), a product, Products, T-shirt designer, Add products; Marketing, Loyalty, Rewards on; Marketing, Gift cards, Turn on sales; then re-import the folder and publish.

## Outcome

- ✅ Impact: header Rewards, Gift cards and Track order all reach working pages of the shop; the rewards page shows the shop's real program.
- 🧪 Tests: 11 import tests, real-browser import of the Sidequest folder, tsc.
- 📁 Files: importHtml.ts, its test.
- 🔁 Next prompts: owner's yes to push; owner's clicks on the live brand; re-import.
- 🧠 Reflection: a demo design's member pages carry made-up numbers; on a real shop they must be the shop's own, or a shopper reads a balance that is not theirs.
