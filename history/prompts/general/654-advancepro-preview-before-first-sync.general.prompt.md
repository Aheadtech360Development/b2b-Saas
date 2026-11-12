---
id: 654
title: AdvancePro preview before first sync
stage: green
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: The client (EZ Mart) has given the AdvancePro API login; what to do now
labels: ["integrations", "inventory", "advancepro", "safety"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/inventory_sync/engine.py
 - backend/app/api/v1/admin/inventory_sync.py
 - backend/tests/test_advancepro_sync.py
 - frontend/src/services/inventorySync.service.ts
 - frontend/src/components/admin/inventory-sync/InventorySync.tsx
 - frontend/src/__tests__/inventory-sync.test.tsx
tests:
 - backend/tests/test_advancepro_sync.py (22 passed; new: a preview's wording; every route, preview included, opens the shop first)
 - frontend/src/__tests__/inventory-sync.test.tsx (6 passed; new: preview table, emptied shelf first, Preview calls preview not run)
 - tsc clean
 - local database: apply(dry=True) on the demo shop: message and changes (133 → 0 first, then 71 → 5); stock, audit rows and count stock untouched
---

## Prompt

api usne mjhy dedi ha ab kia krun mei

## Response snapshot

Told the owner not to paste the login in chat and what is safe now: turn the add-on on for EZ Mart, Test and Connect in EZ Mart's admin, choose the location, keep automatic off, Save. Not Sync now yet: EZ Mart is live, the first sync replaces its stock, and a test-company login would put test numbers there. Built Preview: a run that writes nothing and lists every number that would change (emptied shelves first), how many go to 0 and how many products would start counting stock; a first Sync now asks once before it writes. Committed; push waits for the owner's yes.

## Outcome

- ✅ Impact: a live client's first sync can be seen before it changes anything.
- 🧪 Tests: 22 backend, 6 frontend, tsc, local DB preview run.
- 📁 Files: engine, routes, screen, service, tests.
- 🔁 Next prompts: owner's yes to push; EZ Mart's Test result and Preview screenshot; then the real company login and Sync now.
- 🧠 Reflection: a sync that overwrites live stock needs a look before the first write, and a test-company login must never feed a live shop.
