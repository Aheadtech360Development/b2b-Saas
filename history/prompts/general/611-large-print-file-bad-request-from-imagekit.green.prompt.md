---
id: 611
title: Large print file Bad Request from ImageKit
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner reports a live order's print-ready file opening as "Bad Request" on ImageKit
labels: ["imagekit", "orders", "gang-sheets", "downloads", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/download.ts
 - frontend/src/components/admin/GangSheetLineFiles.tsx
 - frontend/src/app/(admin)/admin/orders/[id]/page.tsx
 - frontend/src/app/(admin)/admin/production/[id]/page.tsx
 - frontend/src/app/(admin)/admin/tshirt-designer/page.tsx
 - frontend/src/components/shared/ConfigurationDetail.tsx
 - frontend/src/__tests__/download-original-file.test.ts
 - backend/app/services/artwork/inspect.py
 - backend/app/services/gang_sheet_render.py
 - backend/tests/test_artwork_original_file.py
tests:
 - read-only HEAD/GET to ImageKit for the file of order 1011: the UTF-8 address 400 "Bad Request", other spellings 404 (so the file is there), with tr=orig-true 206 image/png; the PNG header says 4488 x 6120 px (27.5 megapixels), 18,156,720 bytes
 - frontend download-original-file.test.ts (3) with the download, print file, designer and configured line tests: 40 passed; tsc clean
 - backend test_artwork_original_file.py (2) with test_gang_sheet_render.py: 7 passed
 - next build
---

## Prompt

i have downloaded this print readyfile ok and phir ye error arha ha jani isko hamein wo krna ha fporan check kro ye orders ki bat ha dekho kia werror arha ha

(two screenshots: the order's gang sheet line, Print-ready sheet (uploaded), 22" x 30", print ready file "1011-Iris-chavez-Diseño_sin_título_Q_x8PIEJw.png · the buyer's own file"; and the browser on ik.imagekit.io/9vhlgquzw/tenants/innterflow/Diseño_sin_título_Q_x8PIEJw.png showing "Bad Request")

## Response snapshot

Not the Spanish letters: ImageKit sends every image through its optimiser and refuses one past 25 megapixels with 400 Bad Request; this buyer's own sheet is 27.5. ImageKit gives the uploaded file itself with tr=orig-true (checked). Every download (lib/download.downloadFile, used by six screens) and every link to an uploaded file (uploaded sheet preview, configured line artwork, Production job artwork, t-shirt print files) now asks for the original; the server's print check and print-file drawing fetch the original too. Gave the owner the working link for order 1011 at once; the fix waits for the owner's yes to push.

## Outcome

- ✅ Impact: large uploaded print files download, open and print again.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; when the custom image domain (cdn.printcopilot.co) comes, originalFile's host check must include it.
- 🧠 Reflection: a 400 where a misspelt name gives 404 says the file is there and its delivery fails; asking ImageKit for the original proved it before any code changed.
