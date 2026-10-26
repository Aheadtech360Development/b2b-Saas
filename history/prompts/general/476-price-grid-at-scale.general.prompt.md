---
id: 476
title: Price grid import past 5,000 combinations
stage: refactor
date: 2026-10-26
surface: agent
model: claude-opus-5-5
feature: none
branch: admin-ui-redesign
user: Aheadtech360Development
command: The price import refuses more than 5,000 rows while one product has 11,000+; handle it as a senior backend engineer would
labels: ["product-options", "price-table", "csv-import", "performance", "postgres", "scalability"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - backend/app/services/combinations.py (MAX_MATRIX 50,000 with measured basis; subset_keys)
 - backend/app/services/configurator_service.py (_load looks rows up by subset key on the unique index; GIN <@ fallback)
 - backend/app/services/price_grid.py (10 MB; executemany upsert; streamed export; memoised norm; Counter-based N/A pairs; per-value column profiling)
 - backend/app/api/v1/admin/product_options.py (planning off the event loop; grid page reads only its rows; count instead of loading; streamed download)
 - frontend/src/components/admin/PriceGridImport.tsx (10 MB)
 - backend/tests/test_price_grid.py (+4: subset keys equal the subset scan over 300 random selections incl. multi-select and typed answers; fallback; 13,440-row plan; streamed export)
tests:
 - test_price_grid.py 33 passed
 - local database, 13,440 and 40,320 rows (scratchpad price_grid_scale.py): every check passed; 100 random prices billed exactly at each size; planning 0.6 s / 1.5 s (was 2.3 / 6.1); a storefront price 30-38 ms median at both sizes; old && read 38,304 rows for one price, new lookup reads 1; grid page 0.2-0.7 s; download 2.5 s streamed; same file twice idempotent; replace mode removes exactly the rows not listed; a 50,250-row file refused with its reason
 - profiling: rows written 11.4 s to 4.4-8.6 s for 13,440 (one compiled multi-row VALUES per batch replaced by executemany); the rest is the local Docker disk (Postgres idle on CPU; one INSERT…SELECT of 13,440 rows 3.3 s there, 0.38 s into a temp table with the same indexes)
---

## Prompt

chalo continue kro jaha pr chora tha aur dusra ye dekho jo mene tumse wo import prices wala feature bnawaya tha na wo 5k se ziada products variants nh lera ha jbke ek product ke 11k se ziada hain to ek achy senior backend engineer ki tarah is problem se deal kro using modern system design principles

## Response snapshot

- The cap is 50,000 combinations per product and 10 MB per file, set from measurements and written down with them, not a guess.
- The hot path first: a storefront price fetched every stored row sharing any choice with the selection (&&), the whole table when a question has one answer (11,000+ rows read and matched in Python per price). It now looks rows up by name: every key a subset of the selection can have, on the unique (product, combination) index (255 probes for eight questions), with the GIN containment test as fallback past 4,096 keys. Proven equal to the subset scan over 300 random selections.
- Writes: one INSERT … ON CONFLICT DO UPDATE run by executemany in slices of 5,000, in the request's single transaction: atomic, idempotent, no ORM object per row, no giant statement compiled per batch.
- Reads in the admin: a grid page fetches only the rows its cells can use; the price count is a COUNT; the download streams from six columns.
- Planning: memoised name normalisation, each distinct cell classified once, N/A pairs counted with Counter on integer codes; run in a thread so the worker keeps serving.
- Not added: a background job queue. The import is one atomic, idempotent transaction whose remaining cost is the database write; synchronous is the simpler correct design at this size. If production shows imports past ~20 s, the plan is already plain data and apply one function, so moving apply to a job is direct.

## Outcome

- ✅ Impact: an 11,000+ combination product imports, prices and downloads; storefront pricing no longer grows with the table.
- 🔁 Next prompts: the real 11k file on live; production timings.
- 🧠 Reflection: the cap hid the real scaling fault, which was on the read path every buyer hits, not in the import.
