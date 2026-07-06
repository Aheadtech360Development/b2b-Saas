<!--
=============================================================================
SYNC IMPACT REPORT
=============================================================================
Version change: 0.0.0 (template) → 1.0.0
Bump type: MAJOR — First ratification of project constitution from blank template.

Modified principles:
  [PRINCIPLE_1_NAME] → I. Architecture & Separation of Concerns (new)
  [PRINCIPLE_2_NAME] → II. Technology Standards (new)
  [PRINCIPLE_3_NAME] → III. Code Quality & Standards (new)
  [PRINCIPLE_4_NAME] → IV. Testing Standards (new)
  [PRINCIPLE_5_NAME] → V. Security (new)
  [PRINCIPLE_6_NAME] → VI. Database Design Principles (new)

Added sections:
  - Article VII: Phase-Based Development & Manual Testing
  - Article VIII: Error Handling & Resilience
  - Article IX: Performance Standards
  - Article X: Documentation

Removed sections:
  - [SECTION_2_NAME] placeholder (replaced by Articles VII–VIII)
  - [SECTION_3_NAME] placeholder (replaced by Articles IX–X)

Templates reviewed:
  ✅ .specify/templates/plan-template.md — Constitution Check gate retained; no
     outdated references. No update required.
  ✅ .specify/templates/spec-template.md — No constitution-specific references.
     No update required.
  ✅ .specify/templates/tasks-template.md — Phase structure aligns with Article VII.
     No update required.
  ✅ .specify/templates/phr-template.prompt.md — No references to removed
     placeholders. No update required.

Follow-up TODOs:
  - TODO(RATIFICATION_DATE): Confirm exact project start date with project owner
    if 2026-03-06 is incorrect; this is set to today's date as best available.
  - No other deferred placeholders.
=============================================================================
-->

# AF Apparels Constitution

## Preamble

This constitution governs all development decisions for the AF Apparels B2B Wholesale
E-Commerce Platform. Every specification, plan, task, and implementation MUST comply
with these principles. Deviations require explicit documentation and justification.

---

## Core Principles

### I. Architecture & Separation of Concerns

The platform is built as a two-service architecture with strict boundaries:

- **Frontend (Next.js):** Handles all rendering, user interaction, and client-side
  state. Communicates with the backend exclusively through versioned REST API endpoints.
  MUST NOT access the database directly.
- **Backend (FastAPI):** Owns all business logic, database access, authentication,
  integrations, and background jobs. Exposes a clean REST API. MUST NOT render HTML
  or manage UI state.
- **Database (PostgreSQL):** Single source of truth for all persistent data. Accessed
  only through the backend ORM (SQLAlchemy). No raw SQL in application code except for
  performance-critical queries with explicit justification.
- **Cache (Redis):** Used for sessions, cart persistence, rate limiting, and
  frequently-accessed read data. MUST NOT be used as a primary data store.
- **Background Workers (Celery):** Handle all async operations: email sending,
  QuickBooks sync, price list generation, bulk imports, abandoned cart detection.
  Jobs MUST be idempotent and retryable.

All API endpoints MUST be versioned under `/api/v1/`. No unversioned endpoints are
permitted.

### II. Technology Standards

All dependencies MUST use the latest stable versions at the time of implementation:

- **Frontend:** Next.js (latest stable), TypeScript (strict mode), Tailwind CSS,
  shadcn/ui, Zustand (cart/auth state only)
- **Backend:** FastAPI, Python 3.11+, SQLAlchemy 2.x, Alembic, Celery, Pydantic v2
- **Database:** PostgreSQL 16 or 17 (latest stable), Redis 7.x
- **Testing:** Vitest + React Testing Library (frontend), pytest + pytest-asyncio
  (backend), Playwright (E2E)
- **Infrastructure:** NGINX, Ubuntu 24.04 LTS, Docker Compose (local dev),
  GitHub Actions (CI/CD)

**Dependency Rules:**

- Always prefer well-established, actively maintained libraries over custom
  implementations.
- No library may be added without justification. Check if the need can be met by
  existing dependencies first.
