"use client";

/** One purchase order (design 37): changed while a draft, received once sent.
 *  components/admin/purchase-orders/PurchaseOrderEditor. */
import { useParams } from "next/navigation";
import { PurchaseOrderEditor } from "@/components/admin/purchase-orders/PurchaseOrderEditor";

export default function PurchaseOrderPage() {
  const params = useParams<{ id: string }>();
  return <PurchaseOrderEditor id={params.id} />;
}
