import type { Metadata } from "next";
import PrivacyPolicyPage from "./PrivacyPolicyContent";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/privacy-policy`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Privacy Policy | AF Apparels",
      description: seo.meta_description ?? "AF Apparels privacy policy, terms of service, and shipping and return policies.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Privacy Policy | AF Apparels" };
  }
}

export default function Page() {
  return <PrivacyPolicyPage />;
}
