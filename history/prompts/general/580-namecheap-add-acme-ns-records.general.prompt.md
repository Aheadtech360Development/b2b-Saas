---
id: 580
title: Namecheap add acme NS records
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner sends Namecheap screenshots (Nameservers = Namecheap BasicDNS; Advanced DNS host records)
labels: ["domains", "namecheap", "vercel"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/580-namecheap-add-acme-ns-records.general.prompt.md
tests:
 - none (read the screenshots: A @ 76.76.21.21, CNAME * and www cname.vercel-dns.com, CNAME rsend/send for the mail sender, more under Show more)
---

## Prompt

(screenshots of Namecheap: Domain tab with Namecheap BasicDNS; Advanced DNS with A @, CNAME *, rsend, send, www, Add New Record) ??????

## Response snapshot

Nameservers are right as they are. On that same Advanced DNS screen: Add New Record → NS Record, Host _acme-challenge, Value ns1.vercel-dns.com, TTL Automatic, save with the tick; again for ns2.vercel-dns.com; touch nothing else (the * and www CNAMEs carry the sites, rsend and send carry mail, Show more holds the rest); Enable Vercel DNS on the team's Domains page if not done; Refresh in Vercel after 15 to 30 minutes; a screenshot if NS Record is not in the list.

## Outcome

- ✅ Impact: the owner can add the two records on the screen they have open.
- 🧪 Tests: none.
- 📁 Files: this record.
- 🔁 Next prompts: outside check once added.
- 🧠 Reflection: none.
