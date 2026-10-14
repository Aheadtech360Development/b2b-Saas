---
id: 416
title: Partner program status before the push
stage: general
date: 2026-10-14
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Recall where the partner program stands and what its push needs
labels: ["partner-program", "release-plan"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - git: the partner commits are intact on the branch; live main's last migration is 0059_audit_user_unlink; no partner file has changed on main since the dry run at 2752560
---

## Prompt

acha ab wo jo wo wala kam tha na partners wala yad ha meri jan ?

## Response snapshot

**Where it stands.** The partner program is built on the local branch and is not live:
- 0f7a7ac (engine), e86e292 (sign-in and API) and dd744fc (the partner portal and the Affiliates tab), with migration 0061.
- Checked locally: the HTTP walk at 74/74, the browser pass, and the Add by hand button.
- It waits for the manager's word on the numbers. These are all settings: 20% Standard, 30% Preferred, a 30-day hold, a $50 minimum and a 90-day cookie.

**The push plan still holds.** Live main is now 9da64d1, and none of the partner files has changed on main since the dry run:
- Only the partner commits and their prompt records go. No redesign commit goes.
- The one conflict is backend/app/main.py: main's version plus the partner lines.
- Migration 0061 is re-chained onto 0059_audit_user_unlink.

**After the push, on live:**
- invoice.paid, plus the refund and dispute events, on the platform's Stripe webhook.
- PARTNER_DOCS_KEY set on Railway, by the owner.
- PLATFORM_NAME = PrintCoPilot.
- The lawyer's terms text.
- A support email in the program settings.

## Outcome

- ✅ Impact: the owner has the status and what the push needs.
- 🧪 Tests: the git checks above.
- 📁 Files: this record.
- 🔁 Next prompts: the manager's answer; then the push and the go-live list.
- 🧠 Reflection: n/a

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
