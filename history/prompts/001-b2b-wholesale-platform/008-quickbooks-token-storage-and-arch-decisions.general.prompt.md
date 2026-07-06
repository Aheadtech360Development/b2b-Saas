---
id: "008"
title: QB Token Storage and Architecture ADRs
stage: general
date: 2026-03-09
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: RT
command: /sp.adr quickbooks-token-storage-strategy
labels: ["adr","quickbooks","architecture","authentication","celery","payments","security"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: history/adr/
  pr: null
files:
  - history/adr/ADR-001-quickbooks-token-storage-strategy.md
  - history/adr/ADR-002-two-service-architecture.md
  - history/adr/ADR-003-jwt-authentication-and-session-management.md
  - history/adr/ADR-004-celery-async-sync-bridge-pattern.md
  - history/adr/ADR-005-payment-pci-compliance-via-stripe-elements.md
tests:
  - "none (documentation artifact)"
---

## Prompt

/sp.adr quickbooks-token-storage-strategy

## Response snapshot

Analyzed plan.md, identified 5 architecturally significant decision clusters (all passed the 3-point significance test: impact + alternatives + cross-cutting scope). Created 5 ADRs:

1. **ADR-001** — QB Token Storage: Documents the env-var/in-memory approach and its multi-worker risk. Recommends DB-backed token storage as migration path. Notes token rotation split-brain scenario.

2. **ADR-002** — Two-Service Architecture: Documents Next.js + FastAPI decision vs monolith, BFF, and microservices. References constitution Article I mandate.

3. **ADR-003** — JWT Auth + Session Management: Documents access token (15-min, memory-only) + refresh token (7-day, httpOnly cookie) + Redis blacklisting. Notes the company suspension check DB query on every request.

4. **ADR-004** — Celery Async/Sync Bridge: Documents `asyncio.new_event_loop()` per-task pattern for bridging sync Celery workers to async SQLAlchemy. Notes Python 3.10+ deprecation of `get_event_loop()`. Provides migration path to sync SQLAlchemy.

5. **ADR-005** — PCI via Stripe Elements: Documents card data never touching AF Apparels servers (SAQ-A compliance). Notes vendor lock-in risk and ACH as future alternative.

## Outcome

- ✅ Impact: 5 ADRs created covering the most significant architectural decisions. All have explicit alternatives, tradeoffs, migration paths, and implementation references.
- 🧪 Tests: N/A (documentation artifacts)
- 📁 Files: 5 ADR files created in history/adr/
- 🔁 Next prompts: Review ADR-001 migration path (DB-backed QB tokens); Review ADR-004 for sync SQLAlchemy migration if Celery bridge causes prod issues.
- 🧠 Reflection: ADR-001 (QB tokens) is the most urgent risk — in-memory refresh token rotation loss under multi-worker deployment could require manual OAuth re-authorization.

## Evaluation notes (flywheel)

- Failure modes observed: check-prerequisites.ps1 not executable in bash context; create-adr.sh not present — used agent-native file writing instead.
- Graders run and results (PASS/FAIL): All 5 ADRs pass significance checklist (impact + alternatives + cross-cutting scope).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Implement ADR-001 migration path (QBTokenStore model + SELECT FOR UPDATE refresh) in a follow-up PR.
