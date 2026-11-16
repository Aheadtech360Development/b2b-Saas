---
id: 685
title: Clarity not recording
stage: general
date: 2026-11-16
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Innterflow's Microsoft Clarity stopped getting data although its project ID is set; debug it
labels: ["tracking", "analytics", "clarity", "bug"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/analytics/TrackingScripts.tsx
 - frontend/src/__tests__/tracking-scripts.test.tsx
tests:
 - live, read-only: Innterflow's tracking setup (Clarity yv36li1fic on, GA4, GTM, Meta); both its addresses ask for the Clarity tag (tracker requests recorded and blocked); the tag answers track:true; no CSP; one visit with only Clarity allowed showed "Uncaught TypeError: a[c] is not a function", window.clarity = HTMLScriptElement, no clarity.js, no upload
 - vitest tracking-scripts + tracking-ready: 5 passed
 - local: with the fix, window.clarity is a function, clarity.js loads and Clarity starts uploading (uploads blocked in the check)
---

## Prompt

isme dekho innterflow ka store ha saiha bhai usme microsoft clarity ki project id dali hui thi data pehle arha tha ab nh arha ha propr isko debeug krke check kro plz jani

## Response snapshot

The ID, the shop's setup and the tag were all fine; the page itself broke Clarity. Its inline script was rendered as <script id="clarity">, and a page element's id is also a name on window, so window.clarity was that script tag. Clarity's loader calls window.clarity(...) at once, threw "a[c] is not a function" and never loaded its recorder, so no visit was uploaded. Omnisend's script had the same flaw (id "omnisend", window.omnisend.push). Renamed them (ms-clarity-init, omnisend-init) and made both snippets check for a real function / array, so an element with that id anywhere on a page cannot break them again. Added tests.

## Outcome

- ✅ Impact: Clarity records again on every shop that uses it once pushed; Omnisend's queue is safe too.
- 🧪 Tests: 5 vitest; live and local checks above.
- 📁 Files: TrackingScripts and its test.
- 🔁 Next prompts: owner's yes to push; Clarity shows new sessions within a couple of hours of visits.
- 🧠 Reflection: never give an inline script the same id as the global its code expects.
