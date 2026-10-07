import { redirect } from "next/navigation";

/**
 * The imported theme's admin page is gone with imported themes; the website
 * builder is where a shop's site is made. See app/theme-editor/page.tsx.
 */
export default function AdminThemeGone() {
  redirect("/site-builder");
}
