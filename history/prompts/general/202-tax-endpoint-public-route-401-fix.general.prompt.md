---
id: 202
title: Tax endpoint public route 401 fix
stage: general
date: 2026-05-18
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: fix 401 on GET /api/v1/tax/test-ziptax and make POST /api/v1/tax/calculate public
labels: ["auth","middleware","tax","public-route"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/middleware/auth_middleware.py
tests:
  - GET /api/v1/tax/test-ziptax (must return 200 without auth)
  - POST /api/v1/tax/calculate (must be accessible during guest checkout)
---

## Prompt

The test endpoint GET /api/v1/tax/test-ziptax is returning 401 UNAUTHORIZED. This endpoint needs to be public (no auth required) for debugging. Also make /api/v1/tax/calculate public for guest checkout.

## Response snapshot

Added `if path.startswith("/api/v1/tax/"):` to the `_is_public()` method in `AuthMiddleware` (after the existing `/api/v1/tax-rate` check). This covers all current and future `/api/v1/tax/*` routes with a single prefix check.

## Outcome

- ✅ Impact: Both /api/v1/tax/calculate and /api/v1/tax/test-ziptax are now publicly accessible
- 🧪 Tests: Manual — GET /api/v1/tax/test-ziptax without Bearer token
- 📁 Files: 1 file modified
- 🔁 Next prompts: none
- 🧠 Reflection: Auth middleware uses prefix matching; single `/api/v1/tax/` entry covers all routes in the tax router

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
