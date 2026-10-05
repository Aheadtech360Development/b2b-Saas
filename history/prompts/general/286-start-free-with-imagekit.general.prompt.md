---
id: 286
title: Start free with ImageKit
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: which tool for background removal and upscaling to start with — free, no card; ImageKit is already in use
labels: ["gang-sheet-builder", "background-removal", "upscale", "imagekit", "recommendation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none changed (read backend/app/api/v1/upload.py to confirm artwork is stored on ImageKit)
tests:
 - none (advice only)
---

## Prompt

chalo bg remover aur upscaling kre lie kia use krein hum zara batao jaldi se abhi kia sai rhega shru mei free api ya card na lagana pare image kit to already mei use krrha hn

## Response snapshot

Start with ImageKit: gang sheet artwork is already uploaded there (confirmed in `upload.py`), so its own background removal and upscale work on the same file by adding a parameter to its address — no new account, key or card.

- Free allowance, from ImageKit's pricing page (checked 2026-10-06): 650 extension units a month on the free plan; a background removal uses 10 and an upscale 5, so about 65 removals or 130 upscales a month, shared.
- Flat-background artwork (logos, text) is done by colour in the browser, free and unlimited, so the allowance is spent only on photos.
- Built behind one server function, so moving to Cloudflare Images (5,000 a month included) later is a change in one place.

Not confirmed: quality on real DTF artwork; which ImageKit plan the account is on; speed — ImageKit's docs say a few seconds to a minute. Limits: upscale takes files under 16 megapixels and returns 16.

Asked for a go-ahead.

## Outcome

- ✅ Impact: one recommendation that needs nothing new from the owner.
- 🧪 Tests: none.
- 📁 Files: none.
- 🔁 Next prompts: go-ahead to build.
- 🧠 Reflection: answered in a few lines, as asked.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run three of the client's own files through ImageKit's removal and look at the edges.
