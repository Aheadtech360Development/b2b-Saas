"""
Multi-Tenant SaaS — Fresh Database Setup
Creates all tables from scratch + platform super admin + first tenant
"""
import asyncio, ssl, asyncpg, uuid
from datetime import datetime, timezone
from passlib.context import CryptContext

NEON_DSN = "postgresql://neondb_owner:npg_oSlUHEn9hcx6@ep-patient-sun-ahs9nsep.c-3.us-east-1.aws.neon.tech/neondb"
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ── Platform super admin (owns the SaaS platform itself)
PLATFORM_ADMIN_EMAIL    = "admin@b2bsaas.com"
PLATFORM_ADMIN_PASSWORD = "Platform@123456"
PLATFORM_ADMIN_NAME     = "Platform Admin"

# ── First demo tenant
FIRST_TENANT_SLUG       = "demo"
FIRST_TENANT_NAME       = "Demo Company"
FIRST_TENANT_EMAIL      = "owner@demo.com"
FIRST_TENANT_PASSWORD   = "Demo@123456"


SCHEMA_SQL = """
-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSION
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANTS  (each row = one business on the platform)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                VARCHAR(63)  NOT NULL UNIQUE,   -- subdomain: slug.platform.com
    name                VARCHAR(255) NOT NULL,
    email               VARCHAR(255) NOT NULL,          -- billing / contact email
    phone               VARCHAR(50),
    status              VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active | suspended | cancelled
    plan                VARCHAR(20)  NOT NULL DEFAULT 'starter', -- starter | growth | pro
    custom_domain       VARCHAR(255),                   -- CNAME support
    timezone            VARCHAR(50)  NOT NULL DEFAULT 'UTC',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    cancelled_at        TIMESTAMPTZ,
    trial_ends_at       TIMESTAMPTZ
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT BRANDING  (white-label: logo, colors, favicon per tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_branding (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    logo_url            TEXT,
    favicon_url         TEXT,
    primary_color       VARCHAR(7)   DEFAULT '#1C3557',
    secondary_color     VARCHAR(7)   DEFAULT '#F8F8F6',
    accent_color        VARCHAR(7)   DEFAULT '#E8B84B',
    company_name        VARCHAR(255),
    email_sender_name   VARCHAR(100),
    support_email       VARCHAR(255),
    support_phone       VARCHAR(50),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT FEATURE FLAGS  (enable/disable features per tenant per plan)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature             VARCHAR(100) NOT NULL,   -- e.g. 'supplier_catalog', '2fa', 'api_keys'
    is_enabled          BOOLEAN NOT NULL DEFAULT true,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, feature)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    plan                    VARCHAR(20)  NOT NULL DEFAULT 'starter',
    status                  VARCHAR(20)  NOT NULL DEFAULT 'active',  -- active | past_due | cancelled
    stripe_customer_id      VARCHAR(100),
    stripe_subscription_id  VARCHAR(100),
    current_period_start    TIMESTAMPTZ,
    current_period_end      TIMESTAMPTZ,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- USERS  (all users: platform admins + tenant admins + tenant staff + buyers)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform admin
    email                       VARCHAR(255) NOT NULL,
    hashed_password             VARCHAR(255),
    first_name                  VARCHAR(100) NOT NULL,
    last_name                   VARCHAR(100) NOT NULL,
    phone                       VARCHAR(50),
    role                        VARCHAR(30)  NOT NULL DEFAULT 'buyer',
    -- roles: platform_admin | tenant_admin | tenant_staff | buyer
    account_type                VARCHAR(20)  NOT NULL DEFAULT 'wholesale',
    is_active                   BOOLEAN NOT NULL DEFAULT true,
    is_platform_admin           BOOLEAN NOT NULL DEFAULT false,
    email_verified              BOOLEAN NOT NULL DEFAULT false,
    email_verification_token    VARCHAR(255),
    activation_token            VARCHAR(255),
    activation_token_expires    TIMESTAMPTZ,
    password_reset_token        VARCHAR(255),
    password_reset_expires      TIMESTAMPTZ,
    two_factor_enabled          BOOLEAN NOT NULL DEFAULT false,
    two_factor_secret           VARCHAR(100),
    last_login                  TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, email),
    UNIQUE(email) -- platform admins (tenant_id IS NULL) must also be unique
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT STAFF ROLES  (fine-grained permissions per staff member)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_staff_roles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    can_manage_products     BOOLEAN NOT NULL DEFAULT false,
    can_manage_orders       BOOLEAN NOT NULL DEFAULT false,
    can_manage_customers    BOOLEAN NOT NULL DEFAULT false,
    can_manage_discounts    BOOLEAN NOT NULL DEFAULT false,
    can_view_reports        BOOLEAN NOT NULL DEFAULT false,
    can_manage_staff        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, user_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TENANT API KEYS  (per-tenant API access)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    key_prefix      VARCHAR(10)  NOT NULL,   -- first 8 chars shown to user
    key_hash        VARCHAR(255) NOT NULL,   -- bcrypt hash of full key
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_by      UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- AUDIT LOGS  (every important action: who, what, when, which tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    action          VARCHAR(100) NOT NULL,   -- e.g. 'user.login', 'product.import'
    entity_type     VARCHAR(50),             -- e.g. 'user', 'product', 'order'
    entity_id       VARCHAR(100),
    details         JSONB,                   -- extra context
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- S&S ACTIVEWEAR TABLES  (supplier catalog — per tenant)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ss_categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    ss_id           VARCHAR(50)  NOT NULL,
    name            VARCHAR(255) NOT NULL,
    gender          VARCHAR(50),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    last_synced_at  TIMESTAMPTZ,
    UNIQUE(tenant_id, ss_id)
);

CREATE TABLE IF NOT EXISTS ss_products (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    style_id            VARCHAR(50)  NOT NULL,
    style_name          VARCHAR(500) NOT NULL,
    brand_name          VARCHAR(255),
    category_id         UUID REFERENCES ss_categories(id),
    category_name       VARCHAR(255),
    gender_name         VARCHAR(50),
    description         TEXT,
    keywords            TEXT,
    piece_price         NUMERIC(10,2),
    case_price          NUMERIC(10,2),
    case_size           INTEGER,
    front_image         TEXT,
    is_imported         BOOLEAN NOT NULL DEFAULT false,
    imported_product_id UUID,
    last_synced_at      TIMESTAMPTZ,
    UNIQUE(tenant_id, style_id)
);

CREATE TABLE IF NOT EXISTS ss_variants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES ss_products(id) ON DELETE CASCADE,
    sku                 VARCHAR(100) NOT NULL,
    color_name          VARCHAR(100),
    color_code          VARCHAR(20),
    size_name           VARCHAR(50),
    piece_price         NUMERIC(10,2),
    front_image         TEXT,
    back_image          TEXT,
    side_image          TEXT,
    color_swatch        TEXT,
    qty_on_hand         INTEGER NOT NULL DEFAULT 0,
    last_inventory_sync TIMESTAMPTZ,
    UNIQUE(tenant_id, sku)
);

CREATE TABLE IF NOT EXISTS ss_sync_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sync_type       VARCHAR(50)  NOT NULL,  -- categories | products | inventory
    status          VARCHAR(20)  NOT NULL DEFAULT 'running',
    records_synced  INTEGER NOT NULL DEFAULT 0,
    error_message   TEXT,
    started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at    TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ss_markup_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    rule_type       VARCHAR(20)  NOT NULL DEFAULT 'global',
    target_value    VARCHAR(255),
    markup_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
    markup_fixed    NUMERIC(10,2) NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- INDEXES  (for fast lookups)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_tenant_id       ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email           ON users(email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id  ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ss_products_tenant_id ON ss_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ss_variants_product   ON ss_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_ss_sync_logs_tenant   ON ss_sync_logs(tenant_id, started_at DESC);
"""


