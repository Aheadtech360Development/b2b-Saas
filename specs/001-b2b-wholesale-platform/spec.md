# Feature Specification: AF Apparels B2B Wholesale E-Commerce Platform

**Feature Branch**: `001-b2b-wholesale-platform`
**Created**: 2026-03-06
**Status**: Draft
**Input**: Full platform specification replacing Shopify with a custom B2B wholesale platform

---

## Project Overview

**Product:** AF Apparels B2B Wholesale E-Commerce Platform
**Type:** Custom-built wholesale ordering platform replacing an existing Shopify store
**Target Users:** Wholesale buyers (distributors, resellers), AF Apparels admin team
**Business Model:** Pure B2B wholesale — not retail

### Problem Statement

AF Apparels currently operates on Shopify, which does not adequately support B2B wholesale
operations: tiered pricing per customer, bulk ordering across size/color variant matrices,
minimum order enforcement, warehouse-based inventory, and QuickBooks accounting integration.
The current workflow involves manual processes that are slow, error-prone, and do not scale.

### Solution

Build a custom B2B wholesale platform that enables wholesale buyers to register, get approved,
see their tier-specific pricing, place bulk orders through an intuitive variant grid, and manage
their accounts — while giving the AF Apparels team full admin control over products, pricing,
inventory, customers, orders, and accounting sync.

---

## User Roles

| Role | Description |
|---|---|
| **Guest** | Unauthenticated visitor. Can browse catalog and search/filter. Cannot add to cart or order. Pricing visibility is admin-configured. |
| **Wholesale Customer** | Approved buyer representing a company. Sees tier-specific pricing, places bulk orders, manages account. |
| **Company Account Owner** | Primary user on a wholesale account. All buyer capabilities plus user management (invite, assign roles, deactivate). |
| **Admin** | AF Apparels team. Full platform control: products, inventory, orders, customers, pricing tiers, shipping tiers, email templates, system settings. |

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Wholesale Registration & Approval (Priority: P1)

As a prospective wholesale buyer, I want to submit an application with my business details,
so that I can be approved for a wholesale account with tier-specific pricing.

**Why this priority**: Gating capability — no other buyer functionality is accessible without
an approved account. This is the entry point for all wholesale customers.

**Independent Test**: Application can be submitted, reviewed in admin, approved with tier
assignment, and the approved buyer can log in and see their tier pricing — without any
other feature being complete.

**Acceptance Scenarios**:

1. **Given** a visitor on the registration page, **When** they submit the form with company
   name, tax ID, business type, contact info, and expected order volume, **Then** the
   application is stored with "Pending" status and admin receives a notification.
2. **Given** a pending application in the admin queue, **When** the admin approves it with
   a pricing tier and shipping tier assigned, **Then** the applicant receives an email with
   login instructions and can log in.
3. **Given** a pending application, **When** the admin rejects it with a reason, **Then**
   the applicant receives an email with the rejection reason.
4. **Given** an approved customer logs in and views any product, **When** the page renders,
   **Then** they see their tier-specific discounted price, not the retail price.
5. **Given** a pending applicant logs in before approval, **When** they view their dashboard,
   **Then** they see a status page indicating their application is under review.

---

### User Story 2 — Product Catalog Browsing (Priority: P1)

As a wholesale customer, I want to browse products by category, search by keyword, and
filter by size/color/price, so that I can quickly find the products I need to order.

**Why this priority**: Core discovery mechanism. Without catalog browsing, ordering is
impossible.

**Independent Test**: A logged-in wholesale customer can find a product via search and
category filter, view its detail page with correct tier pricing and variant availability.

**Acceptance Scenarios**:

1. **Given** a logged-in wholesale customer on the product listing page, **When** they filter
   by category "Jackets" and size "L", **Then** results update in real-time showing only
   matching products at their tier-specific prices.
2. **Given** a customer searches "polo shirt", **When** results appear, **Then** all products
   whose name, description, or SKU contain the search term are returned.
3. **Given** a guest visits the product listing page and pricing is set to "Login for pricing",
   **When** the page renders, **Then** prices are hidden and a login prompt is shown.
