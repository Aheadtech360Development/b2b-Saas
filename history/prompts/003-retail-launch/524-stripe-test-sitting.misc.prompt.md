---
id: 524
title: Stripe test sitting with the owner's sandbox keys
stage: misc
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: Stripe sandbox keys pasted in chat with "ye lo stripe ki test keys iska kro test jo krna tha jaldi prope r"
labels: ["retail-plan", "stripe-test-mode", "gift-cards", "refunds", "returns", "billing", "partner-ledger"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/.stripe-test.env (git-ignored, test keys only, not committed)
 - specs/003-retail-launch/tasks.md (T002, T108a, T108, T108b, T308)
 - history/prompts/003-retail-launch/524-stripe-test-sitting.misc.prompt.md
tests:
 - scratchpad stripe_test_sitting.py against the local DB and the owner's Stripe sandbox, sections A to H: ALL PASSED (demo shop put back, test subscription cancelled)
 - pytest test_retail_plan + test_plan_usage + test_partner_ledger: 44 passed
---

## Prompt

(screenshot: Stripe sandbox, API keys page, test mode; the publishable and secret test keys were pasted in the chat and are left out of this record)

ye lo stripe ki test keys iska kro test jo krna tha jaldi prope r

## Response snapshot

Keys went into backend/.stripe-test.env (git-ignored; run_local refuses a live key). The sitting ran against the local DB with a Custom test connected account in the owner's sandbox: an $86 order paid $50 gift card + $36 card (charge on the shop's account, no platform fee, order history agrees); refund all put $36 back on the card and $50 on the gift card; partial refunds go card first ($15, then $6 card + $4 gift card); a gift card spent elsewhere before confirm gives no order and the $36 charge is refunded; signed in $57.96 = $25 gift card + $32.96 card; a returned $8 tee refunded $8 to the card; Retail started from the card on file with a $79 paid invoice and a partner base of $79 ($15.80 at 20%, $23.70 at 30%); Retail to Starter and back switched in Stripe and the proration lines earn no commission. No product bug found: the failures on the way were the sitting script's own (a URL Stripe refused, an invoice call shape, a case-sensitive history check, and a helper that turned shop scoping back on after each call, which hid the subscription from billing).

## Outcome

- ✅ Impact: every money path of Retail (gift card + card, refunds, returns refund, plan billing, partner commission) proven in Stripe test mode.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner rolls the Stripe test secret key (it was in the chat); the manager's answers (T605); push retail-plan on the owner's word.
- 🧠 Reflection: a helper that sets the scoping bypass must put back what it found, not False; otherwise the caller's next query runs scoped and silently finds nothing.
