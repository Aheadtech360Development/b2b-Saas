"use client";

import { useParams } from "next/navigation";
import { BrandReady } from "@/components/platform/console/BrandReady";

export default function BrandReadyPage() {
  const { slug } = useParams<{ slug: string }>();
  return <BrandReady slug={decodeURIComponent(slug)} />;
}
