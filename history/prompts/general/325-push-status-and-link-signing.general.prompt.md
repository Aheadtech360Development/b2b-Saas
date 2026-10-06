---
id: 325
title: Push status and file link signing
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: is it pushed
labels: ["git", "security", "gang-sheets", "print-files"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/gang_sheets.py
 - backend/tests/test_order_print_files.py
tests:
 - backend/tests/test_order_print_files.py (30 passed)
---

## Prompt

chalo push krdia na tumne jani isey?

## Response snapshot

Not on main yet: the work is on the session branch, waiting for the go-ahead. Before going live, the print file links were keyed with APP_SECRET_KEY alone, which has a public default in the code; if a deployment never set it, links could be forged. They are now keyed with APP_SECRET_KEY and JWT_SECRET_KEY together, so either one kept secret is enough, and a test shows a link signed with the app key alone opens nothing. Asked for an explicit yes to push to main.

## Outcome

- ✅ Impact: file links stay unforgeable even where APP_SECRET_KEY was left at its default.
- 🧪 Tests: 30 passed.
- 📁 Files: listed above.
- 🔁 Next prompts: go-ahead to push to main.
- 🧠 Reflection: a signing key with a default in the code is only as secret as the deployment's settings.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
