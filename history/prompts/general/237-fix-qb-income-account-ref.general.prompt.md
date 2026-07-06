---
id: 237
title: Fix QB IncomeAccountRef Account Name
stage: general
date: 2026-06-08
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix QB item IncomeAccountRef to Sales of Product Income
labels: ["quickbooks", "fix", "products"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
tests:
  - manual: create a new product variant and verify QB item is created without 400 error
---

## Prompt

In backend/app/services/quickbooks_service.py, update the find_or_create_item method account refs to use the correct account names from this QB company: Change "IncomeAccountRef": {"name": "Sales"} to "IncomeAccountRef": {"name": "Sales of Product Income"}. Push to Railway.

## Response snapshot

One-line change in `find_or_create_item`: `"IncomeAccountRef": {"name": "Sales of Product Income"}`. Other two account refs (`Inventory Asset`, `Cost of Goods Sold`) unchanged.

## Outcome

- ✅ Impact: QB item creation will no longer fail with 400 due to unknown account name
- 🧪 Tests: Create a variant in admin, verify sync_variant_to_qb succeeds in Railway logs
- 📁 Files: backend/app/services/quickbooks_service.py (1 line)
- 🔁 Next prompts: Test item creation end-to-end
- 🧠 Reflection: n/a
