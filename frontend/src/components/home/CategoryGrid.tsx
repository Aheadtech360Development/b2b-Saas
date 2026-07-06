"use client";

import Link from "next/link";
import { ShirtIcon } from "@/components/ui/icons";

const fallbackCategories = [
  { slug: "t-shirts",     name: "T-Shirts" },
  { slug: "sweatshirts",  name: "Sweatshirts" },
  { slug: "hoodies",      name: "Hoodies" },
  { slug: "polo-shirts",  name: "New Arrivals" },
];

interface Category {
  id: string;
  name: string;
  slug: string;
  image_url?: string | null;
}

interface CategoryGridProps {
  categories: Category[];
}

export default function CategoryGrid({ categories }: CategoryGridProps) {
  const items = categories.length > 0 ? categories.slice(0, 4) : fallbackCategories.map(c => ({ ...c, id: c.slug }));

  return (
    <section style={{ padding: "72px 24px", background: "#F8F8F6" }}>
      <div style={{ maxWidth: "1500px", margin: "0 auto" }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", textTransform: "uppercase", letterSpacing: "0.12em", color: "#6B6B6B", marginBottom: "20px", textAlign: "center" }}>
          Shop by Category
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px" }} className="cat-grid-responsive">
          {items.map((cat) => (
            <Link key={cat.id} href={`/products?category=${cat.slug}`}
              style={{ display: "block", textDecoration: "none", borderBottom: "2px solid transparent", transition: "border-color .2s", background: "#FFFFFF", border: "1px solid #E2E2DE" }}
              onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#1C3557"; }}
              onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.borderColor = "#E2E2DE"; }}
            >
              <div style={{ height: "550px", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8F8F6", position: "relative", overflow: "hidden" }}>
                {(cat as { image_url?: string | null }).image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={(cat as { image_url?: string | null }).image_url as string}
                    alt={cat.name}
                    style={{ width: "100%", height: "100%", objectFit: "cover", position: "absolute", inset: 0 }}
                  />
                ) : (
                  <ShirtIcon size={48} color="#1A1A1A" style={{ opacity: 0.15 }} />
                )}
              </div>
              <div style={{ padding: "14px 16px" }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: "14px", fontWeight: 500, color: "#1A1A1A" }}>{cat.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
