---
name: Fix CORS errors and 401s after deploy
description: Fixed Alembic migration revision ID collision and SameSite=Lax cookie issue blocking production auth
type: general
stage: green
date: 2026-04-10
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: umeradnan7106
labels: ["bug", "cors", "auth", "migration", "production"]
---

## PROMPT_TEXT

Session resumed after context compaction. Investigate and fix:
- CORS errors on /api/v1/products?page_size=4, /api/v1/admin/products?page=1, /api/v1/products/categories
- 401 Unauthorized on wholesale-applications, reports, orders, sales admin endpoints
- All Products section broken after recent push
- Export still works (key diagnostic clue)

## RESPONSE_TEXT

### Root Cause 1: Alembic migration revision ID collision

Two migration files shared the same revision ID `a1b2c3d4e5f6`:
- `a1b2c3d4e5f6_add_order_comments.py` (existing, applied)
- `a1b2c3d4e5f6_add_category_image_url.py` (new, never applied)

Alembic aborts when it encounters duplicate revision IDs → `categories.image_url` column is never created in PostgreSQL → every SQLAlchemy query that loads categories (products, categories list) raises `column categories.image_url does not exist` → response stream breaks mid-way → browser reports CORS error because it can't read the truncated response.

**Fix:** Renamed `a1b2c3d4e5f6_add_category_image_url.py` to `c4d5e6f7a8b9_add_category_image_url.py` with:
- `revision = "c4d5e6f7a8b9"`
- `down_revision = "b3c4d5e6f7a8"` (actual chain head)

### Root Cause 2: SameSite=Lax blocks cross-origin cookie on refresh

The httpOnly refresh token cookie was set with `SameSite=Lax`. For cross-origin POST requests (Vercel frontend → Railway backend), browsers block `SameSite=Lax` cookies. So `POST /api/v1/refresh` never receives the cookie, refresh fails, `accessToken` stays null after page reload, and all protected admin routes return 401.

**Fix:** In `auth.py`, both `set_cookie` calls (login + refresh) now use `SameSite=none; Secure=True` when `APP_ENV == "production"`, and fall back to configured values for local dev.

## FILES_CHANGED
 - backend/migrations/versions/a1b2c3d4e5f6_add_category_image_url.py (deleted)
 - backend/migrations/versions/c4d5e6f7a8b9_add_category_image_url.py (created)
 - backend/app/api/v1/auth.py (cookie SameSite fix)

## OUTCOME
Committed and pushed as 2e7dd8e. Railway will auto-run `alembic upgrade head` on redeploy, adding the `categories.image_url` column. Users must re-login after deploy to get cookies with the new SameSite=none attribute.

**Prerequisite:** Ensure `APP_ENV=production` is set in Railway environment variables.
