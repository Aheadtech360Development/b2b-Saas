---
id: 145
title: Fix Multi-Image Upload on Edit Product Page
stage: general
date: 2026-05-04
surface: agent
model: claude-sonnet-4-6
feature: none
branch: main
user: umeradnan7106
command: "When selecting multiple images in +Add Media on products page, only 1 gets added — all selected images should upload"
labels: ["frontend","bug","admin","products","upload"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx
tests:
  - manual: Select 3+ images in +Add Media on edit product page — all images appear in the media gallery
  - manual: Single image selection still works
---

## Prompt

When I go to products and in +Add Media I select multiple images to upload, only 1 gets added. All the images that I select should be added.

## Response snapshot

One-line fix in `handleImageUpload` in `edit/page.tsx`.

**Before:**
```ts
const file = e.target.files[0]!;
await adminService.uploadImage(product.id, file);
```

**After:**
```ts
const files = Array.from(e.target.files);
for (const file of files) {
  await adminService.uploadImage(product.id, file);
}
```

The file input already had `multiple` attribute — the handler just never iterated past the first file. The `load()` call (which refreshes product images) is kept after the loop so it only fires once when all uploads are done.

The new product page (`new/page.tsx`) already handled this correctly with `Array.from(e.target.files)`.

## Outcome

- ✅ All selected images upload on edit product page
- ✅ Single-file selection unchanged
- 🧪 Tests: Manual
- 📁 Files: 1 file modified
- 🔁 Next prompts: null
- 🧠 Reflection: null

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): manual only
- Prompt variant (if applicable): null
- Next experiment (smallest change to try): null
