"""Reviews imported from a brand's Google Business Profile.

They go into the same `product_reviews` table the storefront and the admin
already read, rather than a table of their own, so a Google review is moderated,
listed and shown exactly like one written on the site. The differences are only
what a Google review genuinely has and a site review does not:

* It is about the business, not one product, so `product_id` becomes nullable.
  A review with no product is a store review.
* It has an identity at Google (`external_id`), which is what makes a re-sync
  update the same row instead of adding a second copy — unique per brand and
  source, so two brands can never collide on one.
* It has its own date (`reviewed_at`), the author's photo and profile link, and
  sometimes the owner's public reply — all of which Google requires to be shown
  with the review.

Nothing already stored changes: existing rows are site reviews with a product,
exactly as before.

Revision ID: 0045_google_reviews
Revises: 0044_collections
"""
from alembic import op

revision = "0045_google_reviews"
down_revision = "0044_collections"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE product_reviews ALTER COLUMN product_id DROP NOT NULL")

    # 'site' for a review written on the storefront, 'google' for an import.
    op.execute(
        "ALTER TABLE product_reviews "
        "ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'site'"
    )
    op.execute("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS external_id VARCHAR(255)")
    op.execute("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS reviewer_photo_url VARCHAR(1000)")
    op.execute("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS source_url VARCHAR(1000)")
    op.execute("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS reply_text TEXT")
    op.execute("ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ")

    # One row per review per brand per source. Partial, because site reviews
    # have no external id and must not collide on NULL.
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_product_reviews_external
        ON product_reviews(tenant_id, source, external_id)
        WHERE external_id IS NOT NULL
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_product_reviews_source ON product_reviews(source)")


def downgrade() -> None:
    # Store reviews have no product and cannot survive NOT NULL coming back.
    op.execute("DELETE FROM product_reviews WHERE product_id IS NULL")
    op.execute("DROP INDEX IF EXISTS ix_product_reviews_source")
    op.execute("DROP INDEX IF EXISTS uq_product_reviews_external")
    for column in ("reviewed_at", "reply_text", "source_url", "reviewer_photo_url",
                   "external_id", "source"):
        op.execute(f"ALTER TABLE product_reviews DROP COLUMN IF EXISTS {column}")
    op.execute("ALTER TABLE product_reviews ALTER COLUMN product_id SET NOT NULL")
