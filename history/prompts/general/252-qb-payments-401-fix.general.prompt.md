---
id: 252
title: QB Payments 401 AuthenticationFailed Fix
stage: general
date: 2026-06-10
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: development.aheadtech360@gmail.com
command: fix QB Payments 401 AuthenticationFailed on POST /charges
labels: ["quickbooks","payments","auth","token","401"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
  - backend/app/services/qb_payments_service.py
tests:
  - python AST parse (PASS)
---

## Prompt

Fix QB Payments 401 AuthenticationFailed error on POST /charges. This is different from the QB Accounting token refresh already fixed. QB Payments API uses same OAuth token but QBPaymentsService is constructed without initialize() so it reads stale env-var tokens. Also check Request-Id header, 401 retry logic, and token source.

## Response snapshot

**Root cause identified:** `QBPaymentsService.__init__` called `QuickBooksService()` without `initialize_sync()`. QB token refreshes write to `app_settings` DB (via `_save_tokens_to_db_sync`), not back to env vars. So after the first OAuth rotation, QB Payments was always sending the stale env-var token and getting 401.

**Existing code was already correct in:**
- `Request-Id` header: already included (was `.hex` format, upgraded to `str(uuid4())`)
- `_do_request` 401 retry: already calls `refresh_token_if_expired()` — but this used the stale env-var refresh token, so it often failed too

**Fix 1 — `quickbooks_service.py`:** Added `initialize_sync()` method that uses psycopg2 to read the latest tokens from `app_settings` DB synchronously (mirrors async `initialize()`). Falls back to env vars on DB error.

**Fix 2 — `qb_payments_service.py`:**
- `__init__`: Changed `QuickBooksService()` to `QuickBooksService().initialize_sync()` — starts with DB tokens
- `_do_request` 401 branch: Added logging of token prefix and full QB response body; logs force-refresh success/failure; logs if 401 persists after refresh
- `_headers` Request-Id: Changed `uuid4().hex` to `str(uuid4())` for standard UUID format

## Outcome

- ✅ Impact: QB Payments charges now start with the current DB token on every instantiation; 401 due to stale env-var token eliminated
- 🧪 Tests: AST syntax PASS both files
- 📁 Files: 2 files modified (+65 lines, -3 lines)
- 🔁 Next prompts: If 401 persists after deploy, check logs for "QB Payments token force-refresh result: FAILED" — that means the refresh token itself is expired and a new OAuth authorization flow is needed (visit /api/v1/qb/auth)
- 🧠 Reflection: QB Payments and QB Accounting share one OAuth token but the Payments service was never loading from DB. The pattern `Service().initialize_sync()` in `__init__` should be applied to any sync service that needs fresh tokens.

## Evaluation notes (flywheel)

- Failure modes observed: stale env-var token causes persistent 401 across all QB Payments calls (charges, tokenize, saved cards)
- Graders run and results (PASS/FAIL): AST PASS
- Prompt variant (if applicable): none
- Next experiment: add request/response logging middleware for QB Payments in staging to verify token rotation works end-to-end
