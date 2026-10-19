---
id: 397
title: Billing card on file starts plan
stage: general
date: 2026-10-13
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: Innterflow has a card on file and was never charged; make platform billing automatic, month by month, when a card is on file
labels: ["billing", "stripe", "subscriptions", "live-fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/billing_service.py
 - backend/app/services/billing_autostart.py (new)
 - backend/app/services/trial.py
 - backend/app/main.py
 - frontend/src/app/(admin)/admin/billing/page.tsx
 - backend/tests/test_billing_card_on_file.py (new)
tests:
 - backend, pytest --noconftest — test_billing_card_on_file.py (4 new) — passed
 - frontend, tsc — only the 2 old errors in api-client.test.ts
 - Stripe TEST mode + local database, five throwaway shops (removed after) — 13 of 13: the live brand's state started and charged $97.00 on coming back from the portal, one subscription, record matching, banner gone, no duplicate on a second run; a running trial held to its end; a declined card makes nothing and the shop stays open; a brand that cancelled is not signed up again; no card, nothing
 - NOT run — any live charge from here; the live brand's own rows were not read (no live database access); the hourly sweep on live (it runs after the deploy)
---

## Prompt

(with three screenshots: Innterflow's Billing & Payouts page — "TRIAL ENDED … Choose a plan", Your Plan "Currently on Starter, Active", Starter "Current"; the plans; and Stripe's billing portal for Innterflow with Mastercard •••• 5018, Default, and no subscription)

bhai ek issue ye agya ha ek brand ha innterflow saiha bhai ab dekho isne na card dala hua ha mera client ne ek brand jo hana innterflow ka lekin iska issue ye arha ha bhai ke iski na payment nh kati ha to plz isey dekho yar zara ye to poora automated system hona chayie na ke month by month agar card lagaya hua ha to payment to automatically cutt off honi chayie na plz isey dekho yar bhai mere

## Response snapshot

The cause: Manage billing (Stripe's billing portal) saves a card and starts nothing. Nothing else created a subscription either: only Choose a plan's Checkout did, and the end of a trial only changed a banner. So Stripe had a card and no plan to charge.

The page also said "Active / Current plan". It read our record's status, and the column defaults to 'active' with nothing in Stripe behind it, so the brand saw Manage billing instead of Subscribe.

What changed:
- A brand whose Stripe customer has a card and never had a subscription is put on its plan, charged to that card. During the trial the charge is held to the trial's end; after it, the charge is taken now. From then on Stripe bills every month.
- A declined card creates nothing, and the shop is not closed.
- A brand that cancelled is not signed up again.
- This runs when the brand comes back from the portal, and hourly in-process.
- The page shows a plan as active only when Stripe has it.

The owner said yes to pushing, knowing it charges Innterflow $97 within about an hour and monthly after that.

## Outcome

- ✅ Impact: platform billing starts by itself from a card on file and renews monthly through Stripe.
- 🧪 Tests: as listed.
- 📁 Files: 6, one commit on main.
- 🔁 Next prompts: confirm Innterflow's first charge in Stripe; the trial reminder emails are a Celery task and the deployment runs no Celery beat (main.py says so), so they likely never send; Choose a plan during a trial still charges at once instead of at the trial's end.
- 🧠 Reflection: "Active" came from our own record, not from Stripe. Billing has to be read from the thing that bills.

## Evaluation notes (flywheel)

- Failure modes observed: a status column defaulting to 'active'; a portal that saves cards without plans; one design risk caught before writing it (re-subscribing a brand that cancelled), so the rule is "never had a subscription".
- Graders run and results (PASS/FAIL): backend 4 PASS; Stripe test-mode run 13/13 PASS; tsc PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): watch the first hourly sweep's log line for Innterflow on Railway.
