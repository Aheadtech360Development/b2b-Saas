// Analytics is the Reports screen now: the same numbers, counted the same way
// for every tab (services/report_view.py). Old links land there.
import { redirect } from "next/navigation";

export default function AnalyticsPage() {
  redirect("/admin/reports");
}