- All dependency versions MUST be pinned in lock files. No floating versions in
  production.
- Dependency vulnerability scans (`npm audit`, `pip-audit`) MUST run as part of
  the CI pipeline.

### III. Code Quality & Standards

**General:**

- All code MUST be written in TypeScript (frontend) or Python (backend). No JavaScript
  files in the frontend. No untyped Python code in the backend.
- Every function, class, and module MUST have a clear single responsibility.
- Business logic MUST live in dedicated service layers, never in route handlers or
  UI components.
- No code duplication. Extract shared logic into utility modules.
- Maximum function length: 50 lines. Functions exceeding this MUST be refactored;
  exceptions require explicit justification.
- All configuration values (API keys, URLs, thresholds) MUST come from environment
  variables, never hardcoded.

**Frontend Specific:**

- Use Server Components by default. Client Components only when interactivity is
  required (forms, state, event handlers).
- All API calls MUST go through a centralized API client with automatic token refresh
  and error handling.
- No direct `fetch` calls in components. Use service functions.
- All forms MUST validate client-side AND server-side. Client-side validation is for
  UX only, never trusted for security.
- All images MUST use Next.js Image component or be served through the image
  optimization pipeline.

**Backend Specific:**

- All endpoints MUST use Pydantic models for request validation and response
  serialization.
- All database operations MUST use SQLAlchemy ORM. Raw SQL requires explicit
  justification in a code comment.
- All write operations (create, update, delete) MUST be wrapped in database
  transactions.
- All external API calls (Stripe, QuickBooks, SendGrid) MUST go through dedicated
  service modules with error handling and retry logic.
- All background jobs MUST be idempotent — running the same job twice with the same
  input must produce the same result.

### IV. Testing Standards (NON-NEGOTIABLE)

Testing is mandatory. No feature is considered complete without tests.

**Coverage Targets:**

| Scope | Minimum |
|---|---|
| Overall project | 70% |
| Critical paths (auth, checkout, payments, pricing) | 90% |
| Business logic (MOQ, MOV, shipping brackets, inventory) | 85% |
| API endpoints | 80% |
| UI components | 65% |

**Testing Rules:**

- Every feature MUST include unit tests alongside the implementation, not after.
- Every API endpoint MUST have integration tests using FastAPI TestClient.
- Every critical user flow MUST have an E2E test in Playwright.
- Tests MUST follow Arrange-Act-Assert structure with descriptive names.
- Tests MUST be isolated — each test creates and destroys its own data. No shared
  mutable state between tests.
- External services (Stripe, QuickBooks, SendGrid) MUST be mocked in unit and
  integration tests. Sandbox testing is for E2E validation only.
- CI pipeline MUST block merges if tests fail or coverage drops below thresholds.

**Test Data:**

- Use Factory Boy (backend) for generating test data.
- Use realistic test data (not lorem ipsum) — real product names, valid email formats,
  realistic prices.
- Never use production data in tests.
- Test database is a separate PostgreSQL instance, auto-rolled-back after each test.

### V. Security (NON-NEGOTIABLE)

- All passwords MUST be hashed with bcrypt. Minimum 8 characters, mixed case, at
  least one number.
- JWT access tokens: 15-minute TTL. Refresh tokens: 7-day TTL, httpOnly cookies,
  one-time use with rotation.
- All API endpoints that modify data MUST require authentication. Role-based access
  control enforced in middleware.
- All user input MUST be validated and sanitized. Parameterized queries only
  (enforced by ORM).
- Rate limiting on all public endpoints: 100 requests/minute per IP.
- CSRF protection on all state-changing requests.
- File uploads restricted to allowed types (images: jpg/png/webp; documents: pdf/csv)
  with size limits.
- No secrets in frontend bundles. All sensitive values in backend environment
  variables only.
- SSL/HTTPS enforced everywhere. HTTP MUST redirect to HTTPS.
- S3 buckets MUST NOT be publicly writable.
- Database MUST NOT be accessible from the public internet.

### VI. Database Design Principles

- Every table MUST have a primary key (`id`), `created_at`, and `updated_at`
  timestamps.
