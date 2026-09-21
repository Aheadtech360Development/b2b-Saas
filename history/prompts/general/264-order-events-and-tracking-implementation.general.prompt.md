---
id: 264
title: Order Events And Tracking Implementation
stage: green
date: 2026-09-22
surface: agent
model: claude-opus-5
feature: order-management
branch: main
user: development.aheadtech360@gmail.com
command: manual implementation
labels: ["orders", "order-events", "timeline", "attribution", "utm", "analytics", "ga4", "meta-pixel", "klaviyo", "migration"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/0039_order_events.py
  - backend/migrations/versions/0040_order_attribution.py
  - backend/app/services/order_events.py
  - backend/app/services/attribution.py
  - backend/app/services/analytics_config.py
  - backend/app/api/v1/admin/analytics_settings.py
  - backend/app/models/order.py
  - backend/app/models/__init__.py
  - backend/app/schemas/order.py
  - backend/app/api/v1/admin/orders.py
  - backend/app/api/v1/orders.py
  - backend/app/api/v1/checkout.py
  - backend/app/api/v1/guest.py
  - backend/app/api/v1/account.py
  - backend/app/api/v1/storefront.py
  - backend/app/services/suppliers/orders.py
  - backend/app/core/tenant_settings.py
  - backend/app/main.py
  - frontend/src/lib/attribution.ts
  - frontend/src/lib/tracking.ts
  - frontend/src/components/analytics/AttributionTracker.tsx
  - frontend/src/components/analytics/TrackingScripts.tsx
  - frontend/src/components/admin/TrackingPanel.tsx
  - frontend/src/app/layout.tsx
  - frontend/src/app/(admin)/admin/orders/page.tsx
  - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
  - frontend/src/app/(admin)/admin/settings/page.tsx
  - frontend/src/app/(customer)/account/orders/[id]/page.tsx
  - frontend/src/app/(customer)/checkout/review/page.tsx
  - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
  - scratchpad/t_events.py — 18 checks: backfill fidelity, no duplicates, re-runnable, tenant isolation, 8 concurrent writers, rollback leaves no history, customer-visible filter
  - scratchpad/t_order_actions.py — 15 checks: status change, tracking added, cancel (reason, notes preserved, idempotent), RMA transitions, the events endpoint
  - scratchpad/t_tracking.py — 30 checks: payload cleaning, length caps, unknown keys dropped, attribution immutable, unknown stays unknown, per-brand tracking IDs, grouping by campaign
  - npx tsc --noEmit — clean (two pre-existing errors in src/__tests__/api-client.test.ts)
  - npm run build — compiled successfully
---

## Prompt

chalo ready kro jani

(Following the audit in PHR 263 and the user's three decisions: build Phase 1
— order_events — first; one shipment per order, so no fulfillments table;
client-side pixels only, no server-side conversion APIs.)

## Response

Two phases shipped across four commits, each pushed to Railway, which runs
`alembic upgrade head` on deploy.

### Phase 1 — `order_events` (commits 33d754e, ad0e1ad)

Migration 0039 creates an append-only `order_events` table with `occurred_at`
kept separate from `created_at`, because a carrier's delivery scan and a
supplier's ship confirmation happen on their clock, not ours. RLS policy and
`app_rls` grant follow the same shape as `supplier_orders`.

The backfill invents nothing: existing `orders.timeline` entries move across
with their own timestamps, and the four milestones the orders table already
dates (`created_at`, `shipped_at`, `invoice_sent_at`, `marked_paid_at`) are
added only where the timeline has no entry for them. Every block is guarded by
`NOT EXISTS`, so a re-run changes nothing.

`services/order_events.py` records an event as an INSERT inside the caller's
transaction — so the history is saved exactly when the action is, and rolled
back with it. The legacy `orders.timeline` is still written, but as a SQL-level
`timeline || entry` append, which also stops the old column losing concurrent
writes. Every call site moved over: checkout, guest checkout, draft orders,
status changes, labels, cancel, refund, invoices, mark-paid, item edits,
comments, RMA transitions, and the S&S supplier jobs.

Fixed on the way: `cancel_admin_order` overwrote `order.notes` rather than
appending to it.

Both order pages now render stored events. The admin timeline groups them by
day with the staff member's real name; the buyer's page gained a history it
never had, filtered to `CUSTOMER_VISIBLE` so internal notes, label costs and
supplier purchase orders stay internal.

### Phase 3 — attribution and tracking (commits 5f40dcb, 6b6ceba)

Migration 0040 gives the five UTM values real columns (a brand filters, groups
and exports by them) and puts referrer, landing page and ad click ids in one
JSONB column. `services/attribution.py` treats the payload as untrusted, since
it arrives from a URL anybody can edit: non-strings refused, lengths capped,
unknown keys dropped, and attribution on an existing order never rewritten.

The browser decides what to keep — last non-direct touch wins — and an
unattributable order records nothing rather than claiming "direct".

`services/analytics_config.py` holds each brand's own public tracking IDs in a
tenant-namespaced settings row: GA4, GTM, Clarity, Meta, TikTok, Pinterest,
Snap, Klaviyo, Omnisend, plus free-form snippets. A mistyped ID is reported by
name at save time, but can be force-saved — the warning is a warning, not a
silent deletion. The storefront reads its own brand's set from an
unauthenticated endpoint, which is safe because nothing stored there is secret.

Orders can now be filtered and exported by source and campaign, and the order
page links straight to every other order from the same campaign.

### Not built, by decision

Partial fulfillment (one shipment per order was confirmed), server-side
conversion APIs, and Phase 2 of the audit — refund history, returns surfaced
on the order page, tags, archive, and delivered set from a carrier poll.
