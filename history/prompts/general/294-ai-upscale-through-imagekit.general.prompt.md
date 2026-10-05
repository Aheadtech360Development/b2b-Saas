---
id: 294
title: AI upscale through ImageKit
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: yes — use the old (the site's own) ImageKit account for AI upscaling
labels: ["gang-sheet-builder", "upscale", "imagekit", "image-editor", "secrets"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/image_upscale.py (new — what is sent to ImageKit and how its answer is put back together)
 - backend/app/api/v1/upload.py (POST /upload/upscale), backend/app/core/config.py (IMAGE_TOOLS_UPSCALE_DAILY_CAP), backend/app/middleware/auth_middleware.py (open to guests)
 - frontend/src/components/storefront/ImageEditorModal.tsx (Upscale now asks the server), WorkingOverlay.tsx (comment)
 - backend/tests/test_image_upscale.py (new)
tests:
 - backend tests/test_image_upscale.py 16/16 — ImageKit stood in for by a plain enlargement
 - the real ImageKit (the site's account), through the new service: a transparent logo 400x250 came back 1600x1000, still transparent, in 16 s; an ordinary 320 px picture came back 1280 px in 15 s
 - found first: sent as it is, a transparent design comes back from ImageKit on solid black
 - frontend tsc: no new errors
---

## Prompt

With a screenshot of ImageKit's API keys page for the site's own account:

private_[REDACTED] public_[REDACTED] hn ye lo purana wala

(Both keys were typed in full. They are left out here on purpose: this file is committed, and this private key is the one the live site uploads with.)

## Response snapshot

Said first: this is the live site's key and it has now been typed into a chat. It was not needed — the site's settings already hold it — and it should be replaced, carefully, because uploads depend on it: new key into Railway and the local env file, redeploy, then delete the old one. Nothing here wrote it anywhere.

Then built the upscale on that account, as answered ("yes, the old one"):

- The image editor's **Upscale** — reached from all three places that offer it — now sends the picture to our API, which has ImageKit upscale it and returns a PNG. About fifteen seconds; up to four times the size.
- **Transparency.** ImageKit's upscaler throws it away: a transparent design comes back on black. So a transparent design is sent as two ordinary pictures side by side — its colour, with the colours carried past the edges so no dark fringe forms, and its transparency — upscaled together in one request, and joined again afterwards. Checked on the real service: sharp, and still see-through.
- Limits, because the platform pays and each one takes ImageKit ten seconds or more: 8 per caller per ten minutes, 30 per shop per day; pictures over about 4 megapixels are told they are already large enough.
- The copy sent to ImageKit goes in a working folder and is deleted as soon as the answer is in.
- The button's own text now says what it is good at, and to check faces on photos of people.

## Outcome

- ✅ Impact: an upscale that sharpens, and does not cost a design its transparent background.
- 🧪 Tests: as listed. The live endpoint is to be asked once after deploy.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: the key replaced; the owner's own test; sharpen and the other instant options if wanted.
- 🧠 Reflection: the first trial used pictures with no transparency and looked finished. Trying the kind of file that is actually printed is what showed the black background.

## Evaluation notes (flywheel)

- Failure modes observed: a service that silently flattens transparency; a secret typed into chat twice in a row.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a real low-resolution customer design through the live editor.
