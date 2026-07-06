# Quickstart: AF Apparels B2B Wholesale Platform

**Branch**: `001-b2b-wholesale-platform` | **Date**: 2026-03-06

This guide covers local development setup and the key validation flows for each phase.

---

## Prerequisites

- Docker Desktop (for PostgreSQL + Redis)
- Node.js 20+ and npm
- Python 3.11+
- Git

---

## 1. Clone & Configure Environment

```bash
git clone <repository-url>
cd af-apparels

# Copy environment templates
cp .env.example .env
cp frontend/.env.example frontend/.env.local
```

### Required `.env` variables (backend)

```env
# Database
DATABASE_URL=postgresql+asyncpg://afuser:afpass@localhost:5432/afapparels
TEST_DATABASE_URL=postgresql+asyncpg://afuser:afpass@localhost:5432/afapparels_test

# Redis
REDIS_URL=redis://localhost:6379/0

# JWT
JWT_SECRET_KEY=<generate: openssl rand -hex 32>
JWT_ALGORITHM=HS256

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# QuickBooks (sandbox)
QB_CLIENT_ID=...
QB_CLIENT_SECRET=...
QB_REDIRECT_URI=http://localhost:8000/api/v1/auth/quickbooks/callback
QB_REALM_ID=...

# SendGrid
SENDGRID_API_KEY=SG....
FROM_EMAIL=noreply@afapparels.com
ADMIN_EMAIL=admin@afapparels.com

# AWS S3
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=afapparels-dev
AWS_S3_REGION=us-east-1

# Sentry
SENTRY_DSN=https://...

# App
FRONTEND_URL=http://localhost:3000
BACKEND_URL=http://localhost:8000
ENVIRONMENT=development
```

### Required `frontend/.env.local` variables

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
NEXT_PUBLIC_SENTRY_DSN=https://...
```

---

## 2. Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker compose up -d

# Verify containers are running
docker compose ps
```

Expected output: `postgres` (port 5432) and `redis` (port 6379) both `Up`.

---

## 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Seed initial data (pricing tiers, shipping tiers, settings, email templates)
python -m scripts.seed_data

# Start Celery worker (separate terminal)
celery -A app.core.celery worker --loglevel=info

# Start FastAPI server
uvicorn app.main:app --reload --port 8000
```

**Verify**: Open `http://localhost:8000/docs` — OpenAPI UI should load with all endpoints.

---

## 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

**Verify**: Open `http://localhost:3000` — homepage should load.

---

## 5. Run Tests

### Backend

```bash
cd backend

# Create test database
createdb afapparels_test  # or via psql

# Run all tests
pytest

# Run with coverage
pytest --cov=app --cov-report=term-missing

# Run specific module
pytest tests/integration/test_auth.py -v
```

**Gate**: Overall ≥ 70%, critical paths (auth, checkout, pricing) ≥ 90%.

### Frontend

```bash
cd frontend

# Run unit/component tests
npm run test

# Run with coverage
npm run test:coverage

# Run E2E tests (requires backend running)
npm run test:e2e
```

---

## 6. Phase Validation Flows

### Phase 1 — Foundation Gate

```bash
# ✅ Docker containers running
docker compose ps

# ✅ Migrations applied
alembic current  # Should show "head"

# ✅ Backend starts
curl http://localhost:8000/health
# Expected: { "status": "ok", "db": "ok", "redis": "ok" }

# ✅ Frontend starts
curl http://localhost:3000
# Expected: HTML response

# ✅ Tests run
cd backend && pytest --tb=short
```

---

### Phase 2 — Backend API Gate

```bash
# Full registration + ordering flow via API

# 1. Submit wholesale application
curl -X POST http://localhost:8000/api/v1/auth/register-wholesale \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Test Co","contact_name":"John","email":"test@example.com","phone":"555-1234","tax_id":"12-3456789","business_type":"Distributor"}'

# 2. Admin login
TOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@afapparels.com","password":"AdminPass1"}' | jq -r '.access_token')

# 3. Approve application
curl -X POST http://localhost:8000/api/v1/admin/wholesale-applications/1/approve \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pricing_tier_id":"<tier_id>","shipping_tier_id":"<tier_id>"}'

# 4. Customer login
CTOKEN=$(curl -s -X POST http://localhost:8000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"InitialPass1"}' | jq -r '.access_token')

# 5. Browse products (should show tier pricing)
curl http://localhost:8000/api/v1/products \
  -H "Authorization: Bearer $CTOKEN"

# ✅ Verify: effective_price reflects tier discount on all products
```

---

### Phase 3 — Frontend Gate (Lighthouse)

```bash
# Run Lighthouse on product listing page
npx lighthouse http://localhost:3000/products --output=json --quiet | jq '.categories.performance.score'
# Expected: ≥ 0.90

# Run Lighthouse on product detail
npx lighthouse http://localhost:3000/products/test-product --output=json --quiet | jq '.categories.performance.score'
# Expected: ≥ 0.90

# Mobile viewport test
npx lighthouse http://localhost:3000/products --emulated-form-factor=mobile --output=json --quiet | jq '.categories.performance.score'
```

---

### Phase 5 — Migration Gate

```bash
# Run product migration (staging first)
cd scripts
python migrate_products.py --shopify-token=<token> --dry-run  # Verify counts
python migrate_products.py --shopify-token=<token>            # Execute

# Validate
python -c "
from scripts.validate_migration import run_validation
results = run_validation()
print(f'Products: {results.products_ok}')
print(f'Variants: {results.variants_ok}')
print(f'Images: {results.images_ok}')
assert results.all_ok, 'Migration validation FAILED'
print('✅ Migration validation PASSED')
"

# Test 301 redirects
curl -I http://localhost:3000/products/old-shopify-handle
# Expected: HTTP/1.1 301, Location: http://localhost:3000/products/new-slug
```

---

### Phase 6 — Load Test Gate

```bash
# Install k6 (load testing tool)
# https://k6.io/docs/get-started/installation/

# Run product listing load test (500 concurrent)
k6 run scripts/load-tests/product-listing.js --vus=500 --duration=60s

# ✅ Gate: p95 < 200ms, error rate < 1%
```

---

## 7. Stripe Test Mode

Use Stripe test card numbers for checkout testing:

| Card | Number | Behavior |
|---|---|---|
| Success | `4242 4242 4242 4242` | Payment succeeds |
| Declined | `4000 0000 0000 0002` | Card declined |
| Auth required | `4000 0025 0000 3155` | Requires 3D Secure |

Expiry: any future date. CVC: any 3 digits.

---

## 8. Troubleshooting

| Issue | Solution |
|---|---|
| `CONNECTION_REFUSED` on PostgreSQL | Run `docker compose up -d postgres` |
| `alembic: no revisions` | Run `alembic upgrade head` |
| Celery tasks not processing | Check `celery -A app.core.celery worker` is running |
| Stripe webhook not received locally | Use `stripe listen --forward-to localhost:8000/api/v1/webhooks/stripe` |
| QB auth expired | Re-run OAuth flow at `/api/v1/auth/quickbooks` |
| Frontend: 401 on all requests | Check `NEXT_PUBLIC_API_URL` in `.env.local` |
