---
id: 267
title: Custom code sections and product templates
stage: general
date: 2026-09-22
surface: agent
model: claude-opus-5
feature: none
branch: main
user: Aheadtech360Development
command: none
labels: ["page-builder","product-templates","metafields","custom-code","storefront","multi-tenant"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/migrations/versions/0047_product_templates.py
 - backend/app/models/product_template.py
 - backend/app/models/product.py
 - backend/app/services/product_templates.py
 - backend/app/api/v1/admin/product_templates.py
 - backend/app/api/v1/products.py
 - backend/app/api/v1/admin/products.py
 - backend/app/api/v1/storefront.py
 - backend/app/schemas/product.py
 - backend/app/services/product_service.py
 - frontend/src/components/storefront/CustomCodeFrame.tsx
 - frontend/src/components/storefront/ProductTemplateBlocks.tsx
 - frontend/src/components/storefront/SectionRenderer.tsx
 - frontend/src/components/admin/SectionsEditor.tsx
 - frontend/src/components/admin/ProductTemplateEditor.tsx
 - frontend/src/components/admin/ProductTemplatesManager.tsx
 - frontend/src/lib/templateTokens.ts
 - frontend/src/services/productTemplates.service.ts
 - frontend/src/app/(admin)/admin/storefront/product-templates/page.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(customer)/products/[slug]/ProductDetailClient.tsx
tests:
 - scratchpad/t_product_templates.py (73 checks over HTTP, pass)
 - all 10 earlier suites re-run, pass
 - frontend typecheck + next build + hook scanner (0 problems)
---

## Prompt

We need to complete this feature properly end-to-end. Our page builder already supports normal sections… Now my manager wants two additional features: 1. Custom Code Sections … 2. Product Templates (Shopify-style, must NOT replace normal product functionality: title, images, price, variants, add to cart, quantity) … Please inspect the existing codebase first … Then implement using the existing architecture … Admin UI → data model → API → editor → template assignment → storefront rendering → preview/save/publish.

## Response snapshot

Inspected the builder (tenant_pages.sections JSONB → SectionsEditor/SectionRenderer) and found there were no metafields
in the platform at all, so products got a metafields JSONB. custom_code became an ordinary section type rendered in a
sandboxed iframe (auto-height via postMessage), available in pages, home and templates. Product templates store
{blocks, sections} as draft + published; the four standard blocks are re-inserted server-side and client-side so a
template can never remove the buying controls. Storefront resolution: product's own published template → brand default →
legacy layout, served uncached at GET /products/{slug}/template so publishing propagates without touching product caches.

## Outcome

- ✅ Impact: brands can add their own code and per-product-type layouts without dev work; existing pages unchanged
- 🧪 Tests: 73 new HTTP checks (validation, draft/publish, preview, assignment, isolation, RBAC) + all earlier suites
- 📁 Files: see list above
- 🔁 Next prompts: push 52b3257 + 2bf152a; final quality gate report
- 🧠 Reflection: standard blocks are re-added on both sides, so a bad payload degrades to a working product page

## Evaluation notes (flywheel)

- Failure modes observed: oversized custom code was silently truncated before the size check (fixed to reject)
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): a section-level "duplicate" action in the builder
