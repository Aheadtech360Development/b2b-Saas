---
id: 136
title: Sidebar Cleanup + Product Specs PDF Redirect + Nav Updates
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Hide General & QuickBooks from admin sidebar Settings; product-specs page auto-redirects to PDF; add Product Specs to header/footer Resources"
labels: ["frontend","admin","navigation","product-specs","sidebar"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/app/(customer)/product-specs/page.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/layout/Footer.tsx
tests:
  - manual: Admin sidebar Settings section shows only Taxes & Duties, Analytics, Users, Audit Log
  - manual: Admin sidebar Settings section no longer shows General or QuickBooks
  - manual: Clicking Product Specs in nav fetches /api/v1/product-specs and auto-navigates to first active PDF
  - manual: If no active PDF uploaded, /product-specs shows Coming Soon page with Contact Us link
  - manual: Header Resources dropdown includes Product Specs linking to /product-specs
  - manual: Footer Resources column shows Product Specs (was mislabeled Size Charts) linking to /product-specs
  - manual: Style Sheets already present in both header and footer Resources — no change needed
---

## Prompt

1. ADMIN SIDEBAR — Remove General and QuickBooks from Settings section. Keep: Taxes & Duties, Analytics, Users, Audit Log.
2. PRODUCT SPECS — Redirect logic: fetch GET /api/v1/product-specs → window.location.replace(first active pdf_url). Show Coming Soon if none.
3. ADD PRODUCT SPECS TO HEADER & FOOTER under Resources.
4. STYLE SHEETS — already present in both; no change needed.

## Response snapshot

**AdminSidebar**: Removed `<SubLink href="/admin/settings" label="General" />` and `<SubLink href="/admin/settings/quickbooks" label="QuickBooks" />` from the Settings dropdown.

**Product Specs page**: Rewritten as "use client". On mount: fetches `/api/v1/product-specs`, finds first item where `is_active && pdf_url`, calls `window.location.replace(pdfUrl)`. Shows "Loading…" → "Opening PDF…" during fetch/redirect. Falls through to "Coming Soon" with Contact Us link if no active PDF found.

**Header**: Added `{ href: "/product-specs", label: "Product Specs", icon: "📐" }` to Resources dropdown array, after Style Sheets.

**Footer**: "Size Charts" (already pointed to `/product-specs`) renamed to "Product Specs". Style Sheets was already present — no change.

## Outcome

- ✅ Admin sidebar Settings: 4 items (Taxes & Duties, Analytics, Users, Audit Log)
- ✅ /product-specs auto-opens PDF via window.location.replace — not a popup, not blocked by browsers
- ✅ Product Specs in header Resources dropdown
- ✅ Product Specs in footer Resources column (corrected from mislabeled "Size Charts")
- 🧪 Tests: Manual
- 📁 Files: 4 files modified

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
