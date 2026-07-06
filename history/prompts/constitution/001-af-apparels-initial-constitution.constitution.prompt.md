---
id: "001"
title: AF Apparels Initial Constitution
stage: constitution
date: 2026-03-06
surface: agent
model: claude-sonnet-4-6
feature: none
branch: master
user: AheadTech360
command: /sp.constitution
labels: ["constitution","architecture","standards","security","testing","performance"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - .specify/memory/constitution.md
  - history/prompts/constitution/001-af-apparels-initial-constitution.constitution.prompt.md
tests:
  - none
---

## Prompt

# AF Apparels — Project Constitution

## Preamble

This constitution governs all development decisions for the AF Apparels B2B Wholesale E-Commerce Platform. Every specification, plan, task, and implementation must comply with these principles. Deviations require explicit documentation and justification.

---

## Article I — Architecture & Separation of Concerns

The platform is built as a two-service architecture with strict boundaries:

- **Frontend (Next.js):** Handles all rendering, user interaction, and client-side state. Communicates with the backend exclusively through versioned REST API endpoints. Never accesses the database directly.
- **Backend (FastAPI):** Owns all business logic, database access, authentication, integrations, and background jobs. Exposes a clean REST API. Never renders HTML or manages UI state.
- **Database (PostgreSQL):** Single source of truth for all persistent data. Accessed only through the backend ORM (SQLAlchemy). No raw SQL in application code except for performance-critical queries with explicit justification.
- **Cache (Redis):** Used for sessions, cart persistence, rate limiting, and frequently-accessed read data. Never used as a primary data store.
- **Background Workers (Celery):** Handle all async operations: email sending, QuickBooks sync, price list generation, bulk imports, abandoned cart detection. Jobs must be idempotent and retryable.

All API endpoints must be versioned under `/api/v1/`. No unversioned endpoints are permitted.

---

## Article II — Technology Standards

All dependencies must use the latest stable versions at the time of implementation:

- **Frontend:** Next.js (latest stable), TypeScript (strict mode), Tailwind CSS, shadcn/ui, Zustand (cart/auth state only)
- **Backend:** FastAPI, Python 3.11+, SQLAlchemy 2.x, Alembic, Celery, Pydantic v2
- **Database:** PostgreSQL 16 or 17 (latest stable), Redis 7.x
- **Testing:** Vitest + React Testing Library (frontend), pytest + pytest-asyncio (backend), Playwright (E2E)
- **Infrastructure:** NGINX, Ubuntu 24.04 LTS, Docker Compose (local dev), GitHub Actions (CI/CD)

[...remaining 8 Articles as provided verbatim in the full user input...]

## Governance

- This constitution supersedes all other project guidelines.
- Amendments require explicit documentation and justification.
- All code reviews must verify compliance with these principles.
- Complexity must be justified. Simpler solutions are always preferred.
- When in doubt, choose the approach that is easier to understand, test, and maintain.

## Response snapshot

Constitution v1.0.0 ratified for AF Apparels B2B Wholesale E-Commerce Platform.
All 10 Articles from the user input were mapped into the constitution template:
- Articles I–VII → Core Principles section
- Articles VIII–X → Operational Standards section
- Governance section populated with amendment procedure and versioning policy

Sync Impact Report prepended as HTML comment. All template placeholders resolved.
Dependent templates reviewed — no updates required. PHR created at
history/prompts/constitution/001-af-apparels-initial-constitution.constitution.prompt.md.

## Outcome

- ✅ Impact: Project constitution written to .specify/memory/constitution.md (v1.0.0)
- 🧪 Tests: none (constitution document, no code tests)
- 📁 Files: .specify/memory/constitution.md created/updated
- 🔁 Next prompts: /sp.specify <feature-name> to start first feature spec
- 🧠 Reflection: Clean first-ratification from blank template; all 10 Articles
  captured with MUST/SHOULD language upgrade for precision.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
