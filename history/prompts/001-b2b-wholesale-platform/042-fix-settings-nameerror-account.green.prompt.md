---
id: "042"
title: Fix Settings NameError in Account Endpoints
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix NameError - name 'settings' is not defined at account.py line 275
labels: ["bug-fix","account","imports"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/account.py
tests:
  - docker logs afapparel_backend --tail 5 (clean startup confirmed)
---

## Prompt

Fix NameError in backend/app/api/v1/account.py

Error: NameError: name 'settings' is not defined
Location: account.py line 275, in add_payment_method function

Fix: Add this import at the top of backend/app/api/v1/account.py:
from app.core.config import settings

## Response snapshot

Added `from app.core.config import settings` to top-level imports in `account.py` alongside other `app.core` imports. Restarted backend — clean startup confirmed, no NameError.

## Outcome

- ✅ `settings` import added at module level (line 13)
- ✅ Backend restarted cleanly: "Application startup complete."
- 📁 Files: account.py
