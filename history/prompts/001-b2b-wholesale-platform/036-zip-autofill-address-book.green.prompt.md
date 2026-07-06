---
id: "036"
title: ZIP Auto-fill Address Book
stage: green
date: 2026-03-25
surface: agent
model: claude-sonnet-4-6
feature: 001-b2b-wholesale-platform
branch: main
user: RT
command: Add ZIP code auto-fill to Address Book page in AF Apparels
labels: ["addresses","frontend","ux","zip-lookup"]
links:
  spec: specs/001-b2b-wholesale-platform/spec.md
  ticket: null
  adr: null
  pr: null
files:
  - frontend/src/app/(customer)/account/addresses/page.tsx
tests:
  - manual: type "90210" → Beverly Hills, CA auto-fills
  - manual: type "10001" → New York, NY auto-fills
  - manual: invalid ZIP → silently ignored, user can type manually
---

## Prompt

Add ZIP code auto-fill to Address Book page in AF Apparels.

Change 1: Add `handleZipLookup` function inside the component that calls `https://api.zippopotam.us/{countryCode}/{zip}` and fills city + state abbreviation.

Change 2: Replace ZIP input with an enhanced version that fires `handleZipLookup` when length hits 5, adds `maxLength={10}`, placeholder hint, and helper text below.

Change 3: Reorder form fields so ZIP appears before City/State grid (ZIP triggers auto-fill → user sees result immediately). Country moved to its own row after City/State.

New form field order: Label → Full Name → Address Line 1 → Address Line 2 → ZIP → City+State grid → Country → Phone → Default checkbox.

No backend changes.

## Response snapshot

**`handleZipLookup`**: Checks `form.country` to pick `us` or `ca` path. Fetches `api.zippopotam.us`. On success, sets `city` from `place["place name"]` and `state` from `place["state abbreviation"]`. Silently ignores non-OK responses and exceptions.

**ZIP input**: Fires lookup when `zip.length === 5`. Uses `maxLength={10}` to accommodate Canadian postal codes. Shows hint text "City & State will auto-fill when you enter a valid ZIP code" below the field.

**Field reorder**: Removed old two-column ZIP+Country grid. ZIP is now full-width with helper text. City+State remain in two-column grid. Country is now a standalone full-width select after City/State.

## Outcome

- ✅ Impact: ZIP auto-fill live at /account/addresses — 90210 → Beverly Hills CA, 10001 → New York NY
- ✅ Canada support: M5V → Toronto ON via `ca` country code path
- ✅ Silent failure: invalid ZIPs do nothing, user can type manually
- 📁 Files: addresses/page.tsx only (frontend-only change)
