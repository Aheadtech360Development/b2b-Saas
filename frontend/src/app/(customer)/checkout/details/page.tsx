"use client";

/**
 * An address from the checkout's old steps (Shipping, Review & pay). The
 * checkout is one page now (/checkout), so links, bookmarks and a half-done
 * checkout left open in a tab all land there.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function OldCheckoutStep() {
  const router = useRouter();
  useEffect(() => { router.replace("/checkout"); }, [router]);
  return (
    <div className="ui-wrap" style={{ padding: "60px 0", textAlign: "center", color: "var(--ui-muted)", fontSize: "14px" }}>
      Taking you to the checkout…
    </div>
  );
}