4. **Given** a customer views a product detail page, **When** the page loads, **Then** all
   images are shown with zoom capability, all variants with availability status, and the
   tier-specific price per variant.
5. **Given** a mobile user browses on a 375px viewport, **When** the catalog loads, **Then**
   products display in a 2-column grid and filters are accessible via a toggle button.

---

### User Story 3 — Bulk Ordering via Variant Matrix (Priority: P1)

As a wholesale customer, I want to enter quantities for multiple size/color combinations
in a single grid and add everything to my cart at once, so that I can place large orders
efficiently without navigating to separate variant pages.

**Why this priority**: Core ordering mechanism for B2B wholesale. Primary differentiation
from standard e-commerce.

**Independent Test**: A customer can open the variant matrix on a product, enter quantities
across multiple color/size cells, see live totals update, and add all to cart in one action.

**Acceptance Scenarios**:

1. **Given** a product with 4 colors × 6 sizes (24 variants), **When** a customer opens the
   variant matrix, **Then** a grid renders with colors as rows, sizes as columns, and each
   cell showing available stock.
2. **Given** a customer enters quantities in 8 cells, **When** values are entered, **Then**
   row subtotals, column subtotals, unit grand total, and dollar grand total all update
   in real-time.
3. **Given** a product with MOQ of 12 and a customer has entered 8 total units, **When**
   they view the matrix footer, **Then** a warning reads "Minimum 12 units required, you
   have 8."
4. **Given** a customer clicks "Add All to Cart", **When** the action completes, **Then**
   all cells with non-zero quantities are added as individual line items in the cart.
5. **Given** a mobile user on a 375px viewport views a 24-variant matrix, **When** rendered,
   **Then** the grid scrolls horizontally with color row headers sticky on the left and
   size column headers sticky at the top.
6. **Given** a product with 60 variants, **When** the matrix renders, **Then** all 60 cells
   render and respond to input within 300ms.

---

### User Story 4 — Quick Order by SKU (Priority: P2)

As an experienced wholesale buyer who knows exactly what I want, I want to enter SKU and
quantity pairs directly or paste from a spreadsheet, so that I can add items to my cart
without browsing the catalog.

**Why this priority**: High-value power-user feature that significantly reduces ordering
time for repeat customers.

**Independent Test**: A customer can paste 10 SKU,Quantity lines, see validation results
categorized by valid/invalid/insufficient stock, and add valid items to cart.

**Acceptance Scenarios**:

1. **Given** a customer pastes "SKU001,24" and "INVALID999,6" into the quick order field,
   **When** they validate, **Then** SKU001 appears as valid and INVALID999 as "not found."
2. **Given** a SKU with 5 units in stock and a customer requests 20, **When** validated,
   **Then** the item appears as "insufficient stock (5 available, 20 requested)."
3. **Given** a customer uploads a CSV with SKU and Quantity columns, **When** processed,
   **Then** the same validation logic applies as with text input.
4. **Given** validated results show 8 valid and 2 invalid items, **When** the customer
   clicks "Add Valid Items to Cart", **Then** only the 8 valid items are added.

---

### User Story 5 — Shopping Cart with MOQ & MOV Enforcement (Priority: P1)

As a wholesale customer, I want to review my cart and understand any ordering requirements
before checkout, so that I can adjust my order to meet minimum requirements.

**Why this priority**: Without cart validation, invalid orders can be submitted. Direct
business rule enforcement.

**Independent Test**: A cart with items violating MOQ and MOV shows appropriate warnings,
the checkout button is disabled, and resolving the issues enables checkout.

**Acceptance Scenarios**:

1. **Given** a cart with 5 units of Product A (MOQ: 12), **When** the cart loads, **Then**
   a warning reads "Product A requires minimum 12 units, you have 5."
2. **Given** a cart total of $380 and a MOV of $500, **When** the cart loads, **Then** a
   warning reads "Minimum order value is $500. Your cart: $380. Add $120 more to proceed."
   and the "Proceed to Checkout" button is disabled.
