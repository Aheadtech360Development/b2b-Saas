"""Visual website builder: a site per brand, its published versions, its fonts.

Additive only. Nothing here reads, changes or depends on brand_themes, which is
how every imported-HTML storefront renders today — those keep rendering exactly
as they do. A brand only renders through the builder once two things are true:
its builder_sites row says render_mode = 'visual_builder', and that row points
at a published version. Neither is ever set by this migration.

  builder_sites     one per brand. The working draft lives here and is never
                    read by the storefront. render_mode is 'legacy' until the
                    brand explicitly switches.
  builder_versions  immutable snapshots, one per publish. The site points at
                    one of them; publishing adds a row and moves the pointer,
                    rollback moves the pointer back.
  builder_fonts     font files a brand uploaded, scoped to that brand.

Revision ID: 0056_visual_builder
Revises: 0055_trial
"""
from alembic import op

revision = "0056_visual_builder"
down_revision = "0055_trial"
branch_labels = None
depends_on = None

_PRED = (
    "(current_setting('app.bypass_rls', true) = 'on'"
    " OR current_setting('app.current_tenant', true) IS NULL"
    " OR CAST(tenant_id AS text) = current_setting('app.current_tenant', true)"
    " OR tenant_id IS NULL)"
)

_TABLES = ("builder_sites", "builder_versions", "builder_fonts")


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS builder_sites (
            id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            -- 'legacy' renders through brand_themes / the built-in storefront,
            -- exactly as before this table existed. Only an explicit switch by
            -- the brand moves it to 'visual_builder', and it can switch back.
            render_mode          VARCHAR(20) NOT NULL DEFAULT 'legacy',
            -- The working copy. The storefront never reads this column.
            draft                JSONB NOT NULL DEFAULT '{}'::jsonb,
            -- Bumped on every save, so two tabs autosaving the same draft
            -- cannot silently overwrite each other.
            draft_revision       INTEGER NOT NULL DEFAULT 0,
            published_version_id UUID,
            created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_builder_sites_tenant UNIQUE (tenant_id),
            CONSTRAINT ck_builder_sites_mode CHECK (render_mode IN ('legacy', 'visual_builder'))
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS builder_versions (
            id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            site_id      UUID NOT NULL REFERENCES builder_sites(id) ON DELETE CASCADE,
            number       INTEGER NOT NULL,
            -- The whole site as it was published: settings, fonts, header and
            -- footer, templates, pages. Never updated after it is written, so a
            -- rollback restores exactly what shoppers saw.
            document     JSONB NOT NULL,
            note         VARCHAR(200),
            published_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_builder_versions_number UNIQUE (site_id, number)
        )
    """)

    # Added after both tables exist. SET NULL rather than cascade: losing a
    # version must never take the site row, and its draft, with it.
    op.execute("""
        DO $$ BEGIN
            ALTER TABLE builder_sites
                ADD CONSTRAINT fk_builder_sites_published
                FOREIGN KEY (published_version_id) REFERENCES builder_versions(id) ON DELETE SET NULL;
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS builder_fonts (
            id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            family      VARCHAR(80) NOT NULL,
            weight      SMALLINT NOT NULL DEFAULT 400,
            style       VARCHAR(10) NOT NULL DEFAULT 'normal',
            format      VARCHAR(10) NOT NULL,
            url         TEXT NOT NULL,
            size_bytes  INTEGER,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_builder_fonts_face UNIQUE (tenant_id, family, weight, style),
            CONSTRAINT ck_builder_fonts_style CHECK (style IN ('normal', 'italic')),
            CONSTRAINT ck_builder_fonts_weight CHECK (weight BETWEEN 100 AND 900)
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_builder_versions_tenant ON builder_versions(tenant_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_builder_versions_site ON builder_versions(site_id, number DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_builder_fonts_tenant ON builder_fonts(tenant_id)")

    for table in _TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation ON {table}")
        op.execute(f"CREATE POLICY tenant_isolation ON {table} USING {_PRED} WITH CHECK {_PRED}")


def downgrade() -> None:
    # Builder data only. brand_themes, and every storefront that renders from
    # it, are untouched either way.
    op.execute("ALTER TABLE IF EXISTS builder_sites DROP CONSTRAINT IF EXISTS fk_builder_sites_published")
    op.execute("DROP TABLE IF EXISTS builder_fonts")
    op.execute("DROP TABLE IF EXISTS builder_versions")
    op.execute("DROP TABLE IF EXISTS builder_sites")
