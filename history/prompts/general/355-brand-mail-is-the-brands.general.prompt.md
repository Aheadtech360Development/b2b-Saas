---
id: 355
title: Brand mail is the brand's
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: a customer ordered on the brand's shop and the mail came in PrintCopilot's name — every brand's customers must be written to in the brand's name only
labels: ["email", "multi-tenant", "branding", "celery", "pdf"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/core/database.py (the brand's name always resolves; logo and reply address resolved with it; one call sets all five)
 - backend/app/core/tenant_context.py (the brand's logo and reply address in the context)
 - backend/app/services/email_service.py (logo: the brand's or none; replies to the brand; a platform address saved with a name loses the name)
 - backend/app/services/pdf_service.py (the order PDF and the invoice: the brand's logo or none)
 - backend/app/tasks/email_tasks.py (seven background jobs sent with no brand at all; every job now signs as the record's brand)
 - backend/tests/test_brand_mail.py (new, 7 checks)
tests:
 - a dry run of the order mail with nothing sent — with the brand's name known it is the brand's throughout; without it the sender, subject, heading and signature are all the platform's (the reported fault, reproduced)
 - tests/test_brand_mail.py 7 passed; with the commission and assistant tests, 63 passed (no database)
 - local test database only — the new lookup gives a brand that never typed a store name its own name (the old one gave None); tests/test_user_delete.py 14 passed, i.e. real requests still learn their brand
 - NOT done — no mail was sent, and the live brand's own settings were not read
---

## Prompt

abhi mene ne ek brand innteflow pe ek customer ne order to kia lekin yar printcopilot ke name se mail jarhi customers ko halake brand ke apne name se ani chayie na yar to ye proper dekho yar meri jan har brand ke customers ko sirf brand name se hi mail jae dekho zara proper dekho meri jan

## Response snapshot

How a mail gets its name: the send path reads "whose mail is this" from the request — the brand's name, where its shop lives, its mail settings — and wherever that is missing it falls back to the platform's name. Built without sending, the order mail shows both: with the name known it is "innterflow" from sender to signature; without it, every line a customer reads says PrintCopilot.

Four ways the name went missing or the platform showed through, all closed:

1. A brand's name was its "store name" or nothing. A brand that had not typed one got the platform's name on everything. It now falls through to its company name and then the name it signed up with, as the shop's own pages already did.
2. Seven background jobs (return decisions, wholesale approved/rejected/received, password reset, email verification, staff invitation) never said whose mail they were sending. All seventeen jobs now sign as the brand of the record they are about.
3. The logo on a brand's mail and on its order PDF and invoice was the platform's whenever the brand had none in its mail settings. It is now the brand's own logo, or none.
4. A reply went to the platform's sending address unless the brand had set one. It now goes to the brand: the address it set, else the one it signed up with.

What stays the platform's: the sending address itself (…@printcopilot.co), because mail can only leave from a domain that is verified. A brand that wants its own address connects its own sending domain in its Integrations.

Not established: which of these the reported mail was. The brand in question appears to have a store name, so (1) should not have been it; its own "Sender name" in Integrations, if somebody typed the platform's name there, would do exactly this and is the first thing to look at.

## Outcome

- ✅ Impact: no path left on which a brand's customer is written to as the platform, bar the address's domain.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: a screenshot of the mail if it still says PrintCopilot; the email templates in the database are one set shared by every brand.
- 🧠 Reflection: the fallback to the platform's name was written as a safety net and worked as a disguise: nothing failed, so nothing was noticed. A test now builds the mail and reads it for the platform's name.

## Evaluation notes (flywheel)

- Failure modes observed: the report could not be tied to one cause without seeing the mail or the brand's settings; four real leaks were found by reading every path instead.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): log, at send time, the sender name and where it came from (store name, company name, signup name, the brand's own setting, or the platform fallback), so the next report is answered from one line.