3. **Given** all MOQ and MOV requirements are met, **When** the cart loads, **Then** no
   warnings are shown and "Proceed to Checkout" is enabled.
4. **Given** a customer clicks "Save as Template" and enters a name, **When** submitted,
   **Then** the template is saved and retrievable from their account dashboard.
5. **Given** a customer edits a quantity inline to zero, **When** changed, **Then** the
   item is removed from the cart and totals recalculate immediately.

---

### User Story 6 — Multi-Step Checkout with PO Number (Priority: P1)

As a wholesale customer, I want to complete my order through a clear multi-step checkout
process that accepts my purchase order number, so that my order is properly tracked in
both systems.

**Why this priority**: Without checkout, orders cannot be placed. PO number is a standard
B2B requirement.

**Independent Test**: A customer with a valid cart can complete all 4 checkout steps,
submit the order, receive a confirmation page, and receive a confirmation email.

**Acceptance Scenarios**:

1. **Given** checkout step 1 (Shipping Address), **When** a customer selects a saved address
   or adds a new one, **Then** they can proceed to step 2.
2. **Given** checkout step 2 (Order Details), **When** a customer enters a PO number and
   notes, **Then** these are attached to the order record.
3. **Given** checkout step 3 (Payment), **When** a customer submits card details, **Then**
   card data is processed by the payment provider without touching the server.
4. **Given** checkout step 4 (Review), **When** a customer clicks "Back", **Then** their
   previously entered data is preserved.
5. **Given** an order is submitted and an item is out of stock server-side, **When** the
   validation fails, **Then** the customer is returned to cart with the specific item flagged.
6. **Given** a successful order, **When** the confirmation page loads, **Then** the order
   number and PO number are displayed and a confirmation email is sent to the buyer and
   all configured company contacts.

---

### User Story 7 — Customer Account Dashboard (Priority: P2)

As a wholesale customer, I want to access a comprehensive dashboard with all my account
information, so that I can manage my orders, account, and purchasing operations in one place.

**Why this priority**: Self-service reduces admin burden and improves buyer experience.

**Independent Test**: A logged-in buyer can navigate to each dashboard section, view order
history, update their profile, and manage their address book.

**Acceptance Scenarios**:

1. **Given** a logged-in customer visits the dashboard, **When** the overview loads, **Then**
   they see last 5 orders, total spend (current year), pricing tier name, and quick actions.
2. **Given** a customer filters Order Status by "Shipped" and "last 30 days", **When** results
   load, **Then** only matching orders are shown with status, date, total, and PO number.
3. **Given** a Company Account Owner views "Manage Users" and invites a new user by email,
   **When** submitted, **Then** the invited user receives an invitation email.
4. **Given** a customer views Statements and clicks "Download PDF" on an invoice, **When**
   clicked, **Then** a PDF downloads with all line items, totals, and payment details.
5. **Given** a customer views their Price List and clicks "Download Excel", **When** clicked,
   **Then** an Excel file downloads with all products at their tier's prices.

---

### User Story 8 — Reorder & Order Templates (Priority: P2)

As a wholesale customer who places similar orders regularly, I want to reorder from previous
orders or load saved templates, so that I can place repeat orders quickly.

**Why this priority**: Reduces friction for repeat buyers, increasing order frequency.

**Independent Test**: A customer can click "Reorder" on a past order, see a new cart
populated with items (stock validated), and proceed to checkout.

**Acceptance Scenarios**:

1. **Given** a past order with 3 line items, **When** the customer clicks "Reorder", **Then**
   a new cart is created with current prices applied and out-of-stock items flagged.
2. **Given** a saved template is loaded, **When** loaded, **Then** a cart is created with
   current prices and stock validation applied.
3. **Given** a template item is now discontinued, **When** the template is loaded, **Then**
   that item is excluded with a message "SKU-XXX is no longer available."

---

### User Story 9 — Product Asset Access (Priority: P3)

As a wholesale customer who resells AF Apparels products, I want to download product images
and marketing flyers, so that I can use them in my own sales channels.

