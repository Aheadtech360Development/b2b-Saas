/**
 * The owner's setup steps (/onboarding): backend/app/api/v1/admin/onboarding.py
 * keeps the owner's place and reads what is done; each step saves through the
 * endpoint that already owns its thing (the shop's look through
 * /admin/storefront, a supplier through /admin/integrations, payments through
 * /admin/connect, pickup through /admin/settings).
 */
import { apiClient } from "@/lib/api-client";

export const BUSINESS_TYPES: { key: string; label: string }[] = [
  { key: "print_shop", label: "Print shop" },
  { key: "dtf_operator", label: "DTF operator" },
  { key: "screen_printer", label: "Screen printer" },
  { key: "embroiderer", label: "Embroiderer" },
  { key: "blank_supplier", label: "Blank supplier" },
  { key: "wholesale_apparel", label: "Wholesale apparel" },
  { key: "custom_apparel_brand", label: "Custom apparel brand" },
];

export interface PickupSaved {
  name: string; street1: string; city: string; state: string; zip: string; hours: string; note: string;
}

export interface OnboardingState {
  started: boolean;
  step: number;
  reached: number;
  business_type: string | null;
  country: string | null;
  finished_at: string | null;
  sanmar_notify: boolean;
  shop_name: string;
  slug: string | null;
  shop_url: string;
  trial_days: number | null;
  branding: { logo_url: string | null; primary_color: string | null; font_heading: string | null; font_body: string | null };
  products: { count: number; gang_sheet: number };
  supplier_connected: boolean;
  stripe: { connected: boolean; charges_enabled: boolean; details_submitted: boolean };
  carriers: string[];
  pickup: { enabled: boolean; address: string; set: boolean; saved: PickupSaved };
  domain: { host: string | null };
  done: { business: boolean; branded: boolean; product: boolean; payments: boolean; shipping: boolean; domain: boolean };
}

export interface ProgressIn {
  step?: number;
  reached?: number;
  business_type?: string | null;
  country?: string | null;
  finished?: boolean;
}

export const onboardingService = {
  get: () => apiClient.get<OnboardingState>("/api/v1/admin/onboarding"),
  save: (changes: ProgressIn) => apiClient.put<OnboardingState>("/api/v1/admin/onboarding", changes),
  notifySanmar: () => apiClient.post<OnboardingState>("/api/v1/admin/onboarding/notify", { topic: "sanmar" }),
  /** The shop's name, logo, colour and fonts: the same save as Settings and the storefront page. */
  saveLook: (changes: Record<string, string>) => apiClient.put("/api/v1/admin/storefront", changes),
  connectSupplier: (values: { account_number: string; api_key: string }) =>
    apiClient.post<{ verified?: boolean; message?: string }>("/api/v1/admin/integrations/ss_activewear", { values, force: false }),
  /** Stripe's own onboarding page, coming back to these steps. */
  startStripe: () => apiClient.post<{ onboarding_url: string }>("/api/v1/admin/connect/onboard?back=onboarding"),
  refreshStripe: () => apiClient.post("/api/v1/admin/connect/refresh"),
  savePickup: (place: PickupSaved) =>
    apiClient.patch("/api/v1/admin/settings", { pickup_enabled: "true", pickup_location: JSON.stringify(place) }),
  checkDomain: () => apiClient.post<{ status?: string }>("/api/v1/admin/storefront/domain/check", {}),
};
