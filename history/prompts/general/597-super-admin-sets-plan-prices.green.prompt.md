---
id: 597
title: Super admin sets plan prices
stage: green
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks for plan prices the super admin can change, and for loyalty widgets in the website builder
labels: ["billing", "plans", "stripe", "console", "marketing-site"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/plan_prices.py
 - backend/app/main.py
 - backend/app/core/billing_plans.py
 - backend/app/services/billing_service.py
 - backend/app/api/v1/platform/billing.py
 - backend/app/api/v1/platform/console.py
 - backend/migrations/versions/0075_subscription_amount.py
 - backend/tests/test_plan_prices.py
 - frontend/src/lib/planPrices.ts
 - frontend/src/lib/planPricesContext.tsx
 - frontend/src/lib/planPricesServer.ts
 - frontend/src/components/platform/console/PlansPage.tsx
 - frontend/src/components/platform/console/api.ts
 - frontend/src/components/platform/console/brand/PlanTab.tsx
 - frontend/src/components/marketing/interactive.ts
 - frontend/src/components/marketing/meta.ts
 - frontend/src/components/marketing/pages/Pricing.tsx
 - frontend/src/components/marketing/pages/Home.tsx
 - frontend/src/components/marketing/pages/Retail.tsx
 - frontend/src/components/marketing/pages/RetailPricing.tsx
 - frontend/src/components/marketing/pages/Partners.tsx
 - frontend/src/app/page.tsx
 - frontend/src/app/(customer)/pricing/page.tsx
 - frontend/src/app/(customer)/retail/page.tsx
 - frontend/src/app/(customer)/affiliate/page.tsx
 - frontend/src/__tests__/plan-prices.test.tsx
tests:
 - backend tests/test_plan_prices.py (17) with console, retail plan, billing card, onboarding, commission, plan usage, entitlements and partner tests (144 passed)
 - frontend plan-prices.test.tsx (12) with retail-site, marketing-forms, partner-retail-link (28 passed); tsc clean in src
 - local database walk (printcopilot_local, migrated to 0075): set Starter $99 through the API, public plan list, console list with default, activity log row, a brand on the old price shows $97, a bad price 422, signed out 401, back to default, the webhook sync keeps Stripe's amount; all put back (13/13). Stripe calls went to the TEST account only (local runs have no live key): two test Prices made on the Starter product.
---

## Prompt

acha ek aur cheez ha bhai ke super admin mei na hamein ek cheez krni ha bhai mere wo ye krni ha bhai ke abhi jo hamare plans ke price hain na wo super admin ke pass acess ho ke price koi bhi change krskty saiha mere bhai ye dekhlena plz proper saiha aur ek aur cheez loyaltu ayur rewards ka feature to bngya lekin wo use kese hoga builder mei usko widgetas ke thru kwese dikhaegy proper isko dekho yar manager ne abhi bhut sunai ha mjhy bhai

## Response snapshot

Part one built. Console, Plans: a "Monthly prices" card with one box per plan (default shown beside a changed one), a confirm that says who pays the new price, and Save prices (PUT /api/v1/platform/billing/plans/prices, platform admin, 422 on a price outside $1 to $10,000, an activity log row). Prices live in one app_settings row ("plan_prices"); every worker reads it at start and each minute. Stripe: a new amount is a new Price that takes the plan's lookup key; brands already paying keep the Price they started on. Migration 0075 keeps what each subscription bills (written on every Stripe sync, read once from Stripe for older ones), so the console's brand list, plan tab and revenue show what a brand on the old price really pays. Website: home, pricing (cards, comparison table, savings calculator), retail page and tab, affiliate example and the retail search description all read the prices in force on the server (a minute's cache), falling back to the shipped prices. A local run found the activity-log action must be "UPDATE" (enum), fixed. Part two (loyalty widgets in the builder) is next.

## Outcome

- ✅ Impact: the super admin changes a plan's price from the console and sign-up, Billing, Stripe and the website follow, without touching what current subscribers pay.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; then loyalty and rewards widgets for the website builder.
- 🧠 Reflection: a unit test with the audit helper stubbed could not see the enum; the one local database run did.
