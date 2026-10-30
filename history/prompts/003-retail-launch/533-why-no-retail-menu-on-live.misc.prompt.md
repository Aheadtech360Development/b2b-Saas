---
id: 533
title: Why the Retail menu is not on the live site
stage: misc
date: 2026-10-29
surface: agent
model: claude-opus-5-5
feature: 003-retail-launch
branch: retail-plan
user: Aheadtech360Development
command: hogya kia deploy kuke yaha retail ki menu nh dikhri jani mjhy (screenshot of www.printcopilot.co, menu Features / Pricing / Affiliate / About)
labels: ["retail-plan", "marketing-site", "launch-switch", "deploy"]
links:
  spec: specs/003-retail-launch/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/003-retail-launch/533-why-no-retail-menu-on-live.misc.prompt.md
tests:
 - none (read MarketingShell, billing_plans and the unpacked design boards' header text)
---

## Prompt

hogya kia deploy kuke yaha retail ki menu nh dikhri jani mjhy

(screenshot: www.printcopilot.co home, top menu Features, Pricing, Affiliate, About, Log in, Book a demo, Start free trial)

## Response snapshot

Deploy is done (website and backend on 83eff85). The manager's design has no Retail item in the top menu either (its header: Features, Pricing, Affiliate, About); Retail is reached from the home page's "For D2C and retail brands" part, the Retail tab on Pricing and the /retail page, and all three are hidden while the launch switch is off (waiting on the manager, T605). To show them: the owner sets NEXT_PUBLIC_RETAIL_LAUNCH=1 for Production in Vercel, then I make the $79 plan public and push, which rebuilds the site with the switch on; unbuilt tools and the unchecked price comparison stay hidden. A Retail item in the top menu can be added if wanted (not in the design). Asked the owner: launch now or wait for the manager.

## Outcome

- ✅ Impact: the owner knows the menu is hidden by the launch switch, not by a failed deploy.
- 🧪 Tests: none.
- 📁 Files: listed above.
- 🔁 Next prompts: the owner's word on launching now; then the Vercel variable and the plan made public, pushed together.
- 🧠 Reflection: check the design before calling something missing; here the design itself has no menu item.
