/**
 * Auth service — wraps all authentication API calls.
 */
import { apiClient } from "@/lib/api-client";
import type { AuthTokens, UserProfile } from "@/types/user.types";

export interface RegisterWholesalePayload {
  // Required
  company_name: string;
  business_type: string;
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  // Optional company info
  tax_id?: string;
  website?: string;
  phone?: string;
  fax?: string;
  company_email?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  state_province?: string;
  postal_code?: string;
  country?: string;
  ppai_number?: string;
  asi_number?: string;
  secondary_business?: string;
  how_heard?: string;
  num_employees?: string;
  num_sales_reps?: string;
  expected_monthly_volume?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface WholesaleApplicationResponse {
  id: string;
  company_name: string;
  status: string;
  created_at: string;
}

export const authService = {
  /** Log in and receive an access token. Refresh token is set as httpOnly cookie. */
  async login(payload: LoginPayload): Promise<AuthTokens> {
    return apiClient.post<AuthTokens>("/api/v1/auth/login", payload, { skipAuth: true });
  },

  /** Log out — clear refresh cookie. */
  async logout(): Promise<void> {
    return apiClient.post<void>("/api/v1/auth/logout");
  },

  /** Submit a wholesale registration application. */
  async registerWholesale(payload: RegisterWholesalePayload): Promise<WholesaleApplicationResponse> {
    return apiClient.post<WholesaleApplicationResponse>(
      "/api/v1/register-wholesale",
      payload,
      { skipAuth: true }
    );
  },

  /** Refresh the access token using the httpOnly refresh cookie. */
  async refreshToken(): Promise<AuthTokens> {
    return apiClient.post<AuthTokens>("/api/v1/auth/refresh", undefined, { skipAuth: true });
  },

  /** Send a password reset email. Always resolves (no enumeration). */
  async forgotPassword(email: string): Promise<void> {
    return apiClient.post<void>("/api/v1/forgot-password", { email }, { skipAuth: true });
  },

  /** Reset password using token from email. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    return apiClient.post<void>(
      "/api/v1/reset-password",
      { token, new_password: newPassword },
      { skipAuth: true }
    );
  },

  /** Get the current user's profile (requires valid access token). */
  async getProfile(): Promise<UserProfile> {
    return apiClient.get<UserProfile>("/api/v1/auth/profile");
  },
};
