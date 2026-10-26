import { redirect } from "next/navigation";

/** Returns now live under Orders, Returns and reprints. The return confirmation
 *  email links here, so the address keeps opening them. */
export default function AccountRmaPage() {
  redirect("/account/orders?tab=returns");
}
