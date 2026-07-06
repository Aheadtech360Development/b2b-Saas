# ADR-001: QuickBooks Token Storage Strategy

- **Status:** Accepted
- **Date:** 2026-03-09
- **Feature:** 001-b2b-wholesale-platform

- **Context:** The platform must sync customer records and order invoices to QuickBooks Online (QBO) asynchronously via Celery workers. QBO uses OAuth 2.0, issuing short-lived access tokens (~1 hour) and long-lived refresh tokens (100 days). These tokens must be available at task runtime across potentially multiple Celery worker processes. The decision is where and how to store, refresh, and distribute these credentials.

  The initial implementation stores QB credentials (access token, refresh token, company ID) directly in the application's `.env` file, read at process startup into `settings.QB_ACCESS_TOKEN` / `settings.QB_REFRESH_TOKEN`. The `QuickBooksService` holds these values in instance-level attributes and refreshes them in-memory when a 401 is received.

  This is sufficient for a single-worker, single-process deployment but has meaningful risks for production.

## Decision

Store QuickBooks OAuth tokens in environment variables (`.env`) for the initial MVP deployment. `QuickBooksService` performs in-memory token refresh using the stored refresh token. The refreshed access token is held only in the service instance; it is **not** written back to `.env` or to any durable store.

- **Token source:** `settings.QB_ACCESS_TOKEN` / `settings.QB_REFRESH_TOKEN` (env vars)
- **Refresh mechanism:** `QuickBooksService.refresh_token_if_expired()` — synchronous httpx call to `https://oauth.intuit.com/oauth2/v1/tokens/bearer`
- **Refresh trigger:** `_needs_refresh()` check before every API call (lazy, in-memory expiry tracking)
- **Rate limiting:** Token bucket (400 req/min) implemented in `QuickBooksService._TokenBucket`
- **Error handling:** Up to 5 Celery retry attempts with exponential backoff; all attempts logged to `qb_sync_log`

## Consequences

### Positive

- Simple to implement and reason about for a single-worker deployment
- No additional infrastructure (no secrets manager, no extra DB table)
- Token refresh is transparent to callers — handled inside `QuickBooksService`
- Rate limiting via token bucket prevents QBO API quota violations
- All sync failures are observable and retryable via the admin QB dashboard

### Negative

- **Multi-worker split-brain risk**: Each Celery worker process holds its own in-memory token state. If Worker A refreshes the access token, Worker B still holds the old one. The first request from Worker B will receive a 401, trigger a second refresh (consuming the refresh token), and return a new access token — leaving Worker A with an invalidated token. Under concurrent load, this can cause cascading 401 errors until all workers converge.
- **Refresh token rotation loss**: QBO uses rotating refresh tokens. If a refresh succeeds in Worker A but the new refresh token is never persisted, a subsequent Worker B refresh will use the old (now invalidated) refresh token, requiring manual re-authorization via the QBO OAuth flow.
- **Process restart wipes state**: If the service restarts between a refresh and the next call, the access token is lost (though re-refresh will work as long as the refresh token in `.env` is still valid).
- **No audit trail for token changes**: Token rotations are invisible — they happen in-memory and are not logged.
- **Manual re-auth if refresh token expires** (100-day TTL): An admin must obtain new OAuth credentials and update `.env`, then restart workers.

## Alternatives Considered

### Alternative A: Database-backed token storage (`qb_tokens` table)
Store `access_token`, `refresh_token`, `expires_at`, `company_id` in a dedicated DB table. `QuickBooksService` reads from DB before each API call and writes back after each refresh. Use a DB row-level lock (`SELECT FOR UPDATE`) to prevent concurrent refresh races.

- **Pros**: Token state is consistent across all workers; refresh token rotation is persisted; audit trail via `updated_at`.
- **Cons**: DB round-trip on every QB API call adds latency (~2–5ms); requires a migration; lock contention under high concurrency.
- **Verdict**: Superior for multi-worker production; should be adopted in the next iteration.

### Alternative B: Redis-backed token storage
Store tokens in Redis with TTL equal to `expires_in`. Use `SET NX` (set-if-not-exists) + Lua script for atomic check-and-refresh to prevent concurrent refresh races.

- **Pros**: Sub-millisecond reads; distributed lock available via `SETNX`; no DB dependency.
- **Cons**: Redis is ephemeral — token lost on Redis flush/restart; adds coupling between QB service and Redis.
- **Verdict**: Good middle ground if Redis persistence is enabled; slightly more complex than DB approach.

### Alternative C: HashiCorp Vault / AWS Secrets Manager
Store tokens in a dedicated secrets manager; rotate via webhook on QB token refresh.

- **Pros**: Best-in-class security; centralized secrets rotation.
- **Cons**: Significant infrastructure overhead; overkill for this deployment scale.
- **Verdict**: Rejected for MVP; appropriate if platform scales to enterprise.

### Alternative D: Single Celery worker (constraint-based solution)
Configure `CELERY_WORKER_CONCURRENCY=1` to ensure only one worker process ever holds tokens.

- **Pros**: Eliminates split-brain without additional infrastructure.
- **Cons**: Bottleneck for all async jobs (email, inventory, QB all share one worker); unacceptable at scale.
- **Verdict**: Acceptable only as a temporary workaround.

## Migration Path

The recommended next step is **Alternative A (DB-backed)**, implemented as:

1. Add `QBTokenStore` model with `access_token`, `refresh_token`, `expires_at`, `company_id`, `updated_at`
2. Update `QuickBooksService` to load tokens from DB and use `SELECT FOR UPDATE` for refresh
3. Write back refreshed tokens to DB within the same transaction
4. Remove QB token env vars from `.env.example` (retain `QB_CLIENT_ID`, `QB_CLIENT_SECRET`, `QB_REDIRECT_URI`)
5. Add OAuth callback endpoint at `POST /api/v1/admin/quickbooks/oauth-callback` to receive initial tokens

## References

- Feature Spec: `specs/001-b2b-wholesale-platform/spec.md`
- Implementation Plan: `specs/001-b2b-wholesale-platform/plan.md` (Risk Register: "QuickBooks API rate limits / sync failures")
- Service: `backend/app/services/quickbooks_service.py`
- Celery tasks: `backend/app/tasks/quickbooks_tasks.py`
- PHR: `history/prompts/001-b2b-wholesale-platform/007-b2b-platform-implementation-phase18-23.green.prompt.md`
- Related ADRs: ADR-004 (Async Background Job Architecture)
