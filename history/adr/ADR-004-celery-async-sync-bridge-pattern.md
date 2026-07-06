# ADR-004: Celery Async/Sync Bridge Pattern for Background Tasks

- **Status:** Accepted
- **Date:** 2026-03-09
- **Feature:** 001-b2b-wholesale-platform

- **Context:** The platform uses Celery (with Redis broker) for background jobs: QB sync, email delivery, price list generation, inventory checks, and abandoned cart detection. FastAPI uses SQLAlchemy 2.x with async sessions (`AsyncSession`), meaning all DB access is `async def`. Celery tasks, however, are fundamentally synchronous Python functions — they run in a regular (non-async) event loop context.

  This creates an impedance mismatch: Celery tasks that need to query the database must bridge from a sync execution context into an async one.

## Decision

Celery tasks that require database access use the **asyncio event loop bridge pattern**:

```python
def _run_async(coro):
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()
```

Each Celery task creates a **new event loop per invocation** (not reusing a module-level loop), runs the async DB coroutine to completion, closes the loop, and continues synchronously. Lazy imports (`from app.models.X import Y` inside the async helper function) avoid circular import issues at module load time.

This pattern is used in:
- `backend/app/tasks/email_tasks.py` — all 9 email task types
- `backend/app/tasks/quickbooks_tasks.py` — `sync_customer_to_qb`, `sync_order_invoice_to_qb`
- `backend/app/tasks/inventory_tasks.py` — `check_low_stock_levels`, `generate_bulk_asset_zip`
- `backend/app/tasks/cart_tasks.py` — `detect_abandoned_carts`

## Consequences

### Positive

- Allows reuse of the existing async SQLAlchemy infrastructure (models, session factory, `AsyncSessionLocal`) without duplicating sync alternatives
- No additional dependency (no `gevent`, no `eventlet`, no `asyncio.run()` deprecation concerns)
- Each task gets a clean event loop — no shared state between task invocations
- Lazy imports inside async helpers prevent circular import chains common in FastAPI/Celery combos

### Negative

- **New event loop per task call**: Creating and closing a new event loop has a small overhead (~0.5–2ms) per task invocation. At high task volumes, this accumulates.
- **`asyncio.set_event_loop(loop)` is not thread-safe**: Celery may run multiple concurrent tasks in threads; `set_event_loop` is global per thread but Celery workers use processes (prefork model by default), so this is safe under process-based concurrency but would break under eventlet/gevent concurrency models.
- **Cannot use `asyncio.get_event_loop()` reliably in Python 3.10+**: The `get_event_loop()` call emits a DeprecationWarning in Python 3.10+ when no running loop exists. Tasks using this pattern in `check_low_stock_levels` (via `asyncio.get_event_loop().run_until_complete()`) should be updated to use `_run_async()` helper.
- **Error propagation**: Exceptions inside the async coroutine propagate through `run_until_complete()` as expected, but tracebacks may appear doubled in Celery logs.
- **Testing complexity**: Unit tests for Celery tasks must mock the async DB calls; the bridge adds an indirection layer.

## Alternatives Considered

### Alternative A: Synchronous SQLAlchemy sessions in Celery tasks
Maintain a parallel sync `SessionLocal` (using `create_engine` with `psycopg2`) for Celery tasks only, separate from the async `AsyncSessionLocal` used by FastAPI.

- **Pros**: No async bridge; straightforward sync code; no event loop overhead.
- **Cons**: Two separate connection pool configurations to maintain; sync SQLAlchemy queries in tasks vs async in routes can diverge; `DATABASE_URL_SYNC` (psycopg2) must be configured alongside `DATABASE_URL` (asyncpg); higher DB connection count.
- **Verdict**: Viable and arguably cleaner — the `DATABASE_URL_SYNC` already exists in the codebase (used by Alembic). Should be considered as an alternative if the async bridge causes issues.

### Alternative B: Celery with `asyncio` native support (celery-aio-pool / gevent)
Run Celery with an async worker pool (`gevent` or `asyncio`-compatible mode) so that tasks can be `async def` natively.

- **Pros**: Tasks can use `await` directly; no bridge required; consistent async code style throughout.
- **Cons**: `gevent` monkey-patching causes subtle bugs with SQLAlchemy's asyncpg driver; `asyncio` pool support in Celery is experimental and not production-stable as of 2026; significantly increases deployment complexity.
- **Verdict**: Rejected — instability risk outweighs the benefit.

### Alternative C: Dramatiq + asyncio-native workers
Replace Celery with Dramatiq (async-native task runner) or ARQ (asyncio job queue on Redis).

- **Pros**: ARQ is fully async — tasks are `async def`, uses aioredis, no bridge needed.
- **Cons**: Breaking change from Celery; ARQ lacks Celery's retry primitives, beat scheduler maturity, and monitoring ecosystem (Flower); team already invested in Celery configuration.
- **Verdict**: Worth re-evaluating if Celery async pain increases significantly.

## Migration Path

If the async bridge pattern causes production issues, migrate Celery tasks to use synchronous SQLAlchemy via `DATABASE_URL_SYNC`:

1. Add `get_sync_db()` dependency using `create_engine` + `sessionmaker` with psycopg2
2. Replace `_run_async(_fetch())` calls with direct sync SQLAlchemy queries
3. Keep `AsyncSessionLocal` for FastAPI routes only
4. Remove `_run_async` helper and async inner functions from task files

## References

- Feature Spec: `specs/001-b2b-wholesale-platform/spec.md`
- Implementation Plan: `specs/001-b2b-wholesale-platform/plan.md` (Background Jobs section)
- Constitution: `.specify/memory/constitution.md` (Article I — Celery jobs idempotent and retryable)
- Implementation: `backend/app/tasks/email_tasks.py`, `backend/app/tasks/quickbooks_tasks.py`
- Related ADRs: ADR-001 (QB Token Storage), ADR-002 (Two-Service Architecture)
