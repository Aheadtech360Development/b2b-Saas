---
id: 523
title: Website builder picture upload always failed
stage: general
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: none
branch: fix/builder-upload
user: Aheadtech360Development
command: Screenshot of the builder's Theme panel (Browser tab icon, "That upload did not work. Try again.") with the report that brands cannot upload images on the storefront
labels: ["website-builder", "uploads", "live-fix", "api-client"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/lib/api-client.ts (encode: a FormData goes as a form on post, put and patch)
 - frontend/src/__tests__/api-client.test.ts (+2)
 - history/prompts/general/523-builder-picture-upload-fails.general.prompt.md
tests:
 - frontend api-client 9 passed (2 new: FormData goes as a form on post/put/patch with no JSON content type; anything else still JSON); tsc clean
 - read only: the ImageKit key in backend/.env lists files (200) and the account is far inside its limits (1.8 GB bandwidth, 436 MB storage in 30 days)
---

## Prompt

acha ye abhi rhi rkho mei stripe wala dalta hn abhi ek isse live pe ye agya ha ke jo brands hain qwo storefront pe jake upload krrhy kch na to wo nh image upload nh hori ye dekho yar

(screenshot: website builder, Theme panel, Browser tab icon: "That upload did not work. Try again.")

## Response snapshot

Not ImageKit: its key and account are fine. Every picture field in the website builder (the tab icon, logos, image blocks) uploads through builderService.uploadImage, which passed the file as a FormData to apiClient.post; post turned every body into JSON, so the server got "{}" with a JSON content type, no file, and refused it. Font uploads in the builder had the same fault. Every other upload in the product already used postForm. Fixed in the client: post, put and patch now send a FormData as the form it is, so no caller can fall into this again. Built on a worktree of live main (branch fix/builder-upload), waiting for the owner's yes to push.

## Outcome

- ✅ Impact: brands can upload pictures and fonts in the website builder again once pushed.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push on the owner's yes, then a check on the live site; the Stripe test key for the Retail sitting.
- 🧠 Reflection: a helper that serialises every body silently breaks the one caller that passes a form; make the helper tell them apart rather than trust every caller to pick the right method.
