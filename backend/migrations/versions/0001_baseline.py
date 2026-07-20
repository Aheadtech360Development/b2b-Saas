"""Baseline — full multi-tenant schema.

Consolidates the entire current schema so a FRESH database can be built with a
single `alembic upgrade head`. The existing (already-built) database is marked
with `alembic stamp head` instead of running this.

Content tables (style_sheets, blog_posts, PO trigger, defensive ALTERs) are
created idempotently by the app's startup `_ensure_content_tables`, so they are
intentionally not duplicated here.

Revision ID: 0001_baseline
Revises:
Create Date: 2026-07-07
"""
from alembic import op
import sqlalchemy as sa

from app.models.base import Base, TenantMixin

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


# ── Platform tables (no ORM models — raw SQL) ─────────────────────────────────
_TENANT_TABLES = """
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(63) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    plan VARCHAR(20) NOT NULL DEFAULT 'starter',
    custom_domain VARCHAR(255),
    timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    cancelled_at TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tenant_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    logo_url TEXT, favicon_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#1C3557',
    secondary_color VARCHAR(7) DEFAULT '#F8F8F6',
    accent_color VARCHAR(7) DEFAULT '#E8B84B',
    company_name VARCHAR(255), email_sender_name VARCHAR(100),
    support_email VARCHAR(255), support_phone VARCHAR(50),
    store_name VARCHAR(255), tagline VARCHAR(255),
    announcement_text TEXT, show_announcement BOOLEAN DEFAULT true,
    announcement_bg_color VARCHAR(7), announcement_text_color VARCHAR(7) DEFAULT '#FFFFFF',
    menu_items JSONB DEFAULT '[]'::jsonb,
    show_hero BOOLEAN DEFAULT true,
    hero_heading VARCHAR(255), hero_subheading TEXT, hero_image_url TEXT,
    hero_cta_text VARCHAR(100) DEFAULT 'Shop Now', hero_cta_link VARCHAR(255) DEFAULT '/products',
    hero_bg_color VARCHAR(7) DEFAULT '#F8F8F6', hero_text_color VARCHAR(7) DEFAULT '#1A1A1A',
    show_featured_categories BOOLEAN DEFAULT true,
    featured_categories_heading VARCHAR(255) DEFAULT 'Shop by Category',
    featured_category_ids JSONB DEFAULT '[]'::jsonb,
    featured_categories_view_all_text VARCHAR(60) DEFAULT 'View all',
    featured_categories_view_all_link VARCHAR(255) DEFAULT '/products',
    featured_categories_limit INTEGER DEFAULT 4,
    show_featured_products BOOLEAN DEFAULT true,
    featured_products_heading VARCHAR(255) DEFAULT 'Featured Products',
    featured_product_ids JSONB DEFAULT '[]'::jsonb,
    featured_products_view_all_text VARCHAR(60) DEFAULT 'View all',
    featured_products_view_all_link VARCHAR(255) DEFAULT '/products',
    featured_products_limit INTEGER DEFAULT 4,
    section_order JSONB DEFAULT '["hero","featured_categories","featured_products"]'::jsonb,
    footer_text TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_feature_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    feature VARCHAR(100) NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, feature)
);

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
    plan VARCHAR(20) NOT NULL DEFAULT 'starter',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    stripe_customer_id VARCHAR(100), stripe_subscription_id VARCHAR(100),
    current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_staff_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(100), key_hash VARCHAR(255) NOT NULL,
    last_used_at TIMESTAMPTZ, revoked BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Platform (tenant) tables — no ORM models.
    bind.execute(sa.text(_TENANT_TABLES))

    # 2. All ORM-modelled tables (products, orders, users, ss_*, …) — these
    #    already carry tenant_id via TenantMixin. Base.metadata is fully
    #    populated by migrations/env.py imports.
    Base.metadata.create_all(bind)

    # 3. users.is_admin (denormalized flag used by the auth middleware).
    bind.execute(sa.text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false"))

    # 4. tenant_id → tenants(id) FK (ON DELETE CASCADE) on every scoped table,
    #    so purging a brand removes all its rows.
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if issubclass(cls, TenantMixin):
            t = cls.__tablename__
            bind.execute(sa.text(f"""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints
                        WHERE constraint_name = 'fk_{t}_tenant' AND table_name = '{t}'
                    ) THEN
                        ALTER TABLE {t} ADD CONSTRAINT fk_{t}_tenant
                            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;
                    END IF;
                END $$;
            """))


def downgrade() -> None:
    # Baseline — dropping is intentionally destructive and rarely used.
    bind = op.get_bind()
    Base.metadata.drop_all(bind)
    bind.execute(sa.text("""
        DROP TABLE IF EXISTS tenant_api_keys, tenant_staff_roles, tenant_subscriptions,
            tenant_feature_flags, tenant_branding, tenants CASCADE;
    """))