**Why this priority**: Value-add for resellers. Not blocking to core ordering workflow.

**Independent Test**: A customer can download images and a flyer from a product page as ZIP
and PDF respectively.

**Acceptance Scenarios**:

1. **Given** a customer on a product page clicks "Download Images", **When** clicked, **Then**
   a ZIP file downloads containing all high-resolution product images.
2. **Given** a customer clicks "Email Flyer" and enters an email address, **When** submitted,
   **Then** the PDF is sent to that address within 60 seconds.
3. **Given** a customer selects 3 products from the catalog, **When** they click "Bulk
   Download", **Then** a single ZIP is generated containing all images and flyers for the
   selected products.

---

### User Story 10 — Tier-Based Pricing Engine (Priority: P1)

As a system, I need to display the correct price to each customer based on their assigned
pricing tier, so that wholesale buyers see their discounted prices and the business maintains
proper margin control.

**Why this priority**: Foundational to the commercial model. Incorrect pricing directly
impacts revenue and customer trust.

**Independent Test**: An admin creates a pricing tier with a discount %, assigns it to a
company, and that company's users see the discounted price on every product.

**Acceptance Scenarios**:

1. **Given** an admin creates "Tier Gold" at 25% off and assigns it to Company A, **When**
   a Company A user views a $100 product, **Then** they see $75.
2. **Given** a product is added to an order, **When** the order line is saved, **Then** the
   unit price at time of purchase is snapshotted and is not affected by future tier changes.
3. **Given** a guest visits a product page and pricing is set to "Login for pricing", **When**
   rendered, **Then** no price is shown, only a login prompt.
4. **Given** an admin generates a price list for Company A, **When** downloaded, **Then**
   all products show Tier Gold prices (25% off retail).

---

### User Story 11 — Tier-Based Shipping Calculation (Priority: P1)

As a system, I need to calculate shipping cost based on the customer's assigned shipping
tier, so that different wholesale customers get appropriate rates based on their agreement.

**Why this priority**: Shipping cost is displayed at checkout and impacts order total.
Incorrect calculation causes financial discrepancies.

**Independent Test**: An admin defines a shipping tier with brackets and assigns it to a
company; at checkout that company sees the correct bracket-based shipping cost.

**Acceptance Scenarios**:

1. **Given** a shipping tier "Standard" with brackets 1–99 units → $25, 100–499 → $50,
   500+ → $0; and Company A assigned to "Standard" with 120 units in cart, **When** they
   reach checkout, **Then** shipping shows $50.
2. **Given** a company with a fixed shipping override of $0, **When** any order quantity,
   **Then** shipping always shows $0, ignoring tier brackets.
3. **Given** the checkout review page, **When** shipping is calculated, **Then** both the
   shipping tier name and the calculated cost are displayed.

---

### User Story 12 — Warehouse-Based Inventory Management (Priority: P2)

As an admin, I want to track inventory across multiple warehouses, so that I have accurate
stock visibility and can manage receiving and adjustments per location.

**Why this priority**: Accurate inventory prevents overselling.

**Independent Test**: An admin creates 2 warehouses, adds stock to each for a variant, and
a customer sees the summed available quantity on the product page.

**Acceptance Scenarios**:

1. **Given** Warehouse A has 50 units of SKU-001 and Warehouse B has 30 units, **When** a
   customer views SKU-001's availability, **Then** they see "80 available."
2. **Given** an admin adjusts stock at Warehouse A for SKU-001 from 50 to 45 with reason
   "Damaged", **When** saved, **Then** an audit log records old=50, new=45, reason="Damaged",
   admin user, and timestamp.
3. **Given** a variant at any warehouse drops below the configured low-stock threshold,
   **When** the threshold is crossed, **Then** a low-stock alert appears in the admin
   dashboard.
4. **Given** an admin uploads a CSV with SKU, Warehouse Code, Quantity, and Adjustment Type
   columns, **When** import completes, **Then** stock is updated per row and a summary
   report shows success/error counts.

---

