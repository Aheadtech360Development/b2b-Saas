// The customer report is the Reports screen's Customers tab now. Old links land there.
import { redirect } from "next/navigation";

export default function CustomerReportPage() {
  redirect("/admin/reports?tab=customers");
}
