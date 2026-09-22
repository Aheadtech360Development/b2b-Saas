/**
 * The brand this request belongs to — never a name baked into the code.
 *
 * Every store on the platform renders from the same app, so a page title, an
 * email footer or an SEO preview that says one brand's name is wrong for
 * everybody else. Server components read the brand from the storefront's own
 * branding; client components use `useBranding()` instead.
 */
import { cache } from "react";
import { apiClient } from "@/lib/api-client";

/** Used only when the brand hasn't set a name, or the call fails. */
export const FALLBACK_BRAND = "Wholesale Store";

export interface BrandInfo {
  name: string;
  /** Empty when the brand hasn't set one — callers leave the line out. */
  supportEmail: string;
  supportPhone: string;
}

/** The brand's name and support contacts, for server-rendered pages. */
export const getBrandInfo = cache(async (): Promise<BrandInfo> => {
  try {
    const b = await apiClient.get<{ store_name?: string; support_email?: string; support_phone?: string }>(
      "/api/v1/storefront/branding", { skipAuth: true },
    );
    const name = (b?.store_name ?? "").trim();
    return {
      name: name && name !== "Store" ? name : FALLBACK_BRAND,
      supportEmail: (b?.support_email ?? "").trim(),
      supportPhone: (b?.support_phone ?? "").trim(),
    };
  } catch {
    return { name: FALLBACK_BRAND, supportEmail: "", supportPhone: "" };
  }
});

/** The brand's display name, for server-rendered page titles and metadata. */
export async function getBrandName(): Promise<string> {
  return (await getBrandInfo()).name;
}

/** "Product — Brand", or just the product when the brand is unknown. */
export async function titleWithBrand(title: string): Promise<string> {
  const brand = await getBrandName();
  return brand === FALLBACK_BRAND ? title : `${title} — ${brand}`;
}

/** The address this store actually runs on, for previews and canonical links. */
export function storeOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return process.env.NEXT_PUBLIC_BASE_URL ?? "";
}

/** "yourstore.com/products/tee" — what a shopper would see in search results. */
export function displayUrl(path: string): string {
  const origin = storeOrigin();
  const host = origin.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const clean = path.startsWith("/") ? path : `/${path}`;
  return host ? `${host}${clean}` : clean;
}

/** A safe file name from the brand, e.g. "bravo-apparels-price-list.csv". */
export function brandFileName(brand: string | undefined | null, suffix: string): string {
  const slug = (brand ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `${slug}-${suffix}` : suffix;
}
