---
id: 446
title: Merge main into the admin redesign
stage: general
date: 2026-10-19
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Continue the go-live preparation - merge main into the local redesign branch and join the live features to the new screens
labels: ["admin-redesign", "merge", "inventory", "migrations", "go-live"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0060_contact_message_state.py (now after 0063, IF NOT EXISTS)
 - backend/migrations/versions/0061_partner_program.py (main's)
 - backend/app/main.py, backend/app/api/v1/guest.py, backend/app/api/v1/admin/inventory.py
 - backend/app/api/v1/gang_sheets.py (one _linked_orders helper, with the order's payment)
 - backend/app/services/stock_view.py (counted, "free", size-chart order)
 - backend/tests/test_stock_view.py
 - frontend/src/app/(admin)/admin/inventory/page.tsx (Products + SKUs views)
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx (Count stock switch)
 - frontend/src/app/(admin)/admin/settings/tracking/page.tsx (Server-side tracking card)
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx, billing/page.tsx, gang-sheets/page.tsx
 - frontend/src/app/(admin)/admin/production/[id]/page.tsx (downloads named after order and buyer)
 - frontend/src/services/gangSheets.service.ts, frontend/src/components/admin/orders/BuyLabelsDialog.tsx
 - frontend/src/__tests__/buy-labels-batch.test.tsx
 - storefront files and lib/tracking.ts taken from main
tests:
 - backend --noconftest suite 369 passed, 0 failed (87 need the conftest database, 8 Redis on 6379); main's new tests + merge-touched 161 passed; 4 script tests exit 0
 - vitest 633/634, the one (Buy labels, a render race) fixed and stable 3/3; tsc clean; next build exit 0
 - local DB migrated 0062 -> 0063 -> 0060; API walk 16/16; browser pass 11/11
---

## Prompt

continue plz

## Response snapshot

Merged origin/main (64 commits) into `admin-ui-redesign` as 0d5ee3e. It is local only; nothing was pushed.

- **Conflicts:** 18 files, joined by hand.
- **Migrations:** the branch's 0060 now runs after main's 0063, with IF NOT EXISTS.
- **Inventory:** two views. Products (main's Count stock screen) is the default; SKUs (the redesign's list) follows the switch and sorts sizes on the size chart.
- **Product editor:** gets the Count stock switch.
- **Tracking page:** gets the Meta CAPI card.
- **Gang sheet jobs:** one helper for the order number, the buyer and the payment.
- **Fixed during the merge:** a doubled billing block and a doubled TS field, both from the auto-merge, plus a Buy labels render race.

A push to main is now a fast-forward of 92 commits. It waits for the owner's final yes, and the manager's yes on the held features.

## Outcome

- ✅ Impact: the redesign has everything live has, and is ready to push once the owner says yes.
- 🧪 Tests: see above.
- 📁 Files: see above.
- 🔁 Next prompts: the owner's go-live decision (held features, the three live features missing from the redesign), then push and verify Vercel and Railway.
- 🧠 Reflection: git's auto-merge can keep the same code twice when both sides added it, without raising a conflict. Diff every both-sides file for repeated lines, and run tsc and a build, not only the conflict list.

## Evaluation notes (flywheel)

- Failure modes observed:
  - a doubled `else if` in billing;
  - a doubled interface field;
  - a select showing its first option before state chose it, which made a test flaky under load.
- Next experiment: check repeated lines down to short ones (the 30-character floor missed the field).
