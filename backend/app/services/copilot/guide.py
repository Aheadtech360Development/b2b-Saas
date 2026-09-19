"""How the admin actually works, in the copilot's own words.

"How do I add a product?" is the other half of what an owner asks, and data
tools cannot answer it. Left to its general knowledge a model invents a
plausible menu path — confidently, and wrong — which is worse than saying
nothing, so the answers live here instead, written from the real screens.

Every path and button name below was taken from the admin itself. When a screen
is renamed or moved, this file has to move with it, or the copilot will send
someone to a page that isn't there.
"""
from __future__ import annotations

# slug -> (one-line summary, steps)
TOPICS: dict[str, tuple[str, str]] = {
    "add_product": (
        "Create a product",
        """Products → All Products → "Add product" (/admin/products/new).

The first question is the product type, and it decides the rest:
- "Apparel / stocked item" — real stock in sizes and colours. You add variants, each with its own SKU, price and stock.
- "Made to order / configurable" — no stock and no variant list. The buyer picks options (size, stock, finish, turnaround) and the price is built from those. Use it for banners, business cards, yard signs, anything with too many combinations to list.

Then fill in name, description, images and pricing, and save.
For a configurable product, the options are built after saving: open the product (Products → All Products → click it) and scroll to "Options & pricing".""",
    ),
    "product_options": (
        "Build the options and pricing of a configurable product",
        """Products → All Products → open the product → "Options & pricing".

- Each option group is one question to the buyer (Size, Paper Stock, Turnaround). Pick how they choose: Dropdown, Buttons, Colour circles or Checkboxes.
- Each choice can change the price: per unit (× quantity), one-off (once per order), or % of the unit price. Getting this wrong is costly — a $45 setup fee left on "per unit" becomes $22,500 on 500.
- Quantity tiers set the base price per quantity break.
- Rules hide or grey out a choice when another is picked (for example, no laminating when UV coating is on).
- An Image on a choice turns the list into picture tiles; Colour circles use the colour swatch.
Save at the top right. The buyer's price is always recalculated on the server.""",
    ),
    "add_customer": (
        "Add a customer, or approve one who signed up",
        """Customers → All Customers → "Add Customer" creates a wholesale account yourself.

If they registered on the storefront, they are waiting instead: Customers → Applications. Approve or reject there. Until approved they cannot order at wholesale prices.

Pricing for a customer: Customers → Discount Groups (a percentage for a group of customers) or Customer pricing (a fixed price for one customer on one variant).""",
    ),
    "orders": (
        "Find, update and ship orders",
        """Orders → All Orders. Click an order to open it: items, payment, shipping, and the status.

- Drafts (Orders → Drafts) is where you build an order for a customer yourself, then convert it to a real order.
- Shipping Labels (Orders → Shipping Labels) buys and prints labels.
- Abandoned carts shows carts that never became orders.
- A gang sheet or upload-by-size job on an order appears on the order page with its layout preview, print PDF and artwork files.""",
    ),
    "gang_sheets": (
        "Set up and run the gang sheet / upload-by-size builder",
        """Products → Gang Sheets. The tabs:
- Setup — the checklist of what still needs doing.
- Products — turn the builder on for a product and choose its type: "Gang Sheet" (buyer arranges designs on a fixed sheet) or "Upload By Size" (one design printed at an exact size, priced by area).
- Sheet Sizes — the sheet sizes and prices you offer, per product or for the whole store.
- Design Library — ready-made artwork buyers can drop onto a sheet.
- Orders — the review queue: check the artwork, edit the layout, download the print PDF, then approve, request a revision, or move it to production.
- Settings — builder behaviour and the customer agreement.

A job only enters the review queue once it is paid.""",
    ),
    "inventory": (
        "Check and correct stock",
        """Products → Inventory. It lists every variant's stock by warehouse, and "Adjust" changes a quantity with a reason recorded against it.

Warehouses are managed at Products → Inventory → Warehouses. Low-stock warnings use each variant's own low-stock threshold.""",
    ),
    "suppliers": (
        "Connect a supplier (S&S Activewear) and import its products",
        """Products → Suppliers. The list shows each supplier: S&S Activewear (Active once connected) and SanMar (inactive, coming soon). The Auto import switch on the list is the same setting as "Auto Create Products & Variants" in Automatic Sync.

Connect: click Edit on S&S → Connection Settings. Enter Supplier Name, Username (your S&S account number), API Key and Country (United States or Canada — Canadian accounts use S&S's Canadian API and catalogue). "Test" checks the credentials; "Save Supplier" (top right) saves every tab at once and checks them again. "Discard Changes" throws away unsaved edits. Each brand uses its own S&S account, so cost prices and stock are that brand's own.

View opens three tabs:
- Products for Import: add filter rules (Brand / Category / Style number or name / Product title; is, contains, is not; match any or all rules), "Save filters", then the counts show products selected, already in the store, ready to import, and variants. "Import N products" runs on the server with a progress bar; up to 500 per run, and products already imported are skipped. With no rules nothing is selected.
- Browse Catalog: search the whole S&S catalogue or pick a brand. "+ Add to import" adds that style to the filters, "Add all <brand> to import" adds the brand, "Import now" imports one style straight away.
- Edit Supplier: the settings tabs — Connection, Inventory, Product, Automatic Sync, Order Settings.

Product Settings (Edit Supplier → Product Settings):
- Publish Imported Products: Active (live on the storefront) or Draft (review first).
- Match Fields: each row maps a supplier field (Source …) to a store field (Store …). "Modify" adds a template, e.g. {{ style.brandName }} {{ style.styleName }} for the title, or {{ variant.customerPrice | times: 1.25 | round: 2 }} for a price. Filters: times, plus, minus, divided_by, round, ceil, floor, at_least, at_most, prepend, append, upcase, downcase, capitalize, replace, remove, strip_html, truncate, default. "Restore Default Fields" puts the defaults back; "+ Add Field" adds a row; Variant Sku and Variant Price must stay mapped. "Preview on a real product" shows what an import would create.
- Markup Rules: selling price = S&S cost + markup, used when the Variant Price mapping has no Modify. Most specific wins: style, then brand, then category, then all products; with no rule, cost + 40%. Price rounding: .99, .95 or whole dollars. Applies to products imported or updated from then on.""",
    ),
    "supplier_sync": (
        "Supplier stock and automatic sync (S&S)",
        """Inventory Settings (Products → Suppliers → Edit → Inventory Settings): for each of your store locations choose where its stock comes from — "All except Dropshipping", "All warehouses", "Dropshipping", one S&S warehouse, or "Don't import stock here". With nothing chosen, your first location gets everything except drop-ship. "Inventory Adjustment Quantity" is held back from every variant (S&S has 52, adjustment 5 → the store shows 47; never below 0).

Automatic Sync (same page, next tab):
- Frequency: Off, or every 1/3/6/12 hours, daily, every 2 days, weekly. Runs on the server — the admin doesn't need to be open.
- Update Settings: Only Inventory, Inventory and Prices, Everything (all matched fields), or Nothing — what a sync changes on products already in the store.
- Auto Create Products & Variants: Always (new products matching the import filters, and new variants), Only New Variants on Existing Products, or Don't Create.
- Action on Unavailable Products (S&S stopped selling it): No Action, Set stock to 0, Set to Draft, or Archive. A product set aside this way goes back to active when S&S sells it again.
- Maximum Variants Per Product (100 / 250 / 2048 / no limit) and Handle Variant Limit (keep the first N, or skip the product).
- Always Update Variant Images: Use Update Settings, or Always.
"Sync stock" updates quantities now; "Full sync" applies all of these now. Save first — a sync uses the saved settings. Sync History lists each run, whether manual or scheduled, with what it changed.""",
    ),
    "supplier_orders": (
        "Send orders to the supplier (S&S purchase orders)",
        """Products → Suppliers → Edit → Order Settings. Off by default.

- Test mode (the switch at the top) is ON until you turn it off: S&S creates and immediately cancels test orders — nothing ships, nothing is charged. Turn it off only when you're ready to place real orders.
- Order Sync: Disabled; Automatic (each order goes within a few minutes of being paid or confirmed); Scheduled (once a day at the hour you pick); or Manual (you choose orders in "Orders to Send" and click Send). Only orders placed after you switched sending on are ever sent — never older ones.
- Only items that came from S&S are sent; the rest of the order is untouched.
- Ship To Address: to the customer (dropship) or to your own address (then Combine Orders can put a whole scheduled run on one PO).
- Store Fulfillment: mark the store order shipped when S&S ships it (tracking added, customer emailed), when the PO is placed, or never.
- Supplier PO Number: a template, default {{ order.order_number }}; {{ order.po_number }} is the customer's PO.
- Warehouse Selection (let S&S choose, or only some warehouses; fewest shipments or fastest), Shipping Method (Cheapest chosen by S&S is the default), Order Payment (on account / credit terms, or a card saved on the S&S website — "Load cards" lists them), Confirmation Email, Ship blind.
Below the settings: "Orders to Send" (tick and send; failed ones wait here with S&S's reason) and "Supplier Orders" (every PO with its status — test, placed, shipped, failed — S&S order number, PO and tracking). "Check for shipments" asks S&S for tracking now; it is also checked automatically every 30 minutes. An order can never be sent twice.""",
    ),
    "shipping": (
        "Set up shipping and connect carriers (UPS, FedEx, USPS)",
        """Shipping (in the left nav, under Marketing) holds flat rates and shipping rules, the ship-from address, and the carrier connections. Each brand connects its own carrier accounts, so checkout shows that brand's own negotiated rates and labels bill to it.

- UPS: Client ID and Client secret (from your app at developer.ups.com) and your UPS account (shipper) number.
- FedEx: API key and Secret key (developer.fedex.com) and your FedEx account number.
- USPS: Consumer key and secret (developer.usps.com). For labels also your EPS account number, CRID and MID (from the Business Customer Gateway) — without them USPS gives rates only.
- Environment: "test" uses the carrier's sandbox; switch to "production" for real labels.
Connecting checks the account for real — it prices a sample parcel (and for USPS checks label payment), so wrong details are refused with the carrier's own reason.

Labels: open the order → the label section. Orders where the buyer picked a live rate at checkout buy that rate; others show live rates to choose from. The label is bought on the brand's carrier account, kept on the order ("Download Label" reprints it any time), the order is marked Shipped and the customer is emailed the tracking link.
With no carrier connected, live rates fall back to the platform's aggregator account so checkout still works.""",
    ),
    "email": (
        "Set up the store's email",
        """Settings → General & Email. The email section sets the brand's sender name, reply-to address and which address gets your own alerts (new orders, applications).

The platform sends the mail; each brand only chooses its identity and where alerts land.""",
    ),
    "discounts": (
        "Create a discount code",
        """Discounts → "Create Discount". Set the code, the amount or percentage, and any conditions.

For customer-based pricing rather than a code, use Customers → Discount Groups instead.""",
    ),
    "users": (
        "Add a staff member and control what they can see",
        """Settings → Users → "Add User". Each user gets a role, and the role decides which parts of the admin they can open. Roles are managed from the same screen.

Settings → Security (2FA) covers sign-in protection, and Settings → Audit Log shows who changed what.""",
    ),
    "storefront": (
        "Change how the storefront looks and reads",
        """Storefront (in the left nav) is the theme: colours, fonts, homepage sections, logo and favicon.
- Storefront → Pages for pages like About or Contact.
- Storefront → Menus for the navigation.
- Storefront → Media Library for images.""",
    ),
    "purchase_orders": (
        "Buy stock from a supplier",
        """Orders → Purchase Orders → Create. Add the supplier and the items, send it, and when the stock arrives use Receive to book it into inventory.""",
    ),
    "returns": (
        "Handle a return",
        """Sales → Returns. Each request shows the order, the reason and the customer. Approve or reject it there; the customer sees the decision.""",
    ),
    "taxes": (
        "Set up tax",
        """Settings → Taxes & Duties. Each brand chooses its own tax handling — automatic, manual rates, or none.""",
    ),
    "billing": (
        "Payouts and the platform subscription",
        """Settings → Billing & Payouts. Connect the payment account that customer payments are paid into, and see the store's own subscription to the platform.""",
    ),
    "reports": (
        "See how the store is doing",
        """Settings → Analytics for the overview. The dashboard's own numbers cover today and the last 7 days, and the copilot can answer sales questions directly.""",
    ),
}

INDEX = "\n".join(f"- {slug}: {title}" for slug, (title, _) in TOPICS.items())


def lookup(topic: str) -> dict:
    key = (topic or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key in TOPICS:
        title, steps = TOPICS[key]
        return {"topic": key, "title": title, "steps": steps}
    # Near-enough match, so "products" or "adding a product" still finds
    # add_product. Words are compared singular, since the model asks either way.
    def words(text: str) -> set[str]:
        return {w[:-1] if len(w) > 3 and w.endswith("s") else w for w in text.split("_") if w}

    asked = words(key)
    if asked:
        # The topic sharing the most words wins ("send orders to supplier" is
        # supplier_orders, not the first topic that mentions orders).
        best = max(TOPICS, key=lambda slug: len(asked & words(slug)))
        if asked & words(best):
            title, steps = TOPICS[best]
            return {"topic": best, "title": title, "steps": steps}
    return {
        "error": f"No guide for '{topic}'.",
        "available_topics": list(TOPICS),
        "note": "Answer only from a topic listed here; do not describe screens that aren't in one.",
    }
