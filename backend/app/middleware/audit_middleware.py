"""The activity log: who did what to this brand, and when.

Every write through /api/v1/admin/* leaves a row, plus the attempts that were
refused — a denied action is usually the one an investigation starts from.

Nothing secret is written down. The body of a request is useful evidence and
also the place passwords and API keys arrive in, so values under a key that
looks like a credential are replaced before anything is stored. That is not a
nicety: creating a staff member used to record their plaintext password in a
table every brand admin can read.

The log is append-only in the database itself (migration 0043), so a brand
admin cannot erase their own tracks even by reaching the table directly.
"""
import json
import re
from typing import Any

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

AUDITED_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
ADMIN_PATH_PREFIX = "/api/v1/admin/"

# Paths that should NOT be audited (read-only or export endpoints)
AUDIT_EXCLUSIONS: set[str] = set()

# A key containing any of these holds something that must not be written down.
# Matched as substrings, so "api_key", "new_password" and "card_number" are all
# caught, and a key nobody thought of is more likely to be caught than missed.
SECRET_HINTS = (
    "password", "secret", "token", "api_key", "apikey", "private",
    "card", "cvc", "cvv", "ssn", "routing", "account_number", "credential",
    "authorization", "signature", "webhook",
)

REDACTED = "••• redacted •••"

# Bodies can be large (a product import, a bulk variant edit). The log is for
# reading, not archiving, so oversized ones are summarised instead.
MAX_BODY_CHARS = 4000


def redact(value: Any, depth: int = 0) -> Any:
    """A copy of the payload with every credential-shaped value removed."""
    if depth > 6:
        return "…"
    if isinstance(value, dict):
        out: dict[str, Any] = {}
        for key, item in value.items():
            if any(hint in str(key).lower() for hint in SECRET_HINTS):
                out[key] = REDACTED
            else:
                out[key] = redact(item, depth + 1)
        return out
    if isinstance(value, list):
        # A long list says little that its first few entries do not.
        return [redact(item, depth + 1) for item in value[:20]]
    if isinstance(value, str) and len(value) > 500:
        return value[:500] + "…"
    return value


def _as_json(value: Any) -> str | None:
    if value is None:
        return None
    try:
        text = json.dumps(redact(value), default=str)
    except Exception:
        return None
    if len(text) > MAX_BODY_CHARS:
        return json.dumps({"truncated": True, "preview": text[:MAX_BODY_CHARS]})
    return text


# How a path reads as a sentence. The section is the first segment; anything
# after an id is the action taken on it.
def summarise(method: str, path: str, status_code: int) -> str:
    parts = [p for p in path.replace(ADMIN_PATH_PREFIX, "").split("/") if p]
    section = parts[0].replace("-", " ") if parts else "admin"
    tail = parts[-1] if len(parts) > 1 and not _looks_like_id(parts[-1]) else None
    past, present = {
        "POST": ("created", "create"), "PATCH": ("updated", "update"),
        "PUT": ("updated", "update"), "DELETE": ("deleted", "delete"),
    }.get(method.upper(), ("changed", "change"))
    verb = past
    if status_code == 403:
        return f"Refused: tried to {present} {section}"
    if tail:
        return f"{tail.replace('-', ' ').capitalize()} on {section}"
    return f"{section.capitalize()} {verb}"


