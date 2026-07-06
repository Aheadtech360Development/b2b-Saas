---
id: 176
title: Seven Final Platform Fixes
stage: general
date: 2026-05-12
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: Fix 7 final issues in AF Apparels
labels: ["bug-fix","contact-email","footer","header","privacy-policy","image-library","wholesale","blog"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - backend/app/api/v1/contact.py
  - frontend/src/components/layout/Footer.tsx
  - frontend/src/components/layout/Header.tsx
  - frontend/src/app/(customer)/privacy-policy/PrivacyPolicyContent.tsx
  - frontend/src/services/admin.service.ts
  - frontend/src/app/(admin)/admin/dashboard/page.tsx
  - backend/app/services/wholesale_service.py
  - backend/app/api/v1/admin/blog_posts.py
tests:
  - none
---

## Prompt

Fix 7 final issues in AF Apparels. Read ALL relevant files before making changes.

FIX 1: Contact form email — use professional branded HTML format with EmailService._base_template, proper department labels, reply-to submitter.

FIX 2: Footer auth-aware links — "Apply for Wholesale" goes to /wholesale/register when not logged in, /account when logged in. "Log In" becomes "My Account" when logged in.

FIX 3: Header Resources dropdown — add Privacy Policy link with Lock icon.

FIX 4: Privacy Policy sidebar — remove "Apply for NET 30" link.

FIX 5: Image library (product page) — downloads should open in new tab / trigger file download.

FIX 6: Admin reject application shows "Request failed" — field name mismatch (sent `reason`, backend expects `rejection_reason`). Also reject used PATCH not POST.

FIX 7: Admin Blog — "Error saving" when saving blog post. The BlogPost model uses `onupdate="now()"` which causes asyncpg to reject a Python string as a TIMESTAMP bind parameter.

## Response snapshot

FIX 1: contact.py rewritten to use EmailService._base_template for branded HTML table layout. Admin notification sent to ADMIN_NOTIFICATION_EMAIL with reply-to set to submitter's email. Confirmation email sent to submitter.

FIX 2: Footer.tsx converted to "use client" component, useAuthStore imported, Account section links made conditional on auth state.

FIX 3: Header.tsx — Lock icon added to lucide imports, Privacy Policy entry added to Resources dropdown array.

FIX 4: PrivacyPolicyContent.tsx — "Apply for NET 30" anchor removed from sidebar Quick Links.

FIX 5: ProductDetailClient.tsx — image library already implemented correct fetch→blob→anchor download; no change needed.

FIX 6 frontend: admin.service.ts rejectApplication — changed payload from `{ reason }` to `{ rejection_reason: reason || "Rejected by admin" }`. dashboard/page.tsx — changed apiClient.patch → apiClient.post with proper body.

FIX 6 backend: wholesale_service.py reject() — added `await self.db.commit()` after flush(); wrapped Celery task call in try/except (non-fatal).

FIX 7: blog_posts.py — added `func` to sqlalchemy imports; changed `onupdate="now()"` to `onupdate=func.now()` so SQLAlchemy generates a server-side SQL expression instead of passing a Python string as a TIMESTAMP bind parameter to asyncpg.

## Outcome

- ✅ Impact: Contact emails now use branded layout; footer/header are auth-aware; reject application no longer fails with 422/405; blog posts can be saved/updated without asyncpg TIMESTAMP type error
- 🧪 Tests: Manual verification required — no automated tests added
- 📁 Files: 8 files modified across frontend and backend
- 🔁 Next prompts: Verify wholesale rejection flow end-to-end; test blog post save/update in admin
- 🧠 Reflection: Two root causes repeated from previous sessions — asyncpg UUID/timestamp type strictness, and field name mismatches between frontend service layer and backend Pydantic schemas

## Evaluation notes (flywheel)

- Failure modes observed: onupdate="now()" string passed as Python scalar to asyncpg TIMESTAMP column; frontend service sending wrong field name (`reason` vs `rejection_reason`); HTTP method mismatch (PATCH vs POST) on reject endpoint
- Graders run and results (PASS/FAIL): none
- Prompt variant (if applicable): none
- Next experiment (smallest change to try): Add field name unit test between service layer payloads and Pydantic schemas to catch mismatches earlier
