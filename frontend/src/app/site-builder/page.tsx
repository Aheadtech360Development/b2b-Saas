"use client";

/**
 * The visual website builder, on its own screen — outside the admin layout
 * for the same reason as the theme editor: the page being built is the work,
 * and a sidebar beside it only makes it look smaller than it is.
 */
import AdminGate from "./AdminGate";
import SiteEditor from "@/components/builder/editor/SiteEditor";

export default function SiteBuilderPage() {
  return (
    <AdminGate>
      <SiteEditor backHref="/ui-preview" />
    </AdminGate>
  );
}
