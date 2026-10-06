---
id: 306
title: Vercel build and use client order
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: after the deploys the "new version available" bar no longer appears and none of the changes show
labels: ["deploy", "vercel", "build", "next"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin/discounts/page.tsx
 - frontend/src/app/(admin)/admin/customers/tiers/page.tsx
 - frontend/src/app/(admin)/admin/products/categories/page.tsx
 - frontend/src/app/(admin)/admin/products/collections/page.tsx
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
 - frontend/src/app/(customer)/account/orders/[id]/page.tsx
tests:
 - next build (production): passes; before the fix it failed on these six files
 - live /api/version read before the fix: 3fa0ccc, the last build before the dialogs change
---

## Prompt

With a picture of Railway: the backend's latest deploy ("Builder contact form…") active and successful.

ek issue ha sb deploy hochuka ha saiha mere bhai deploy hone ke bad na jo meri app hana isme nechay bottonm center mei ek cheez ati thi new version available esa kch aur reload ka btn to jo change hotin thin wo effect hojatin thin ab unfortunaltely nh arha ha wo cheez aur changes bhi nazar nh arhy hain to plz dekho yar is cheez ko yar mere bhai

## Response snapshot

Railway (the backend) had deployed; the website (Vercel) had not. The live site's `/api/version` answered `3fa0ccc` — the footer fix at 18:21. Every commit after it failed to build on Vercel, so there was no newer build for the "A newer version of this page is available — Reload" bar to offer, and none of those changes reached the site.

The cause was the dialogs change (2d1468d): in six files that begin with a `// path` comment, the new `import … from "@/lib/dialog"` was put above `"use client"`. That directive must come before any import; without it Next treats the page as a server component and the build stops at its `useState`. The type check does not see this, which is why it passed.

Fixed by putting the import back under `"use client"` in all six, with a check that no file in `src` has an import above its directive. `next build` passes locally. Once Vercel builds this commit, the bar appears in open tabs and everything since 18:21 goes live together: the browser-box replacement, gang sheet Auto Build / copies nesting, and the contact form.

## Outcome

- ✅ Impact: the website deploys again.
- 🧪 Tests: production build, as listed.
- 📁 Files: as listed.
- 🔁 Next prompts: confirm `/api/version` shows the new commit.
- 🧠 Reflection: for a change that touches many files, run `next build`, not only the type check — and read `/api/version` after a push.

## Evaluation notes (flywheel)

- Failure modes observed: an automated import insertion that did not recognise a leading `//` comment.
- Graders run and results (PASS/FAIL): next build PASS.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none.
