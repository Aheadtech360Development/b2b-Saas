---
id: 581
title: Wildcard live, remove add-in-Vercel notes
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends Vercel Domains: *.printcopilot.co now "DNS Change Recommended" (yellow)
labels: ["domains", "vercel", "signup", "platform-console"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/api/v1/signup.py
 - backend/app/api/v1/platform/tenants.py
 - backend/app/api/v1/platform/console.py
 - frontend/src/components/platform/console/BrandReady.tsx
 - frontend/src/components/platform/console/brand/DomainTab.tsx
 - frontend/src/components/platform/console/CreateBrand.tsx
tests:
 - outside: a never-added random subdomain answers 200 with a valid certificate, CN=*.printcopilot.co, Let's Encrypt, until 2027-02-03; Namecheap's own server answers _acme-challenge NS ns1/ns2.vercel-dns.com (Google's resolver still had the old answer); innterflow.printcopilot.co unchanged
 - frontend console and sign-up tests: 6 files, 44 passed; backend modules import
---

## Prompt

(screenshot: *.printcopilot.co DNS Change Recommended, nameservers ns1/ns2.vercel-dns.com suggested) ?????

## Response snapshot

The wildcard works: checked from outside that a brand-new subdomain gets the *.printcopilot.co certificate and the challenge records are on Namecheap's own server; the yellow note only suggests moving nameservers, not needed. Removed the "add it in Vercel" to-dos from the platform's new-shop emails (sign-up and console) and the console's Brand ready and Domain tab texts. Committed locally; push on the owner's yes. Keep the two _acme-challenge NS records for renewals.

## Outcome

- ✅ Impact: new brands' addresses work at once; no more hand-adding in Vercel.
- 🧪 Tests: listed above.
- 📁 Files: listed above.
- 🔁 Next prompts: push of the wording change; brands' own domains through the Vercel API, if wanted.
- 🧠 Reflection: a public resolver can keep the wildcard answer for a while; ask the zone's own server.
