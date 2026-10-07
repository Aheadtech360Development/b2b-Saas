---
id: 353
title: Commission text, what is confirmed
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: is the two-line commission text for the client confirmed from the codebase
labels: ["commission", "stripe-connect", "verification"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - read again — backend/app/services/connect_service.py (the two account styles and who pays Stripe's fees in each), payment_service.py, the three places a card is charged; no payout schedule is set anywhere in the code
 - read — Stripe's "Fee behavior on connected accounts" page
 - NOT done — no real payment was watched
---

## Prompt

When a customer pays by card for a gang sheet, the money goes to the shop's own Stripe account, and 2.8% of the gang sheet price is sent to our Stripe account automatically at the same moment. Stripe then pays each side out to its own bank account automatically, usually within a few business days. ye tumne confirm kia hana bai codebase se

Then:

client ko basic english mei kia bolun mein

## Response snapshot

What to send, asked for last: "When a customer pays by card for a gang sheet, the money goes to the shop's own Stripe account. Our commission (2.8% of the gang sheet price) is taken automatically from that payment and sent to our Stripe account. Stripe then sends each side its money to its bank account, usually within a few business days." With one line to add if wanted: "Stripe's card fee is paid by the shop."

Before that, on whether it was confirmed. Yes for the part that is ours, and said which part is not:

- From the code: the charge is made on the shop's own connected Stripe account; the platform's share of the gang sheet lines is attached to that charge as an application fee, at the shop's rate (2.8% on Starter), in all three places a card is charged since yesterday's fix.
- From Stripe's documentation, not the code: that fee is what Stripe pays to the platform out of the payment, and on a standard account Stripe takes its own processing fee from the shop separately.
- Not in the code at all: when anybody is paid out. The code sets no payout schedule; each Stripe account follows Stripe's own. "A few business days" is Stripe's usual, not something checked today.
- Not done: a real payment has not been watched.

Found while checking, and worth more than the question: who pays Stripe's card fee is decided by one setting, STRIPE_CONNECT_STYLE. Live is recorded as "standard" (the shop pays). The code's default, if that setting is ever missing, is "express", where the platform pays Stripe's fee on every order.

## Outcome

- ✅ Impact: the owner knows which half of the sentence is the product and which half is Stripe.
- 🧪 Tests: as listed.
- 📁 Files: none.
- 🔁 Next prompts: one small real gang sheet order, then look at Connect, collected fees.
- 🧠 Reflection: the longer text sent earlier said the shop pays the card fee, flatly. It is true for the account style in use and false for the code's default; it was written before reading which is which.

## Evaluation notes (flywheel)

- Failure modes observed: a claim about fees was written from general knowledge of Stripe before the account style was read from the code.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): make "standard" the code's default, or refuse to start without the setting, so the costly style cannot arrive by omission.
