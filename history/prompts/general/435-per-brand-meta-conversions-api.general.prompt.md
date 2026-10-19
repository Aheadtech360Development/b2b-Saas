---
id: 435
title: Per-brand Meta Conversions API
stage: general
date: 2026-10-15
surface: agent
model: claude
feature: none
branch: claude/compassionate-albattani-0c4vur
user: Aheadtech360Development
command: Build the Meta Conversions API end to end so each brand saves its own access token
labels: ["tracking", "meta-pixel", "conversions-api", "integrations", "checkout", "multi-tenant"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/meta_capi.py (new)
 - backend/app/services/integrations_service.py
 - backend/app/services/order_events.py
 - backend/app/api/v1/checkout.py
 - backend/app/api/v1/guest.py
 - backend/app/schemas/order.py
 - backend/tests/test_meta_capi.py (new)
 - frontend/src/lib/attribution.ts
 - frontend/src/app/(customer)/checkout/review/page.tsx
 - frontend/src/app/(admin)/admin/settings/tracking/page.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/__tests__/server-tracking.test.ts (new)
tests:
 - backend tests/test_meta_capi.py — 21 passed
 - backend checkout/order suites on a local Postgres — 53 passed now vs 32 on the base; the same 29 pre-existing seed errors on both
 - real-DB check: per-brand target lookup, masked token hint, other brand gets nothing
 - frontend vitest — 586 passed (48 files); tsc --noEmit clean
---

## Prompt

hn ye feature bnado ke har brand apna access token save krsky saiha jani jaldi kro proper end to end bnado isy

## Response snapshot

Built a per-brand Meta Conversions API connection:
- New `meta_capi` provider (category "tracking") in integrations_service. The access token is a masked secret,
  with an optional test event code. The verifier reads the pixel name with the token against the Pixel ID saved on
  the Tracking page. With a test code saved, it also sends one test PageView.
- New services/meta_capi.py. After an order is committed (signed-in and guest checkout), the Purchase is sent from
  a background task to graph.facebook.com/v25.0/{pixel}/events:
  - event_id = order number, the same as the browser pixel's eventID, so Meta deduplicates
  - customer data normalised and SHA-256 hashed; fbp/fbc/IP/UA passed as-is
  - the token goes in the Authorization header, never in the URL
  - gated on tracking on + Meta Pixel on + checkout tracking on + token saved
- The outcome is written on the order history as "meta_capi_sent" / "meta_capi_failed" (internal only).
- Checkout now sends `tracking` {fbp, fbc, page_url}, because the API is on another domain and cannot read the
  pixel cookies itself.
- Tracking & Analytics page: new "Server-side tracking" section rendering IntegrationsPanel(category="tracking").

## Outcome

- ✅ Impact: Each brand can connect its own CAPI token. Sales reach its pixel even when the browser pixel is blocked.
- 🧪 Tests: 21 new backend tests and 4 new frontend tests. Full frontend suite and tsc green. No backend regressions.
- 📁 Files: 12 (3 new)
- 🔁 Next prompts: deploy, then connect innterflow's token (newly generated) and check Events Manager → Test events
- 🧠 Reflection: Reused the integrations registry and IntegrationsPanel, so no new storage, endpoints or form UI were needed

## Evaluation notes (flywheel)

- Failure modes observed: the backend conftest seed fails on the current schema (company_users.user_group NOT NULL), which is pre-existing
- Graders run and results (PASS/FAIL): pytest PASS, vitest PASS, tsc PASS, ruff PASS on the new files
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): add AddToCart/InitiateCheckout server events if the brand wants more signal
