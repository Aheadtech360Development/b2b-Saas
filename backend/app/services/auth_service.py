# backend/app/services/auth_service.py
"""Authentication service."""
import secrets
import uuid
from datetime import UTC, datetime, timedelta
import logging
logger = logging.getLogger(__name__)

from sqlalchemy.exc import IntegrityError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.config import get_settings, settings

from app.core.exceptions import (
    AccountNotActivatedError,
    AccountPendingApprovalError,
    AccountSuspendedError,
    ConflictError,
    NotFoundError,
    UnauthorizedError,
    ValidationError,
)
from app.core.redis import redis_delete, redis_get, redis_set
from app.core.tenant_context import get_current_tenant_id
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.company import Company, CompanyUser
from app.models.user import User
from app.schemas.auth import LoginResponse, RegisterWholesaleRequest, TokenRefreshResponse
from app.models.wholesale import WholesaleApplication

REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_TOKEN_EXPIRE_DAYS = 7


def _build_access_token_claims(user: User, membership: CompanyUser | None) -> dict:
    """Build extra JWT claims from user + company membership."""
    claims: dict = {
        "is_admin": user.is_admin,
        "account_type": getattr(user, "account_type", "wholesale"),
    }
    if membership:
        claims["company_id"] = str(membership.company_id)
        claims["company_role"] = membership.role
        if membership.company and membership.company.pricing_tier_id:
            claims["pricing_tier_id"] = str(membership.company.pricing_tier_id)
    return claims


