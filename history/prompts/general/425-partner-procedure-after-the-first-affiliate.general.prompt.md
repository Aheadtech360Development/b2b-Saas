---
id: 425
title: What a partner does after the first affiliate is made
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Explain the partner's procedure from the portal dashboard onward
labels: ["partner-program", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - live, read-only: https://printcopilot.co/?ref=SUMMER20 redirects 308 to https://www.printcopilot.co/?ref=SUMMER20, keeping the code
---

## Prompt

(screenshot of the live partner portal dashboard for "Bilal": $0 payable, pending, paid, 0 shops, link https://printcopilot.co/?ref=SUMMER20) bhai pehle mene ek admin se affiliate create kia saiha meri jan ke tukre aur ya bnadia ab dekho ab ye kia krega yaha se kia procedure ha

## Response snapshot

The partner's path, step by step:
1. Set up the account: a payout method and a W-9 in Profile and settings, and read the Terms.
2. Share the link or the code (Link and assets has captions, a banner and a QR code).
3. A shop owner clicks the link, which is remembered for the cookie window. They sign up a shop on printcopilot.co, or type the code at sign-up. The shop shows in the partner's Referrals and in the console's Referrals.
4. Each paid plan invoice earns the rate (20% Standard) and is Pending through the 30-day hold, then Payable.
5. At $50 or more, the super admin makes a batch in Payouts, pays outside the system and records the payout. The partner sees it as Paid and gets a statement.
6. A refund or dispute takes back its share from the next payout.

The ?ref code survives the www redirect. The real terms should be published before outside partners are invited.

## Outcome

- ✅ Impact: the owner knows the partner flow.
- 🧪 Tests: the redirect check above.
- 📁 Files: this record.
- 🔁 Next prompts: publish terms, support email, the docs key on Railway; a first real referral.
- 🧠 Reflection: n/a

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
