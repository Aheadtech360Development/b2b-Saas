---
id: 615
title: Uploads never kept on the server's disk
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner picks option 1 (refuse an upload ImageKit will not take instead of keeping it on the server's disk), then sends the Production job page with its picture broken
labels: ["imagekit", "uploads", "media", "production", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/imagekit_service.py
 - backend/app/api/v1/upload.py
 - backend/app/api/v1/tshirt_designs.py
 - backend/app/api/v1/admin/products.py
 - backend/app/api/v1/admin/media.py
 - backend/app/api/v1/admin/builder.py
 - backend/tests/test_upload_never_on_server_disk.py
 - frontend/src/lib/download.ts
 - frontend/src/app/(admin)/admin/production/[id]/page.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin/gang-sheets/page.tsx
 - frontend/src/app/(customer)/account/artwork/page.tsx
 - frontend/src/app/(customer)/account/gang-sheets/[id]/page.tsx
 - frontend/src/components/admin/OrderGangSheets.tsx
 - frontend/src/components/storefront/AutoBuildPanel.tsx
 - frontend/src/components/storefront/GangSheetCanvas.tsx
 - frontend/src/components/storefront/GangSheetStudio.tsx
 - frontend/src/components/storefront/UploadBySizeModal.tsx
 - frontend/src/__tests__/download-original-file.test.ts
tests:
 - backend test_upload_never_on_server_disk.py (2): ImageKit tried twice then 503 "upload it again"; the artwork endpoint with ImageKit failing answers 503 and writes nothing to the disk; with the media, original-file and t-shirt tests 41 passed
 - frontend download-original-file.test.ts (4, one new for the picture fallback); tsc clean; whole suite (see the run)
---

## Prompt

hn 1 wala krdo simple

(then, interrupting: a screenshot of the Production job page for order 1011, Own sheet 22x30: the sheet layout and the artwork picture broken, Artwork files "Diseño sin título.png 21.74 × 29.65 in, qty 1, Not checked, Download")

## Response snapshot

Option 1: every upload to ImageKit goes through imagekit_service.upload_or_refuse, tried twice (with a longer timeout for big files), and when ImageKit still will not take it the person is told to upload again (503); the buyer's artwork, the generic upload, t-shirt print files, product pictures, the Media library and builder fonts. Product flyers, which never used ImageKit and went to the disk, go to ImageKit too. Only a setup with no ImageKit at all (a developer's machine) still uses the disk. The job in the screenshot places the artwork that was on the disk and is gone (404), so nothing can draw it; the same design is the order's print-ready file on ImageKit (4488 × 6120 px, the exact proportion of 21.74 × 29.65 in, about 206 DPI), which downloads now. Pictures of uploaded files (sheet layout, thumbnails, the builders) now show the file itself once when ImageKit will not deliver them, so a big file shows instead of breaking.

## Outcome

- ✅ Impact: no upload can again look saved and vanish at the next deploy; big uploaded files show in the layout and thumbnails.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: build, commit and push on the owner's yes; for order 1011, print from the print-ready file or ask the buyer for the file again.
- 🧠 Reflection: the flyer path never touched ImageKit, so it was losing files the same way and nobody had noticed.
