"use client";

import { useBranding } from "@/components/providers/BrandingProvider";

function AnnouncementBarInner() {
  const branding = useBranding();

  // Only render when the brand has enabled an announcement with text.
  if (!branding.show_announcement || !branding.announcement_text) return null;

  return (
    <div
      style={{
        background: branding.announcement_bg_color || branding.primary_color || "var(--brand-primary, #1C3557)",
        color: branding.announcement_text_color || "#fff",
        textAlign: "center",
        padding: "8px 16px",
        fontFamily: "var(--brand-font-body, 'DM Sans', sans-serif)",
        fontSize: "12px",
        letterSpacing: "0.02em",
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {branding.announcement_text}
      {branding.support_phone ? (
        <span className="hidden sm:inline">&nbsp;·&nbsp;{branding.support_phone}</span>
      ) : null}
    </div>
  );
}

export default AnnouncementBarInner;
export { AnnouncementBarInner as AnnouncementBar };
