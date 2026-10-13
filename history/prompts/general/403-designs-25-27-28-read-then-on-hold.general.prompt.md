---
id: 403
title: Designs 25 27 28 read then on hold
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: wire designs 25 (Notifications), 27 (Wholesale application) and 28 (Pricing tiers); stopped while reading the live code, to be resumed later
labels: ["admin-redesign", "notifications", "wholesale-application", "pricing-tiers", "on-hold", "local-only"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code was changed; the findings are kept in memory notes outside the repository)
tests:
 - none (read-only reading of the live code)
---

## Prompt

(with three screenshots: "25. Settings: Notifications", "27. Wholesale application", "28. Pricing tiers")

ab jani zara ye 3 screens wire kro jani zara

(then, while the live code was being read:)

ruko abhi dusra kam aya ha ui wala bad mei continue kregy hold rkho memory mei

## Response snapshot

Stopped before building anything. What was learned is kept for later:
- 25: mail always goes out in the shop's name through the platform, so "Not connected" would be false. Most customer emails are written in code and cannot be edited. "Artwork ready for approval" and editing each email per shop have no feature behind them.
- 27: approve takes a pricing tier, shipping tier, discount group, notes and tax exempt. Terms are card or Net 30 only. The credit limit is per tier. Net 15 and Net 60, a per-buyer limit, and the Checks card have no feature behind them.
- 28: only the discount and the credit limit are read at checkout. The tier's minimum order, terms, free shipping, tax and volume breaks are stored and read by nothing found.

Two live faults were told to the owner:
- One email template table serves every shop, and any shop's admin can edit it.
- The shipped email names "AF Apparels" to every shop's customers.

## Outcome

- ✅ Impact: the round can resume where it stopped, with what has a feature behind it and what does not.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's other task; the owner's word on the two live faults; then designs 25, 27 and 28.
- 🧠 Reflection: reading the live code before building showed most of the three designs ask for things the platform does not do.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
