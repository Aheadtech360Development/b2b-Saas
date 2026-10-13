---
id: 405
title: Partner affiliate program plan
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Read the two partner program designs in partners/ (partner portal and super admin tab) and explain how a Shopify-Partners-style referral program would be built
labels: ["partner-program", "affiliates", "referrals", "stripe-billing", "plan-only", "needs-manager-yes"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed; the owner's design files in partners/ stay untracked)
tests:
 - none run; read-only review
 - both design files unpacked from their bundled manifest and every page drawn offline in a browser with the network shut (9 partner screens, 12 super admin screens, 0 page errors); words and pictures of all 21 read
 - code read to ground the plan: no partner, referral or commission code exists; webhooks.py has no invoice.paid handler and tells platform events from a brand's (Connect) events by the event's account; /api/v1/platform/ is guarded by path in auth_middleware.py; signup.py SignupIn is where a referral code would attach; billing_service.py checkout allows promotion codes and prorates plan switches; trial.py is 14 days and app-level; pyotp, reportlab and boto3 are already installed
---

## Prompt

acha abhi na mene do html files attach ki hain saiha ek partners folder bnaya ha uske andar kin hain meri jan saiha proper dekho usko aramse aur ek cheez aur krna wo ye krna ke mere bhai usme na poora design dekhlo basically iska matlab batadeta hn jis tarah shopify partners hain na usi tarh ka ham bhi system chahre hain proper saiha bhai meri jan to zara dekho take affilaiate marketing ke thru bhi paisa kama paein log refer krein aur earn krein saiha zara dekho proper aur mjhy batao implementation kesi rhegi ek super admin mei jo tab hoga wo bhi ha poori ui aur ek alag se partners a login sign up zara wo bhi proper deklhlena har cheez full and final aur phir batao zara proper saiha meri jan

## Response snapshot

A plan only; nothing built. The whole program is new to the platform, so it waits for the manager's yes.

- **Flow.** A partner applies and the super admin approves. The partner gets an invite to set a password, then a link (?ref=CODE, saved 90 days) and a code to type at sign-up. A referred shop's paid plan invoice makes a commission line (Standard 20%, Preferred 30%) held 30 days, then payable. The super admin batches and pays outside the system (PayPal, Wise or bank), records the payment, and a statement PDF is emailed. Refunds and disputes make a minus line.
- **Partner accounts.** A platform-level partner account, apart from per-shop users, with its own login, token type, 2FA, lockout and invite link.
- **Attribution and safeguards.** Attribution at brand sign-up (signup.py), with self-referral flags.
- **Commission engine.** A new invoice.paid handler on platform events only. It is unique per invoice line, stores the rate on the line, and never edits a line. Pending and payable come from dates, with no scheduler.
- **Payouts and records.**
  - Payouts and the W-9: a $50 minimum, a W-9 gate with an override, W-9s stored encrypted (never ImageKit), and 1099 yearly totals.
  - Terms: versions and acceptances.
  - Activity log: append-only, actor kept as text.
  - Partner mail: sent in PrintCoPilot's name from code templates, not the shared email_templates table.
- **Where it lives.**
  - The portal at /partners on the platform domain.
  - A new Affiliates tab in the Platform Console.
  - A referral code field on the brand sign-up page.
  - About 13 new tables in one migration.
- **Design gaps.**
  - No public program page or apply form.
  - No referral field on the brand sign-up.
  - No email texts or statement layout.
  - Desktop only.
  - Placeholders for the support email and the legal text.
- **Decisions for the owner and manager.**
  - Domain: .com or .co.
  - Rates.
  - Lifetime or capped.
  - List price or the amount actually paid, after promo codes and prorations.
  - Hold, minimum, cookie and return windows.
  - Payout methods.
  - Non-US partners and the tax form.
  - The lawyer's terms text.
  - Typed code or cookie, when both are present.
  - Whether brand owners can be partners.
  - What happens when new terms are not accepted.
  - The support email.
  - A separate branch off main.
- **Phases.** Engine, then the partner portal, then the super admin tab, then payouts and documents, then assets and stats.

## Outcome

- ✅ Impact: the owner has the full build plan to take to the manager, with the open decisions listed.
- 🧪 Tests: none; the review was read-only, as listed.
- 📁 Files: this record. Memory: partner-affiliate-program (new), pending-manager-features (one line).
- 🔁 Next prompts: the manager's answers to the decision list, then phase 1 on its own branch off main.
- 🧠 Reflection: the designs are thorough on the money rules (stored rates, invoice-keyed lines, clawbacks, reasons on every action). What they leave out is the way in: the apply page and the referral field on sign-up.

## Evaluation notes (flywheel)

- Failure modes observed: reading the bundles' HTML directly gave no words, because each page is drawn by script; drawing them offline in a browser did.
- Graders run and results (PASS/FAIL): n/a (plan only)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
