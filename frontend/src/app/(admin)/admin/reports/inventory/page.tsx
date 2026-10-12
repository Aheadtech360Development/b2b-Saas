// The inventory report is the Inventory screen now (Products → Inventory): the
// same SKUs with what open orders hold and what is coming. Old links land there.
import { redirect } from "next/navigation";

export default function InventoryReportPage() {
  redirect("/admin/inventory");
}
