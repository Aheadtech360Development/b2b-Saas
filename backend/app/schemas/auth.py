"""Auth Pydantic schemas."""
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str = ""
    token_type: str = "bearer"
    # When the account has 2FA on, login returns no access token — instead a
    # short-lived challenge the client exchanges at /auth/2fa/verify with a code.
    requires_2fa: bool = False
    challenge_token: str | None = None
    # Only ever filled for a native client, which has no cookie jar and does
    # have the Keychain. A browser keeps getting the httpOnly cookie, where
    # script cannot read it. See core/native_client.
    refresh_token: str | None = None


class TokenRefreshRequest(BaseModel):
    """A native client's refresh token, since it has no cookie to send."""

    refresh_token: str | None = None


class RegisterCustomerRequest(BaseModel):
    """An ordinary buyer opening an account with one shop.

    Shorter than the wholesale form on purpose: this is somebody who has a
    design ready and wants it printed, and every extra field between them and
    that is a reason to leave. The shop still gets a real customer out of it —
    a company record, a login, and an address to send the proof to — rather
    than an order from a name and an email nobody can follow up with.
    """

    first_name: str = Field(..., min_length=1, max_length=80)
    last_name: str = Field(default="", max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=200)
    phone: str | None = Field(default=None, max_length=50)
    # Most buyers here are a small print shop. When they do not give one, their
    # own name stands in, because the shop's customer list is a list of
    # accounts and an empty one is worse than a person's name.
    company_name: str | None = Field(default=None, max_length=255)


class RegisterWholesaleRequest(BaseModel):
    # Company info
    company_name: str = Field(..., min_length=2, max_length=255)
    tax_id: str | None = Field(None, max_length=100)
    business_type: str = Field(..., min_length=2, max_length=100)
    website: str | None = Field(None, max_length=500)
    expected_monthly_volume: str | None = None

    # Extended company info (registration form)
    fax: str | None = Field(None, max_length=50)
    secondary_business: str | None = Field(None, max_length=255)
    estimated_annual_volume: str | None = Field(None, max_length=100)
    ppac_number: str | None = Field(None, max_length=100)
    ppai_number: str | None = Field(None, max_length=100)
    asi_number: str | None = Field(None, max_length=100)
    company_email: str | None = Field(None, max_length=255)
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    how_heard: str | None = Field(None, max_length=100)
    num_employees: str | None = Field(None, max_length=50)
    num_sales_reps: str | None = Field(None, max_length=50)

    # Contact info
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    phone: str | None = Field(None, max_length=50)
    password: str = Field(..., min_length=8)


class TokenRefreshResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    # Refreshing rotates the refresh token. A browser receives the new one as a
    # cookie; a native client has to be handed it, or its next refresh would
    # present the spent one and be logged out.
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class ActivateAccountSchema(BaseModel):
    token: str
    # Personal
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: str = Field(..., min_length=1, max_length=100)
    phone: str | None = Field(None, max_length=50)
    # Business
    company_name: str = Field(..., min_length=1, max_length=255)
    business_type: str = Field(..., min_length=1, max_length=100)
    website: str | None = Field(None, max_length=500)
    tax_id: str | None = Field(None, max_length=100)
    company_email: str | None = Field(None, max_length=255)
    # Address
    address_line1: str | None = Field(None, max_length=255)
    address_line2: str | None = Field(None, max_length=255)
    city: str | None = Field(None, max_length=100)
    state_province: str | None = Field(None, max_length=100)
    postal_code: str | None = Field(None, max_length=20)
    country: str | None = Field(None, max_length=100)
    # Account
    password: str = Field(..., min_length=8)
    confirm_password: str
    # Additional
    how_heard: str | None = Field(None, max_length=100)
    secondary_business: str | None = Field(None, max_length=255)
    num_employees: str | None = Field(None, max_length=50)
    num_sales_reps: str | None = Field(None, max_length=50)


class ResendActivationSchema(BaseModel):
    email: EmailStr
