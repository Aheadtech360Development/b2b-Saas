---
id: 305
title: Builder contact form
stage: general
date: 2026-10-06
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: a customisable, responsive contact form for the builder's contact page — fields added freely, required or not, field borders and button colours — whose submissions arrive in the admin's Messages
labels: ["visual-builder", "contact-form", "messages", "responsive"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - frontend/src/components/builder/islands/ContactForm.tsx (new)
 - frontend/src/lib/builder/registry.ts (the "Contact form" element; items fields can start from a default)
 - frontend/src/components/builder/editor/fields.tsx (item fields shown only when they apply; new items start from the default)
 - frontend/src/components/builder/render.tsx, editor/icons.ts, lib/builder/baseCss.ts
 - frontend/src/app/(admin)/admin/messages/page.tsx (a message's fields in reading order)
 - backend/app/services/builder/schema.py ("contact_form" known), backend/app/api/v1/storefront.py (bot trap; "_" keys not stored)
 - frontend/src/__tests__/builder-contact-form.test.tsx (new)
tests:
 - frontend vitest: builder-contact-form 7/7, all builder suites 185/185; tsc: no new errors
 - backend builder schema 61/61
 - a picture of the default form at 1280 px and 390 px
---

## Prompt

With a picture of the builder open on the "Contact information" page:

acha ab bs ekalst cheez ye rehgyi ha mere bhai bs rko meri bat dekho ab ek contact page ha saiha bhai to tum ek customize form bhi do full reponsive ho uske btn qwagera fields jitn ichaho add krdo required not required rkh skty fields ka border wagera button ka colors wagera saiha ye cheez proper kro meri jan aur ye form ka sara data yaha arha ho hamara admin ka sidebar hana waha messages ha saiha meri jan waha sb gir rha ho saiha bhai mere bs jaldi se krdo saiha inteeligent form bnana

## Response snapshot

A new element, **Contact form** (Add panel → Content), built on what was already there: the storefront's public `/api/v1/storefront/contact` saves into `contact_submissions`, which is what the admin's **Messages** lists.

- **Fields, as many as wanted**: label, type (short text, email, phone, long text, dropdown with one choice per line, number, date, tick box), hint, Required on/off, whole row or half a row. Starts with Name and Email (required, side by side), Phone and Company (optional), Message (required).
- **Its look**: label colour, field border, field background, border while typing, field corners, button colour, button text colour, button corners, button width (fits its words / whole width), plus the usual text and spacing settings. Colours are checked to be colours before they reach the page.
- **Intelligent checking, in words**: "Please fill this in.", "That email address does not look right.", "That phone number looks too short.", "Please tick this." — beside the field, the first one focused, nothing sent until it is right. Required fields carry a red star, the others "(optional)". The browser's own bubbles are not used.
- **Responsive**: half-row fields sit two to a row; on a phone every field takes the whole row, the button too, and text is 16 px so phones do not zoom in.
- **To Messages**: each message is saved under the form's name (set in the panel) and the page it was sent from, with each field under its own label; two fields with one label are kept apart. Messages now shows name, email, phone, company first and the message last.
- **Bots**: a field no person sees; when it is filled, the sender is thanked and nothing is kept.
- In the editor the form cannot be typed in or sent, so clicking it selects it.

To use it on Innterflow: open the Contact page in the builder, Add → Contact form, drop it under the heading, change what you like, Publish.

## Outcome

- ✅ Impact: any page can carry a form the shop designs itself, and its answers arrive in Messages.
- 🧪 Tests: as listed; no run against a live shop.
- 📁 Files: as listed. No migration.
- 🔁 Next prompts: an email to the brand when a message arrives, if wanted.
- 🧠 Reflection: the storage and the inbox already existed; the work was the element, its checks and its look.

## Evaluation notes (flywheel)

- Failure modes observed: a patch run twice added a section twice (caught by the type check and redone once).
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a preset "contact section" — heading, a line of text and the form side by side.
