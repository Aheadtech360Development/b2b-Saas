---
id: 283
title: Gang sheet image tools alternative
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: gang sheet builder — background removal and enhance are slow and the results are poor; is there a better alternative
labels: ["gang-sheet-builder", "background-removal", "upscale", "recommendation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed (read frontend/src/lib/backgroundRemoval.ts and frontend/src/components/storefront/ImageEditorModal.tsx)
tests:
 - none (advice only)
---

## Prompt

boss ab ajaty hain gang sheet builder pr saiha mere ab gang sheet builder ka ye issue arha ha mere bhai ke usme ye horha ha jo usme third party tools use horhy hain na background removal wagera enhancer wagera ke wo loading mei yar bhut time lerhy client bhut gussa krrha aur results bhi achy nh arhy to koi tumhare pass iska acha alternative ha kia

## Response snapshot

What the code does today (read, not assumed):

- Background removal is `@imgly/background-removal` running in the buyer's own browser: a large model is downloaded on first use, then it runs on the buyer's device (GPU when the browser offers one, otherwise the CPU). That is the slow loading.
- The artwork is shrunk to 2048 px on its longest edge before the model sees it, and the result replaces the artwork, so a larger design loses print resolution.
- The model looks for a photo's subject. Most DTF artwork is a logo, text or clip-art on a flat background, where it eats thin text and separate parts.
- "Upscale" is not AI: it is a plain 2× canvas resize, so nothing gets sharper.

Recommended instead:

1. Flat-background artwork: remove the background by its colour, from the edges inwards. Instant, full resolution, no model, no cost.
2. Photos: run the AI on a GPU service from our server, not on the buyer's device. Suggested fal.ai with BiRefNet for the cut-out.
3. Upscale: a real AI upscaler that keeps the design as it is (Real-ESRGAN on the same service).
4. The buyer keeps working while it runs; the original is always kept; before/after shown.

Fallback offered: ImageKit's own AI transforms, since ImageKit is already in use — quickest to wire, less control over quality.

Prices given as approximate and unverified today; to be confirmed on the provider's page before wiring. Asked for: a go-ahead, the provider key in Railway (never in chat), and who pays — suggested the platform's key with a monthly limit per plan.

## Outcome

- ✅ Impact: the owner has the cause of both complaints and one recommended route.
- 🧪 Tests: none; nothing was changed.
- 📁 Files: none.
- 🔁 Next prompts: the go-ahead and the billing choice; then build step 1 first (no key needed).
- 🧠 Reflection: answered from two file reads, as asked — no local run.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): colour-based removal for flat artwork, chosen automatically when the border of the image is one colour.
