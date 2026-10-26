import { redirect } from "next/navigation";

/** Saved carts now live under Orders, Saved for later; the old address still opens them. */
export default function AbandonedCartsPage() {
  redirect("/account/orders?tab=saved");
}
