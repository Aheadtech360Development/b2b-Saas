---
id: 596
title: Video in the media library
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner asks whether the media library (ImageKit) can take videos too
labels: ["media", "imagekit", "video", "planning"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/596-video-in-the-media-library.general.prompt.md
tests:
 - none (read: admin/media.py takes any file but reads it whole into memory and sends it on; every picker says accept="image/*"; ImageKit plans and limits from imagekit.io, 2026-11-05)
---

## Prompt

acha oisme mjhy na ek option bhi banna ha wo ye bnana ha mere bhai ke abhi image library mei images jarhin hain mjhy video ka bhi opton dena ha kia possible ha image kit mei ye cheez jani batao zara meri jan

## Response snapshot

Yes, ImageKit stores and serves video. Limits (imagekit.io): free plan 100 MB per video, Lite 300 MB, Pro 2 GB; 500 video processing units a month on free (1 second SD = 1 unit, HD = 2), Lite $9 with 500, Pro $89 with 5,000; repeat views cost only bandwidth; the account is free (20 GB bandwidth a month) and shared by every brand, and a free allowance that runs out stops working till next month. On our side: pickers accept images only, and uploads pass through our server whole (big videos would weigh on Railway), so videos should go straight from the browser to ImageKit with a signed upload. Asked where videos should show (product page, website builder section, library only), the size limit, and the ImageKit plan; recommended a first step of library + product page.

## Outcome

- ✅ Impact: the owner can decide scope and plan before a build.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's choices, then build.
- 🧠 Reflection: none.