### User Story 13 — Admin Product Management (Priority: P1)

As an admin, I want to manage the entire product catalog from a centralized interface,
so that I can add, edit, and organize products without developer assistance.

**Why this priority**: Without product management, the catalog cannot be maintained
after launch.

**Independent Test**: An admin creates a new product with variants, uploads images, sets
MOQ, and publishes it — after which it appears in the customer-facing catalog.

**Acceptance Scenarios**:

1. **Given** an admin uploads 3 images via drag-and-drop, **When** saved, **Then** images
   appear in the dragged order and are served as WebP with JPEG fallback in 3 sizes
   (thumbnail 150px, medium 400px, large 800px).
2. **Given** an admin bulk-generates variants with colors [Red, Blue] × sizes [S, M, L],
   **When** generated, **Then** 6 variants are created each with a unique editable SKU.
3. **Given** an admin selects 20 products and applies "Update Pricing +10%", **When**
   applied, **Then** all 20 retail prices increase by 10%.
4. **Given** an admin exports the catalog as CSV, modifies 5 rows, and re-imports, **When**
   import completes, **Then** only those 5 products are updated.

---

### User Story 14 — Admin Order Management (Priority: P2)

As an admin, I want to view and manage all orders from a centralized dashboard, so that
I can process orders, update shipping, and handle issues efficiently.

**Why this priority**: Post-order fulfillment workflow management is critical.

**Independent Test**: An admin can find an order by PO number, update its status, enter a
tracking number, and trigger a customer email notification.

**Acceptance Scenarios**:

1. **Given** an admin searches by PO number "PO-2026-001", **When** results load, **Then**
   the matching order appears with company name, status, and total.
2. **Given** an admin enters a tracking number and sets status to "Shipped", **When** saved,
   **Then** the customer receives an automated shipping email with the tracking number.
3. **Given** an admin views an order and clicks "Manual QB Sync", **When** triggered, **Then**
   a sync attempt runs and the result (success/fail) is shown within 30 seconds.
4. **Given** an admin exports orders filtered to "Last 30 days, Status=Shipped", **When**
   CSV downloads, **Then** only matching orders are included.

---

### User Story 15 — Admin Customer & Wholesale Management (Priority: P1)

As an admin, I want to manage all wholesale company accounts and approve new applications,
so that I can control who gets wholesale access and at what tier.

**Why this priority**: Core business operation — controls who can order and at what price.

**Independent Test**: An admin views the approval queue, approves an application with tier
assignment, and the company account becomes active.

**Acceptance Scenarios**:

1. **Given** a new wholesale application, **When** the admin approves with "Tier Silver"
   (pricing) and "Standard Shipping" (shipping), **Then** the company is activated and
   users see Silver tier prices.
2. **Given** an admin suspends Company A, **When** Company A users attempt to log in,
   **Then** they receive a message that their account is suspended.
3. **Given** an admin views a company's detail page and clicks "Generate Price List",
   **When** clicked, **Then** a PDF/Excel price list at that company's tier is generated
   and downloadable.

---

### User Story 16 — Admin Reporting & Analytics (Priority: P2)

As an admin, I want to view sales, inventory, and customer reports, so that I can make
informed business decisions.

**Why this priority**: Operational visibility for business management.

**Independent Test**: An admin can view a sales revenue report filtered by last 30 days,
see revenue by category, and export as CSV.

**Acceptance Scenarios**:

1. **Given** an admin selects "Sales Report" with date range "Q1 2026", **When** loaded,
   **Then** revenue by week, by category, and top 10 products are displayed.
2. **Given** an admin views the "Low Stock" report, **When** loaded, **Then** all variants
   below their threshold across all warehouses are listed.
3. **Given** an admin clicks "Export CSV" on any report, **When** downloaded, **Then** the
   current filtered view is exported as a valid CSV within 10 seconds.

---

### User Story 17 — QuickBooks Integration (Priority: P2)

As a system, I need to sync customer and order data to QuickBooks Online, so that accounting
is automated and invoices are created without manual data entry.

