---
id: 548
title: Retail launch push
stage: general
date: 2026-11-03
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner set NEXT_PUBLIC_RETAIL_LAUNCH in Vercel (screenshot of the Add Environment Variable dialog, then "hn push krdia jani mene")
labels: ["retail-launch", "deploy", "vercel", "launch-switch"]
links:
  spec: specs/003-retail-launch/tasks.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/billing_plans.py
 - backend/tests/test_retail_plan.py
 - history/prompts/general/548-retail-launch-push.general.prompt.md
tests:
 - pytest test_retail_plan, test_plan_usage, test_partner_ledger: 44 passed
 - live: deploy watched; /retail, the menu, the Pricing tab and the plan list checked from outside
---

## Prompt

?????  (screenshot: Vercel Add Environment Variable, key NEXT_PUBLIC_RETAIL_LAUNCH, type Secret)

hn push krdia jani mene

## Response snapshot

Told the owner: type Config (a NEXT_PUBLIC_ value is in the site's code anyway, hence Vercel's warning), value exactly 1, Production ticked, Save, no manual redeploy. Prepared and committed Retail `public: True` in billing_plans (test updated: the public list is retail, starter, wholesale, scale). On the owner's go, pushed 1072faa (menu + partner Retail link) and 29650e7 (plan public) to main together, so the build that carries them reads the switch; watched the deploy and checked /retail, the menu, the Pricing tab and the plan list live.

## Outcome

- ✅ Impact: Retail launch (website switch on + plan offered) in one push.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: owner walks /retail, the Pricing tab, sign-up on Retail and the partner portal's Retail link.
- 🧠 Reflection: NEXT_PUBLIC values are fixed at build time; the push after the env var is what turns the switch on.
