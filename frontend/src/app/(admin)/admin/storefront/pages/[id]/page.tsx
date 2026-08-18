"use client";

// Deep-link route to a single page editor. Reuses the shared PageEditor
// component; "back" returns to the pages list.
import { useRouter, useParams } from "next/navigation";
import PageEditor from "@/components/admin/PageEditor";

export default function PageEditorRoute() {
  const router = useRouter();
  const params = useParams();
  return <PageEditor id={String(params.id)} onBack={() => router.push("/admin/storefront/pages")} />;
}
