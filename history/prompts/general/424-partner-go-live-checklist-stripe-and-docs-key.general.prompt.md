---
id: 424
title: Partner go-live checklist, Stripe events and the docs key
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Answer the go-live checklist questions and make the partner documents key
labels: ["partner-program", "go-live", "stripe", "secrets"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed; the key went to a file on the owner's Desktop, never into the chat, the repo or this record)
tests:
 - live, read-only after the push: website 0826055, backend on migration 0062, GET /partners/program 200, the affiliates API without a sign-in 401, www.printcopilot.co/partners 200
 - the new key file holds a valid Fernet key (checked by encrypting and decrypting a word, without printing it)
---

## Prompt

(screenshot of Stripe, Webhooks: two event destinations to .../api/v1/webhooks/stripe, "connectedaccounts" and "myaccount", each listening to 249 events, error rate 0%) kia krun

ye pehle ye batao ke partner doc keys kia cheez ha ye kia kam aegi aur support mail ka kia scene ha bhai

tum bnake dedo na partner doc keys jani

## Response snapshot

**Stripe needs nothing.** The "myaccount" (Your account) destination listens to 249 events, which is practically all of them. That includes the six the partner code handles. Partner commission comes from the platform's own plan invoices, which are Your account events. "connectedaccounts" carries the brands' own sales.

**PARTNER_DOCS_KEY** is the key the W-9s (which hold a tax number) are encrypted with.
- Without it, a key derived from APP_SECRET_KEY is used, so rotating that secret would make every stored W-9 unreadable.
- It is best set now, before any W-9 is uploaded.
- It must never change or be lost.

**The support email** is where partners' replies to the program's emails land, and the contact those emails show. An applicant's answer to a question lands there too.

**The key was generated as a random Fernet key** and written straight to C:\Users\hp\Desktop\PARTNER_DOCS_KEY.txt.
- It was never shown in the chat, the transcript or any record.
- The owner pastes it into Railway (backend service, Variables), keeps a copy in a password manager, and deletes the file.

## Outcome

- ✅ Impact: Stripe confirmed ready; the documents key made without exposing it.
- 🧪 Tests: listed above.
- 📁 Files: this record.
- 🔁 Next prompts: the owner sets the key on Railway, publishes the terms, sets the support email, reviews the numbers with the manager.
- 🧠 Reflection: a secret the user asks for is written to a local file, never printed.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
