"""Content tables — style_sheets, product_specs, blog_posts, page_seo.

These models are declared inside their router modules, which `migrations/env.py`
never imports, so `Base.metadata.create_all` never created them — every Content
endpoint (public + admin) returned 500 on a fresh database.

Created here explicitly and, unlike the original single-tenant schema, scoped per
brand: `tenant_id` + per-tenant unique slugs (a global unique slug would let one
brand's post block another brand from using the same slug).

Revision ID: 0010_content_tables
Revises: 0009_theme_style
"""
from alembic import op
import sqlalchemy as sa

revision = "0010_content_tables"
down_revision = "0009_theme_style"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        CREATE TABLE IF NOT EXISTS style_sheets (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            style_number VARCHAR(50) NOT NULL,
            image_url VARCHAR(500),
            pdf_url VARCHAR(500),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_style_sheets_tenant ON style_sheets(tenant_id);

        CREATE TABLE IF NOT EXISTS product_specs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            pdf_url VARCHAR(500),
            sort_order INTEGER NOT NULL DEFAULT 0,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS ix_product_specs_tenant ON product_specs(tenant_id);

        CREATE TABLE IF NOT EXISTS blog_posts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            title VARCHAR(255) NOT NULL,
            slug VARCHAR(255) NOT NULL,
            cover_image_url TEXT,
            published_date DATE,
            read_time VARCHAR(50),
            excerpt TEXT,
            article_body JSONB,
            faq JSONB,
            tags TEXT[],
            status VARCHAR(20) NOT NULL DEFAULT 'draft',
            meta_title VARCHAR(60),
            meta_description VARCHAR(160),
            keywords TEXT,
            og_image_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_blog_posts_tenant_slug UNIQUE (tenant_id, slug)
        );
        CREATE INDEX IF NOT EXISTS ix_blog_posts_tenant ON blog_posts(tenant_id);

        CREATE TABLE IF NOT EXISTS page_seo (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
            page_slug VARCHAR(100) NOT NULL,
            meta_title VARCHAR(60),
            meta_description VARCHAR(160),
            keywords TEXT,
            og_image_url TEXT,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_page_seo_tenant_slug UNIQUE (tenant_id, page_slug)
        );
        CREATE INDEX IF NOT EXISTS ix_page_seo_tenant ON page_seo(tenant_id);
    """))


def downgrade() -> None:
    op.get_bind().execute(sa.text("""
        DROP TABLE IF EXISTS page_seo CASCADE;
        DROP TABLE IF EXISTS blog_posts CASCADE;
        DROP TABLE IF EXISTS product_specs CASCADE;
        DROP TABLE IF EXISTS style_sheets CASCADE;
    """))
