---
id: 423
title: Partner numbers as settings and the console as designed
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Take the partner program live with every number in the super admin's hands and the console as designed, built and checked like senior work
labels: ["partner-program", "settings", "platform-console", "release-plan", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/partners/{program,referrals,commissions,ledger,actions,admin_views,portal,mail}.py
 - backend/app/api/v1/{partners_auth,partners_portal,partners_public}.py, backend/app/api/v1/platform/affiliates.py
 - backend/migrations/versions/0062_partner_earn_until.py
 - backend/tests/test_partner_settings.py
 - frontend/src/components/platform/ConsoleBar.tsx (new), frontend/src/app/(platform)/layout.tsx, frontend/src/app/(platform)/platform/page.tsx
 - frontend/src/components/platform/affiliates/{ProgramSettings,Applications,AffiliateDetail,AffiliatesList,Payouts,Referrals,Overview,AffiliatesTab}.tsx, api.ts
 - frontend/src/app/(partners)/partners/(portal)/{earnings,payouts,referrals,settings}/page.tsx, frontend/src/components/partners/ProgramPage.tsx, frontend/src/app/(auth)/signup/page.tsx
 - frontend/src/components/partners/partners.css, frontend/src/app/globals.css
 - frontend/src/__tests__/partner-program-settings.test.tsx, frontend/src/__tests__/signup-partner-code.test.tsx
tests:
 - backend partner tests 45/45 on the branch, 55/55 with the builder script tests on the go-live branch; ruff clean apart from one unused import that live main already has
 - the partner engine check and the full HTTP walk through the local API, both ALL PASS and cleaned up (the one traceback is the check's deliberately broken event)
 - frontend: tsc 0 errors; the whole suite 563/563 on the branch
 - the console in a local browser at 1440 and 390: the bar on every tab, Brands keeps its title and Create Brand, the avatar menu shows the email and Log out, no sideways scroll; screenshots held against the design
 - the whole migration chain on an empty local database: 0001 to 0059, 0061, 0062; 14 partner tables and partner_referrals.earn_until
---

## Prompt

ab partners wala kam live kro meri jan

ary bhai mere but partners wala kam to poora hogya tha na

saiha bs jesi sb complete hojae krdena push but make sure as a senior software architect and senior eng wala kam lage saiha

dekho zara koi erroraya ha kia bhai mere

kitna hogya agents ka kam jani

chalo continue kro yar meri jan jaldi kro yar

## Response snapshot

**Every number of the deal is now a setting**, each defaulting to today's behaviour:
- how long a referral earns. It is kept on each referral, in the new column partner_referrals.earn_until (migration 0062).
- the clawback window, judged by the day Stripe says the refund happened.
- the answer time promised to applicants.
- the W-9 amount, per calendar year.
- the 1099 marker.
- the rate-change notice the portal states.
- a default rate plan, which the dialogs start on.

**Texts follow the settings.** Every text that states one of these numbers reads it. Partner mails reply to the support address.

**Two faults fixed:**
- an ended partnership's earned commission could never be paid;
- a stale cookie lost a typed partner code.

**The console matches the design.**
- The dark bar is on every tab, with the tabs, the Affiliates count and the SA menu (email, Log out).
- Brands keeps its own title.
- Affiliates runs full width.
- The CSS leaking into the design is handed back to the browser.

**How the work was done.** Two agents built it in parallel and stopped at the session limit. The rest was finished and reviewed by hand:
- the settings agent's whole diff was read;
- the "months" box and the Stripe handlers card were fixed from screenshots;
- the console's open tab now scrolls into view on a phone.

**Prepared for main.** Branch commits fc28213 and 7b1626d went onto the go-live branch with the partner commits. That branch is rebased on live main 41697db.

## Outcome

- ✅ Impact: the manager's rule and the owner's design, ready for the push.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: the push and the go-live checklist (Stripe webhook events; optionally PARTNER_DOCS_KEY; the lawyer's terms; a support email).
- 🧠 Reflection: the live start command runs migrations but starts the app even if one fails, so the chain was run on an empty database before the push.

## Evaluation notes (flywheel)

- Failure modes observed: both build agents stopped at the session limit mid-work; a unit word overlapped its number; a card heading was a bare h2
- Graders run and results (PASS/FAIL): all PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
