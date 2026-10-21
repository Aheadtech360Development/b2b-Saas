"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { BrandPage } from "@/components/platform/console/BrandPage";

export default function PlatformBrandPage() {
  const { slug } = useParams<{ slug: string }>();
  return (
    <Suspense fallback={<div className="pc-empty">Loading…</div>}>
      <BrandPage slug={decodeURIComponent(slug)} />
    </Suspense>
  );
}
