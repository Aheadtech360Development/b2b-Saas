---
id: "062"
title: Production Deployment Prep Railway Vercel
stage: green
date: 2026-03-30
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Prepare AF Apparels for production deployment on Railway (backend) + Vercel (frontend)
labels: ["deployment","railway","vercel","cors","cookies","production"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/core/config.py
  - backend/app/main.py
  - backend/app/api/v1/auth.py
  - backend/requirements.txt
  - backend/Procfile
  - backend/railway.json
  - backend/.env.example
  - frontend/next.config.ts
  - frontend/.env.production
tests:
  - manual: curl http://localhost:8000/health → {"status":"ok","version":"1.0.0","db":"ok","redis":"ok"}
  - manual: docker compose restart backend frontend — both started successfully
---

## Prompt

Prepare AF Apparels for production deployment on Railway (backend) + Vercel (frontend). Steps:
1. Update CORS to allow Vercel domains
2. Add COOKIE_SECURE/COOKIE_DOMAIN/COOKIE_SAMESITE to config
3. Create backend/Procfile
4. Create backend/railway.json
5. Add version to /health endpoint
6. Add gunicorn to requirements.txt
7. Create frontend/.env.production
8. Update next.config.ts rewrites for all environments
9. Verify api-client.ts base URL
10. Create backend/.env.example
11. Update cookie settings in auth.py to use settings values

## Response snapshot

**Config changes:**
- `config.py`: Added `COOKIE_SECURE: bool = False`, `COOKIE_DOMAIN: str | None = None`, `COOKIE_SAMESITE: str = "lax"`. `FRONTEND_URL` and `ALLOWED_ORIGINS` were already present.
- `main.py`: Added `allow_origin_regex=r"https://.*\.vercel\.app"` to CORSMiddleware (Starlette doesn't support glob patterns in allow_origins — regex is the correct approach). Added `version: "1.0.0"` to existing /health response.
- `auth.py`: Updated all 3 cookie calls (login set_cookie, logout delete_cookie, refresh set_cookie) to use `settings.COOKIE_SECURE`, `settings.COOKIE_SAMESITE`, `settings.COOKIE_DOMAIN` instead of hardcoded values.
- `requirements.txt`: Added `gunicorn==21.2.0`. `uvicorn[standard]` already present at 0.41.0, `psycopg2-binary` already at 2.9.11.

**New files:**
- `backend/Procfile`: web/worker/beat process definitions for Railway
- `backend/railway.json`: nixpacks builder, `alembic upgrade head && uvicorn` start command, /health check
- `backend/.env.example`: all env vars documented with production values
- `frontend/.env.production`: placeholder with Railway/reCAPTCHA vars

**next.config.ts:**
- Rewrites now apply in ALL environments (not just development). This keeps cookies same-origin via Vercel's proxy and avoids CORS preflight complexity.
- Added `*.railway.app` and `localhost` to image `remotePatterns`.

**api-client.ts**: Already correct — uses `process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'` with proper SSR/CSR detection.

## Outcome

- ✅ Impact: Backend ready for Railway deploy; frontend ready for Vercel; cross-domain auth via cookie settings configurable per environment
- 🧪 Tests: /health returns {"status":"ok","version":"1.0.0","db":"ok","redis":"ok"}; local docker compose restart successful
- 📁 Files: 9 files modified/created
- 🔁 Next prompts: Set Railway env vars (COOKIE_SECURE=true, COOKIE_SAMESITE=none, ALLOWED_ORIGINS=https://app.vercel.app, FRONTEND_URL=...), then set Vercel NEXT_PUBLIC_API_URL to Railway URL
- 🧠 Reflection: Vercel rewrites proxy /api/* to Railway backend — this makes cookies same-origin from the browser's perspective, eliminating the need for SameSite=None in most cases. Only needed if frontend calls backend directly.

## Evaluation notes (flywheel)

- Failure modes observed: Starlette CORSMiddleware does not support glob patterns (*.vercel.app) in allow_origins — must use allow_origin_regex instead
- Graders run and results (PASS/FAIL): health check verified ✅
- Prompt variant (if applicable): null
- Next experiment: Test cross-domain cookie flow end-to-end with staging Railway + Vercel preview deployments
