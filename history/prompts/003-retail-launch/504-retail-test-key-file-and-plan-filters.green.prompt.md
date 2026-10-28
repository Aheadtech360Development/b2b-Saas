---
id: 504
title: Why two package 1 items were left, and doing them
stage: green
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: Why were the Stripe test mode switch check and the affiliate plan lists not done?
labels: ["retail-plan", "stripe-test-mode", "affiliate", "package-1"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/run_local.py (reads Stripe TEST keys only from backend/.stripe-test.env; a live key or any other name refuses to start)
 - .gitignore (backend/.stripe-test.env)
 - backend/app/services/partners/admin_views.py (ledger filter by plan; affiliates filter by referred shops' plan)
 - backend/app/api/v1/platform/affiliates.py (plan, shop_plan query parameters)
 - backend/tests/test_partner_ledger.py (+1)
 - frontend/src/components/platform/affiliates/api.ts (SHOP_PLANS), Referrals.tsx (Retail in the plan filter), Ledger.tsx (plan filter), AffiliatesList.tsx (shops on plan filter)
 - specs/003-retail-launch/tasks.md (T107 done, T108a)
tests:
 - backend tests/test_partner_ledger.py: 25 passed
 - frontend partner-program-settings: 6 passed; tsc clean
 - run_local.py check still starts; the test key reader accepts sk_test_, refuses sk_live_ and other names
---

## Prompt

Stripe test mode mein Retail se Starter aur wapas Retail badal ke dekhna. Is ke liye Stripe ki test key (sk_test_...) chahiye. Bata dein to main file aur jagah bata doon, key chat mein na bhejein.
Affiliate ki lists mein plan ka naam aur plan se filter. to ye tumne ku nh kie ye to batao hai

## Response snapshot

- The Stripe check needs a Stripe key and the local runner blanks every outside key on purpose; asking for the key in chat would have been wrong. Opened one door: backend/.stripe-test.env (git-ignored) with STRIPE_SECRET_KEY_TEST=sk_test_..., read only for test keys; the platform's stripe_mode already runs in test when only a test key is set.
- The affiliate lists were simply not done yet. Plan names already showed on both referral lists; added Retail to the console's referral plan filter, a plan filter on the Ledger (the plan stored on each line) and a "shops on plan" filter on Affiliates.

## Outcome

- ✅ Impact: package 1 is complete but for the Stripe test-mode switch check, which waits on the owner's test key in the file.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner puts the test key in the file; the switch check; then package 2.
- 🧠 Reflection: say "not done yet" plainly when it is just not done; keep "blocked" for what really waits on someone.
