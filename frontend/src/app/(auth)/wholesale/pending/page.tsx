import { redirect } from "next/navigation";

/** Nothing is pending approval any more — see wholesale/register. */
export default function WholesalePendingPage() {
  redirect("/");
}