async def main():
    ssl_ctx = ssl.create_default_context()
    ssl_ctx.check_hostname = False
    ssl_ctx.verify_mode = ssl.CERT_NONE

    conn = await asyncpg.connect(NEON_DSN, ssl=ssl_ctx)
    print("Connected to Neon DB\n")

    # ── 1. Create all tables
    print("Creating tables...")
    await conn.execute(SCHEMA_SQL)
    tables = await conn.fetch(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
    )
    print(f"  {len(tables)} tables created:")
    for t in tables:
        print(f"    ✓ {t['tablename']}")

    # ── 2. Platform super admin (no tenant)
    print("\nCreating platform super admin...")
    existing = await conn.fetchval(
        "SELECT id FROM users WHERE email=$1 AND tenant_id IS NULL", PLATFORM_ADMIN_EMAIL
    )
    if existing:
        print(f"  Already exists: {PLATFORM_ADMIN_EMAIL}")
    else:
        hashed = pwd_ctx.hash(PLATFORM_ADMIN_PASSWORD)
        await conn.execute("""
            INSERT INTO users (email, hashed_password, first_name, last_name,
                               role, is_platform_admin, is_active, email_verified, tenant_id)
            VALUES ($1, $2, $3, $4, 'platform_admin', true, true, true, NULL)
        """, PLATFORM_ADMIN_EMAIL, hashed, "Platform", "Admin")
        print(f"  Created: {PLATFORM_ADMIN_EMAIL} / {PLATFORM_ADMIN_PASSWORD}")

    # ── 3. First demo tenant
    print("\nCreating first demo tenant...")
    tenant_id = await conn.fetchval(
        "SELECT id FROM tenants WHERE slug=$1", FIRST_TENANT_SLUG
    )
    if tenant_id:
        print(f"  Tenant already exists: {FIRST_TENANT_SLUG}")
    else:
        tenant_id = await conn.fetchval("""
            INSERT INTO tenants (slug, name, email, status, plan)
            VALUES ($1, $2, $3, 'active', 'starter')
            RETURNING id
        """, FIRST_TENANT_SLUG, FIRST_TENANT_NAME, FIRST_TENANT_EMAIL)

        # Default branding
        await conn.execute("""
            INSERT INTO tenant_branding (tenant_id, company_name)
            VALUES ($1, $2)
        """, tenant_id, FIRST_TENANT_NAME)

        # Default subscription record
        await conn.execute("""
            INSERT INTO tenant_subscriptions (tenant_id, plan, status)
            VALUES ($1, 'starter', 'active')
        """, tenant_id)

        # Default feature flags
        features = ['supplier_catalog', 'markup_rules', 'staff_accounts', 'audit_logs']
        for feature in features:
            await conn.execute("""
                INSERT INTO tenant_feature_flags (tenant_id, feature, is_enabled)
                VALUES ($1, $2, true)
            """, tenant_id, feature)

        print(f"  Created tenant: {FIRST_TENANT_NAME} (slug: {FIRST_TENANT_SLUG})")
        print(f"  Tenant ID: {tenant_id}")

    # ── 4. Tenant admin user
    print("\nCreating demo tenant admin...")
    existing_user = await conn.fetchval(
        "SELECT id FROM users WHERE email=$1 AND tenant_id=$2",
        FIRST_TENANT_EMAIL, tenant_id
    )
    if existing_user:
        print(f"  Already exists: {FIRST_TENANT_EMAIL}")
    else:
        hashed = pwd_ctx.hash(FIRST_TENANT_PASSWORD)
        await conn.execute("""
            INSERT INTO users (tenant_id, email, hashed_password, first_name, last_name,
                               role, is_active, email_verified)
            VALUES ($1, $2, $3, 'Demo', 'Owner', 'tenant_admin', true, true)
        """, tenant_id, FIRST_TENANT_EMAIL, hashed)
        print(f"  Created: {FIRST_TENANT_EMAIL} / {FIRST_TENANT_PASSWORD}")

    await conn.close()

    print("\n" + "="*55)
    print("  MULTI-TENANT SETUP COMPLETE")
    print("="*55)
    print(f"\n  Platform Admin:")
    print(f"    Email    : {PLATFORM_ADMIN_EMAIL}")
    print(f"    Password : {PLATFORM_ADMIN_PASSWORD}")
    print(f"\n  Demo Tenant Admin:")
    print(f"    Email    : {FIRST_TENANT_EMAIL}")
    print(f"    Password : {FIRST_TENANT_PASSWORD}")
    print(f"    URL      : http://demo.localhost:3000")
    print("\n  Tables Created:")
    print("    tenants, tenant_branding, tenant_feature_flags,")
    print("    tenant_subscriptions, tenant_api_keys, users,")
    print("    tenant_staff_roles, audit_logs,")
    print("    ss_categories, ss_products, ss_variants,")
    print("    ss_sync_logs, ss_markup_rules")
    print("="*55)

asyncio.run(main())
