import { redirect } from "next/navigation";

/** Order templates now live under Orders, Saved for later; the old address still opens them. */
export default function AccountTemplatesPage() {
  redirect("/account/orders?tab=saved");
}
