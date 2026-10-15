---
id: 440
title: Where the Conversions API token goes, and how to check it
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Where to enter the marketer's Meta Conversions API token; why the connect test failed; a message asking the marketer to check
labels: ["meta-capi", "tracking", "support"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - live, read-only: website /api/version = 9481233; the server's openapi gained `tracking` on both checkout requests about 6 minutes after the push
 - live, read-only: Innterflow's public tracking settings show tracking on, checkout tracked, Meta pixel 1131707639791414
---

## Prompt

@Bilal sajjad

[access token, redacted: never copied into files]
This is the Meta Conversions API access token for Pixel 1131707639791414. Please store it ONLY as a server environment variable named META_CAPI_TOKEN (in .env or the hosting settings). Do NOT put it in frontend code, JS files or git, and do not share it. capi-server.js reads it from there to send events from our server to Meta. ab ye dekho jani zara mjhy na isne mjhy marketor wale bndy ne ye bhja ha zara jaldi se dekho isey jani ab ye access tokenjo ha pixel id to daldi ha access token kaha dalun

(screenshot: Server-side tracking card, "Nothing available to connect yet.") ????

(screenshot: the Meta Conversions API form, Chrome's saved-password list open over the token field) kia dalun yaha pe

(screenshot: "Meta said: (#100) Missing Permission") ??????

sir ko mei bolun kese ke isey check krlein?

## Response snapshot

**Where the token goes:**
- The brand's admin, Settings → Tracking & Analytics → Server-side tracking → Meta Conversions API.
- Not a Railway env var: the code reads no META_CAPI_TOKEN, and every brand has its own token. The admin field keeps it on the server, masked.

**"Nothing available":** the website had the new build before the server finished deploying. It was ready about 6 minutes after the push.

**"(#100) Missing Permission":**
- Our connect check reads the pixel's name, which an Events Manager Conversions API token is usually not allowed to do. It can only send events.
- The token and pixel match, so: Save anyway without testing. The first order's history shows "Sent to Meta".
- Offered to change the check so it tests the sending path; waiting on the owner.

**Last answer:** a ready-to-send English message for the marketer, saying how to check in Events Manager.

## Outcome

- ✅ Impact: the owner knows where the token goes and how to get it confirmed.
- 🧪 Tests: read-only live checks above.
- 📁 Files: this record.
- 🔁 Next prompts: the owner's yes or no on fixing the connect check; the marketer's report from Events Manager.
- 🧠 Reflection: a connect check must test what the connection is for (sending), not something the credential may never be allowed to do.

## Evaluation notes (flywheel)

- Failure modes observed: the shipped connect check refuses a valid send-only token.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): verify by a test event to /{pixel}/events instead of reading the pixel.
