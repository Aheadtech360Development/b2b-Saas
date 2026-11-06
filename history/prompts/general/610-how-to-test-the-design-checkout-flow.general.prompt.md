---
id: 610
title: How to test the design checkout flow
stage: general
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks how to check the t-shirt designer's cart and checkout flow on live
labels: ["t-shirt-designer", "testing", "how-to"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none (instructions only; read that cancelling an order does not put stock back and emails the customer)
---

## Prompt

acha ab mjhy ye batao ke meri jan check kese krun mei flow kese check krun iska jaldi batao zara

## Response snapshot

Steps on a test shop of the owner's own (not a client's), on a print plan: Products → T-shirt designer → Add products (a blank tee with colours and sizes); open the product's page in an incognito window as a customer whose email the owner reads; Design your own → add text → Sizes → Review order → Add to cart; check the cart line and Edit design; check out with Cash on delivery or Bank transfer so no money moves; then the shop side: Orders (lines per colour and size, Awaiting approval pill), Production (card under Artwork review), the design page (Approve, Send back for changes), the customer's email opening the designer with Send the changes; Inventory shows the stock taken. Clean-up: cancel the test order (it emails the customer and does not put stock back, so fix the stock in Inventory) and take the product out of the designer.

## Outcome

- ✅ Impact: the owner can check the whole flow on live without a card payment.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: the owner's findings from the check.
- 🧠 Reflection: a test order on live is a real order: say which shop to use, how to avoid a charge, and what cancelling does and does not undo.
