import { redirect } from "next/navigation";

/**
 * "Edit theme" went when imported themes did: a shop's site is made in the
 * website builder. An old bookmark or an open tab lands there instead of on a
 * page that is not found.
 */
export default function ThemeEditorGone() {
  redirect("/site-builder");
}
