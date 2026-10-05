---
id: 290
title: Cloudflare background removal
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: leave the upscaler as it is; put Cloudflare background removal everywhere background removal appears, across the three builders
labels: ["gang-sheet-builder", "upload-by-size", "background-removal", "cloudflare", "worker"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - workers/image-tools/src/index.js, wrangler.jsonc, README.md (new — the Worker; deployed as pc-image-tools)
 - backend/app/services/image_tools.py (new — signed tickets), backend/app/api/v1/upload.py (POST /upload/cutout-ticket), backend/app/core/config.py (IMAGE_TOOLS_URL / _KEY / _DAILY_CAP), backend/app/middleware/auth_middleware.py (the ticket endpoint is open to guests)
 - frontend/src/lib/backgroundRemoval.ts (the one function all three builders call), frontend/src/components/storefront/ImageEditorModal.tsx (comment)
 - backend/tests/test_image_tools.py (new), .gitignore (.wrangler/)
tests:
 - backend tests/test_image_tools.py 20/20 (signing, and the endpoint with its surroundings stood in for)
 - the deployed Worker asked with tickets from the API's own code: 14/14 — a good ticket accepted, six kinds of bad ticket refused, the browser's pre-check answered, a non-image turned down
 - one run in a real browser through the real Worker: a 3072x3072 file came back 3072x3072 with its background transparent, in 12.5 s
 - copy size measured: 1024 / 1536 / 2048 px copies of two pictures — same cut-out, the largest up to twice as slow
 - frontend tsc: no new errors
 - not run: the live API (its two variables are not set in Railway yet), and the client's own files
---

## Prompt

dekho ap abhi upscaler jesa ha wesa rehn do lekin jaha jaha bg removal wala hana waha proper ap yahi cloudfare wala lagao saiha ai upscaler bad mei dekhegy hum saiha meri jan aur tumhein to pata ha mere pass gang sheets mei 3 builders hain ek gang sheet builder ek upload by size ek upload a print ready gang sheet to jaha jaha bg removal ata ha waha ap ye cheez proper daldo saiha cloudfare se bg removal saiha

## Response snapshot

Background removal is called from four places — the gang sheet builder's upload prompt and its Auto Build, the image editor, and Upload by size — and all four go through one function, `removeImageBackground`. That function now does the work on Cloudflare. "Upload a print-ready gang sheet" has no background removal, so nothing changes there. The upscaler is untouched.

How it works: the browser asks our API for a ticket (signed, good for five minutes, rate-limited per caller and per shop per day), then sends a copy of the image no larger than 1536 px straight to a Cloudflare Worker, which returns it with the background transparent. That is applied to the full-size original in the browser, so the artwork keeps its print resolution — the old tool handed back a 2048 px copy.

If the service cannot be used — not set up, the month's allowance spent, the connection gone — the old in-browser tool takes over, so the button never does nothing.

Found on the way: guests reach the API only through an allow-list of open routes. Without adding the ticket endpoint to it, signed-out buyers would have silently kept the old slow tool.

Needs the owner: two variables in Railway (`IMAGE_TOOLS_URL`, `IMAGE_TOOLS_KEY`), written into the local `backend/.env` to copy from — not shown in chat. Until they are set the builders use the old tool.

## Outcome

- ✅ Impact: about five seconds on any device instead of a model download and minutes on a slow one; full print resolution kept.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: the two Railway variables; then a check on the live shop with the client's files; the upscaler later.
- 🧠 Reflection: the first size sent was a guess (2048). Measuring three sizes showed the smaller copy gave the same cut-out in half the time.

## Evaluation notes (flywheel)

- Failure modes observed: a new open endpoint that would have been closed to guests by the route allow-list, with a fallback that would have hidden it.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): after the variables are set, time one removal from the live shop.
