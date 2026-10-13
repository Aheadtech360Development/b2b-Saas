// The sales report is the Reports screen's Sales tab now. Old links land there.
import { redirect } from "next/navigation";

export default function SalesReportPage() {
  redirect("/admin/reports");
}
