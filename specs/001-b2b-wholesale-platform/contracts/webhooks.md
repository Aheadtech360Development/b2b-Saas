# API Contract: Webhooks

**Base path**: `/api/v1/webhooks`
**Auth**: Verified via signature header (not JWT).

---

## POST /api/v1/webhooks/stripe

Receive Stripe webhook events.

**Headers**: `Stripe-Signature: t=...,v1=...`

**Processing**: Signature verified against `STRIPE_WEBHOOK_SECRET`.
Duplicate events identified by `event.id` → ignored with 200 OK.

### Handled Events

#### `payment_intent.succeeded`

**Triggers**:
1. Update `orders.payment_status = 'paid'`
2. Update `orders.status = 'processing'`
3. Queue `sync_order_invoice_to_qb.delay(order_id)`
4. Queue `send_order_confirmation_email.delay(order_id)`
5. Clear cart items for the company/user
6. Update `webhook_log.status = 'processed'`

#### `payment_intent.payment_failed`

**Triggers**:
1. Update `orders.payment_status = 'failed'`
2. Queue `send_payment_failed_email.delay(order_id)`

#### `charge.refunded`

**Triggers**:
1. Update `orders.payment_status = 'refunded'`
2. Update `orders.status = 'cancelled'`

**Response**: Always `200 OK` after signature validation (even for unhandled events).
Processing is async — response does not wait for task completion.

---

## Error Responses (all webhook endpoints)

| Status | Scenario |
|---|---|
| `400` | Invalid signature |
| `200` | Valid signature, event already processed (duplicate) |
| `200` | Valid signature, event queued for processing |
