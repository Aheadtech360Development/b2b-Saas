---
id: 613
title: Artwork on the server's disk asks for sign-in
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner shows a buyer's artwork link on the backend answering "Authentication required"
labels: ["media", "auth", "orders", "gang-sheets", "bugfix"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/middleware/auth_middleware.py
 - backend/tests/test_media_files_open.py
tests:
 - backend test_media_files_open.py (2): a file under /media opens without sign-in (200), a folder lists nothing (404), a missing file 404, climbing out with encoded dots 400/404; the API stays closed; with test_tshirt_designs.py and test_partner_auth.py 16 passed; ruff clean on the new test, the middleware's count unchanged
---

## Prompt

ye ku arha ha bhai ab meri jan

(screenshot: b2b-saas-production.up.railway.app/media/artwork/328c3503-7c0e-4cb8-b1c1-3fd9176c0777/Diseño%20sin%20título.png answering {"error":{"code":"UNAUTHORIZED","message":"Authentication required"}})

## Response snapshot

This artwork is not on ImageKit: when ImageKit refuses an upload, upload/artwork keeps the file on the backend's own disk under /media/artwork/<random>/, and every path but the listed public ones needs a sign-in, which a browser tab never carries, so such files never opened from a link. Opened /media/* like an ImageKit address (random folder, nothing listed, read only). Said plainly that /app/media is made at start with no volume in the repo's config: unless Railway has a volume there, a file kept on that disk is gone after a deploy, and the link will then say Not Found; the file must then come from the buyer again. Recommended (owner's call) refusing an upload when ImageKit fails rather than keeping it on a disk that does not last.

## Outcome

- ✅ Impact: files the server keeps itself open from their links again (where they still exist).
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes, then check whether this file is still on the server; decide about the disk fallback.
- 🧠 Reflection: a fallback that writes to a container's own disk looks like it worked and can lose the file at the next deploy; worth saying before the owner finds out from a customer.