**Why this priority**: Direct financial requirement replacing manual QB entry, an explicit
pain point.

**Independent Test**: When an order is placed and paid, a corresponding QB invoice is
created with correct line items and PO number, verifiable in the QB sandbox.

**Acceptance Scenarios**:

1. **Given** a new wholesale customer is approved, **When** approval is processed, **Then**
   a customer record is created in QuickBooks within 60 seconds (async) or retry is queued.
2. **Given** an order is placed and payment confirmed, **When** the order event fires,
   **Then** a QB invoice is created with all line items, amounts matching order totals,
   and the PO number in the memo field.
3. **Given** a QB sync attempt fails, **When** caught, **Then** the failure is logged with
   full error detail and retried with exponential backoff (max 5 attempts).
4. **Given** the admin QB dashboard, **When** loaded, **Then** it shows last sync time,
   today's successful sync count, and a list of failed syncs with retry buttons.
5. **Given** QB sync is retrying, **When** order fulfillment runs concurrently, **Then**
   the order is not blocked — sync is entirely asynchronous.

---

### User Story 18 — Email Notification System (Priority: P1)

As a system, I need to send automated transactional emails for key events, so that customers
and admins are kept informed without manual communication.

**Why this priority**: Required for registration flow, order flow, and operational
communications. Cannot function without it.

**Independent Test**: Triggering an order confirmation event sends an email to the buyer
within 60 seconds with accurate order details.

**Acceptance Scenarios**:

1. **Given** an order is confirmed, **When** the event fires, **Then** an email is sent to
   the buyer and all contacts with the "order confirmation" preference enabled.
2. **Given** an admin inserts `{{tracking_number}}` variable into the "Order Shipped"
   template, **When** previewed, **Then** a sample tracking number appears in the preview.
3. **Given** an email send fails, **When** caught, **Then** the job is retried up to 3 times
   with backoff before being marked as failed.

---

### User Story 19 — Data Migration from Shopify (Priority: P1)

As a system, I need to migrate all product, customer, and order data from Shopify, so that
the platform launches with complete data and no business disruption.

**Why this priority**: Launch blocker. Platform cannot go live without historical data.

**Independent Test**: Run migration on staging — verify product count matches Shopify export,
images load at all 3 sizes, no duplicate SKUs exist.

**Acceptance Scenarios**:

1. **Given** a Shopify export with 100 products, **When** migration runs, **Then** all 100
   products appear with correct names, descriptions, variants, and categories.
2. **Given** a Shopify product image, **When** migration processes it, **Then** three resized
   versions (thumbnail 150px, medium 400px, large 800px) and WebP conversions are stored.
3. **Given** old Shopify URL `/products/red-polo-shirt`, **When** a browser requests it,
   **Then** a 301 redirect is returned to the new product URL.
4. **Given** migration completes, **When** a validation report runs, **Then** product count,
   variant count, and image count all match the Shopify export with 0 discrepancies.

---

### User Story 20 — Audit Logging (Priority: P2)

As an admin, I want every admin action to be logged with timestamp and user information,
so that I can track who changed what and when for accountability and debugging.

**Why this priority**: Accountability and debugging. Required for business compliance.

**Independent Test**: An admin edits a product price; the audit log shows the change with
old value, new value, admin user, and timestamp.

**Acceptance Scenarios**:

1. **Given** an admin changes Product A's retail price from $50 to $45, **When** saved,
   **Then** an audit log entry is created with action=UPDATE, entity=Product, old=$50,
   new=$45, admin user, timestamp, and IP address.
2. **Given** an admin searches the audit log for "Company A" changes in the last 7 days,
   **When** results load, **Then** all admin actions on Company A records in that period
   are listed.
3. **Given** an audit log entry, **When** the admin views detail, **Then** a diff showing
   old value vs new value is displayed for all changed fields.

---

### Edge Cases

- **Tier change mid-session**: If a customer's pricing tier is changed by an admin during an
  active session, prices refresh on next page load (not mid-session) to avoid confusion.
