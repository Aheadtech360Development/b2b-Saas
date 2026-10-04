---
id: 276
title: Builder hardening, guest cart, layout engine
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: fix production risks, then Grid + Flex layout engine
labels: ["visual-builder", "performance", "db-pool", "versioning", "guest-cart", "layout-engine", "admin-nav"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/resolve.py (batched grids, caps)
 - backend/app/services/builder/schema.py (page-cost warnings, layout keys)
 - backend/app/services/builder/site.py (document cache, idempotent publish, retention, pins)
 - backend/app/api/v1/admin/builder.py (publish result, pin endpoint)
 - backend/app/core/config.py, backend/app/core/database.py, backend/app/main.py, backend/railway.worker.json (connection budget)
 - backend/app/models/builder.py, backend/migrations/versions/0057_builder_version_pin.py
 - frontend/src/lib/guestCart.ts, src/lib/session.ts, src/app/(auth)/login/page.tsx, src/components/storefront/CartView.tsx (guest cart adoption)
 - frontend/src/lib/builder/style.ts, layout.ts, types.ts, baseCss.ts, registry.ts
 - frontend/src/components/builder/editor/LayoutPanel.tsx, Canvas.tsx, Inspector.tsx, LeftPanel.tsx, SiteEditor.tsx, ui.tsx
 - frontend/src/app/site-builder/page.tsx (back link to /admin/dashboard)
 - .gitattributes
tests:
 - backend test_builder_schema.py 47/47
 - backend test_builder_integration.py 62/62
 - backend test_builder_security.py 35/35
 - frontend vitest 159 passed (2 pre-existing api-client failures)
 - browser probes 111/111 (storefront+editor 41, editor 11, gaps 32, tiles 7, layout 20)
---

## Prompt

Five things were asked in this session:

1. Fix the overflowing Add-panel tile text.
2. Fix six production risks: grid query explosion, DB connection pool, published-document performance, duplicate publish, version history growth, guest cart loss. Inspect first, then implement and test.
3. Build a professional Elementor-style Grid + Flex layout engine. Inspect first and explain the integration, without breaking existing content.
4. Mid-way, the user reported the admin UI looked different: "ye ui kesi krdi … purani ui wapis lao … supplier catalog". Follow-up screenshots showed /ui-preview versus their real /admin layout: "pehle ye issue solve krdo".
5. "continue kro jo krrhy thy tum".

## Response snapshot

**Admin UI.**

- Cause: the website builder's back arrow pointed to /ui-preview, a dormant prototype admin.
- Fix: it now points to /admin/dashboard (67a3a51).
- Nothing in the real admin had changed.
- Corrected a stale memory note that had called /ui-preview the real admin.

**Production risks (f5c8446).**

- Grids are filled per source, not per grid. 200 grids went from 607 SQL / 1.5 s to 9–10 SQL. Collection sources are capped at 8 and grids at 60 per page, with publish warnings.
- Pools are env-driven (web 8+4, worker 4+2). Worst case is 61 of 97 usable connections, and the startup log reads the real max_connections.
- Published documents are cached in memory by tenant and version. An 820 KB site went from 152 ms to 75 ms per page, with one query fewer.
- Publishing what is already live makes no new version.
- History keeps 30 versions. The live version, the previous live version and Keep-pinned versions are never removed, and every prune is reported (migration 0057).
- The guest cart is adopted into the account at sign-up and sign-in, for both legacy and builder shops.

**Tile labels.** They wrap inside the tile, with a soft hyphen for "Announcement bar".

**Layout engine (8d8a5f2, 1a34b1a).**

- Layout is per-breakpoint style data with inheritance.
- Grids auto-collapse on smaller screens, and hand placement resets only where they collapsed.
- Auto-fit works without overflow.
- Sections lay out their inner wrapper.
- New editor UI: Layout tab, presets, placement, numbered cells, drop into cell, span handle, Grid & Flex presets.
- Server validation covers the new keys.
- Snapshot-proven byte-identical CSS for pre-existing pages.
- The Preview tab now inherits the editor's sign-in.

## Outcome

- ✅ Impact: all six risks fixed and measured; the layout engine shipped without changing existing pages' CSS; the admin back link fixed.
- 🧪 Tests: as listed above.
- 📁 Files: as listed above.
- 🔁 Next prompts:
  - read the real Railway max_connections from the startup log line
  - consider pruning-policy UI copy with the owner
- 🧠 Reflection:
  - Probes caught two real bugs that unit tests could not see: a product grid treated as a layout grid, and the preview tab losing its session.
  - The admin confusion came from a stale memory note. Verify navigation targets against what the owner actually uses.

## Evaluation notes (flywheel)

- Failure modes observed:
  - Heredoc escape mangling.
  - Dev compile timing in probes.
  - Machine CPU contention invalidating a load A/B; reported as inconclusive rather than claimed.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): Run a cross-browser check of rel="opener" preview tabs in production.
