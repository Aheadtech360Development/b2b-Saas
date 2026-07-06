---
id: "044"
title: Fix QB Token Refresh DNS and Retries
stage: green
date: 2026-03-26
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Fix QB token auto-refresh in Docker environment — DNS resolver + retry transport
labels: ["bug-fix","quickbooks","docker","dns","networking"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/services/quickbooks_service.py
tests:
  - docker logs afapparel_backend --tail 3 (Application startup complete, no errors)
---

## Prompt

Fix QB token auto-refresh in Docker environment.

DNS resolver for oauth.platform.intuit.com failing in Docker.

Fix: Add DNS resolver to httpx client in refresh method + add dns: 8.8.8.8/8.8.4.4 to docker-compose.yml backend service.

## Response snapshot

**docker-compose.yml** — DNS entries already present for `backend` (lines 57–59) and `celery_worker` (lines 83–84) from a prior session. No change needed.

**quickbooks_service.py** — Two sync methods updated to use `httpx.Client(transport=httpx.HTTPTransport(retries=3))`:

1. `refresh_token_if_expired` (token refresh call):
```python
with httpx.Client(transport=httpx.HTTPTransport(retries=3)) as client:
    resp = client.post(TOKEN_URL, auth=..., data=..., timeout=10)
```

2. `_request` (all QB API calls):
```python
with httpx.Client(transport=httpx.HTTPTransport(retries=3)) as client:
    resp = client.request(method, url, headers=..., timeout=15, **kwargs)
    if resp.status_code == 401:
        self.refresh_token_if_expired()
        resp = client.request(method, url, headers=..., timeout=15, **kwargs)
```

Note: Used `httpx.HTTPTransport` (sync) not `httpx.AsyncHTTPTransport` because both methods are synchronous (`def`, not `async def`).

Full stack restarted with `docker compose down && docker compose up -d`. Backend started cleanly.

## Outcome

- ✅ `refresh_token_if_expired` uses retry-enabled client (3 retries on transient DNS failures)
- ✅ `_request` uses same retry-enabled client for all QB API calls
- ✅ docker-compose.yml DNS already configured — no change needed
- ✅ Stack restarted cleanly: "Application startup complete."
- 📁 Files: quickbooks_service.py