- Use UUID or auto-incrementing integers for primary keys (consistent within the
  project).
- All relationships MUST have proper foreign key constraints with appropriate
  CASCADE/SET NULL behavior.
- Every migration MUST include both `upgrade()` and `downgrade()` functions.
- Indexes MUST exist on all columns used in WHERE clauses, JOINs, and ORDER BY
  operations.
- Soft deletes preferred over hard deletes for business entities (products, orders,
  companies). Use `is_active` or `status` fields.
- All monetary values MUST be stored as `DECIMAL(10,2)`, never floating point.
- All date/time values MUST be stored as UTC. Timezone conversion happens only in
  the presentation layer.

### VII. Phase-Based Development & Manual Testing

Development follows a strict phase-based approach:

- Each phase has defined objectives, deliverables, and quality gates.
- **Quality gates are mandatory.** No phase may begin until the previous phase's
  quality gate checklist is fully passed.
- After each phase, the developer performs manual localhost testing of all new
  features before proceeding.
- Every phase ends with a working, testable increment of the platform.
- Automated tests MUST pass (100%) before any phase is considered complete.

**Commit Strategy:**

- Commits MUST be frequent and atomic — one logical change per commit.
- Commit messages MUST follow conventional format: `feat:`, `fix:`, `refactor:`,
  `test:`, `docs:`, `chore:`.
- Feature branches merge to `develop` via PR. `develop` merges to `main` only for
  releases.

---

## Operational Standards

### VIII. Error Handling & Resilience

- All API endpoints MUST return a consistent error response format:
  `{ "error": { "code": "...", "message": "...", "details": [...] } }`
- All external service calls MUST have timeout limits (30 seconds max).
- All background jobs MUST have retry logic with exponential backoff.
- QuickBooks sync failures MUST NOT block order processing. Orders are always created
  first; sync is async.
- Payment failures MUST be handled gracefully with clear user-facing error messages
  and retry options.
- All errors MUST be logged to Sentry with sufficient context for debugging.

### IX. Performance Standards

- Page load time: < 3 seconds (measured by Lighthouse).
- API response time: < 200ms at p95 under normal load.
- Lighthouse scores: > 90 on Performance, Accessibility, Best Practices, SEO.
- Product images: served as WebP with JPEG fallback, in 3 sizes (thumbnail 150px,
  medium 400px, large 800px).
- Database queries: no N+1 queries. Use eager loading for related data.
- Redis caching: product listings (5 min TTL), search results (2 min TTL),
  sessions (24 hour TTL).
- Cache invalidation: update/delete operations MUST invalidate relevant cache entries
  immediately.

### X. Documentation

- API documentation MUST be auto-generated from FastAPI (OpenAPI/Swagger) and always
  up-to-date.
- Every module/service MUST have a docstring explaining its purpose and
  responsibilities.
- Complex business logic MUST have inline comments explaining the "why", not the
  "what".
- Database schema changes MUST be documented in the migration file description.
- All environment variables MUST be documented in `.env.example` with descriptions.

---

## Governance

- This constitution supersedes all other project guidelines.
- Amendments require explicit documentation and justification.
- All code reviews MUST verify compliance with these principles.
- Complexity MUST be justified. Simpler solutions are always preferred.
- When in doubt, choose the approach that is easier to understand, test, and maintain.

**Amendment Procedure:**
1. Propose change with rationale in a PR against `.specify/memory/constitution.md`.
2. Bump `CONSTITUTION_VERSION` per semantic versioning (MAJOR/MINOR/PATCH).
3. Update `LAST_AMENDED_DATE` to the amendment date.
4. Run the consistency propagation checklist against all dependent templates.
5. Obtain explicit approval before merging.

**Versioning Policy:**
- MAJOR: Backward-incompatible governance/principle removals or redefinitions.
- MINOR: New principle/section added or materially expanded guidance.
- PATCH: Clarifications, wording fixes, non-semantic refinements.

**Compliance Review:** All PRs are subject to constitution compliance checks.
Non-compliant PRs MUST NOT be merged without documented justification.

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
