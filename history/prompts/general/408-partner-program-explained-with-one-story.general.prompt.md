---
id: 408
title: Partner program explained with one story
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Explain, with one scenario, how the partner program works from start to finish
labels: ["partner-program", "affiliates", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - none
---

## Prompt

ab ek bs scenario deke smjhado ke iska kam hoga kese kesa work kregi ye functionality

## Response snapshot

One story, told with the program's default numbers.

- **Joining.** A YouTuber who teaches DTF printing applies on printcopilot.co/partners. The super admin approves him at Standard 20% with the code AHMED. He sets his password from the invite and accepts the terms.
- **The referral.** He shares printcopilot.co/?ref=AHMED. A shop owner clicks it, which saves a cookie for 90 days. She signs up later on Wholesale ($297) and is saved to him. Her 14-day trial earns nothing.
- **Earning.** Her first paid invoice makes a $59.40 line (20% of $297; less if she used a promo code). It is pending for 30 days, then payable.
- **Getting paid.** Once he is over $50 with a W-9 on file, the super admin makes a batch, pays him by PayPal outside the system, and records it. He gets an email with a PDF statement. This repeats every month she stays on a paid plan.
- **What changes the money.**
  - A refund makes a minus line that is taken from his next payout.
  - A failed payment earns nothing that month.
  - An upgrade to Scale makes $99.40 a month.
  - A cancel ends the referral, unless she pays again within 90 days.
  - Referring his own shop is held for review.
  - Gang sheet commission and tax never count.

## Outcome

- ✅ Impact: the owner can explain the program to the manager with one example.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's numbers, set in Settings; the go-live list.
- 🧠 Reflection: one person and one shop, followed month by month, covers every rule.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
