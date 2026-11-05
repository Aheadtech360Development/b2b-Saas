# Tasks: one product, several sources (phase 1)

- [x] T1 Migration 0073: `warehouses.supplier`, `variant_sources`, `order_item_sources` (+ RLS); models.
- [x] T2 `sourcing.py`: locations, matching (colour+size, barcode, close name), preview, link, unlink, product sources.
- [x] T3 Checkout and reprint: own stock first, then cheapest supplier; shares recorded.
- [x] T4 S&S sending uses the shares; order page shows each line's split; SanMar's part to order by hand.
- [x] T5 Syncs refresh linked stock (and cost on a full sync); import refuses a linked style.
- [x] T6 Supplier locations kept out of own-stock paths (feeds, default location, PO receiving, returns, Stock box); buyers see "Partner warehouse".
- [x] T7 Admin API + Sources card on the product page.
- [x] T8 Checks: backend tests/test_sourcing.py (9); frontend product-sources (6); local database walk (scratchpad sourcing_local_check.py) 28/28; full backend suite on the local test database 743 passed, 0 failed (81 errors = the known conftest seed issue); tsc clean in src.
- [ ] T9 Phase 2: convert an imported product to sources / merge duplicates; manual match; SanMar orders; rule choice per shop; profit per source.
