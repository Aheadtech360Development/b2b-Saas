---
id: 579
title: Vercel asks for nameservers
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends "View DNS configuration" for *.printcopilot.co (update nameservers to ns1/ns2.vercel-dns.com)
labels: ["domains", "vercel", "namecheap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/579-vercel-asks-for-nameservers.general.prompt.md
tests:
 - none
---

## Prompt

(screenshot: *.printcopilot.co Invalid Configuration, "Update your domain's nameservers to enable Vercel DNS", ns1.vercel-dns.com, ns2.vercel-dns.com) ?????

## Response snapshot

The dashboard shows only the nameservers method; do not change printcopilot.co's nameservers (all DNS, email included, would move). Use the same two values as NS records for the host _acme-challenge in Namecheap's Advanced DNS, keep Namecheap BasicDNS on the Domain tab, Enable Vercel DNS on the team's Domains page if not done, leave the * CNAME alone (it points to Vercel and the sites run on it), Refresh after 15 to 30 minutes and tell me to check from outside.

## Outcome

- ✅ Impact: the owner avoids moving the whole DNS.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: outside check of _acme-challenge NS and a random subdomain's certificate.
- 🧠 Reflection: none.
