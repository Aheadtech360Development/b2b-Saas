---
id: 134
title: Style Sheets + Product Specs + Content Pages + Icon Cleanup
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "Style Sheets page rebuild, Product Specs page rebuild, backend CRUD endpoints, admin pages, sidebar Content section, emoji → Lucide icon replacement"
labels: ["frontend","backend","content","icons","admin","customer-pages"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/admin/style_sheets.py
  - backend/app/api/v1/admin/product_specs.py
  - backend/app/api/v1/style_sheets.py
  - backend/app/api/v1/product_specs.py
  - backend/app/api/v1/upload.py
  - backend/migrations/versions/r1s2t3u4v5w6_add_style_sheets_product_specs.py
  - backend/app/main.py
  - frontend/src/app/(customer)/style-sheets/page.tsx
  - frontend/src/app/(customer)/product-specs/page.tsx
  - frontend/src/app/(admin)/admin/style-sheets/page.tsx
  - frontend/src/app/(admin)/admin/product-specs/page.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/contact/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/privacy-policy/page.tsx
tests:
  - manual: /style-sheets page shows 4-column grid with style number badge (STYLE / number) on each card
  - manual: Clicking a style sheet card opens its PDF in a new tab
  - manual: /product-specs page shows card grid with title, description, "View Specs" button
  - manual: "View Specs" button opens PDF in new tab; shows "Coming Soon" when no PDF
  - manual: Admin /admin/style-sheets — table lists all sheets, toggle active, edit/delete, modal with image+PDF upload
  - manual: Admin /admin/product-specs — table lists all specs, toggle active, edit/delete, modal with PDF upload
  - manual: POST /api/v1/upload accepts image → resizes to JPEG → returns { url, file_name, type }
  - manual: POST /api/v1/upload accepts PDF → saves → returns { url, file_name, type }
  - manual: AdminSidebar shows "Content" section with "Style Sheets" and "Product Specs" links
  - manual: About page — value card icons are Lucide (Factory, Palette, Zap, Leaf), no emoji icons
  - manual: Contact page — info card icons are Lucide (Phone, Mail, MapPin, Clock), dept icons are Lucide
  - manual: Private Label page — "Who It's For" cards use Lucide (Shirt, Store, Printer)
  - manual: Print Guide page — method card headers use Lucide (Printer, Palette, Droplets, Scissors, Square, BookOpen)
  - manual: Privacy Policy sidebar nav uses Lucide icons (Package, ShoppingCart, FileText, Lock)
---

## Prompt

Make the following updates to the AF Apparels platform:

1. STYLE SHEETS PAGE — Replace placeholder with a full T-Shirt Collection style grid. 4-column grid, cards with product image + style number badge (black badge top-left, "STYLE" text above number). Click opens linked PDF. Fetch from GET /api/v1/style-sheets.

2. PRODUCT SPECS PAGE — Replace placeholder with a clean specs page showing title, description, and "View Specs" button that opens a PDF. Fetch from GET /api/v1/product-specs.

3. BACKEND — New API Endpoints: Public GET /api/v1/style-sheets, public GET /api/v1/product-specs, plus full admin CRUD for both at /api/v1/admin/style-sheets and /api/v1/admin/product-specs. Create DB migration for both tables.

4. ADMIN PANEL — Style Sheets Management Page: table with Style Number, Image thumbnail, PDF, Sort Order, Active toggle, Edit/Delete. Modal with image/PDF upload via POST /api/v1/upload. Add to sidebar under "Content" section.

5. ADMIN PANEL — Product Specs Management Page: same pattern. Add to sidebar under "Content" section.

6. REMOVE EMOJIS FROM ALL NEW PAGES — Replace with Icons: In all recently created customer pages (About, Contact, Private Label, Print Guide, Privacy Policy, Style Sheets, Product Specs), replace decorative emoji icons with lucide-react components. Keep emojis that are part of textual content.

## Response snapshot

**Backend**:
- `backend/app/api/v1/admin/style_sheets.py` — inline SQLAlchemy model `StyleSheet` + full CRUD (GET, POST, PUT, DELETE) with admin auth
- `backend/app/api/v1/admin/product_specs.py` — inline SQLAlchemy model `ProductSpec` + full CRUD
- `backend/app/api/v1/style_sheets.py` — public GET returns active style sheets (imports model from admin module)
- `backend/app/api/v1/product_specs.py` — public GET returns active product specs
- `backend/app/api/v1/upload.py` — generic `POST /api/v1/upload` handles images (resize + JPEG) and PDFs; returns `{ url, file_name, type }`
- `backend/migrations/versions/r1s2t3u4v5w6_add_style_sheets_product_specs.py` — creates `style_sheets` and `product_specs` tables, `down_revision = "q0r1s2t3u4v5"`
- `backend/app/main.py` — registered 5 new routers: style_sheets, product_specs, upload, admin_style_sheets, admin_product_specs

**Customer Pages**:
- `/style-sheets` — full 4-column grid; cards with black style number badge (STYLE above number), hover effect, PDF download link; empty state with FileText icon
- `/product-specs` — card grid with FileText icon, title, description (2-line clamp), "View Specs" button linking to PDF; empty state with Ruler icon

**Admin Pages**:
- `/admin/style-sheets` — table (Image thumb, Style #, PDF link, Sort, Active toggle, Edit/Delete) + modal with image upload (preview), PDF upload, sort order, active checkbox
- `/admin/product-specs` — table (Title, Description truncated, PDF link, Sort, Active toggle, Edit/Delete) + modal with textarea for description, PDF upload, active checkbox

**AdminSidebar**:
- Added "Content" section between Marketing and Settings
- Content dropdown with SubLinks: "Style Sheets" → /admin/style-sheets, "Product Specs" → /admin/product-specs
- `isContentActive` + `contentOpen` state wired up correctly

**Emoji → Lucide replacements**:
- About: `Factory`/`Palette`/`Zap`/`Leaf` for value cards; `Factory`/`Package` for placeholder images
- Contact: `Phone`/`Mail`/`MapPin`/`Clock` for info cards; `Briefcase`/`Wrench`/`Tag` for dept cards; `CheckCircle` for success state
- Private Label: `Shirt`/`Store`/`Printer` for "Who It's For" cards; `Shirt` for hero placeholder
- Print Guide: `Printer`/`Palette`/`Droplets`/`Scissors`/`Square`/`BookOpen` for method card headers
- Privacy Policy: `Package`/`ShoppingCart`/`FileText`/`Lock` for sidebar nav icons

## Outcome

- ✅ Impact: Style Sheets and Product Specs fully implemented end-to-end (backend models + migrations + public/admin API + customer pages + admin management pages)
- ✅ New upload endpoint at POST /api/v1/upload handles images and PDFs generically
- ✅ AdminSidebar gains "Content" section with Style Sheets and Product Specs
- ✅ All 5 customer pages (About, Contact, Private Label, Print Guide, Privacy Policy) + new pages cleaned of decorative emojis → Lucide icons
- 🧪 Tests: Manual
- 📁 Files: 17 files created/modified
- 🔁 Next prompts: null
- 🧠 Reflection: Used inline SQLAlchemy model pattern (same as taxes.py). Public endpoints import model from admin module to share model definition. Generic upload endpoint uses S3 or local media path based on config.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