- **Out-of-stock product**: A product with zero stock across all warehouses shows as
  "Out of Stock", disables quantity input, and is excluded from MOQ calculations.
- **Deleted product in cart**: If an admin deletes a product that is in a customer's cart,
  the cart displays "This product is no longer available" and the item cannot be checked out.
- **QuickBooks token expiry**: Token refresh is handled automatically. If refresh also fails,
  the sync is queued for retry after re-authorization.
- **Duplicate SKU in CSV import**: Last row wins; duplicate rows are flagged in the import
  summary report.
- **MOV with templates**: When loading an order template, MOV is not pre-validated — it is
  enforced only at checkout.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST enforce role-based access: Guests cannot add to cart or order;
  Customers cannot access admin; Admins have full platform access.
- **FR-002**: System MUST apply tier-based pricing at all display points (listing, detail,
  cart, order line items) and MUST snapshot prices at order creation.
- **FR-003**: System MUST enforce MOQ per product and MOV per order at cart display and
  server-side at order creation.
- **FR-004**: System MUST calculate shipping cost using the company's assigned shipping tier
  brackets or fixed override.
- **FR-005**: System MUST track inventory per variant per warehouse and display summed
  availability to customers.
- **FR-006**: System MUST create QuickBooks customer records on approval and invoices on paid
  orders, asynchronously, with automatic retry on failure.
- **FR-007**: System MUST send transactional emails for all defined trigger events via async
  background queue with retry logic.
- **FR-008**: System MUST log all admin write operations to an immutable audit log with user,
  timestamp, IP, entity, and old/new values.
- **FR-009**: System MUST support bulk ordering via variant matrix (grid input) for products
  with multiple size/color variants.
- **FR-010**: System MUST support quick order by SKU (text/CSV input) with validation against
  live catalog and stock levels.
- **FR-011**: System MUST allow Company Account Owners to invite sub-users with roles
  (Buyer, Viewer, Finance) and deactivate users.
- **FR-012**: System MUST migrate all Shopify products, customers, and order history with 100%
  count validation and zero duplicate SKUs.
- **FR-013**: System MUST generate 301 redirects for all old Shopify product and category URLs.
- **FR-014**: System MUST allow admins to manage products, variants, inventory, orders,
  customers, pricing tiers, shipping tiers, and email templates without developer assistance.
- **FR-015**: System MUST allow customers to save, load, and manage named order templates.

### Key Entities

- **Company**: Wholesale account. Has pricing tier, shipping tier, status, users, addresses,
  contacts, and optional fixed shipping override.
- **User**: Person who logs in. Belongs to a Company (role: Owner/Buyer/Viewer/Finance) or
  is an Admin.
- **Product**: Catalog item. Has name, description, category, images, marketing flyer, MOQ,
  SEO fields, status.
- **Variant**: Specific attribute combination (color, size). Has SKU, retail price, status.
- **PricingTier**: Discount percentage applied to retail prices. Assigned per Company.
- **ShippingTier**: Bracket-based shipping cost table. Assigned per Company. Overridable with
  a fixed per-company rate.
- **Warehouse**: Physical stock location. Has name, code, address, active status.
- **InventoryRecord**: Stock quantity of a Variant at a specific Warehouse.
- **InventoryAdjustment**: Logged stock change with reason code and admin audit trail.
- **Cart**: Session-persisted (Redis) collection of CartItems. Belongs to a User.
- **CartItem**: One line in a cart. References Variant, quantity, price at add-time.
- **Order**: Confirmed purchase. Has status, PO number, shipping address, payment reference,
  QB sync status.
- **OrderItem**: One line in an order. References Variant, quantity, unit price (snapshot at
  time of order).
- **OrderTemplate**: Named saved cart. Stores SKU+quantity pairs. Belongs to a Company.
- **EmailTemplate**: Admin-editable template. Has trigger event, subject, body with variable
  placeholders.
- **AuditLog**: Immutable record of admin write operations.
- **QuickBooksSyncJob**: Tracks sync attempt for a Company or Order with status and retry
  count.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of products migrated from Shopify — product count, variant count, and image
  count match the Shopify export with 0 discrepancies (validated pre-launch).
