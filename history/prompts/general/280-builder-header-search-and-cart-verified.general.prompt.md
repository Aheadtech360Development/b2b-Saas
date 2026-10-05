---
id: 280
title: Builder header search and cart verified
stage: general
date: 2026-10-05
surface: agent
model: claude-opus-5-5
feature: none
branch: main
user: Aheadtech360Development
command: verify and wire the Website builder's storefront header Search and Cart to the existing backend; test end to end
labels: ["visual-builder", "storefront", "search", "cart", "tenant-isolation", "e2e"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/builder/resolve.py (search matching, total, LIKE escaping, data.search)
 - backend/tests/test_builder_integration.py (33 new checks: search, cart, isolation)
 - frontend/src/components/builder/render.tsx (SearchResults; search box focus and length)
 - frontend/src/lib/builder/baseCss.ts, frontend/src/lib/builder/types.ts
 - frontend/src/__tests__/builder-search.test.tsx (new, 13)
tests:
 - backend test_builder_integration.py 138/138 (33 new), test_builder_security.py 35/35, test_builder_schema.py 47/47
 - frontend vitest 212 passed (13 new; 2 pre-existing api-client failures)
 - browser probe_search_cart 53/53 (twice); regression probe_builder 41/41, probe_gaps 32/32, probe_templates 60/60, probe_editor2 11/11
---

## Prompt

One more important thing: please fully verify and wire the Website Builder's storefront header functionality.

The header Search and Cart are NOT just visual UI — they must be fully functional and connected to our existing backend/storefront system.

SEARCH:
- The search bar must search the actual products that exist in our shop/backend.
- Search should return the correct products with title, image, price and relevant product data.
- Results should open the correct product page.
- Handle empty results properly.
- Make sure search respects the current shop/tenant and never exposes products from another shop.
- Do not create a separate/mock product dataset or duplicate product system.
- Use the existing product/storefront APIs and data.

CART:
- The Add to Cart button must actually add the correct product/variant/options to the existing cart.
- Cart contents must stay perfectly synced with the backend/storefront cart state.
- Quantity updates, removing items, variant/options selection and totals must work correctly.
- Cart should persist when navigating between pages and refreshing where the existing cart architecture supports persistence.
- Make sure the cart belongs to the current shop/tenant.
- Do not create a second/parallel cart system.

MOST IMPORTANT:
Please inspect the existing backend APIs, product system, variant/options system and cart implementation first, then properly connect the Website Builder storefront components to those existing systems.

Test the complete flow end-to-end:

Search → find real product → open product → select variant/options → Add to Cart → open Cart → update quantity → remove item → verify totals.

Also test with multiple products and make sure tenant/shop isolation is maintained.

Do not change or rebuild the existing product, variant, options or cart architecture unnecessarily. Reuse what already exists and fix/wire anything that is currently only UI/mock functionality.

Run the relevant tests and browser tests after implementation.

(Preceded by: "dekho ab bs mei tumse simple krke ek cheez poochra hn … kia tum ready ho meri jan")

## Response snapshot

**Inspected first. Nothing was mock.** The builder's buy box is the shop's one existing buy controller (`ThemeProductBuy`), found through marks on the builder's markup; the cart page is the shop's one `CartView`; the header count listens to both kinds of cart. One cart system: a guest's lines live in the browser and move into the account at sign-in; a signed-in customer's cart is the cart API's, per company, priced by the server. The cart needed no code change.

**Search had two real gaps, both fixed.**

1. *It matched less than it should.* It looked only in the name and short description. The shop's catalogue search also looks at the product code, and its full-text index (`search_vector`) is empty for every product in this database — no migration creates the trigger that would fill it — so nothing could be found by code, brand, type or tag. The builder's search now looks for every word typed, in any order, in the name, code, short description, type, brand and tags (and asks the full-text index too, where a product has one); names that start with the words come first. `%` and `_` typed by a shopper are those characters, not wildcards.
2. *No results was a blank page.* The page now says how many products matched ("3 products for “tee”", "showing the first 24" when there are more), and when nothing matches says so with a link to all products. The server returns the total with the results (`data.search`), computed only on a page that has a search on it.

Also: the header's search icon lands on the search page with the cursor already in the box.

**Shop isolation, verified rather than assumed.** Search carries the shop and "on sale" conditions in the query itself. A product only another shop sells is not found, its page does not open, it cannot be added to this shop's cart by either cart endpoint, and another shop's customer can neither see, change nor remove a line in this shop's cart.

**Found along the way, not part of this change.**
- A flaky-looking "Connection closed." script error: traced to leaving a page before its HTML has finished arriving (0 errors when loaded, 5 when not, same steps). Thrown in the page being left; nothing visible.
- About 1 in 30 visits to a missing product, the server leaves the 404 for the browser to draw, which it does within a second, with the right status. Measured over 112 visits; no blank page for a shopper. Both seen on the dev server only.

## Outcome

- ✅ Impact: Search → product → variant/options → Add to cart → Cart → quantity → remove → totals works end to end on a builder shop against real data, as a guest and signed in, with several products, and stays inside the shop.
- 🧪 Tests: as listed above, against the local test database only.
- 📁 Files: as listed above. No change to products, variants, options or the cart.
- 🔁 Next prompts:
  - The catalogue's full-text index is never filled (no trigger in any migration); decide whether to add one or drop the column from the search.
  - On one shared address (local dev only) two shops would share a browser's guest cart; in production each shop has its own address.
- 🧠 Reflection: one server test failed on a status code (200 from removing a line that was never the caller's) while the outcome it was guarding — nothing removed, own cart returned — was correct. Assert outcomes. Two "flaky" browser failures were each reproduced and measured before being classified.

## Evaluation notes (flywheel)

- Failure modes observed:
  - Asserting a status code instead of the state it stands for.
  - A probe leaving pages mid-load; a probe checking a page at network idle rather than waiting for what it is looking for.
  - Heredoc escaping turning "\n" in a patch into a line break (again): write the patch to a file.
- Graders run and results (PASS/FAIL): all PASS as listed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): a production build (`next build && next start`) run of the two dev-server observations.
