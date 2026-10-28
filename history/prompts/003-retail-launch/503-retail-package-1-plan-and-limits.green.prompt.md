---
id: 503
title: Retail package 1, plan, limits and affiliate rules
stage: green
date: 2026-10-28
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: continue (package 1 after a session restart)
labels: ["retail-plan", "billing", "plan-limits", "affiliate", "package-1"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/billing_plans.py (retail plan; enforce_limits and public flags; public_pricing_table lists public plans)
 - backend/app/core/features.py (PLAN_FEATURES["retail"] = base minus gang_sheet, supplier_catalog)
 - backend/app/services/partners/ledger.py (proration lines earn nothing, both Stripe shapes)
 - backend/app/services/plan_usage.py (new: usage, staff cap, monthly 80% / 100% notices, hourly loop)
 - backend/app/core/tenant_settings.py (plan_limit_notice is per shop)
 - backend/app/services/mails.py (order_limit_notice)
 - backend/app/api/v1/admin/users.py (staff cap on add and on switching a user back on)
 - backend/app/api/v1/admin/billing.py (usage on /admin/billing and GET /admin/billing/usage)
 - backend/app/main.py (plan usage loop)
 - frontend/src/components/admin/PlanUsageNotice.tsx (new), frontend/src/app/(admin)/admin/dashboard/page.tsx, frontend/src/app/(admin)/admin/billing/page.tsx
 - specs/003-retail-launch/plan.md (D10), tasks.md (T101 to T107)
tests:
 - backend tests/test_retail_plan.py (5), tests/test_plan_usage.py (14 incl. params), tests/test_partner_ledger.py (proration, Retail $15.80 / $23.70, default plans): 43 passed
 - backend full suite without the 11 script-style files: 564 passed, 0 failed (89 need a database or Redis)
 - frontend plan-usage-notice (3) passed; tsc clean
---

## Prompt

continue pkz

## Response snapshot

- Resumed on branch retail-plan: the plan, features and affiliate edits were intact (29 tests passing).
- Built the limits: services/plan_usage counts every order created this UTC month and every non-buyer user (owner included); only plans with enforce_limits (Retail) bind. The owner's 80% / 100% emails go from an hourly loop with a Redis lock, once each per month, recorded per shop; nothing is on the checkout path. Adding a user, or switching one back on, past Retail's 2 is refused with a message naming the plan.
- Admin: Home notice and Billing usage line. Signup already makes a Retail shop from /signup?plan=retail; the console accepts Retail; Retail stays off sign-up and pricing lists (public: False) until the pages launch.

## Outcome

- ✅ Impact: package 1's server side and admin parts are in place on the branch, hidden from the public.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: Stripe test mode check of Retail <-> Starter switching (needs a test key); referral lists by plan (T107 rest); then package 2.
- 🧠 Reflection: a limit checked inside order creation could one day fail an order; reading it live and mailing from a loop keeps the checkout untouched.
