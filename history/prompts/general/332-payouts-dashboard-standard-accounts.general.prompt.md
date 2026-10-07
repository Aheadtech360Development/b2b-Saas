---
id: 332
title: Payouts dashboard for standard accounts
stage: green
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: fix open payouts dashboard error
labels: ["stripe", "connect", "billing", "payouts"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/connect_service.py
 - backend/app/api/v1/admin/connect.py
 - backend/tests/test_connect_dashboard_link.py
tests:
 - backend/tests/test_connect_dashboard_link.py (5 passed)
---

## Prompt

(screenshot: innterflow.printcopilot.co/admin/billing showing "Cannot create an edit link for the account acct_1ULjHgJx3f99givF, which does not have access to the Express Dashboard.")

see this last thing only jb mei yaha open payouts dashboards mei click krrha ye ajeebsa error arha ha zara dekho isey jani

## Response snapshot

The button always asked Stripe for a login link, which opens only the Express Dashboard. The brand's account was created as a standard account (STRIPE_CONNECT_STYLE=standard, controller.stripe_dashboard.type "full"), which has the full Stripe Dashboard instead, so Stripe refused. The link now follows the account: Express gets its login link as before; a full-dashboard account opens dashboard.stripe.com/payouts (or /test/payouts in test mode), where the owner signs in with the Stripe login made at onboarding; an account with no dashboard gets a plain message. Accounts from before controller properties are read by their type.

## Outcome

- ✅ Impact: "Open payouts dashboard" works for standard accounts.
- 🧪 Tests: 5 passed.
- 📁 Files: listed above.
- 🔁 Next prompts: go-ahead to push to main.
- 🧠 Reflection: the code chose between Express and standard when creating accounts but assumed Express when opening their dashboard.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
