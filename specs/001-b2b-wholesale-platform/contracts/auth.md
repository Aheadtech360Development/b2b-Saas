# API Contract: Authentication

**Base path**: `/api/v1/auth`
**Auth required**: As noted per endpoint

---

## POST /api/v1/auth/register-wholesale

Submit a wholesale application (no auth required).

**Request**:
```json
{
  "company_name": "string, required",
  "contact_name": "string, required",
  "email": "string, required, valid email",
  "phone": "string, required",
  "tax_id": "string, required",
  "business_type": "string, required",
  "expected_order_volume": "string, optional",
  "address": {
    "street": "string",
    "city": "string",
    "state": "string",
    "zip": "string"
  }
}
```

**Response 201**:
```json
{ "message": "Application submitted. You will be notified by email." }
```

**Errors**: `422 VALIDATION_ERROR` (missing required fields, invalid email)

---

## POST /api/v1/auth/login

Authenticate and receive tokens.

**Request**:
```json
{ "email": "string", "password": "string" }
```

**Response 200**:
```json
{
  "access_token": "string (JWT, 15-min TTL)",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "email": "string",
    "first_name": "string",
    "last_name": "string",
    "is_admin": "boolean",
    "company_id": "uuid | null",
    "role": "owner | buyer | viewer | finance | null",
    "pricing_tier_id": "uuid | null"
  }
}
```

Set-Cookie: `refresh_token=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth/refresh; Max-Age=604800`

**Errors**: `401 UNAUTHORIZED` (invalid credentials), `403 FORBIDDEN` (account inactive / company suspended)

---

## POST /api/v1/auth/refresh

Rotate refresh token and issue new access token. Reads refresh_token from httpOnly cookie.

**Response 200**: Same as login response (new access token + rotated cookie)

**Errors**: `401 UNAUTHORIZED` (invalid or expired refresh token)

---

## POST /api/v1/auth/logout

Blacklist refresh token. Requires: `Authorization: Bearer <token>`

**Response 200**: `{ "message": "Logged out successfully" }`

---

## POST /api/v1/auth/forgot-password

Initiate password reset.

**Request**: `{ "email": "string" }`

**Response 200**: `{ "message": "If an account exists, a reset email was sent." }` (always 200 to prevent email enumeration)

---

## POST /api/v1/auth/reset-password

Complete password reset.

**Request**: `{ "token": "string", "password": "string (min 8, mixed case, ≥1 digit)" }`

**Response 200**: `{ "message": "Password updated." }`

**Errors**: `400 INVALID_TOKEN` (expired or already used)

---

## GET /api/v1/auth/verify-email?token={token}

Verify email address.

**Response 200**: `{ "message": "Email verified." }`

**Errors**: `400 INVALID_TOKEN`

---

## GET /api/v1/auth/application-status

Check status of pending wholesale application (no auth — identified by email query param).

**Query**: `?email=buyer@example.com`

**Response 200**:
```json
{ "status": "pending | approved | rejected", "message": "string" }
```
