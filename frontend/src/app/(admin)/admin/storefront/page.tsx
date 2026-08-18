"use client";

// The storefront customizer lives in a shared component so it can render both
// here (its own route) and inside the new admin shell (/ui-preview) with no
// duplication. See @/components/admin/StorefrontCustomizer.
import StorefrontCustomizer from "@/components/admin/StorefrontCustomizer";

export default function StorefrontSettingsPage() {
  return <StorefrontCustomizer />;
}
