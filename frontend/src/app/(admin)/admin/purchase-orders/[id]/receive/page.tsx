import { redirect } from "next/navigation";

/** Receiving is on the purchase order's own page now (Receive stock). */
export default async function ReceivePurchaseOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/admin/purchase-orders/${id}?receive=1`);
}
