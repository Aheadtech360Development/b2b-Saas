---
id: 149
title: Pages SEO Management + Blog System
stage: general
date: 2026-05-06
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Add Pages SEO admin section + full Blog system with block editor
labels: ["seo", "blog", "admin", "content", "block-editor"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/migrations/versions/t3u4v5w6x7y8_add_page_seo_blog_posts.py
  - backend/app/api/v1/admin/pages_seo.py
  - backend/app/api/v1/pages_seo.py
  - backend/app/api/v1/admin/blog_posts.py
  - backend/app/api/v1/blog_posts.py
  - backend/app/main.py
  - backend/app/middleware/auth_middleware.py
  - frontend/src/components/admin/BlogBlockEditor.tsx
  - frontend/src/components/layout/AdminSidebar.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/app/(admin)/admin/pages/page.tsx
  - frontend/src/app/(admin)/admin/pages/[slug]/edit/page.tsx
  - frontend/src/app/(admin)/admin/blogs/page.tsx
  - frontend/src/app/(admin)/admin/blogs/new/page.tsx
  - frontend/src/app/(admin)/admin/blogs/[id]/edit/page.tsx
  - frontend/src/app/(customer)/blog/page.tsx
  - frontend/src/app/(customer)/blog/[slug]/page.tsx
  - frontend/src/app/page.tsx
  - frontend/src/app/(customer)/about/page.tsx
  - frontend/src/app/(customer)/print-guide/page.tsx
  - frontend/src/app/(customer)/private-label/page.tsx
  - frontend/src/app/(customer)/contact/page.tsx
  - frontend/src/app/(customer)/contact/ContactContent.tsx
  - frontend/src/app/(customer)/privacy-policy/page.tsx
  - frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx
  - frontend/src/app/(customer)/style-sheets/page.tsx
  - frontend/src/app/(customer)/style-sheets/StyleSheetsContent.tsx
  - frontend/src/app/(customer)/product-specs/page.tsx
  - frontend/src/app/(customer)/product-specs/ProductSpecsContent.tsx
tests:
  - none
---

## Prompt

Add the following two major features to the AF Apparels admin panel:

**Feature 1: Pages SEO Management (Under Content dropdown in admin sidebar)**
- Admin list page at /admin/pages showing all website pages with SEO status
- Admin edit page at /admin/pages/[slug]/edit for per-page meta title, description, keywords, OG image
- Backend: page_seo table + GET/PATCH admin endpoints + public GET /api/v1/pages-seo/{slug}
- Apply generateMetadata() to all customer-facing pages using the public endpoint

**Feature 2: Blog System (Under Content → Blogs in admin sidebar)**
- Admin list, new, and edit pages with full block-based editor
- Block types: paragraph, heading (H2/H3/H4), bullet_list, numbered_list, cta_box, info_box, insight_box, image, table
- Blog post fields: cover image, title, slug, published date, read time, excerpt, tags, status, article body (JSON blocks), FAQ section, SEO fields
- Backend: blog_posts table + admin CRUD endpoints + public GET (published only)
- Customer blog listing at /blog (server component with generateMetadata)
- Customer blog post at /blog/[slug] with rendered blocks, FAQ accordion, related posts
- Blog link added to Header Resources dropdown and Footer Resources column

## Response snapshot

**Backend — 2 new tables:**
- `page_seo`: page_slug (unique), meta_title (60), meta_description (160), keywords, og_image_url, updated_at
- `blog_posts`: title, slug (unique), cover_image_url, published_date, read_time, excerpt, article_body (JSONB), faq (JSONB), tags (TEXT[]), status (draft/published), SEO fields, timestamps

**Backend — new routers (all using PATCH for updates, consistent with codebase):**
- `admin/pages_seo.py`: GET list, GET/{slug}, PATCH/{slug} (upsert)
- `pages_seo.py`: public GET /{slug}
- `admin/blog_posts.py`: GET, POST, PATCH/{id}, DELETE/{id}
- `blog_posts.py`: public GET (published only), GET/{slug}
- Auth middleware: /api/v1/pages-seo and /api/v1/blog-posts added to _is_public()
- main.py: routers registered, CREATE TABLE IF NOT EXISTS fallbacks added to _ensure_content_tables()

**Frontend Admin:**
- `BlogBlockEditor.tsx`: 9 block types (paragraph/heading/bullet/numbered list/cta_box/info_box/insight_box/image/table), add-block picker, move up/down, delete per block
- AdminSidebar: "Pages SEO" and "Blogs" added to Content section
- `/admin/pages`: table listing all 9 predefined pages with meta title preview + Last Updated
- `/admin/pages/[slug]/edit`: meta title (60 char counter), meta description (160 char counter), keywords tag input, OG image upload
- `/admin/blogs`: post list table with status badge, delete confirmation
- `/admin/blogs/new`: quick-create (title + slug + status) → redirects to edit
- `/admin/blogs/[id]/edit`: full form — card info, article body (block editor), FAQ, SEO section

**Frontend Customer:**
- Blog listing `/blog`: server component, 3-col card grid, generateMetadata from page_seo
- Blog post `/blog/[slug]`: server component, cover hero, article body rendered from JSON blocks, FAQ accordion (details/summary), related posts section, generateMetadata from blog post SEO fields
- Header: Blog link added to Resources dropdown
- Footer: Blog link added to Resources section
- Server pages with generateMetadata: home, about, print-guide, private-label
- Client pages wrapped with server components: contact, privacy-policy, style-sheets, product-specs (each original page.tsx → [Page]Content.tsx, new server page.tsx exports generateMetadata + renders client component)

## Outcome

- ✅ Impact: Admins can now manage SEO for all 9 website pages and publish blog posts with rich block content; customer-facing blog + dynamic metadata on all pages
- 🧪 Tests: none added (UI and data features)
- 📁 Files: 30 files created/modified
- 🔁 Next prompts: run migrations on production backend to create page_seo and blog_posts tables
- 🧠 Reflection: Client pages needing generateMetadata require a server wrapper pattern (rename original to [Page]Content.tsx, new page.tsx is the server shell); blog fetch must be Array.isArray-guarded since the table may not exist on production during build

## Evaluation notes (flywheel)

- Failure modes observed: Production backend returns 500 during build (table doesn't exist) → fetch returns error JSON instead of array → `a.map is not a function` prerender failure; fixed with `r.ok` guard + `Array.isArray` guard
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): none
