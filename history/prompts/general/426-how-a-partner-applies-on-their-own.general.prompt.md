---
id: 426
title: How a partner applies on their own
stage: general
date: 2026-10-15
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: Explain how someone joins the partner program without the super admin creating them
labels: ["partner-program", "explainer"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - this record only (no code changed)
tests:
 - live, read-only: backend /health ok on 0062 after the owner set PARTNER_DOCS_KEY; www.printcopilot.co/partners 200
---

## Prompt

hn partner doc keys lagadi ha ye batao abhi to super admin ne khud create kia ha affiliate khud koi link se aky kre to kese krskta

## Response snapshot

**How someone applies:**
1. They open www.printcopilot.co/partners. The landing page footer has "Partner program", and the link can also be shared directly.
2. They press Apply now and fill in the form.
3. The application lands in Console > Affiliates > Applications, with a count on the tab and on Overview.
4. The super admin approves it and picks a rate plan, which starts on the default. They can also ask a question or decline.
5. The approved partner gets an invite email, sets a password and signs in at /partners/login.

**Settings that change this:**
- "Accepting applications" must be on.
- "Auto approve" skips the queue for applications that are not flagged.

**After the key was set**, the backend is healthy on 0062.

## Outcome

- ✅ Impact: the owner knows the self-serve path.
- 🧪 Tests: the checks above.
- 📁 Files: this record.
- 🔁 Next prompts: terms and support email; a first real application.
- 🧠 Reflection: n/a

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
