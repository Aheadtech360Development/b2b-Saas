/**
 * Which shop the app is looking at.
 *
 * On the web a shop is a subdomain. There is no such thing here, so a shop is
 * found by the short code its owner hands out, and afterwards by the brand
 * named inside the signed-in token.
 */
import { call } from "@/api/client";

export interface Shop {
  slug: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  /** Whether this shop takes wholesale applications at all. A retail-only
   *  shop has nowhere to put one, so the app must not offer the form. */
  acceptsWholesaleSignup: boolean;
}

/** The two endpoints spell the same things differently — the shop-code lookup
 *  says name/logo, branding says store_name/logo_url — so both are read. */
interface ShopResponse {
  slug?: string;
  name?: string;
  store_name?: string;
  logo?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  wholesale_signup?: boolean;
}

function shopFrom(res: ShopResponse): Shop {
  return {
    slug: res.slug ?? "",
    name: res.name ?? res.store_name ?? "",
    logoUrl: res.logo ?? res.logo_url ?? null,
    primaryColor: res.primary_color ?? null,
    acceptsWholesaleSignup: res.wholesale_signup === true,
  };
}

/** Look up a shop by the code on the card, the invoice or the email. */
export async function findByCode(code: string): Promise<Shop> {
  const cleaned = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  const res = await call<ShopResponse>(
    `/api/v1/storefront/by-code/${encodeURIComponent(cleaned)}`,
    { anonymous: true },
  );
  return shopFrom(res);
}

/** The branding for the shop this session belongs to. */
export async function currentShop(tenantSlug: string): Promise<Shop> {
  const res = await call<ShopResponse>("/api/v1/storefront/branding", {
    anonymous: true,
    tenantSlug,
  });
  return shopFrom({ ...res, slug: res.slug ?? tenantSlug });
}
