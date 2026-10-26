"use client";

/** The Reports pages' tabs. */
import { Tabs } from "./ui";

export function ReportTabs({ on }: { on: "history" | "stock" }) {
  return (
    <Tabs label="Reports" tabs={[
      { key: "history", label: "Purchase history", href: "/account/sales-history", on: on === "history" },
      { key: "stock", label: "Stock levels", href: "/account/inventory", on: on === "stock" },
    ]} />
  );
}
