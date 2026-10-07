---
id: 350
title: Commission explained for the client
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: write a short text in basic English answering the client's question — how the 2.8% commission works on the shop's side and on ours, and how the payout works
labels: ["commission", "stripe-connect", "payouts", "explainer", "client"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none (a text to send; this record only)
tests:
 - plan rates read from backend/app/core/billing_plans.py before quoting them (Starter 2.8%, Wholesale 1.9%, Scale 1.3%)
---

## Prompt

Explain to me how the commission 2.8% payment system works. on client and our side both and how the payout also works.  client ki is bat pe chota sa ek text likh ke do basic english mei

Then, on seeing the full text:

ek do basic line mei likh ke do na bs jani

## Response snapshot

The two-line version asked for second: "When a customer pays by card for a gang sheet, the money goes to the shop's own Stripe account, and 2.8% of the gang sheet price is sent to our Stripe account automatically at the same moment. Stripe then pays each side out to its own bank account automatically, usually within a few business days."

The full version, given first. Read as: the client (the platform's owner) asked the first sentence; "client" in it is the shop, "our side" is the platform. A short text in plain English to send back:

- A customer pays by card on the shop's website. The money goes to the shop's own Stripe account; the shop is the seller.
- When the order has a sheet made in the Gang Sheet Builder, 2.8% of the gang sheet price is taken automatically at the moment of payment and goes to the platform's Stripe account. No invoice, no transfer by hand. Other products carry no commission; the monthly plan covers them.
- Example, a $100 gang sheet: $2.80 to the platform, about $3.20 of card fee to Stripe (paid by the shop), about $94.00 kept by the shop.
- The shop's side: every payment shows in its own Stripe account; Stripe pays the shop's bank automatically, usually within a few business days; refunds and disputes are handled from the shop's account.
- Our side: the 2.8% is in the platform's Stripe balance the moment the customer pays, listed under Connect, collected fees; Stripe pays it to the platform's bank on the platform's own schedule.
- Good to know: the rate follows the plan (Starter 2.8%, Wholesale 1.9%, Scale 1.3%) and can be set for one shop; with a discount code the percentage is counted on the discounted price; an order paid by cash or bank transfer has nothing collected automatically; a refund does not return the commission to the shop at the moment.

## Outcome

- ✅ Impact: the owner has something to send that matches what the code does today.
- 🧪 Tests: none needed; rates checked against the code.
- 📁 Files: none.
- 🔁 Next prompts: the two "at the moment" lines (refunds, off-card orders) are still the owner's to decide.
- 🧠 Reflection: the last two lines are how it works today, not a promise; they are in the text so the reader does not assume the opposite.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
