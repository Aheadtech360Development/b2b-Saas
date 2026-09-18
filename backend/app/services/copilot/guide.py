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

Pricing for a customer: Customers → Discount Groups (a percentage for a group of customers) or Individual Variant Pricing (a fixed price for one customer on one variant).""",
    ),
    "orders": (
        "Find, update and ship orders",
        """Orders → All Orders. Click an order to open it: items, payment, shipping, and the status.

- Drafts (Orders → Drafts) is where you build an order for a customer yourself, then convert it to a real order.
- Shipping Labels (Orders → Shipping Labels) buys and prints labels.
- Abandoned Checkouts shows carts that never became orders.
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
        "Connect a supplier catalogue (S&S Activewear)",
        """Products → Suppliers → S&S Activewear → Edit → Connection: add your own S&S account number and API key. Then "Products for Import": set filters (e.g. Brand is Gildan), save, and click Import. "Browse Catalog" lets you add single styles or whole brands, or import one right away. Edit → Product pricing sets your markup rules and rounding; Inventory sets stock sync and safety stock; Automatic sync runs stock (and, with Auto import on, new matching products) on a schedule. SanMar is coming soon.""",
    ),
    "shipping": (
        "Set up shipping and connect carriers",
        """Standard Shipping (in the left nav) is where flat rates and shipping rules live, and where UPS, FedEx and USPS are connected — each brand with its own carrier account, so labels and rates bill that brand.

With no carrier connected, live rates fall back to test rates so checkout still works.""",
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
        """Online Store → Storefront is the theme: colours, fonts, homepage sections, logo and favicon.
- Online Store → Pages for pages like About or Contact.
- Online Store → Menus for the navigation.
- Online Store → Media Library for images.""",
    ),
    "purchase_orders": (
        "Buy stock from a supplier",
        """Orders → Purchase Orders → Create. Add the supplier and the items, send it, and when the stock arrives use Receive to book it into inventory.""",
    ),
    "returns": (
        "Handle a return",
        """Orders → Returns (RMA). Each request shows the order, the reason and the customer. Approve or reject it there; the customer sees the decision.""",
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
        for slug, (title, steps) in TOPICS.items():
            if asked & words(slug):
                return {"topic": slug, "title": title, "steps": steps}
    return {
        "error": f"No guide for '{topic}'.",
        "available_topics": list(TOPICS),
        "note": "Answer only from a topic listed here; do not describe screens that aren't in one.",
    }
