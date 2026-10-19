"""The partner program: people who bring shops to the platform, and what
they earn for it.

Revision ID: 0061_partner_program
Revises: 0059_audit_user_unlink

A partner is not a user of any shop. Users belong to one brand each; a
partner belongs to the platform, signs in somewhere else, and is paid by it.
So none of these tables has a tenant_id: the referred shop is
`shop_tenant_id`, which tenant scoping does not touch, and there is no
foreign key to tenants. A commission line is money owed and must outlive the
shop it came from.

What a partner earns is a ledger. A line is never edited for its amount: a
refund is a new minus line, an admin's correction is a new adjustment line,
and each line keeps the rate it was earned at, so a rate change only reaches
lines still to come. A commission line is unique per Stripe invoice, so an
event Stripe delivers twice can never pay twice.

The activity log is append-only, and has no foreign keys at all, so it can
never stand in the way of anything else being deleted (see 0043 and 0059,
where the shop audit log's trigger blocked every user delete).

Nothing existing changes.
"""
from alembic import op

revision = "0061_partner_program"
down_revision = "0059_audit_user_unlink"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE partner_rate_plans (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            key varchar(40) NOT NULL UNIQUE,
            name varchar(80) NOT NULL,
            rate_bps integer NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
            is_public boolean NOT NULL DEFAULT false,
            is_default boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("""
        INSERT INTO partner_rate_plans (key, name, rate_bps, is_public, is_default) VALUES
            ('standard', 'Standard', 2000, true, true),
            ('preferred', 'Preferred', 3000, false, false)
    """)

    op.execute("""
        CREATE TABLE partner_terms_versions (
            version integer PRIMARY KEY,
            clauses jsonb NOT NULL,
            changes text,
            published_at timestamptz NOT NULL DEFAULT now(),
            published_by varchar(200)
        )
    """)
    op.execute("""
        INSERT INTO partner_terms_versions (version, clauses, changes, published_by) VALUES (1, '[
            {"title": "Disclose that you earn a commission",
             "text": "Say it clearly wherever you share your link or code. No false claims and no income promises."},
            {"title": "No spam, no brand ads, no self referral",
             "text": "Do not spam. Do not run ads on the PrintCoPilot brand name. Do not refer yourself or a business you own."},
            {"title": "What you earn",
             "text": "A percentage of the base plan fee on every paid invoice, for as long as the referred shop stays on a paid plan. Trials, failed payments, the Gang Sheet Builder commission, add-ons and taxes earn nothing."},
            {"title": "Refunds and disputes",
             "text": "Commission on a refunded or disputed payment is deducted from later payouts."},
            {"title": "Changes",
             "text": "We can change rates for future referrals with 30 days notice. Commission already earned is never reduced."},
            {"title": "Ending the partnership",
             "text": "Either side can end it at any time. Earned commission is paid. Removal for breaking the terms forfeits pending commission."},
            {"title": "Tax and disputes",
             "text": "A W-9 is needed before the first payout. Disputes follow the company''s standard terms. [LEGAL TEXT TO BE CONFIRMED BY YOUR LAWYER]"}
        ]'::jsonb, 'The first version.', 'system')
    """)

    op.execute("""
        CREATE TABLE partner_applications (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name varchar(160) NOT NULL,
            email varchar(255) NOT NULL,
            business_name varchar(200),
            website varchar(300),
            promote_how text,
            audience_size varchar(60),
            terms_version integer REFERENCES partner_terms_versions(version),
            terms_accepted_at timestamptz,
            status varchar(20) NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting', 'info_requested', 'approved', 'rejected')),
            flags jsonb NOT NULL DEFAULT '[]'::jsonb,
            ip_hash varchar(64),
            user_agent varchar(300),
            info_request text,
            decided_by varchar(200),
            decided_at timestamptz,
            decision_reason text,
            partner_id uuid,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_partner_applications_status ON partner_applications (status, created_at)")
    op.execute("CREATE INDEX ix_partner_applications_email ON partner_applications (lower(email))")

    op.execute("""
        CREATE TABLE partners (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            application_id uuid REFERENCES partner_applications(id) ON DELETE SET NULL,
            email varchar(255) NOT NULL,
            name varchar(160) NOT NULL,
            business_name varchar(200),
            website varchar(300),
            code varchar(24) NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'paused', 'suspended', 'terminated')),
            status_reason text,
            rate_plan_id uuid NOT NULL REFERENCES partner_rate_plans(id),
            custom_rate_bps integer CHECK (custom_rate_bps BETWEEN 0 AND 10000),
            custom_rate_ends_on date,
            password_hash varchar(255),
            session_version integer NOT NULL DEFAULT 1,
            invite_token_hash varchar(64),
            invite_expires_at timestamptz,
            reset_token_hash varchar(64),
            reset_expires_at timestamptz,
            failed_logins integer NOT NULL DEFAULT 0,
            locked_until timestamptz,
            two_factor_secret varchar(100),
            two_factor_enabled boolean NOT NULL DEFAULT false,
            two_factor_backup_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
            payout_method varchar(20) CHECK (payout_method IN ('paypal', 'wise', 'bank')),
            payout_account varchar(255),
            email_prefs jsonb NOT NULL DEFAULT '{}'::jsonb,
            terms_version integer REFERENCES partner_terms_versions(version),
            last_login_at timestamptz,
            approved_at timestamptz,
            approved_by varchar(200),
            ended_at timestamptz,
            forfeit_pending boolean NOT NULL DEFAULT false,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE UNIQUE INDEX ux_partners_email ON partners (lower(email))")
    op.execute("CREATE UNIQUE INDEX ux_partners_code ON partners (upper(code))")
    op.execute("""
        ALTER TABLE partner_applications
            ADD CONSTRAINT fk_partner_applications_partner
            FOREIGN KEY (partner_id) REFERENCES partners(id) ON DELETE SET NULL
    """)

    op.execute("""
        CREATE TABLE partner_terms_acceptances (
            id bigserial PRIMARY KEY,
            partner_id uuid REFERENCES partners(id),
            application_id uuid REFERENCES partner_applications(id) ON DELETE SET NULL,
            version integer NOT NULL REFERENCES partner_terms_versions(version),
            accepted_at timestamptz NOT NULL DEFAULT now(),
            ip_hash varchar(64),
            user_agent varchar(300)
        )
    """)
    op.execute("CREATE INDEX ix_partner_terms_acceptances_partner ON partner_terms_acceptances (partner_id, version)")

    op.execute("""
        CREATE TABLE partner_clicks (
            id bigserial PRIMARY KEY,
            partner_id uuid NOT NULL REFERENCES partners(id),
            at timestamptz NOT NULL DEFAULT now(),
            src varchar(60),
            landing varchar(300),
            referrer_host varchar(200),
            visitor_hash varchar(64)
        )
    """)
    op.execute("CREATE INDEX ix_partner_clicks_partner ON partner_clicks (partner_id, at)")

    op.execute("""
        CREATE TABLE partner_referrals (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id uuid NOT NULL REFERENCES partners(id),
            shop_tenant_id uuid NOT NULL UNIQUE,
            shop_name varchar(200),
            owner_email varchar(255),
            source varchar(10) NOT NULL CHECK (source IN ('code', 'cookie', 'manual')),
            code_used varchar(24),
            click_id bigint,
            src varchar(60),
            status varchar(20) NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'review', 'excluded')),
            flags jsonb NOT NULL DEFAULT '[]'::jsonb,
            attributed_at timestamptz NOT NULL DEFAULT now(),
            ended_at timestamptz,
            decided_by varchar(200),
            decided_at timestamptz,
            decision_reason text,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    op.execute("CREATE INDEX ix_partner_referrals_partner ON partner_referrals (partner_id)")

    op.execute("""
        CREATE TABLE partner_payout_batches (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name varchar(40) NOT NULL UNIQUE,
            note text,
            status varchar(20) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'paid', 'cancelled')),
            created_by varchar(200),
            created_at timestamptz NOT NULL DEFAULT now(),
            closed_at timestamptz
        )
    """)
    op.execute("""
        CREATE TABLE partner_payouts (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            batch_id uuid REFERENCES partner_payout_batches(id),
            partner_id uuid NOT NULL REFERENCES partners(id),
            amount_cents integer NOT NULL,
            method varchar(20) NOT NULL CHECK (method IN ('paypal', 'wise', 'bank')),
            reference varchar(200),
            paid_on date NOT NULL,
            recorded_by varchar(200),
            recorded_at timestamptz NOT NULL DEFAULT now(),
            w9_override_reason text,
            statement_sent_at timestamptz
        )
    """)
    op.execute("CREATE INDEX ix_partner_payouts_partner ON partner_payouts (partner_id, paid_on)")

    op.execute("""
        CREATE TABLE partner_commission_lines (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id uuid NOT NULL REFERENCES partners(id),
            referral_id uuid REFERENCES partner_referrals(id),
            shop_tenant_id uuid,
            kind varchar(12) NOT NULL CHECK (kind IN ('commission', 'clawback', 'adjustment')),
            stripe_invoice_id varchar(80),
            stripe_payment_ref varchar(80),
            source_ref varchar(160),
            plan_key varchar(40),
            base_cents integer NOT NULL DEFAULT 0,
            rate_bps integer NOT NULL DEFAULT 0,
            amount_cents integer NOT NULL,
            currency varchar(3) NOT NULL DEFAULT 'usd',
            status varchar(12) NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'held', 'void', 'paid')),
            hold_reason varchar(60),
            status_note text,
            earned_at timestamptz NOT NULL,
            payable_on date NOT NULL,
            reverses_line_id uuid REFERENCES partner_commission_lines(id),
            batch_id uuid REFERENCES partner_payout_batches(id),
            payout_id uuid REFERENCES partner_payouts(id),
            livemode boolean NOT NULL DEFAULT true,
            created_by varchar(200),
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)
    # One commission line per invoice: the guarantee that a replayed event
    # never pays twice. Clawbacks and adjustments carry their own source_ref.
    op.execute("""
        CREATE UNIQUE INDEX ux_partner_lines_invoice ON partner_commission_lines (stripe_invoice_id)
            WHERE kind = 'commission'
    """)
    op.execute("""
        CREATE UNIQUE INDEX ux_partner_lines_source ON partner_commission_lines (source_ref)
            WHERE source_ref IS NOT NULL
    """)
    op.execute("CREATE INDEX ix_partner_lines_partner ON partner_commission_lines (partner_id, status, payable_on)")
    op.execute("CREATE INDEX ix_partner_lines_batch ON partner_commission_lines (batch_id)")
    op.execute("CREATE INDEX ix_partner_lines_referral ON partner_commission_lines (referral_id)")

    op.execute("""
        CREATE TABLE partner_documents (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            partner_id uuid NOT NULL REFERENCES partners(id),
            kind varchar(20) NOT NULL CHECK (kind IN ('w9')),
            filename varchar(200),
            mime varchar(80),
            size_bytes integer,
            sha256 varchar(64),
            data bytea NOT NULL,
            uploaded_at timestamptz NOT NULL DEFAULT now(),
            replaced_at timestamptz
        )
    """)
    op.execute("CREATE INDEX ix_partner_documents_current ON partner_documents (partner_id, kind) WHERE replaced_at IS NULL")

    op.execute("""
        CREATE TABLE partner_assets (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            title varchar(120) NOT NULL,
            width integer,
            height integer,
            mime varchar(80) NOT NULL,
            size_bytes integer,
            data bytea NOT NULL,
            sort integer NOT NULL DEFAULT 0,
            created_by varchar(200),
            created_at timestamptz NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE TABLE partner_stripe_events (
            id bigserial PRIMARY KEY,
            stripe_event_id varchar(80) NOT NULL,
            event_type varchar(60) NOT NULL,
            livemode boolean NOT NULL DEFAULT true,
            received_at timestamptz NOT NULL DEFAULT now(),
            shop_tenant_id uuid,
            partner_id uuid,
            result varchar(24) NOT NULL,
            detail text,
            attempts integer NOT NULL DEFAULT 1,
            last_error text,
            payload jsonb,
            resolved_at timestamptz
        )
    """)
    # One outcome per event; a replay is an extra row that says so.
    op.execute("""
        CREATE UNIQUE INDEX ux_partner_stripe_events_event ON partner_stripe_events (stripe_event_id)
            WHERE result <> 'replay_ignored'
    """)
    op.execute("CREATE INDEX ix_partner_stripe_events_received ON partner_stripe_events (received_at DESC)")

    op.execute("""
        CREATE TABLE partner_activity (
            id bigserial PRIMARY KEY,
            at timestamptz NOT NULL DEFAULT now(),
            actor_kind varchar(12) NOT NULL CHECK (actor_kind IN ('admin', 'partner', 'system', 'stripe')),
            actor_name varchar(200),
            actor_email varchar(255),
            partner_id uuid,
            subject_kind varchar(20),
            subject_id varchar(80),
            action varchar(60) NOT NULL,
            reason text,
            before jsonb,
            after jsonb
        )
    """)
    op.execute("CREATE INDEX ix_partner_activity_partner ON partner_activity (partner_id, at DESC)")
    op.execute("CREATE INDEX ix_partner_activity_subject ON partner_activity (subject_kind, subject_id)")
    op.execute("""
        CREATE OR REPLACE FUNCTION partner_activity_is_append_only() RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'partner_activity is append-only';
        END;
        $$ LANGUAGE plpgsql
    """)
    op.execute("""
        CREATE TRIGGER partner_activity_append_only
            BEFORE UPDATE OR DELETE ON partner_activity
            FOR EACH ROW EXECUTE FUNCTION partner_activity_is_append_only()
    """)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS partner_activity_append_only ON partner_activity")
    op.execute("DROP FUNCTION IF EXISTS partner_activity_is_append_only()")
    for table in (
        "partner_activity", "partner_stripe_events", "partner_assets", "partner_documents",
        "partner_commission_lines", "partner_payouts", "partner_payout_batches",
        "partner_referrals", "partner_clicks", "partner_terms_acceptances",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table}")
    op.execute("ALTER TABLE partner_applications DROP CONSTRAINT IF EXISTS fk_partner_applications_partner")
    for table in ("partners", "partner_applications", "partner_terms_versions", "partner_rate_plans"):
        op.execute(f"DROP TABLE IF EXISTS {table}")
