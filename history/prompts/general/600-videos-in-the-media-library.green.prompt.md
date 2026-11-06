---
id: 600
title: Videos in the media library
stage: green
date: 2026-11-06
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner (from the manager) wants videos in the media library, a link usable anywhere, and the builder's video section choosing from the library's videos
labels: ["media", "imagekit", "video", "website-builder"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/config.py
 - backend/app/services/imagekit_service.py
 - backend/app/api/v1/admin/media.py
 - backend/tests/test_media_video.py
 - frontend/src/lib/videoUrl.ts
 - frontend/src/services/media.service.ts
 - frontend/src/app/(admin)/admin/media/page.tsx
 - frontend/src/components/admin/MediaPicker.tsx
 - frontend/src/components/builder/render.tsx
 - frontend/src/components/builder/editor/fields.tsx
 - frontend/src/components/builder/editor/SiteEditor.tsx
 - frontend/src/lib/builder/registry.ts
 - frontend/src/lib/builder/baseCss.ts
 - frontend/src/__tests__/media-video.test.tsx
tests:
 - backend tests/test_media_video.py (11): the signed permission pins folder, size and video; file names; too big 413, not a video 400; no public key no videos; a video never through the server upload; the list says it takes videos
 - frontend media-video.test.tsx (10) with every builder test, brand-logos, options builder (294); tsc clean in src
 - not run: a real upload, because backend/.env's ImageKit key is the LIVE library (no test uploads); the first real upload after the deploy is the check
---

## Prompt

ary dekho video ka scene yahi hoga na simple jese library mei ake apne video daldi saiha url aya aur us url ko kahi bhi dalein to wo video show hojaein smple aur website builder mei bhi agar kahi video ka section ha to select video krein to jitni bhi videos han na library mei simple to sari videos ajaein jo select krun wo ajae show hoke bs simpleas that smjhy kia abhi image ibarry mei sirf image jarhi lekin video bhi jaein as simple as that imagekit use horha abhi video ke lie kia dusre platform pe jana hoga kia hamein

## Response snapshot

No other platform: ImageKit takes video. Built: Media library uploads pictures and videos (a video goes from the browser straight to ImageKit's V2 upload with a JWT our server signs per file, pinning the brand's folder, a size limit MEDIA_VIDEO_MAX_MB default 100 and "file.mime: video"; the server's own upload refuses videos); video cards play in the library with Copy link; picture pickers leave videos out; the builder's Video block takes a library video (Library, Upload, or a pasted YouTube, Vimeo or https video link) and plays it in the browser's player. Committed locally; push waits for the owner.

## Outcome

- ✅ Impact: a shop uploads a video once and uses its link anywhere, and picks it in the website builder.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes; first real upload on live as the check; plan (100 MB per video and 500 processing units a month on the free plan).
- 🧠 Reflection: ImageKit's V2 upload is in beta; the checks syntax is from its docs, not yet tried against the live account.
