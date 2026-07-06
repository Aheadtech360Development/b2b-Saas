/** Authenticated user profile (backend ProfileOut + is_admin/account_type added from JWT). */
export interface UserProfile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  is_admin: boolean;             // Not in backend ProfileOut; added from JWT payload
  is_platform_admin?: boolean;   // Super admin (owns the whole SaaS); from JWT payload
  role?: string;                 // platform_admin | tenant_admin | staff | ...; from JWT
  tenant_id?: string | null;     // null for platform admin; from JWT payload
  account_type?: string;         // Not in backend ProfileOut; added from JWT payload
  email_verified: boolean;
  created_at: string;
}

/** A tenant (brand) in the multi-tenant platform. */
export interface Tenant {
  id: string;
  slug: string;
  name: string;
  email: string;
  status: "active" | "suspended" | "cancelled";
  plan: string;
  created_at: string;
  user_count: number;
}

/** Company membership with role. */
export interface CompanyMembership {
  company_id: string;
  company_name: string;
  role: "owner" | "buyer" | "viewer" | "finance";
  is_active: boolean;
}

/** Wholesale company account. */
export interface Company {
  id: string;
  name: string;
  trading_name: string | null;
  tax_id: string | null;
  business_type: string | null;
  website: string | null;
  phone: string | null;
  status: "pending" | "active" | "suspended" | "rejected";
  pricing_tier_id: string | null;
  pricing_tier_name: string | null;
  pricing_tier_discount: number | null;
  shipping_tier_id: string | null;
  shipping_tier_name: string | null;
  shipping_override_amount: number | null;
  created_at: string;
}

/** Auth token pair returned from login. */
export interface AuthTokens {
  access_token: string;
  token_type: "bearer";
}

/** Address record. */
export interface Address {
  id: string;
  label: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

/** Contact record. */
export interface Contact {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  title: string | null;
  is_primary: boolean;
  notify_order_confirmation: boolean;
  notify_order_shipped: boolean;
  notify_invoices: boolean;
}
