import StorefrontPage from "@/components/storefront/StorefrontPage";

export const dynamic = "force-dynamic";

// Catch-all for custom storefront pages created in the admin Pages builder.
// Specific routes (products, account, about, contact, …) take priority.
export default async function CustomStorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <StorefrontPage slug={slug} />;
}
