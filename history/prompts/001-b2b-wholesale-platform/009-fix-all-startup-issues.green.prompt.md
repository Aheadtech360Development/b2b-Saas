---
id: 009
title: Fix All Startup Issues for Local Stack
stage: green
date: 2026-03-10
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: fix all startup/configuration issues preventing local stack from starting
labels: ["startup","docker","migrations","alembic","celery","nextjs","devops","bugfix"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - docker-compose.yml
  - backend/requirements.txt
  - backend/migrations/versions/001_initial_schema.py
  - backend/migrations/env.py
  - backend/app/models/user.py
  - backend/app/middleware/auth_middleware.py
  - backend/app/middleware/pricing_middleware.py
  - scripts/seed_data.py
  - frontend/Dockerfile
  - frontend/src/app/(admin)/admin/customers/[id]/page.tsx
  - frontend/src/app/(admin)/admin/dashboard/page.tsx
  - frontend/src/app/(admin)/admin/inventory/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/products/page.tsx
  - frontend/src/app/(admin)/admin/reports/page.tsx
  - frontend/src/app/(admin)/admin/returns/[id]/page.tsx
  - frontend/src/app/(admin)/admin/settings/page.tsx
tests:
  - curl http://localhost:8000/health → {"status":"ok","db":"ok","redis":"ok"}
  - curl http://localhost:3000/login → HTTP 200
  - docker-compose ps → all 6 services Up
---

## Prompt

Fix all startup issues preventing the AF Apparels B2B Wholesale Platform from starting locally. Verify the full stack starts correctly. Do NOT build new features. Do NOT change business logic. Only fix startup and configuration issues.

Known issues to fix:
1. `backend/migrations/env.py` uses `async_engine_from_config` — replace with synchronous `engine_from_config` using `DATABASE_URL_SYNC`
2. `docker-compose.yml` celery_beat uses `django_celery_beat.schedulers:DatabaseScheduler` — replace with built-in Celery scheduler
3. `docker-compose.yml` has obsolete `version: "3.9"` — remove it
4. Verify `DATABASE_URL_SYNC` exists in `backend/app/core/config.py`
5. Verify all model imports work inside the backend container

After fixing, run the 9-step startup sequence: rebuild backend → start postgres/redis → run migrations → run seed script → start backend → start celery_worker → start celery_beat → build/start frontend → final `docker-compose ps`.

## Response snapshot

Fixed 12 distinct issues across backend and frontend. All 6 services (postgres, redis, backend, celery_worker, celery_beat, frontend) are running.

**Fixes applied:**

1. **docker-compose.yml**: Removed `version: "3.9"`, replaced Django Celery Beat scheduler with built-in scheduler, added Docker-internal hostname overrides for DATABASE_URL/REDIS_URL, added `target: deps` to frontend build.

2. **Alembic migration chain**: Created missing `001_initial_schema.py` — all 32 tables and 8 enum types. Enum types use `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` pattern (PostgreSQL doesn't support `CREATE TYPE IF NOT EXISTS`). Tables created as pure raw SQL to avoid SQLAlchemy `_on_table_create` event firing and attempting duplicate enum creation.

3. **bcrypt/passlib incompatibility**: Pinned `bcrypt==3.2.2` in requirements.txt. bcrypt 4.x+ added strict 72-byte validation that breaks passlib 1.7.4's `detect_wrap_bug()` test.

4. **`auth_middleware.py`**: Added missing `require_admin` FastAPI dependency function (imported by admin route files but not defined).

5. **`pricing_middleware.py`**: Fixed `from app.core.database import AsyncSessionLocal as async_session_factory` (was `async_session_factory` which doesn't exist).

6. **`scripts/seed_data.py`**: Fixed `from app.models.inventory import Warehouse` (no `warehouse.py` module). Added all model imports to ensure SQLAlchemy relationship resolution.

7. **`frontend/Dockerfile`**: Changed `npm ci` → `npm install --legacy-peer-deps` (no lockfile; `@stripe/react-stripe-js` doesn't support React 19 peer deps).

8. **Next.js route conflicts**: Moved all admin routes from `(admin)/products/`, `(admin)/dashboard/`, etc. into `(admin)/admin/` subdirectory. Route groups don't add URL prefixes — `(admin)/products` and `(customer)/products` both resolved to `/products`, causing parallel page conflicts. Moving admin routes under `admin/` makes admin URLs `/admin/*`.

9. **Dynamic route param conflict**: Renamed `(admin)/products/[id]` → `(admin)/products/[slug]` and updated `useParams` destructuring.

10. **`app/models/user.py`**: Added `foreign_keys="[CompanyUser.user_id]"` to `company_memberships` relationship (CompanyUser has two FKs to users table).

**Verification:**
- `GET http://localhost:8000/health` → `{"status":"ok","db":"ok","redis":"ok"}`
- `GET http://localhost:3000/login` → HTTP 200
- `docker-compose ps` → all 6 services Up

## Outcome

- ✅ Impact: Full local stack operational — all 6 Docker services running, migrations applied, seed data loaded, health checks passing
- 🧪 Tests: Manual HTTP health checks — /health returns ok for db+redis; /login returns 200
- 📁 Files: 15+ files modified across backend, frontend, docker-compose, migrations, and scripts
- 🔁 Next prompts: Run E2E tests; verify admin login flow at /admin/dashboard; configure nginx for local SSL
- 🧠 Reflection: The biggest hidden issue was Next.js route group semantics — route groups are organizational only and don't affect URL structure, causing silent conflicts that only appear at build time

## Evaluation notes (flywheel)

- Failure modes observed: SQLAlchemy enum auto-creation in Alembic even with create_type=False; bcrypt major version breaking passlib compatibility; Docker localhost vs service-name hostname resolution; Next.js route group URL conflict semantics
- Graders run and results (PASS/FAIL): docker-compose ps (PASS), /health endpoint (PASS), /login page (PASS), alembic upgrade head (PASS), seed script (PASS)
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): Run Playwright E2E login test to verify full auth flow