class AuthService:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def login(self, email: str, password: str) -> LoginResponse:
        result = await self.db.execute(select(User).where(User.email == email.lower()))
        user = result.scalar_one_or_none()

        # Retail user who hasn't activated yet (no password) or is pending admin approval
        if user and getattr(user, "account_type", "wholesale") == "retail" and not user.is_active:
            if user.activation_token:
                raise AccountNotActivatedError()
            else:
                raise AccountPendingApprovalError()

        if not user or not verify_password(password, user.hashed_password or ""):
            raise UnauthorizedError("Invalid email or password")

        if not user.is_active:
            raise UnauthorizedError("Your account is inactive")

        # Check company status for non-admin users
        membership: CompanyUser | None = None
        is_retail = getattr(user, "account_type", "wholesale") == "retail"
        if not user.is_admin:
            mem_result = await self.db.execute(
                select(CompanyUser)
                .where(CompanyUser.user_id == user.id, CompanyUser.is_active == True)
                .limit(1)
            )
            membership = mem_result.scalar_one_or_none()
            if membership:
                await self.db.refresh(membership, ["company"])
                company: Company = membership.company
                if not is_retail and company.status == "suspended":
                    raise AccountSuspendedError()
            elif not is_retail:
                # No company membership for wholesale — check wholesale application status
                app_result = await self.db.execute(
                    select(WholesaleApplication)
                    .where(WholesaleApplication.email == user.email)
                    .order_by(WholesaleApplication.created_at.desc())
                    .limit(1)
                )
                application = app_result.scalar_one_or_none()
                if application and application.status == "pending":
                    raise UnauthorizedError(
                        "Your wholesale application is pending review. "
                        "You will receive an email once your account is approved."
                    )
                elif application and application.status == "rejected":
                    raise UnauthorizedError(
                        "Your wholesale application was not approved. "
                        "Please contact us for more information."
                    )

        # Update last_login
        user.last_login = datetime.now(UTC)
        await self.db.flush()

        extra_claims = _build_access_token_claims(user, membership)
        access_token = create_access_token(str(user.id), extra_claims=extra_claims)
        refresh_token = create_refresh_token(str(user.id))

        # Store refresh token in Redis (7-day TTL)
        await redis_set(
            f"refresh:{user.id}",
            refresh_token,
            expire=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

        return LoginResponse(access_token=access_token, token_type="bearer"), refresh_token

    async def logout(self, user_id: str, access_jti: str) -> None:
        """Blacklist the access token JTI and delete the refresh token."""
        await redis_set(f"blacklist:{access_jti}", "1", expire=15 * 60)
        await redis_delete(f"refresh:{user_id}")

    async def refresh_tokens(self, refresh_token: str) -> TokenRefreshResponse:
        """Validate refresh token, issue new access token."""
        from jose import JWTError

        try:
            payload = decode_token(refresh_token)
        except JWTError:
            raise UnauthorizedError("Invalid or expired refresh token")

        if payload.get("type") != "refresh":
            raise UnauthorizedError("Wrong token type")

        user_id = payload.get("sub")
        stored = await redis_get(f"refresh:{user_id}")
        if stored != refresh_token:
            raise UnauthorizedError("Refresh token has been rotated or revoked")

        result = await self.db.execute(select(User).where(User.id == uuid.UUID(user_id)))
        user = result.scalar_one_or_none()
        if not user or not user.is_active:
            raise UnauthorizedError("User not found or inactive")

        mem_result = await self.db.execute(
            select(CompanyUser)
            .where(CompanyUser.user_id == user.id, CompanyUser.is_active == True)
            .limit(1)
        )
        membership = mem_result.scalar_one_or_none()
        if membership:
            await self.db.refresh(membership, ["company"])

        extra_claims = _build_access_token_claims(user, membership)
        new_access_token = create_access_token(user_id, extra_claims=extra_claims)
        new_refresh_token = create_refresh_token(user_id)

        # Rotate refresh token (one-time use)
        await redis_set(
            f"refresh:{user_id}",
            new_refresh_token,
            expire=REFRESH_TOKEN_EXPIRE_DAYS * 86400,
        )

        return TokenRefreshResponse(access_token=new_access_token), new_refresh_token

    async def register_wholesale(self, data: RegisterWholesaleRequest) -> WholesaleApplication:
        """Create a user account and wholesale application with 'pending' status."""
        # Check for duplicate email
        existing = await self.db.execute(select(User).where(User.email == data.email.lower()))
        if existing.scalar_one_or_none():
            raise ConflictError("An account with this email already exists")

        user = User(
            email=data.email.lower(),
            hashed_password=hash_password(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            is_admin=False,
            is_active=True,
            email_verified=False,
            # User isn't a TenantMixin, so it isn't auto-stamped — bind the buyer
            # to the storefront's brand explicitly, or their tenant-scoped login
            # (which filters by tenant_id) can never find them.
            tenant_id=get_current_tenant_id(),
        )
        self.db.add(user)
        try:
            await self.db.flush()
        except IntegrityError:
            # Emails are unique across the whole platform, but the check above
            # only sees this brand's accounts, so an email already registered
            # with another store got past it and crashed the insert.
            await self.db.rollback()
            raise ConflictError(
                "This email already has an account on our platform. "
                "Log in with it, or apply with a different email address."
            )

        application = WholesaleApplication(
            company_name=data.company_name,
            tax_id=data.tax_id,
            business_type=data.business_type,
            website=data.website,
            expected_monthly_volume=data.expected_monthly_volume,
            first_name=data.first_name,
            last_name=data.last_name,
            email=data.email.lower(),
            phone=data.phone,
            status="pending",
            # Extended registration fields
            company_email=getattr(data, "company_email", None),
            address_line1=getattr(data, "address_line1", None),
            address_line2=getattr(data, "address_line2", None),
            city=getattr(data, "city", None),
            state_province=getattr(data, "state_province", None),
            postal_code=getattr(data, "postal_code", None),
            country=getattr(data, "country", None),
            how_heard=getattr(data, "how_heard", None),
            num_employees=getattr(data, "num_employees", None),
            num_sales_reps=getattr(data, "num_sales_reps", None),
            secondary_business=getattr(data, "secondary_business", None),
            estimated_annual_volume=getattr(data, "estimated_annual_volume", None),
            ppac_number=getattr(data, "ppac_number", None),
            ppai_number=getattr(data, "ppai_number", None),
            asi_number=getattr(data, "asi_number", None),
            fax=getattr(data, "fax", None),
        )
        self.db.add(application)
        await self.db.flush()

        # ✅ Yeh lagao
        from app.services.email_service import EmailService
        email_svc = EmailService(self.db)
        # The store the buyer applied to — its own name and contact details,
        # not one hardcoded brand's on every store's emails.
        store, contact = await self._store_identity(application.tenant_id)
        try:
            email_svc.send_raw(
                to_email=application.email,
                subject=f"We Received Your Wholesale Application — {store}",
                body_html=f"""
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
                    <div style="background:#080808;padding:24px;text-align:center">
                        <span style="color:#fff;font-size:22px;font-weight:800;letter-spacing:.04em">{store}</span>
                    </div>
                    <div style="padding:32px;background:#fff">
                        <h2>Application Received! ✅</h2>
                        <p>Hi {data.first_name},</p>
                        <p>We received your wholesale application for <b>{data.company_name}</b>.</p>
                        <p>Our team will review within <b>1-2 business days</b> and notify you of our decision.</p>
                        {f"<p>Questions? Contact us at <b>{contact}</b></p>" if contact else ""}
                        <p>— {store} Team</p>
                    </div>
                    </div>
                """,
            )
        except Exception:
            pass

        # ✅ Notify the store owner of the brand this application was submitted to.
        # The application is tenant-scoped, so its stamped tenant_id tells us whose
        # store it is; the recipient is that brand's own notification address, never
        # a single shared inbox.
        owner_email = await self._resolve_owner_notification_email(application.tenant_id)
        if owner_email:
            try:
                email_svc.send_raw(
                    to_email=owner_email,
                    subject=f"New Wholesale Application — {data.company_name}",
                    body_html=f"""
                        <h2>New Wholesale Application</h2>
                        <p><b>Company:</b> {data.company_name}</p>
                        <p><b>Name:</b> {data.first_name} {data.last_name}</p>
                        <p><b>Email:</b> {data.email}</p>
                        <p><b>Phone:</b> {data.phone}</p>
                        <p><b>Business Type:</b> {data.business_type}</p>
                        <a href="{settings.FRONTEND_URL}/admin/customers/applications">Review Application →</a>
                    """,
                )
            except Exception:
                pass  # non-fatal

        return application

    async def _store_identity(self, tenant_id: object) -> tuple[str, str]:
        """This store's display name and a contact line (phone or email)."""
        from sqlalchemy import text

        if tenant_id:
            try:
                row = (await self.db.execute(
                    text(
                        "SELECT COALESCE(NULLIF(b.store_name, ''), NULLIF(b.company_name, ''), t.name), "
                        "COALESCE(NULLIF(b.support_phone, ''), NULLIF(b.support_email, ''), '') "
                        "FROM tenants t LEFT JOIN tenant_branding b ON b.tenant_id = t.id WHERE t.id = :t"
                    ),
                    {"t": str(tenant_id)},
                )).first()
                if row and row[0]:
                    return str(row[0]), str(row[1] or "")
            except Exception:
                pass
        return "Our store", ""

    async def _resolve_owner_notification_email(self, tenant_id: object) -> str | None:
        """Where a new wholesale application should notify — resolved per brand.

        Order: the brand's configured support email, else its first tenant admin's
        login email, else the platform-wide fallback. Each brand thus hears about
        its own applicants and never about another brand's.
        """
        from sqlalchemy import text

        if tenant_id:
            branding = await self.db.execute(
                text("SELECT support_email FROM tenant_branding WHERE tenant_id = :t"),
                {"t": str(tenant_id)},
            )
            support_email = branding.scalar()
            if support_email:
                return support_email

            admin = await self.db.execute(
                text(
                    "SELECT email FROM users "
                    "WHERE tenant_id = :t AND role = 'tenant_admin' AND is_active = true "
                    "ORDER BY created_at LIMIT 1"
                ),
                {"t": str(tenant_id)},
            )
            admin_email = admin.scalar()
            if admin_email:
                return admin_email

        # The brand's configured alert address, then the platform's. Without the
        # first, a new application notified the platform and never the owner.
        from app.services.email_service import notify_address as _notify_to
        return _notify_to()

    async def send_password_reset(self, email: str) -> None:
        """Send the link that gets somebody back into their account.

        Looked up without tenant scoping, deliberately. An email address
        belongs to one account across the whole platform, and this is asked for
        from wherever the person happens to be — the platform's own page, or a
        shop's. Scoped to the page they were on, row-level security hid their
        own account from the query: no user found, no mail sent, and a page
        that said "check your email" regardless.
        """
        token = secrets.token_urlsafe(32)
        user = await self._claim_reset_token(email.lower(), token)
        if not user:
            return

        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

        # ✅ Direct call — no Celery
        from app.services.email_service import EmailService
        email_svc = EmailService(self.db)
        try:
            sent = await email_svc.send_password_reset_link(
                to_email=user["email"],
                first_name=user["first_name"] or "there",
                reset_url=reset_url,
                expiry_hours=1,
            )
            if not sent:
                logger.error("Password reset email NOT sent for %s", email)
        except Exception:
            logger.warning("Password reset email failed for %s", email)

    @staticmethod
    async def _claim_reset_token(email: str, token: str) -> dict | None:
        """Write a fresh reset token against this address, whoever it belongs to.

        Runs on its own unscoped session — see send_password_reset. Returns what
        the email needs, never the account itself.
        """
        from sqlalchemy import text as _text

        from app.core.database import AsyncSessionLocal
        from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

        previous = is_scoping_bypassed()
        set_bypass_scoping(True)
        try:
            async with AsyncSessionLocal() as db:
                row = (await db.execute(_text("""
                    UPDATE users SET password_reset_token = :tok,
                                     password_reset_expires = now() + interval '1 hour'
                    WHERE lower(email) = :em
                    RETURNING email, first_name
                """), {"tok": token, "em": email})).mappings().first()
                await db.commit()
                return dict(row) if row else None
        except Exception:
            logger.warning("Could not issue a reset token for %s", email, exc_info=True)
            return None
        finally:
            set_bypass_scoping(previous)

    async def reset_password(self, token: str, new_password: str) -> None:
        """Spend a reset token. Unscoped for the same reason as issuing one:
        the page the link was opened on says nothing about whose account it is."""
        from sqlalchemy import text as _text

        from app.core.database import AsyncSessionLocal
        from app.core.tenant_context import is_scoping_bypassed, set_bypass_scoping

        previous = is_scoping_bypassed()
        set_bypass_scoping(True)
        try:
            async with AsyncSessionLocal() as db:
                row = (await db.execute(_text(
                    "SELECT id, password_reset_expires FROM users"
                    " WHERE password_reset_token = :tok"
                ), {"tok": token})).mappings().first()
                if not row or not row["password_reset_expires"]:
                    raise ValidationError("Invalid or expired reset token")
                if row["password_reset_expires"] < datetime.now(UTC):
                    raise ValidationError("Reset token has expired")

                # Cleared in the same statement that sets the password: a token
                # that still works after it has been used is a second key left
                # in an inbox.
                await db.execute(_text("""
                    UPDATE users SET hashed_password = :pwd,
                                     password_reset_token = NULL,
                                     password_reset_expires = NULL
                    WHERE id = :uid
                """), {"pwd": hash_password(new_password), "uid": row["id"]})
                await db.commit()
        finally:
            set_bypass_scoping(previous)