class AuditMiddleware(BaseHTTPMiddleware):
    """Record admin write operations — and refusals — in the activity log."""

    async def dispatch(self, request: Request, call_next: Any) -> Response:
        path = request.url.path
        method = request.method

        should_audit = (
            path.startswith(ADMIN_PATH_PREFIX)
            and method in AUDITED_METHODS
            and path not in AUDIT_EXCLUSIONS
        )

        if not should_audit:
            return await call_next(request)

        # Capture request body for new_values (must consume before call_next)
        body_bytes = await request.body()
        new_values_raw: dict | None = None
        if body_bytes:
            try:
                new_values_raw = json.loads(body_bytes)
            except Exception:
                new_values_raw = None

        # Re-inject body so route handlers can still read it
        async def receive():
            return {"type": "http.request", "body": body_bytes, "more_body": False}

        request._receive = receive  # type: ignore[attr-defined]

        response = await call_next(request)

        # Successful writes, and refusals. A 403 on an admin path means somebody
        # reached for something they are not allowed to have, which is worth
        # more to an investigation than most of the successes around it.
        worth_recording = (200 <= response.status_code < 300) or response.status_code == 403

        if worth_recording:
            user_id = getattr(request.state, "user_id", None)
            client_ip = _client_ip(request)
            user_agent = request.headers.get("user-agent", "")[:500]

            if response.status_code == 403:
                action = "DENIED"
            else:
                action = {
                    "POST": "CREATE", "PATCH": "UPDATE",
                    "PUT": "UPDATE", "DELETE": "DELETE",
                }.get(method, "UPDATE")

            # /api/v1/admin/products/{id}/... → entity_type=products, entity_id={id}
            path_parts = path.replace(ADMIN_PATH_PREFIX, "").split("/")
            entity_type = path_parts[0] if path_parts else "unknown"
            entity_id = path_parts[1] if len(path_parts) > 1 and path_parts[1] else None

            # Skip UUID-like sub-action suffixes (e.g. /approve, /reject)
            if entity_id and not _looks_like_id(entity_id):
                entity_id = None

            try:
                import uuid as _uuid

                from app.core.database import AsyncSessionLocal
                from app.models.system import AuditLog

                _tenant_id = getattr(request.state, "tenant_id", None)
                async with AsyncSessionLocal() as session:
                    log = AuditLog(
                        tenant_id=_uuid.UUID(str(_tenant_id)) if _tenant_id else None,
                        admin_user_id=_uuid.UUID(str(user_id)) if user_id else None,
                        action=action,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        new_values=_as_json(new_values_raw),
                        ip_address=client_ip,
                        user_agent=user_agent,
                        summary=summarise(method, path, response.status_code)[:300],
                        method=method,
                        path=path[:300],
                        status_code=response.status_code,
                    )
                    session.add(log)
                    await session.commit()
            except Exception:
                pass  # Never block the response due to audit failure

        return response


def _client_ip(request: Request) -> str:
    """The caller's address, preferring what the proxy in front of us reports.

    Railway terminates TLS, so `request.client` is the proxy for every request;
    without this every row would record the same useless address.
    """
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()[:45]
    return (request.client.host if request.client else "unknown")[:45]


def _looks_like_id(value: str) -> bool:
    """Heuristic: UUID or numeric ID."""
    return bool(re.match(r"^[0-9a-f\-]{8,}$", value, re.IGNORECASE) or re.match(r"^\d+$", value))


async def write_audit_log(
    db: Any,
    admin_user_id: str | None,
    action: str,
    entity_type: str,
    entity_id: str | None,
    old_values: dict[str, Any] | None,
    new_values: dict[str, Any] | None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    summary: str | None = None,
    tenant_id: Any = None,
) -> None:
    """Write one entry from a route or service, where the detail is known.

    The middleware records that something happened; this records what. Both
    redact, so neither can be the one that writes a secret down. The caller
    commits.
    """
    import uuid

    from app.models.system import AuditLog

    log = AuditLog(
        tenant_id=uuid.UUID(str(tenant_id)) if tenant_id else None,
        admin_user_id=uuid.UUID(admin_user_id) if admin_user_id else None,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id else None,
        old_values=_as_json(old_values),
        new_values=_as_json(new_values),
        ip_address=ip_address,
        user_agent=user_agent,
        summary=(summary or "")[:300] or None,
    )
    db.add(log)


async def record_event(
    action: str,
    entity_type: str,
    *,
    summary: str,
    tenant_id: Any = None,
    user_id: Any = None,
    entity_id: Any = None,
    details: dict | None = None,
    request: Any = None,
    actor_name: str | None = None,
) -> None:
    """Record something that is not an HTTP write — a sign-in, a webhook.

    Opens its own session and commits: a sign-in is not part of any request's
    transaction, and a refund recorded by a Stripe webhook must survive
    whatever else that webhook does.
    """
    import uuid as _uuid

    from app.core.database import AsyncSessionLocal
    from app.models.system import AuditLog

    try:
        async with AsyncSessionLocal() as session:
            session.add(AuditLog(
                tenant_id=_uuid.UUID(str(tenant_id)) if tenant_id else None,
                admin_user_id=_uuid.UUID(str(user_id)) if user_id else None,
                action=action,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id else None,
                new_values=_as_json(details),
                summary=summary[:300],
                actor_name=(actor_name or "")[:255] or None,
                ip_address=_client_ip(request) if request is not None else None,
                user_agent=(request.headers.get("user-agent", "")[:500]
                            if request is not None else None),
            ))
            await session.commit()
    except Exception:
        # The activity log must never be the reason a sign-in or a webhook fails.
        pass
