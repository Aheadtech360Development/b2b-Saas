---
id: 328
title: Address autocomplete provider recommendation
stage: general
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: which address autocomplete for now
labels: ["checkout", "address-autocomplete", "recommendation"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

tumhare nazar mei abhi ke lie kia sai rhegi iske lie

## Response snapshot

Recommended Geoapify for now: no card, free daily allowance, commercial use with attribution, enough for the platform's current order volume. Built so it can never block checkout (typing the address by hand always works, including on a day the allowance runs out), with the key kept on the server behind a small endpoint that debounces, caches and rate-limits, so one shop or a bot cannot use up every shop's allowance and switching to Google later changes only that endpoint. Move to Google Places (card required) if addresses come back wrong or volume outgrows the free plan. Asked whether to build it; the user only needs to create a free Geoapify account and put its key in Railway.

## Outcome

- ✅ Impact: a provider choice to act on.
- 🧪 Tests: none.
- 📁 Files: this record only.
- 🔁 Next prompts: go-ahead to build; GEOAPIFY_API_KEY in Railway.
- 🧠 Reflection: none.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
