---
id: 135
title: Fix Style-Sheets 500 + Upload 404
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Fix /api/v1/admin/style-sheets 500 (missing tables) and POST /api/v1/upload 404 (raw fetch hitting Vercel instead of Railway)"
labels: ["backend","bugfix","upload","cors","tables"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/main.py
  - backend/app/api/v1/admin/style_sheets.py
  - backend/app/api/v1/admin/product_specs.py
  - frontend/src/app/(admin)/admin/style-sheets/page.tsx
  - frontend/src/app/(admin)/admin/product-specs/page.tsx
tests:
  - manual: GET /api/v1/admin/style-sheets returns [] (not 500) after redeploy
  - manual: GET /api/v1/admin/product-specs returns [] (not 500) after redeploy
  - manual: POST /api/v1/upload with image file returns { url, file_name, type }
  - manual: POST /api/v1/upload with PDF file returns { url, file_name, type }
  - manual: Admin style-sheets page — image upload uses apiClient.postForm and succeeds
  - manual: Railway logs show [ROUTE] lines for all registered routes including POST /api/v1/upload
---

## Prompt

Fix two backend issues:

Issue 1: /api/v1/admin/style-sheets returning 500. Most likely Alembic migration didn't run so tables don't exist. Add graceful table creation + error handling.

Issue 2: POST /api/v1/upload returning 404. Upload endpoint missing or not registered.

## Response snapshot

**Root causes found:**

Issue 1 (500): Alembic migration `r1s2t3u4v5w6` may not have run on the deployed DB (migration chain dependency on `q0r1s2t3u4v5` might not match actual deployed head). Tables `style_sheets` and `product_specs` don't exist.

Fix: Added `_ensure_content_tables()` in `main.py` that runs `CREATE TABLE IF NOT EXISTS` for both tables using raw SQL — called from `lifespan` right before email template seeding. Also added `try/except` to GET endpoints in both routers so 500s surface the real DB error message in `detail` instead of an opaque crash.

Issue 2 (upload 404): The admin pages were using raw `fetch("/api/v1/upload", ...)` — a relative URL. On Vercel (`https://af-apparel-sigma.vercel.app`), this resolves to the Vercel host, not the Railway backend. `apiClient` prepends `NEXT_PUBLIC_API_URL` (Railway URL) to all calls; raw `fetch` does not.

Fix: Changed both admin pages to use `apiClient.postForm("/api/v1/upload", fd)` which correctly routes to the Railway backend URL.

**Additional**: Added route logging after all `app.include_router()` calls — prints `[ROUTE] METHOD /path` for every registered route in Railway startup logs.

## Outcome

- ✅ Impact: style_sheets and product_specs tables auto-created at startup even if Alembic migration failed
- ✅ GET /api/v1/admin/style-sheets and /product-specs return meaningful 500 detail instead of crashing
- ✅ Upload calls in admin pages now use apiClient.postForm → correct Railway backend URL
- ✅ Route log printed at startup for Railway debugging
- 🧪 Tests: Manual
- 📁 Files: 5 files modified

## Evaluation notes (flywheel)

- Failure modes observed: raw fetch() in admin client components bypasses apiClient base URL — always use apiClient.postForm for multipart uploads
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
