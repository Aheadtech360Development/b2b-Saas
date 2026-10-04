---
id: 275
title: Builder gaps and production audit
stage: general
date: 2026-10-04
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: finish remaining gaps, then audit and harden the visual builder
labels: ["visual-builder", "seo-404", "cart", "product-templates", "performance", "security-audit", "multi-tenant"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/not-found.tsx
 - frontend/src/app/(customer)/cart/page.tsx
 - frontend/src/components/storefront/CartView.tsx
 - frontend/src/components/builder/islands/CartIsland.tsx
 - frontend/src/components/storefront/ThemeChrome.tsx
 - frontend/src/lib/builder/load.ts
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/lib/builder/doc.ts
 - frontend/src/components/builder/editor/LeftPanel.tsx
 - backend/app/api/v1/storefront.py
 - backend/app/services/builder/site.py
 - backend/app/services/builder/schema.py
 - backend/app/services/builder/starter.py
 - backend/tests/test_builder_security.py
tests:
 - backend/tests/test_builder_schema.py (44 pass)
 - backend/tests/test_builder_integration.py (62 pass)
 - backend/tests/test_builder_security.py (18 pass, new)
 - frontend vitest (123 pass; 2 pre-existing api-client failures)
 - Browser probes: storefront+editor 41/41, editor pass 2 11/11, gaps 26/30 (4 = sign-up rate limit 429 on rerun; earlier full run 30/30), 404s 7/7 in dev and in a production build
---

## Prompt

We have already implemented the Visual Builder system described below. Do NOT rebuild it and do NOT introduce unrelated features. Your job now is to **finish the remaining gaps, then audit and harden the implementation for production**.

The full prompt is in the conversation. In summary it asked for:

- **Part 1:** four fixes — builder 404 SEO, the builder cart, product-specific templates, and removing the extra storefront API request.
- **Parts 2–8:** audits of multi-tenant security, the database, scalability, storefront performance, custom HTML/CSS/fonts, publish/versioning safety, and legacy regression.
- **Part 9:** a final report with fixes, security findings by severity, multi-tenant and scalability verdicts, performance, data integrity, legacy regression, a readiness score and the top 10 risks.

Rules given:

- Inspect the actual code.
- Make no speculative changes.
- Explain any change made outside the four gaps.
- Report the tests that were run.

## Response snapshot

Pushed commit 476eb8b.

Fixes:

- **Real 404s.** Builder shops get a 404 status with their own template via `app/not-found.tsx`. Legacy shops get Next's built-in 404, verified identical with and without the file.
- **Cart.** The cart moved unchanged into `CartView`. A `cart_items` element places it inside the builder cart template.
- **Product templates.** There is now a Templates-panel UI for assigning products to a template.
- **Builder answer.** It now comes back inside `theme-active`, as a not_found payload. Measured result: legacy pages make 0 builder requests (was 1–2); builder pages make 1 `/storefront/site` call (was 2).

Out-of-gap changes, each explained with a reproduction:

- Locked rows are re-read with `populate_existing`. Before the fix, four concurrent saves on one revision were all accepted.
- Custom HTML blocks get `contain:paint`. Before the fix, a block in the header covered the cart's checkout button.

The audit found and reported, without fixing:

- unbounded grid count per page (200 grids measured at 607 SQL statements and ~1.5 s)
- guest cart lost at the mandatory sign-up step (pre-existing)
- DB connection pool can exceed Postgres's default limit
- full published document re-parsed on every request
- CSS-escape bypass of the https-only image rule
- stale pytest conftest that seeds whichever DB `.env` names
- unbounded version retention

## Outcome

- ✅ Impact: Four gaps closed; two real defects fixed; legacy output verified unchanged.
- 🧪 Tests: see the tests list above.
- 📁 Files: see the files list above.
- 🔁 Next prompts:
  - cap grids per page and batch them
  - carry the guest cart over at sign-up
  - cache published documents by version id
  - set pool size against Postgres max_connections
- 🧠 Reflection: Measure before claiming. The first after-run exposed that Next renders not-found on every request, which the original design would have paid for on every page.

## Evaluation notes (flywheel)

- Failure modes observed:
  - The eager not-found render.
  - The identity-map stale read under FOR UPDATE.
  - The sign-up rate limit during repeated probes.
  - The pytest conftest pointing at the .env database.
- Graders run and results (PASS/FAIL): all listed tests are PASS apart from the noted environmental 429s and the pre-existing failures.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Add a per-page cap on resolved grids, of about 24.
