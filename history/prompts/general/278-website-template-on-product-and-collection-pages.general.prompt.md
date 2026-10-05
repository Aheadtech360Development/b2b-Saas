---
id: 278
title: Website template on product and collection pages
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: add a Shopify-style "Website template" dropdown to the product and collection admin pages
labels: ["visual-builder", "templates", "product-admin", "collection-admin", "draft-publish"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/resolve.py (assigned_template: the one rule, askable)
 - backend/app/services/builder/site.py (assign_template: one choice, in the draft)
 - backend/app/api/v1/admin/builder.py (GET/PUT /assignment)
 - backend/tests/test_builder_integration.py (21 new checks)
 - frontend/src/components/admin/WebsiteTemplateField.tsx (new)
 - frontend/src/services/builder.service.ts (assignment, assign)
 - frontend/src/app/(admin)/admin/products/[slug]/edit/page.tsx (Website template card)
 - frontend/src/app/(admin)/admin/products/collections/page.tsx (Website template field in the edit dialog)
 - frontend/src/__tests__/website-template-field.test.tsx (new)
tests:
 - backend test_builder_schema.py 47/47
 - backend test_builder_integration.py 102/102 (21 new)
 - backend test_builder_security.py 35/35
 - frontend vitest 187 passed (11 new; 2 pre-existing api-client failures)
 - browser probe_assign 29/29; regression probe_templates 60/60, probe_gaps 32/32
---

## Prompt

Yes, add the "Website template" dropdown to the product admin page.

I want this to work similar to Shopify:

- Show a "Website template" dropdown on the product edit page.
- List all available Product Templates.
- The currently assigned template should be selected automatically.
- Allow changing the product's assigned template directly from the product admin page.
- Because this affects the Website Builder, do NOT make this change live immediately.
- Save the selection to the Website Builder draft and make it live only when the user clicks Publish.
- Make it clear in the UI that the template change is part of the Website Builder draft/publish flow, so it doesn't feel inconsistent with the other instant-saving product fields.

Also make sure the same concept is available for Collections if the collection admin page doesn't already have it.

Keep the existing template assignment logic and do not change the existing product, variants, options or metafields system.

## Response snapshot

**Where the choice lives.** Unchanged: `assignments.<kind>.byId` in the Website builder's site document — the same entry the builder's Templates panel writes. Nothing was added to products, collections, variants, options or metafields; no migration.

**Server.** Two endpoints under the builder's admin API:

- `GET /assignment?kind=&id=` — the templates of that kind (default first, then by name), the one chosen for this record in the draft, the one the published site draws it with, and whether the two differ. A brand that has never opened the builder gets `{available: false}`; asking never creates a site.
- `PUT /assignment {kind, id, template}` — changes that one entry in the draft under the site's row lock and moves the draft's revision. "" follows the default. A template the draft does not have is refused; a product or collection that is not this brand's is a 404.

Both ask one function, `resolve.assigned_template`, which applies the rule `render_payload` already follows — so the admin page and the storefront cannot disagree about which template a record gets.

**Admin pages.** One shared field, `WebsiteTemplateField`, wrapped by each page in its own card style:

- Product edit page: a "Website template" card.
- Collection edit dialog: a "Website template" field, for a saved collection.
- The template in use is selected. Choosing another saves to the draft at once and the field says, in amber: "In the website draft — not live yet. Shoppers still see “X” until you publish the website", with a link that opens the builder in a new tab (so nothing unsaved on the page is lost). Once published it says, in green, "Live: shoppers see this product with “X”". The help text states that this saves on its own, not with the page's Save button.
- A shop that has not opened the builder sees no field at all; its product page is as it was.

**With an editor open elsewhere.** Because the draft's revision moves, an editor left open in another tab is told "This site was changed in another window" on its next save rather than saving over the choice; "Load the latest" shows it.

## Outcome

- ✅ Impact: a product's or collection's template can be chosen where the product or collection is edited, Shopify-style, without making the website's draft/publish flow inconsistent: the choice is a draft change, labelled as one, live on Publish.
- 🧪 Tests: as listed above, against the local test database only.
- 📁 Files: as listed above.
- 🔁 Next prompts:
  - The product page still shows the older "Theme template" card beside the new one; on a builder shop that older card has no effect and could be hidden.
  - Deep-link "Manage templates" to the template itself.
- 🧠 Reflection: the server test caught that JSONB does not keep insertion order (templates came back alphabetically, default not first); the list is now sorted on purpose. The first browser run "failed" on my own arithmetic about how many products were on a template — the product was right.

## Evaluation notes (flywheel)

- Failure modes observed:
  - A new browser tab does not carry the admin's per-tab sign-in; the probe now opens the editor from the admin tab, and the field's links use rel="opener".
  - JSONB key order assumed to be insertion order.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): hide the legacy "Theme template" card when the shop's render mode is visual_builder.
