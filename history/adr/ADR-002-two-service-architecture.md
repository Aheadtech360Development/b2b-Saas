# ADR-002: Two-Service Full-Stack Architecture

- **Status:** Accepted
- **Date:** 2026-03-09
- **Feature:** 001-b2b-wholesale-platform

- **Context:** AF Apparels requires a B2B wholesale platform to replace their existing Shopify store. The team must decide on the top-level architectural pattern: how many services, how they communicate, and where business logic lives. The constitution (Article I) mandates a two-service architecture with a strict API boundary.

## Decision

Build two independently deployable services that communicate exclusively via a versioned REST API:

- **Frontend**: Next.js 15 (App Router, TypeScript strict) — handles rendering, routing, client state
- **Backend**: FastAPI (Python 3.11+) — handles all business logic, data persistence, external integrations
- **API boundary**: All communication via `GET/POST/PATCH/DELETE /api/v1/*`; frontend never touches DB directly
- **State boundary**: Zustand used only for cart and auth state; all server state fetched via service layer
- **Infrastructure**: Both services run as Docker containers behind NGINX on a single VPS (DigitalOcean Ubuntu 24.04)

## Consequences

### Positive

- Clear separation of concerns; frontend and backend can evolve independently
- Different teams can own each service; backend skills (Python/FastAPI) and frontend skills (React/TypeScript) don't need to overlap
- Backend is independently testable via OpenAPI; frontend mocks the API during component tests
- NGINX handles SSL termination, rate limiting, and routing — neither service handles infrastructure concerns
- Scales independently: can add more Celery workers without touching Next.js

### Negative

- Additional operational overhead vs a monolith (two build pipelines, two Dockerfiles, two deployment concerns)
- Network round-trip for every data fetch (vs server-rendered monolith with direct DB access)
- Type drift risk between Pydantic schemas (backend) and TypeScript types (frontend) unless kept in sync manually
- CORS configuration required; auth token management more complex than session cookies in a monolith

## Alternatives Considered

### Alternative A: Django/Rails Monolith with server-rendered templates
Single Python/Ruby application serving HTML, with optional HTMX for interactivity.

- **Pros**: Simpler deployment; no API boundary; less operational overhead.
- **Cons**: Wholesale B2B UIs (variant matrix, quick order, bulk cart) require rich client-side interactivity that HTMX struggles with; poor mobile PWA support; harder to separate frontend and backend developers.
- **Verdict**: Rejected — interactivity requirements necessitate a proper JS frontend.

### Alternative B: Next.js with server actions (no separate FastAPI)
Single Next.js application using server actions or Route Handlers to access PostgreSQL directly (e.g., via Prisma).

- **Pros**: Simpler stack; server actions colocate data and UI; TypeScript end-to-end.
- **Cons**: Node.js ecosystem for QuickBooks/Stripe integrations less mature than Python; Celery has no direct equivalent; mixing UI and business logic violates the team's constitution; harder to test business logic in isolation.
- **Verdict**: Rejected — Python ecosystem advantage for QB/Stripe/Celery is decisive; constitution mandates separation.

### Alternative C: Microservices (separate services per domain)
Separate deployments for products, orders, payments, QB sync, etc.

- **Pros**: Independent scaling per domain; fault isolation.
- **Cons**: Dramatically increased operational complexity; premature for this scale; network latency between services; distributed transactions; overkill for a team of this size.
- **Verdict**: Rejected — single-team project at early scale; two services is the right granularity.

## References

- Feature Spec: `specs/001-b2b-wholesale-platform/spec.md`
- Implementation Plan: `specs/001-b2b-wholesale-platform/plan.md` (Technical Approach section)
- Constitution: `.specify/memory/constitution.md` (Article I)
- Related ADRs: ADR-003 (JWT Auth), ADR-004 (Async Jobs)
