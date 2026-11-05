---
id: 576
title: New brand subdomain needs wildcard
stage: general
date: 2026-11-05
surface: agent
model: claude-opus-5-5
feature: none
branch: feat/bulk-order
user: Aheadtech360Development
command: Owner on Vercel Pro asks why a new brand's subdomain (hello.printcopilot.co) opens only after adding it in Vercel by hand
labels: ["domains", "vercel", "dns", "signup"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/576-new-brand-subdomain-needs-wildcard.general.prompt.md
tests:
 - read-only from outside: printcopilot.co nameservers = Namecheap (registrar-servers.com); a random subdomain resolves to Vercel (76.76.21.93 / 66.33.60.194) but its TLS handshake fails (no certificate)
 - Vercel docs (add-a-domain, updated 2026-09-16): wildcard needs DNS challenges, nameservers method or delegating _acme-challenge; Hobby 50 domains per project
---

## Prompt

acha abhi ye cheez hori ha mene vercel jo hana wo 20$ wala lelia ha pro ekin abhi koi new brand ake sign in krrha na to uska domain nh kr parha jis tarah kl ek aya dummy mene bnaya hello to jb tk nh chla web page ya admin side nh khuli jb tk vercel pe jake meine hello.printcopilot.co nh dala to ye kia scene ha jani kch dekho yar meri jan isey yar plz jan

## Response snapshot

Cause: DNS already sends every subdomain to Vercel, but Vercel issues a certificate only for domains added to the project, so a new brand's address has none; Pro does not change that. Fix with no code: add *.printcopilot.co to the project and delegate certificate checks (Enable Vercel DNS for printcopilot.co in the team's Domains, keep Namecheap's nameservers, add two NS records _acme-challenge → ns1/ns2.vercel-dns.com in Namecheap, keep the * CNAME at the value Vercel shows). Then every new brand's subdomain works at once with a certificate; email records untouched; a brand's own domain (brand.com) still needs adding. Offered to check from outside once done and to update the platform's "add it in Vercel" emails.

## Outcome

- ✅ Impact: the owner has a one-time fix that ends adding every brand by hand.
- 🧪 Tests: listed above.
- 📁 Files: this record.
- 🔁 Next prompts: outside check after the owner adds the wildcard; update signup.py and platform/tenants.py emails; optional Vercel API for brands' own domains.
- 🧠 Reflection: Vercel now offers delegating only _acme-challenge, so a wildcard no longer means moving the whole DNS.
