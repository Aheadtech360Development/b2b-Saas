---
id: 357
title: Settings, one shop email
stage: general
date: 2026-10-08
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: delete the three boxed fields from General Settings; and make the email simple — the brand's admin puts in one email and all its customers get mail under that name
labels: ["admin", "settings", "email", "multi-tenant", "removal"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/app/(admin)/admin/settings/page.tsx (General Settings gone; Email is one panel, the full form under "More options")
 - frontend/src/components/admin/ShopEmailPanel.tsx (new: one email, and what the customer will see)
 - backend/app/api/v1/admin/integrations.py (GET and PUT /admin/integrations/email-identity)
 - backend/app/services/email_service.py (customer_facing_identity: what a customer sees, worked out as the send path does)
 - backend/tests/test_brand_mail.py (7 more checks)
tests:
 - backend, no database, nothing sent — tests/test_brand_mail.py 14 passed (the page's promise matches the mail in five set-ups; the route reads, saves, refuses a bad address, puts the store's name back); with the commission and assistant tests, 70 passed
 - frontend — tsc clean
 - NOT run — the route against a real database (Docker was not running on this machine); the functions it calls to read and save are the ones the existing form already uses
 - NOT done — the page was not opened in a browser, and no mail was sent
---

## Prompt

With a picture of Settings, General and Email: "General Settings" with a box drawn round Minimum Order Value, Guest Pricing Mode and Low-Stock Alert Threshold, and "Notification Email" under them:

ye jo teen fields mene wo border krin hain deelte kro aur dusra bhai notification mail jis name se mail jae  yar ek simple system batado na ke brand wala admin ek mail rkhde uske sary customers ko usi name se mail jaein plz yar dekhlo zara ek jaldi

## Response snapshot

**The three fields are gone — and the fourth with them.** Reading where they were used: nothing in the app read any of the four (minimum order value, guest pricing mode, low-stock threshold, and "Notification Email" itself), and all four were one value shared by every shop on the platform, so a brand saving its own changed it for the others. The whole "General Settings" box is removed. The email that does work is the one in the Email box.

**Email, the simple way.** One field: "Your shop's email". Under it the page says exactly what a customer will see:

- From: the store's name, and the address the mail leaves from.
- Replies to: the email just typed.

The shop's own alerts (new orders, applications, messages, low stock) come to the same address. If a sender name was typed in earlier that is not the store's name, the page says so and one press puts the store's name back. The older, fuller form is still there under "More options".

**What one email cannot do, said plainly.** The name on the mail is the shop's. The address it is sent from stays the platform's sending address: mail can only leave from a domain that has been verified with the mail provider, so typing an address is not enough to send from it. A shop that wants its own address verifies its domain (More options). Making that a guided step inside the admin — type your address, add three DNS records, done — is possible and is the next piece if wanted.

## Outcome

- ✅ Impact: one email to set, and no guessing what the customer sees.
- 🧪 Tests: as listed.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: a guided "send from my own address" (domain verification through the platform's mail account), if the owner wants customers to see the shop's own address.
- 🧠 Reflection: asked to delete three fields, found four that did nothing and were shared across shops. The fourth was the one the second half of the request was about; removing it and giving the working one its place answered both halves.

## Evaluation notes (flywheel)

- Failure modes observed: the local database could not be started, so the new route was exercised with its storage stood in for; said rather than skipped silently.
- Graders run and results (PASS/FAIL): PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): run scratchpad check_shop_email.py once Docker is up.
