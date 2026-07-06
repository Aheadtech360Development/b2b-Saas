---
id: 186
title: Blog Posts Not Showing — Force Dynamic RSC Fix
stage: general
date: 2026-05-13
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix blog posts not showing on frontend blog page. Read files first.
labels: ["blog","frontend","nextjs","rsc","cache","fix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/blog/page.tsx
  - frontend/src/app/(customer)/blog/[slug]/page.tsx
tests:
  - none
---

## Prompt

Fix blog posts not showing on frontend blog page. Read files first.

## Response snapshot

**Root cause (two issues):**

1. **ISR cache masking published posts** — `getPosts()` used `{ next: { revalidate: 60 } }`. When the page was first SSR'd with no published posts, Next.js cached the empty response. Newly-published posts would not appear for up to 60 seconds. With `export const dynamic = "force-dynamic"` absent, the page could also be statically generated at build time with zero posts and never update until the revalidation window expired.

2. **Invalid event handlers in Server Component** — `onMouseEnter`/`onMouseLeave` were placed directly on `<article>` DOM elements inside `BlogListingPage` (a React 19 Server Component). React 19 enforces RSC rules more strictly; event handlers in Server Components are invalid and can cause serialization errors that prevent the component from rendering (falling back to empty state silently since `getPosts` catches all errors and returns `[]`).

**Fix — `frontend/src/app/(customer)/blog/page.tsx`:**
- Added `export const dynamic = "force-dynamic"` (forces per-request SSR, matches `products/page.tsx` pattern)
- Changed `{ next: { revalidate: 60 } }` → `{ cache: "no-store" }` in `getPosts()`
- Removed `onMouseEnter`/`onMouseLeave` event handlers from `<article>`
- Replaced with `className="blog-card"` + inline `<style>` block using CSS `:hover` for the box shadow

**Fix — `frontend/src/app/(customer)/blog/[slug]/page.tsx`:**
- Added `export const dynamic = "force-dynamic"`
- Changed both `{ next: { revalidate: 60 } }` → `{ cache: "no-store" }` in `getPost()` and `getAllPosts()`

## Outcome

- ✅ Impact: Published blog posts now appear immediately on `/blog` and `/blog/[slug]`; hover effect preserved via CSS; no invalid RSC event handlers
- 🧪 Tests: Manual — publish a blog post in admin, visit /blog and verify it appears; check hover effect on cards
- 📁 Files: 2 files changed
- 🔁 Next prompts: none
- 🧠 Reflection: Blog listing page was missing `export const dynamic = "force-dynamic"` that all other dynamic pages have. ISR caching + RSC event handler violations combined to silently suppress posts. Always check for missing `dynamic = "force-dynamic"` when a data-fetching Server Component shows stale or empty data.

## Evaluation notes (flywheel)

- Failure modes observed: ISR cache hiding newly-published content; RSC event handlers causing silent render failures in React 19
- Graders run and results (PASS/FAIL): not run
- Prompt variant (if applicable): none
- Next experiment: none
