---
id: "002"
title: AF Apparels B2B Platform Spec
stage: spec
date: 2026-03-06
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: 001-b2b-wholesale-platform
user: AheadTech360
command: /sp.specify
labels: ["spec","b2b","wholesale","ecommerce","platform","shopify-migration","quickbooks"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - specs/001-b2b-wholesale-platform/spec.md
  - specs/001-b2b-wholesale-platform/checklists/requirements.md
  - history/prompts/001-b2b-wholesale-platform/002-af-apparels-b2b-platform-spec.spec.prompt.md
tests:
  - none
---

## Prompt

# AF Apparels — Feature Specification

## Project Overview

**Product:** AF Apparels B2B Wholesale E-Commerce Platform
**Type:** Custom-built wholesale ordering platform replacing an existing Shopify store
**Target Users:** Wholesale buyers (distributors, resellers), AF Apparels admin team
**Business Model:** Pure B2B wholesale — not retail

[...20 user stories (US-1 through US-20) covering: Wholesale Registration & Approval,
Product Catalog Browsing, Bulk Ordering via Variant Matrix, Quick Order by SKU, Shopping
Cart with MOQ & MOV, Multi-Step Checkout, Customer Account Dashboard, Reorder & Templates,
Product Asset Access, Tier-Based Pricing Engine, Tier-Based Shipping, Warehouse Inventory,
Admin Product Management, Admin Order Management, Admin Customer Management, Admin Reporting,
QuickBooks Integration, Email Notification System, Data Migration from Shopify, Audit Logging]

[...Non-Functional Requirements: Performance, Security, Reliability, Scalability,
Accessibility, SEO]

[...12 Out-of-Scope items explicitly excluded]

## Response snapshot

Branch `001-b2b-wholesale-platform` created. Full spec written to
`specs/001-b2b-wholesale-platform/spec.md` with:

- Project overview and 4 user roles (Guest, Wholesale Customer, Company Owner, Admin)
- 20 prioritized user stories (US-1 to US-20) with P1/P2/P3 priority, Why-priority rationale,
  Independent Test descriptions, and Given/When/Then acceptance scenarios
- 6 edge cases documented
- 15 functional requirements (FR-001 to FR-015)
- 17 key entities defined
- 10 measurable, technology-agnostic success criteria (SC-001 to SC-010)
- Non-functional requirements across Performance, Security, Reliability, Scalability,
  Accessibility, SEO
- 12 out-of-scope items
- 8 assumptions (Stripe, QuickBooks Online, SendGrid, S3, USD-only, flat tax, etc.)

Quality checklist at `specs/001-b2b-wholesale-platform/checklists/requirements.md`:
All 16 items passed. 0 NEEDS CLARIFICATION markers. Spec ready for /sp.plan.

## Outcome

- ✅ Impact: Full platform spec for AF Apparels B2B Wholesale Platform written and validated
- 🧪 Tests: Quality checklist passed (all 16 items) — no code tests at spec stage
- 📁 Files: specs/001-b2b-wholesale-platform/spec.md, checklists/requirements.md
- 🔁 Next prompts: /sp.plan to create architecture plan, or /sp.clarify for any open questions
- 🧠 Reflection: 20 user stories with complete Given/When/Then coverage; all out-of-scope
  items explicit; assumptions section prevents ambiguity at planning stage.

## Evaluation notes (flywheel)

- Failure modes observed: PowerShell Join-Path 4-arg limitation caused script to fail
  mid-run (branch and spec file were created successfully; prompts dir created manually)
- Graders run and results (PASS/FAIL): Quality checklist — all PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
