---
id: 410
title: What we see of partner leads
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Check whether every lead a partner brings shows up in our own system
labels: ["partner-program", "affiliates", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - none (read the code and the owner's designs)
---

## Prompt

matlab jo bhi leads wagera partners larhy hpngy wo sb pata chlra hoga na hamein hamare system mei hi

## Response snapshot

Yes, and all of it is in our own database and the Platform Console, with no outside tool. A lead comes in three kinds.

- **A shop that signs up.** We see everything in Affiliates, then Referrals:
  - the shop and its owner's email
  - which partner brought it
  - its plan and status
  - how it was attributed (cookie, code or manual)
  - the date

  Each partner's page lists their shops, and the Ledger holds the money. The normal shops list does not show the partner.
- **A click with no sign-up.** We get a count, not a person: the time, the landing page, the site it came from, and a campaign tag. One browser counts once a day. The partner's Link page shows the last 30 days of clicks, sign-ups and conversion. An admin sees the same through "View as affiliate". There is no admin-wide click report, and the design had none.
- **What we cannot see.** A shop that heard of us from a partner but used neither the link nor the code, or came back after 90 days, signs up as a normal shop. The server can give a shop to a partner by hand, with a reason, but no button calls it. The design shows an "Added by admin" row and no control for it. A wrong partner can already be fixed with Reassign.

Recommendation: add an "Add referral" button to Referrals before the push. It is small and waits for the owner's yes.

**Correction (record 411):** the button exists. It is "Add by hand" on Referrals, with its modal and a shop search. The search that said it was missing had been cut short by `head`.

## Outcome

- ✅ Impact: the owner knows what the system records about partner leads, and the one gap.
- 🧪 Tests: none.
- 📁 Files: this record; memory (partner-affiliate-program).
- 🔁 Next prompts: the owner's yes on the Add referral button; the manager's numbers; the push.
- 🧠 Reflection: the server action without a button was found only by asking how a missed referral gets fixed.

## Evaluation notes (flywheel)

- Failure modes observed: a backend action built with no UI to call it (add_referral).
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): grep each admin route for a caller in the frontend before calling a feature done.
