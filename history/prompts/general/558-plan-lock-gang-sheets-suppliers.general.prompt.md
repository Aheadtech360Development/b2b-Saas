---
id: 558
title: Plan lock on Gang sheet setup and Suppliers
stage: green
date: 2026-11-04
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner's yes to the clear "included from Starter" message on the two print-only Products tabs
labels: ["retail-launch", "plan-gating", "admin", "products"]
links:
  spec: specs/003-retail-launch/tasks.md
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/admin/entitlements.py
 - backend/tests/test_entitlements_locked.py
 - frontend/src/components/admin/UpgradeNotice.tsx
 - frontend/src/components/admin/customers/CustomersFrame.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/components/admin/suppliers/SuppliersManager.tsx
 - frontend/src/__tests__/products-plan-lock.test.tsx
tests:
 - backend tests/test_entitlements_locked.py + test_retail_plan.py: 8 passed
 - frontend products-plan-lock.test.tsx: 6 passed
 - tsc: no errors in src (only the stale generated .next/types validator)
---

## Prompt

hn ye wala kam krdo tum plz jani

## Response snapshot

On a shop whose plan lacks them (Retail), Products → Gang sheet setup and Products → Suppliers now show the Customers tabs' lock box: "Included from the Starter plan", one line on what the screen does, "Upgrade to turn this on." and a See plans button to Billing; Suppliers drops "+ Add manual supplier". UpgradeNotice (written earlier, used nowhere, old styling) now draws PlanLock; PlanLock takes cta={null}. Backend: the entitlements list names no plan for a feature the shop's own plan includes (the platform switched it off), so such a shop reads "switched off for your shop" instead of being sent to buy its own plan or a cheaper one. Committed locally; push waits for the owner's yes.

## Outcome

- ✅ Impact: a Retail shop sees why the two tabs are closed and where to upgrade.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; Add product still offers the gang sheet kinds on Retail, and the onboarding supplier step is not plan-aware (not changed).
- 🧠 Reflection: a lock message needs the "switched off by the platform" case too, or it tells a shop to buy what it already has.
