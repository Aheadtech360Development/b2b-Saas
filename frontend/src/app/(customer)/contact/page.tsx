import type { Metadata } from "next";
import ContactPage from "./ContactContent";

const _API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const seo = await fetch(`${_API}/api/v1/pages-seo/contact`, { next: { revalidate: 300 } }).then(r => r.json());
    return {
      title: seo.meta_title ?? "Contact Us | AF Apparels",
      description: seo.meta_description ?? "Get in touch with AF Apparels. We're here to help with wholesale inquiries, orders, and support.",
      keywords: seo.keywords ?? undefined,
      openGraph: seo.og_image_url ? { images: [{ url: seo.og_image_url }] } : undefined,
    };
  } catch {
    return { title: "Contact Us | AF Apparels" };
  }
}

export default function Page() {
  return <ContactPage />;
}
