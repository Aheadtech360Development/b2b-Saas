import { redirect } from "next/navigation";

/**
 * There is no wholesale application any more.
 *
 * The shop used to be gated: apply, wait to be approved, then see prices.
 * Anyone can buy now, so the form is gone — and the link is kept alive as a
 * redirect because it was printed in emails and sits in people's bookmarks.
 */
export default function WholesaleRegisterPage() {
  redirect("/");
}