- **SC-002**: A new wholesale buyer can complete the full registration-to-first-order flow in
  under 10 minutes.
- **SC-003**: Tier-specific pricing is displayed correctly for 100% of products across all
  customer tiers with 0 pricing errors in the first 30 days post-launch.
- **SC-004**: 100% of order submissions that violate MOQ or MOV are blocked server-side —
  verified by automated integration tests.
- **SC-005**: QuickBooks invoices are created for 100% of paid orders; fewer than 1% of
  orders require manual QB intervention in the first 30 days.
- **SC-006**: Product listing and detail pages load in under 3 seconds on standard broadband
  (Lighthouse score ≥ 90 on Performance).
- **SC-007**: Platform handles 500 concurrent users without API response time exceeding 200ms
  at p95 (load test verified pre-launch).
- **SC-008**: The admin team can perform all product, order, customer, and pricing management
  tasks without developer assistance (verified by admin user acceptance testing).
- **SC-009**: Zero P1 bugs (data loss, incorrect pricing, payment failure, security breach)
  in the first 30 days post-launch.
- **SC-010**: Mobile Lighthouse Performance score ≥ 90 on product listing page from a
  375px viewport.

---

## Non-Functional Requirements

### Performance

- Page load: < 3 seconds on standard broadband.
- API response: < 200ms at p95 under normal load.
- Handles 500 concurrent users without degradation.
- Catalog supports 5,000+ products without performance degradation.
- Variant matrix renders 60+ variants within 300ms.

### Security

- HTTPS everywhere with SSL A+ rating.
- PCI compliance via Stripe Elements — card data never touches the platform's server.
- Role-based access control enforced server-side on all endpoints.
- Rate limiting: 100 requests/minute per IP on all public endpoints.
- Automated vulnerability scanning in CI pipeline.

### Reliability

- 99.9% uptime target.
- Automated daily database backups with 30-day retention.
- Monthly restore-test verification.
- Graceful degradation: QuickBooks sync failures and email send failures do not block
  order creation or fulfillment.

### Scalability

- Architecture supports horizontal scaling.
- Database designed for growth to 50,000+ products and 500,000+ orders.
- Caching layer reduces database load for read-heavy operations.

### Accessibility

- WCAG 2.1 AA compliance for core flows: semantic HTML, alt tags, keyboard navigation,
  sufficient color contrast, labeled form fields.
- Full accessibility audit deferred to post-launch.

### SEO

- Server-side rendered product and category pages.
- Unique meta titles and descriptions per product and category.
- Schema.org Product structured data on product detail pages.
- 301 redirects from all old Shopify product and category URLs.
- Sitemap generated and submitted to Google Search Console at launch.

---

## Out of Scope (Explicitly Excluded)

- Product visibility restrictions per tier or customer.
- Backorder / pre-order support.
- Sales representative assignment.
- Two-way QuickBooks sync (payment status from QB back to platform).
- Automated tax calculation via TaxJar or Avalara (MVP uses configurable flat tax rates).
- Customer-specific per-product price overrides (MVP uses tier-based % discount only).
- Credit terms / Net 30 payment.
- Facebook Pixel or ad tracking integration.
- Automated abandoned cart email sequences (MVP: admin can manually send).
- Scheduled automated price list delivery (MVP: on-demand only).
- Native mobile app.
- Multi-language support.

---

## Assumptions

- Stripe is the payment processor. Stripe Elements handles card capture; the platform
  stores Stripe customer/payment method IDs only — never raw card data.
- QuickBooks Online is the accounting system (not QuickBooks Desktop).
- SendGrid (or equivalent) is used for transactional email delivery.
- S3-compatible object storage is used for product images and generated files (PDFs, ZIPs).
- Tax rates are configured as flat percentages by admin (no automated tax service at MVP).
- "Retail price" is the base price per variant; tier pricing applies a discount % on top.
- PO numbers are stored as text strings with no validation logic at MVP.
- All monetary values are in USD only at MVP.
