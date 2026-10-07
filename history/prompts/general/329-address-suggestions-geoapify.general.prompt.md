---
id: 329
title: Address suggestions with Geoapify
stage: green
date: 2026-10-07
surface: agent
model: claude-opus-5-5
feature: none
branch: claude/fervent-brown-ldrcyf
user: Aheadtech360Development
command: build address autocomplete
labels: ["checkout", "address-autocomplete", "geoapify", "security"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/address.py
 - backend/app/core/config.py
 - backend/app/main.py
 - backend/app/middleware/auth_middleware.py
 - backend/tests/test_address_suggest.py
 - frontend/src/lib/addressSuggest.ts
 - frontend/src/hooks/useAddressAutocomplete.ts
 - frontend/src/__tests__/address-suggestions.test.tsx
 - .env.example
tests:
 - backend/tests/test_address_suggest.py (9 passed)
 - frontend/src/__tests__/address-suggestions.test.tsx (7 passed)
 - full vitest suite (376 passed; the 2 api-client refresh tests fail as before)
 - tsc (only the 2 known api-client.test.ts errors)
 - browser check on the local demo shop (saved addresses and checkout), Geoapify answered from the cache
---

## Prompt

(screenshot: the Geoapify project "printcopilot", API keys page)

[Geoapify API key redacted] ye lo jani

## Response snapshot

The checkout and saved-address forms already had a Google widget that never woke: no store set a Google key, and it gave up if the street field was not on the page in its first ten seconds. Now, without a Google key, the street field asks the store's server (GET /api/v1/address/suggest), which asks Geoapify inside the US and returns up to five addresses as street, city, two-letter state and ZIP; choosing one (mouse or keyboard) fills them. The key stays on the server (GEOAPIFY_API_KEY, never in the repo or the page). Repeats come from a 7-day cache; a visitor may ask 40 times a minute; the platform stops at 2,800 requests a day and a shop at 1,400 (the free plan is 3,000); a 429 from Geoapify pauses asking for an hour; any failure is just no suggestions, and the key is never logged. The hook is now a callback ref, so the field gets suggestions whenever it appears. A store with a Google key keeps Google's widget.

api.geoapify.com is blocked by this environment's network policy, so the live service was not reached here; tests stand in for it and the browser check answered from the cache.

## Outcome

- ✅ Impact: buyers get US address suggestions at checkout and in saved addresses without a card.
- 🧪 Tests: 9 backend, 7 frontend, full suites as before, browser check on both forms.
- 📁 Files: listed above.
- 🔁 Next prompts: set GEOAPIFY_API_KEY on Railway's backend; go-ahead to push to main.
- 🧠 Reflection: the old hook's fixed ten-second wait meant it could never have worked on forms that open later, Google key or not.

## Evaluation notes (flywheel)

- Failure modes observed: a pkill pattern matched its own shell again; the account pages' existing hydration error replaces the form for about a second after load.
- Graders run and results (PASS/FAIL): all listed tests PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
