---
id: 293
title: ImageKit upscale trial
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: check ImageKit's AI upscaling, sharpen, grayscale and the like, with the keys given
labels: ["gang-sheet-builder", "upscale", "imagekit", "trial", "secrets"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed
tests:
 - ImageKit e-upscale on a 400x250 logo and a 320x320 photo: both returned 4x larger in about 12 s; compared with a plain resize pixel by pixel and by eye
 - e-retouch on the photo: returned in about 12 s
 - e-sharpen, e-usm, e-contrast, e-grayscale: each returned in about 1 s
 - the two test pictures were uploaded to a /_trial folder and deleted afterwards
---

## Prompt

With a screenshot of ImageKit's API keys page (a new account, key created that day):

zabardast perfect ab ai upscaling ke lie kch batao yar kia krun zara image kit dekhun public_[REDACTED] private_[REDACTED] ye lo jani check kro imagekiet se zara ai upscaling wgaera sharpen wagera ke jo featuren ha grayscale wagera

(The two keys were typed in full in the message. They are left out here on purpose: this file is committed, and a private key does not belong in a repository.)

## Response snapshot

First, plainly: a private key typed into a chat should be treated as seen — replace it in ImageKit and delete this one. The trial read it from the session's own record in memory; it was not written to any file, command or output.

Then what was found:

- **AI upscale works** on ImageKit — it did not on Cloudflare. Four times larger in about 12 seconds. A logo with small text came back clearly sharper than a plain resize.
- **On a very small photo of people it redraws the faces**: sharper, but not the same faces. That was a hard test (320 px), and it is the case to warn buyers about.
- **AI retouch** works too, about 12 seconds. **Sharpen, unsharp mask, contrast, grayscale** answer in about a second and cost no AI units.
- Cost on the free plan: 5 units an upscale out of 650 a month — about 130.

One thing the owner may not have noticed: these keys belong to a **different ImageKit account** from the one the site uses. The site's artwork is in the other one, so upscaling it there needs no second upload. Asked which account should carry it, with a recommendation (the site's own).

Offered to replace the image editor's "Upscale Quality" — today a plain 2× resize — with this, behind the same kind of per-shop limit as background removal.

## Outcome

- ✅ Impact: an upscaler that measurably upscales, found and tried; its weak spot seen before buyers see it.
- 🧪 Tests: as listed; sample images, not the client's files.
- 📁 Files: none.
- 🔁 Next prompts: which ImageKit account; go-ahead to wire it; the key replaced.
- 🧠 Reflection: the side-by-side is what showed the faces had changed — the numbers only said "different from a plain resize", which is true of a good result and a wrong one alike.

## Evaluation notes (flywheel)

- Failure modes observed: an upscaler that invents detail on faces at very low resolution.
- Graders run and results (PASS/FAIL): upscale on logo PASS; upscale on tiny faces — sharper but altered.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a moderately low-resolution real design (about 1000 px) through e-upscale, which is the case buyers actually bring.
