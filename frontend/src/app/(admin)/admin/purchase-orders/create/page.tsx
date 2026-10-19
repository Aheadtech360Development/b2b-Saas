import { redirect } from "next/navigation";

/** The old three-step form: a purchase order is made on one page now. */
export default function CreatePurchaseOrderPage() {
  redirect("/admin/purchase-orders/new");
}
