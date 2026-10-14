---
id: 407
title: Partner program built on the local branch
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Build the partner (affiliate) program from the designs in partners/ on printcopilot.co; the commission numbers are confirmed with the manager later
labels: ["partner-program", "affiliates", "referrals", "stripe-billing", "commission", "frontend", "backend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0061_partner_program.py (new)
 - backend/app/services/partners/ (new package: db, program, ledger, activity, referrals, commissions, auth, docs, mail, statements, portal, actions, admin_views)
 - backend/app/api/v1/partners_public.py, partners_auth.py, partners_portal.py, platform/affiliates.py (new)
 - backend/app/api/v1/webhooks.py, signup.py; backend/app/main.py; backend/app/core/config.py; backend/app/middleware/auth_middleware.py; backend/requirements.txt (segno)
 - backend/tests/test_partner_ledger.py, test_partner_auth.py (new)
 - frontend/src/components/partners/ (partners.css, ui, states, PartnerShell, AuthFrame, ProgramPage, ReferralCapture)
 - frontend/src/lib/partnerApi.ts
 - frontend/src/app/(partners)/partners/ (program, login, invite, reset, view, unavailable, and the portal: dashboard, link, referrals, earnings, payouts, settings, terms)
 - frontend/src/components/platform/affiliates/ (the Affiliates tab: overview, applications, affiliates, referrals, ledger, payouts, settings, activity log, Stripe events)
 - frontend/src/app/(platform)/platform/page.tsx; frontend/src/app/(auth)/signup/page.tsx; frontend/src/components/platform/PlatformLanding.tsx; frontend/src/middleware.ts
tests:
 - python -m pytest --noconftest tests/test_partner_ledger.py tests/test_partner_auth.py: 27 passed
 - migration 0061 taken down and up again on the local database: ok
 - engine walk on the local database (Stripe-shaped events straight into the engine): 22 of 22
 - HTTP walk through the local API, apply to payout, suspend, terms, view-as, lockout: 74 of 74, everything it made removed
 - the screens drawn in a browser on the local site with demo data and held against the designs
---

## Prompt

pehli bat jo hamara main platform hana jaha se log abhi ake apna brand aur store wagera setup krty wo ha printcopilot.co saiha bhai mere aur dusra baki jo commision wagera ha wo bnado bad  mei poochulunga mei apne usse manager se batao shru krein?

## Response snapshot

Built the whole partner program on the local branch. Nothing was pushed and nothing touches live. The numbers are the design's defaults (20% and 30%, a 30-day hold, a $50 minimum, a 90-day cookie, a 90-day return window), and each is a setting on Program settings, so the manager's answers become setting changes, not code.

**Backend:**
- Migration 0061 with 14 platform-level tables and an append-only activity log.
- An `invoice.paid` commission engine, one line per invoice. It reads both of Stripe's payload shapes, counts only the platform's own Stripe mode, and handles clawbacks for refunds and disputes.
- Sign-up attribution, with a cookie from a valid click, otherwise a typed code, and self-referral flags.
- Separate partner sign-in: its own token type, an httpOnly refresh cookie, lockout, two-step sign-in, invite and reset links.
- The portal API.
- The super admin API: applications, affiliates, referral decisions, ledger actions, payout batches and recording, 1099 totals, settings, rate plans, terms versions, banners, the activity log, and Stripe events with retry.
- Encrypted W-9s, PDF statements, QR codes, and platform-named emails written in code.

**Frontend:**
- The design's own CSS, scoped under `.pcp`.
- The partner portal and its public pages, including an apply page (not in the designs) drawn in their style.
- The Affiliates tab in the Platform Console.
- `?ref=` capture and a partner code field on sign-up.

**Found along the way, not fixed:**
- The webhook drops Stripe's retry of a failed event.
- Every route in the app commits after it has answered, so an immediate re-read can be stale. The partner routes commit first.

## Outcome

- ✅ Impact: the partner program can be tried end to end on the local site, and goes live once the manager confirms the numbers and the go-live list is done.
- 🧪 Tests: 27 unit tests, a 22-check engine walk, a 74-check HTTP walk, the migration both ways, and a browser pass.
- 📁 Files: as listed. Memory: partner-affiliate-program.
- 🔁 Next prompts:
  - The manager's numbers, set in Settings.
  - The go-live list: invoice.paid on the Stripe destination, PARTNER_DOCS_KEY, PLATFORM_NAME, the lawyer's terms, and a support email.
  - Shipping it alone onto main by cherry-pick, with migration 0061 re-chained.
- 🧠 Reflection: FastAPI's default dependency scope closes the session after the response, which showed up as a flaky check (a hold not yet visible). Checks that read straight after a write are worth keeping for that reason.

## Evaluation notes (flywheel)

- Failure modes observed:
  - `.test` email addresses are refused by the validator.
  - asyncpg refuses one parameter used as two types.
  - The commit after the response, above.
  - The dev server's first compile of a route can outlast a navigation wait.
- Graders run and results (PASS/FAIL): unit PASS, engine walk PASS, HTTP walk PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
