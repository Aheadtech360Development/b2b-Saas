# ADR-003: JWT Authentication and Session Management

- **Status:** Accepted
- **Date:** 2026-03-09
- **Feature:** 001-b2b-wholesale-platform

- **Context:** The platform must authenticate B2B wholesale buyers and admin users across a two-service architecture (Next.js frontend + FastAPI backend). The auth mechanism must support: short session TTLs for security, seamless token refresh for long browsing sessions, role-based access control (customer / owner / admin), company-level access isolation, and token revocation on logout. The platform targets 500 concurrent users with < 200ms API p95 latency — meaning auth overhead must be minimal.

## Decision

Stateless JWT-based authentication with short-lived access tokens and rotating refresh tokens:

- **Access token**: HS256 JWT, 15-minute TTL, payload includes `user_id`, `company_id`, `role`, `pricing_tier_id`, `is_admin`, `jti`
- **Refresh token**: HS256 JWT, 7-day TTL, `type: refresh`, stored in httpOnly `SameSite=Strict` cookie by the frontend
- **Frontend storage**: Access token in Zustand store (JavaScript memory only — not localStorage, not sessionStorage)
- **Auto-refresh**: `api-client.ts` intercepts 401 responses, calls `POST /api/v1/auth/refresh`, retries original request transparently
- **Refresh token rotation**: Each refresh issues a new refresh token (old one invalidated)
- **Logout/revocation**: Refresh token's `jti` blacklisted in Redis (TTL = remaining refresh token lifetime); access token expires naturally (15-min max exposure)
- **Middleware**: `AuthMiddleware` decodes and validates every request; injects `request.state.user_id`, `is_admin`, `company_id`, `pricing_tier_id` — eliminating per-route DB lookups for auth
- **Company suspension check**: Middleware queries DB for company status on every non-admin, non-public request (single `SELECT status` query with async session)

## Consequences

### Positive

- No server-side session store required for auth validation — stateless JWT validation is fast (~0.1ms, no DB hit)
- Pricing tier and company context injected at middleware level — eliminates per-route DB queries for this data
- 15-minute access token TTL limits exposure window if token is intercepted
- httpOnly cookie for refresh token prevents XSS-based theft
- Redis blacklist enables immediate logout with < 1ms overhead
- Token payload carries role claims — RBAC checks are fast (`require_admin()` checks `request.state.is_admin`)

### Negative

- **Access token revocation gap**: If a user is suspended between token issue and expiry, they retain access for up to 15 minutes. The company suspension check mitigates this for company suspensions, but individual user bans have the same window.
- **Company suspension DB query on every request**: Every non-admin authenticated request makes a `SELECT status FROM companies WHERE id = ?`. Under high load, this adds latency and DB load. (Mitigatable with a short Redis cache on company status.)
- **Refresh token in cookie**: If the frontend and backend are on different origins in development, `SameSite=Strict` prevents the cookie from being sent — complicating local development setups.
- **Token size**: Payload includes 5 claims (user_id, company_id, role, pricing_tier_id, is_admin); decoded on every request.
- **No native token introspection endpoint**: External services cannot verify tokens without access to the JWT secret.

## Alternatives Considered

### Alternative A: Server-side sessions (Redis session store)
Store session data in Redis, issue opaque session cookies to the browser.

- **Pros**: Instant revocation; session data mutable without re-issuing tokens; simpler frontend (no token management).
- **Cons**: Every request requires a Redis lookup (latency + coupling); Redis becomes a critical path dependency; scales less cleanly across multiple backend instances.
- **Verdict**: Rejected — JWT's statelessness is preferred for a distributed system; Redis is already a dependency but for non-critical-path use.

### Alternative B: Auth0 / Clerk / third-party identity provider
Delegate authentication to a managed identity provider.

- **Pros**: OAuth2/OIDC standards; social login; MFA out-of-the-box; no auth code to maintain.
- **Cons**: External dependency for a core security function; additional cost; custom B2B roles (company_id, pricing_tier_id in claims) require custom claims setup; latency on every token validation if using remote introspection.
- **Verdict**: Rejected for MVP — custom wholesale role structure makes standard IdP mapping complex; team prefers full control over auth logic.

### Alternative C: Long-lived access tokens (no refresh)
Issue a single 24–72 hour access token; no refresh flow.

- **Pros**: Simpler implementation; no 401 intercept logic; no refresh token rotation complexity.
- **Cons**: Large exposure window if token is intercepted; no graceful session extension; constitution specifies 15-minute TTL.
- **Verdict**: Rejected — security posture unacceptable for a B2B platform with financial transactions.

## References

- Feature Spec: `specs/001-b2b-wholesale-platform/spec.md`
- Implementation Plan: `specs/001-b2b-wholesale-platform/plan.md` (Authentication & Authorization section)
- Constitution: `.specify/memory/constitution.md` (Article V — Security)
- Implementation: `backend/app/core/security.py`, `backend/app/middleware/auth_middleware.py`
- Related ADRs: ADR-002 (Two-Service Architecture)
