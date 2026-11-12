---
id: 651
title: AdvancePro inventory sync connector
stage: green
date: 2026-11-12
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Build the AdvancePro inventory sync end to end, as a connector sold to every brand
labels: ["integrations", "inventory", "advancepro", "add-on"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/inventory_sync/__init__.py
 - backend/app/services/inventory_sync/advancepro.py
 - backend/app/services/inventory_sync/config.py
 - backend/app/services/inventory_sync/engine.py
 - backend/app/api/v1/admin/inventory_sync.py
 - backend/app/services/integrations_service.py
 - backend/app/core/features.py
 - backend/app/main.py
 - backend/tests/test_advancepro_sync.py
 - frontend/src/services/inventorySync.service.ts
 - frontend/src/components/admin/inventory-sync/InventorySync.tsx
 - frontend/src/app/(admin)/admin/inventory-sync/page.tsx
 - frontend/src/components/admin/products/ProductsFrame.tsx
 - frontend/src/components/admin/UpgradeNotice.tsx
 - frontend/src/__tests__/inventory-sync.test.tsx
tests:
 - backend/tests/test_advancepro_sync.py (21 passed): sign-in, refused login, two-factor, token refresh on 401, https only, paging from 1 (page 0 clamped, 400, empty), from 0, page ignored, short page, both pages refused; the numbers (all warehouses added up, one warehouse, safety stock, deleted rows, no stock row, duplicate SKUs, case and spaces); setup rules; schedule due; the add-on gate; password never returned; every route opens the shop before asking for it
 - frontend/src/__tests__/inventory-sync.test.tsx (5 passed); products-plan-lock (6 passed); tsc clean
 - retail plan, Meta CAPI, SanMar backend tests still pass (5, 21, 13)
 - local database: apply() on the demo shop inside a rolled-back transaction (numbers, audit rows, demo's own rows, second run unchanged, rollback restores)
 - local end to end through the real API with AdvancePro pretended: 403 before the add-on, 200 after; wrong password refused with AdvancePro's reason; connect without echoing the password; warehouses; turning on with no location refused; save; sync now; a second at once refused (409); the job completes with its summary (after fixing the job route, which asked for the shop before opening it: 400); history and last sync recorded; stock 9+3-1=11 and 4-1=3; local demo put back exactly (133, 38, 71; no settings, flags or audit rows left)
---

## Prompt

hn hn proper end to end wiring shru kro isko hum sary brands ko as a connector sell kregy saiha meri jan jaldi se krdo

## Response snapshot

Built v1, stock in: Products → Inventory sync, AdvancePro first. The login is a provider in the brand's connected accounts (tested by signing in and reading warehouses; password masked). Each store location takes every AdvancePro warehouse added up, one warehouse, or nothing; safety stock; count stock on matched products; sizes AdvancePro lacks kept or zeroed; sync automatically every 15 minutes to a day, or Sync now. A run reads every variant and every warehouse's available quantity (paging base detected, since the spec does not say), matches SKUs ignoring case and spaces, writes only changed numbers with an audit row each, and records what it did (matched, changed, AdvancePro SKUs not in the shop, shop sizes not in AdvancePro, samples). Runs in-process with a Redis lock and a scheduler loop like supplier syncs. Sold as an add-on: feature inventory_sync in no plan, the platform turns it on per brand in the console's Features; a locked shop reads "is an add-on, ask us". Orders out to AdvancePro (v2) left for after a test login: it writes into the brand's company.

## Outcome

- ✅ Impact: brands can keep shop stock in step with AdvancePro on their own; the platform sells it brand by brand.
- 🧪 Tests: 21 backend, 5 frontend, tsc, local DB run, local API end to end.
- 📁 Files: the inventory_sync service and routes, provider, feature, scheduler, admin screen, tests.
- 🔁 Next prompts: owner's yes to push; a brand's AdvancePro test login for a live check; v2 orders into AdvancePro.
- 🧠 Reflection: the end-to-end run found what the unit tests could not (the job route without get_db); the first run's crash left local data changed, so cleanup must sit in a finally from the start.
