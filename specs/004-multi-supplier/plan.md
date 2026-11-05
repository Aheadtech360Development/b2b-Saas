# Plan: one product, several sources

## Data (migration 0073_variant_sources)

- `warehouses.supplier` (nullable): set on one location per supplier ("S&S Activewear stock" SUP-SS, "SanMar stock" SUP-SANMAR), made on first link. A supplier's stock for linked variants lives only there, so a sync never writes over a number the shop counted. Every location the shop counts is NULL.
- `variant_sources`: variant, supplier, the supplier's SKU, style, part number, GTIN, cost. Unique per (variant, supplier) and per (shop, supplier, SKU).
- `order_item_sources`: per order line, how much a supplier's stock covered.

Why a location per supplier rather than a stock column on the source: every stock read (storefront, cart checks, sold out, admin lists, reports) already sums a variant's locations, so supplier stock is counted everywhere without touching those reads.

## Code

- `services/suppliers/sourcing.py`: supplier location, matching, preview, link, unlink, the product's sources, `take_stock` (own first, then cheapest), `record_shares`, `order_shares`, `linked_styles`, `sync`.
- Checkout (`order_service` 9.5, `guest` step 6) and the reprint (`returns.create_reprint`) call `take_stock` + `record_shares`.
- `suppliers/orders.supplier_lines` adds S&S's shares with S&S's SKU; `_identifiers` passes them through.
- `suppliers/jobs`: `_import` skips linked styles; `_inventory` and `_update` call `sourcing.sync`.
- Kept off supplier locations: legacy feed locations (`ss_products.locations`), the default location, the supplier location mapping list, PO receiving, returns restock and exchange stock, the product page's Stock box and its total.
- Buyers' stock-by-location view names a supplier location "Partner warehouse".
- Admin API under `/admin/suppliers` (plan-gated with supplier catalogues): GET `/product-sources/{product}`, POST `/{supplier}/product-sources/{product}/preview`, POST and DELETE `/{supplier}/product-sources/{product}`.
- Admin order detail returns `supplier_shares`; the order page shows each line's split.
- Frontend: `components/admin/products/ProductSources.tsx`, `services/productSources.service.ts`.

## Phase 2

- `sourcing.convert`: an imported product becomes the shop's own (`supplier`, `supplier_ref` cleared), one source per variant whose store SKU maps to a supplier row (Match Fields respected), the supplier's stock rewritten into its own location from fresh rows, its feed-location records set to 0; other locations are the shop's and stay. `jobs._claim` skips products with sources (they keep S&S's style id as product code).
- Manual picks: preview returns every supplier row; `link(..., manual=)` applies `{variant id: supplier SKU | null}` over the automatic match (`apply_manual`).
- Rule: `sourcing_rule` (tenant-scoped setting) = `cheapest` (default; a supplier able to send the whole rest of the line goes ahead of cheaper ones that cannot) or a supplier key (that supplier first, always). `order_records(records, costs, want, first)`.
- Migration 0074 `order_item_sources.unit_cost`, written by `record_shares` from the source's cost.
- SanMar by hand: `orders.manual_waiting` / `orders.mark_ordered` (a `supplier_orders` row with status placed, trigger manual; the live-row index stops a second mark); admin `GET /{supplier}/orders` answers the list for a supplier that takes no orders, `POST /{supplier}/orders/mark`; rule at `GET/PUT /product-sources/rule` (declared before `/product-sources/{product_id}`); `POST /{supplier}/product-sources/{product}/convert`.
- Frontend: Sources card (convert, rule, match table with selects, set duplicate to Draft), `ManualOrders.tsx` tab for SanMar (`?supplier=sanmar&tab=manual`).

## Risks

- Checkout touches every order: shops without sources keep the old order exactly (tested), and the full suite passes.
- A supplier's stock is only as fresh as its last sync (same as imported products); the safety stock setting is the buffer.
- `_claim` (older S&S rule) still marks an own product whose product code equals an S&S style id as an S&S product: pre-existing, noted, not changed.
