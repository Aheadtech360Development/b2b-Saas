---
id: "003"
title: B2B Platform Implementation Plan
stage: plan
date: 2026-03-06
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: AheadTech360
command: /sp.plan
labels: ["plan","architecture","data-model","api-contracts","b2b","wholesale","fastapi","nextjs","postgresql","redis","celery","stripe","quickbooks"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-b2b-wholesale-platform/plan.md
  - specs/001-b2b-wholesale-platform/research.md
  - specs/001-b2b-wholesale-platform/data-model.md
  - specs/001-b2b-wholesale-platform/quickstart.md
  - specs/001-b2b-wholesale-platform/contracts/auth.md
  - specs/001-b2b-wholesale-platform/contracts/products.md
  - specs/001-b2b-wholesale-platform/contracts/cart-checkout.md
  - specs/001-b2b-wholesale-platform/contracts/orders-account.md
  - specs/001-b2b-wholesale-platform/contracts/admin.md
  - specs/001-b2b-wholesale-platform/contracts/webhooks.md
  - CLAUDE.md (updated via update-agent-context.ps1)
tests:
  - none
---

## Prompt

# AF Apparels — Technical Implementation Plan

[Full technical plan including: Technology stack decisions table (20 rows), constitution
compliance check (all ✅ PASS), complete project directory structure (frontend/ + backend/
+ scripts/), full data model (25+ tables across 8 domains), authentication flow, caching
strategy, webhook infrastructure, 8 implementation phases with quality gates and manual
tests, risk register (10 risks), and prerequisites checklist (16 items).]

## Response snapshot

All Phase 0 (research) and Phase 1 (design) artifacts generated:

**plan.md** — Full implementation plan with:
- Technical Context (language, framework, storage, testing, platform, goals)
- Constitution Check: 26 principles verified, all ✅ PASS
- Complete project directory structure (frontend/ + backend/ + scripts/)
- Technology decisions table (20 rows with rationale)
- Auth flow (JWT + refresh token rotation)
- Caching strategy (9 data types, TTLs, invalidation triggers)
- Webhook infrastructure (Stripe, idempotent processing pattern)
- API error format standard
- 8 implementation phases with quality gates and manual test procedures
- Risk register (10 risks with likelihood, impact, mitigation)
- Prerequisites checklist (16 items to collect before Phase 1)

**research.md** — 9 research decisions:
1. Image processing: Pillow/backend (vs Sharp/Sharp)
2. Full-text search: PostgreSQL tsvector (vs Elasticsearch)
3. Cart persistence: PostgreSQL (auth) + Redis (guest) hybrid
4. Pricing application: service layer with JWT tier injection
5. QB sync: outbound-only Celery queue with exponential backoff
6. Stripe: Payment Intents + webhook-first (not direct API response)
7. Email templates: DB-stored Jinja2 + SendGrid delivery
8. Data migration: Python scripts via Shopify Admin API
9. 301 redirects: NGINX config (not application code)

**data-model.md** — 25 tables across 8 domains:
- Identity: companies, users, company_users, contacts, user_addresses
- Products: categories, products, product_variants, product_images, product_assets, product_categories
- Inventory: warehouses, inventory, inventory_adjustments
- Pricing/Shipping: pricing_tiers, shipping_tiers, shipping_brackets
- Orders: orders, order_items, cart_items, order_templates, abandoned_carts
- Returns: rma_requests, rma_items
- Wholesale: wholesale_applications
- Communication: messages, email_templates
- System: settings, audit_log, qb_sync_log, webhook_log, price_list_requests

**contracts/** — 6 contract files covering all API domains:
- auth.md (7 endpoints), products.md (5 endpoints), cart-checkout.md (8 endpoints)
- orders-account.md (30+ endpoints), admin.md (40+ endpoints), webhooks.md

**quickstart.md** — Local dev setup, test commands, phase validation flows, Stripe test cards

**CLAUDE.md** — Updated via update-agent-context.ps1 with language/framework/DB context.

## Outcome

- ✅ Impact: Full architectural plan for AF Apparels B2B platform — ready for /sp.tasks
- 🧪 Tests: Constitution compliance gate passed (26/26 principles verified)
- 📁 Files: 10 new files across specs/001-b2b-wholesale-platform/
- 🔁 Next prompts: /sp.tasks to generate implementation task list
- 🧠 Reflection: All architectural decisions documented with rationale; 3 ADR candidates identified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): Constitution Check — 26/26 PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
