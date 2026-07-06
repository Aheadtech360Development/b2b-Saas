---
id: "150"
title: ACH Bank Account Storage — Payment Methods Page
stage: green
date: 2026-05-07
surface: agent
model: claude-sonnet-4-6
feature: payment-methods-ach
branch: main
user: umeradnan7106
command: resume session — implement Item 13 ACH bank details storage
labels: ["payment-methods","ach","company-model","api","frontend"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/models/company.py
  - backend/migrations/versions/v5w6x7y8z9a0_add_ach_account_to_companies.py
  - backend/app/api/v1/account.py
  - frontend/src/app/(customer)/account/payment-methods/page.tsx
  - frontend/src/lib/api-client.ts
tests:
  - manual: GET /api/v1/account/ach-method returns {} when no ACH saved
  - manual: PUT /api/v1/account/ach-method saves bank_name, account_holder, routing_last4, account_last4, account_type
  - manual: DELETE /api/v1/account/ach-method clears ach_account on company
  - manual: frontend form shows empty state, add form, saved display, remove button
---

## Prompt

Resume from previous session — continue implementing batch of 20 UI/functional changes. Last pending item: Item 13 — add ACH/Bank details storage to customer Payment Methods page. Company model had no ACH fields. Backend GET/PUT/DELETE endpoints needed. Frontend form with bank name, account holder, routing/account last 4, account type needed.

## Response snapshot

Implemented full ACH/bank account storage feature:
1. Added `ach_account: JSONB` nullable column to Company model
2. Created migration v5w6x7y8z9a0_add_ach_account_to_companies.py
3. Added GET/PUT/DELETE endpoints at /api/v1/account/ach-method — stores bank_name, account_holder, routing_last4, account_last4, account_type (only last 4 digits of numbers for safety)
4. Rewrote payment-methods/page.tsx to include an "ACH / Bank Account" section below the saved cards, with saved display card and an add/edit form
5. Added `.put()` method to apiClient (previously only had get/post/patch/delete)

## Outcome

- ✅ Impact: Customers can now store ACH bank reference details on their account; fields are purely informational (last 4 digits only), not live payment processing
- 🧪 Tests: Manual testing via UI after migration applied
- 📁 Files: 5 files modified/created
- 🔁 Next prompts: Run `alembic upgrade head` to apply migration; Item 4 (page load slowness) still pending
- 🧠 Reflection: Chose JSONB column on Company over a separate table — single account per company, no relational queries needed, minimal schema change

## Evaluation notes (flywheel)

- Failure modes observed: apiClient missing .put method — caught before runtime by reading the client source
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
