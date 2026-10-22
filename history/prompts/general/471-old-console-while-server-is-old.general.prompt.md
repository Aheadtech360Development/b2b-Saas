---
id: 471
title: The old console while the server is older than the website
stage: general
date: 2026-10-22
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: The console still shows Not Found on Brands; the owner is scared; make it work
labels: ["platform-console", "deploy", "railway", "fallback"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(platform)/layout.tsx
 - frontend/src/components/platform/classic/ClassicConsole.tsx (the old console page from 3793cd5)
 - frontend/src/components/platform/classic/ConsoleBar.tsx, InsightTabs.tsx, PlanAndTrial.tsx (from 3793cd5)
tests:
 - Innterflow live, read only, against last night's copy: branding, site, pages, theme, tracking, filters the same; 22 products, only stock down by 1 on six variants (orders overnight)
 - frontend tsc --noEmit clean
---

## Prompt

(screenshots: Railway "Limited Access, Deploys have been paused due to an upstream issue"; printcopilot.co/platform Brands "Not Found") bhai ye to abhi bhi yahi dikhara ha ha yar msla abhi bhi whi ha ye brands ku fetch nh kr parha ha yar dekho yar bhai mjhy dar lagra ha yar ?????

## Response snapshot

- The client's store checked again: unchanged, and selling (stock down by one on six variants overnight).
- The console layout asks the server once per page load whether it has the redesigned console's routes (GET /platform/console/search: 422 on a new server, 404 on the old one). On a 404 it shows the old console, restored from 3793cd5 into components/platform/classic, which the running server answers; the redesign shows by itself once Railway deploys, with no second push. New brands from the old console start on Starter, not "standard".

## Outcome

- ✅ Impact: the super admin lists and manages brands again while Railway's builds are paused.
- 🔁 Next prompts: Railway back and deployed; then remove components/platform/classic.
- 🧠 Reflection: when the website can go live before its server, the website should check what the server can answer.
