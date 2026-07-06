# API Contract: Orders & Customer Account

**Base path**: `/api/v1/orders`, `/api/v1/account`
**Auth required**: Authenticated customer for all endpoints.

---

## Orders

### GET /api/v1/orders

List customer's orders.

**Query**: `?status=&date_from=&date_to=&po_number=&page=&page_size=`

**Response 200**:
```json
{
  "items": [
    {
      "id": "uuid",
      "order_number": "string",
      "po_number": "string | null",
      "status": "string",
      "payment_status": "string",
      "total": "decimal",
      "item_count": "integer",
      "created_at": "ISO8601"
    }
  ],
  "total": "integer",
  "page": "integer"
}
```

---

### GET /api/v1/orders/{id}

Get full order detail.

**Response 200**: Full order object + line items with snapshot fields + shipping info + tracking.

---

### POST /api/v1/orders/{id}/reorder

Load a past order into a new cart. Validates current stock and applies current tier pricing.

**Response 200**: Full cart response (same as GET /api/v1/cart) with flagged unavailable items.

---

## Account

### GET /api/v1/account/profile

Get company and user profile.

**Response 200**:
```json
{
  "user": { "id", "email", "first_name", "last_name" },
  "company": { "id", "name", "tax_id", "business_type", "status" },
  "pricing_tier": { "id", "name", "discount_percentage" },
  "shipping_tier": { "name" }
}
```

---

### PATCH /api/v1/account/profile

Update personal or company info.

**Request**: `{ first_name?, last_name?, company_name?, business_type? }`

**Response 200**: Updated profile.

---

### GET /api/v1/account/addresses

List company addresses.

---

### POST /api/v1/account/addresses

Add a new address.

**Request**: `{ label, address_line_1, address_line_2?, city, state, zip, country, is_default_shipping, is_default_billing }`

**Response 201**: Address object.

---

### PATCH /api/v1/account/addresses/{id}

Update an address.

---

### DELETE /api/v1/account/addresses/{id}

Delete an address (not if set as default for an active cart).

---

### GET /api/v1/account/contacts

List company contacts.

---

### POST /api/v1/account/contacts

Add a contact.

---

### PATCH /api/v1/account/contacts/{id}

Update contact notification preferences.

---

### DELETE /api/v1/account/contacts/{id}

Remove a contact.

---

### GET /api/v1/account/users

List company users (Owner only).

---

### POST /api/v1/account/users/invite

Invite a new user to the company (Owner only).

**Request**: `{ email, role: "buyer | viewer | finance" }`

**Response 201**: `{ message: "Invitation sent." }`

**Side effect**: Sends invitation email with setup link.

---

### PATCH /api/v1/account/users/{user_id}

Update user role (Owner only).

---

### DELETE /api/v1/account/users/{user_id}

Deactivate a company user (Owner only). Cannot deactivate self.

---

### GET /api/v1/account/payment-methods

List saved Stripe payment methods.

**Response 200**: `[{ id, brand, last4, exp_month, exp_year, is_default }]`

---

### DELETE /api/v1/account/payment-methods/{id}

Remove a saved payment method.

---

### POST /api/v1/account/payment-methods/{id}/set-default

Set a payment method as default.

---

### GET /api/v1/account/statements

List financial statements (invoices, payments).

**Query**: `?date_from=&date_to=&page=&page_size=`

---

### GET /api/v1/account/statements/{id}/pdf

Download statement as PDF.

**Response 200**: `application/pdf`

---

### GET /api/v1/account/templates

List order templates.

---

### DELETE /api/v1/account/templates/{id}

Delete a template.

---

### POST /api/v1/account/templates/{id}/load

Load a template into cart (validates stock, applies current prices).

**Response 200**: Full cart response.

---

### GET /api/v1/account/price-list

Request price list generation.

**Query**: `?format=pdf|excel`

**Response 202**: `{ request_id: "uuid", status: "pending" }`

---

### GET /api/v1/account/price-list/{request_id}

Check price list generation status.

**Response 200**: `{ status: "pending | generating | complete | failed", file_url?: "string" }`

---

### GET /api/v1/account/inventory-report

Get catalog stock report (customer view — sums across warehouses).

**Query**: `?q=&category=&stock_level=in|low|out&page=`

**Response 200**: Paginated list of variants with total_stock.

---

### GET /api/v1/account/messages

List support messages for the company.

---

### POST /api/v1/account/messages

Send a new message to AF Apparels admin.

**Request**: `{ subject, body }`

---

### PATCH /api/v1/account/change-password

Change password.

**Request**: `{ current_password, new_password }`

---

## RMA (Returns)

### GET /api/v1/account/rma

List RMA requests for the company.

---

### POST /api/v1/account/rma

Submit a new return request.

**Request**: `{ order_id, reason, items: [{ order_item_id, quantity, reason }], photo_urls?: ["string"] }`

**Response 201**: RMA object with `rma_number`.

---

### GET /api/v1/account/rma/{id}

Get RMA detail including admin notes and status history.
