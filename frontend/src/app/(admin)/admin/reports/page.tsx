"use client";

import Link from "next/link";
import { TrendingUpIcon, PackageIcon, UsersIcon } from "@/components/ui/icons";

const REPORT_CARDS = [
  {
    href: "/reports/sales",
    title: "Sales Report",
    description: "Revenue by period, category breakdown, top products",
    icon: <TrendingUpIcon size={36} color="#1A5CFF" />,
  },
  {
    href: "/reports/inventory",
    title: "Inventory Report",
    description: "Stock levels, low-stock alerts, movement history",
    icon: <PackageIcon size={36} color="#1A5CFF" />,
  },
  {
    href: "/reports/customers",
    title: "Customer Report",
    description: "New registrations, approval rate, AOV by tier",
    icon: <UsersIcon size={36} color="#1A5CFF" />,
  },
];

export default function ReportsDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports & Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">
          Business insights across sales, inventory, and customers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {REPORT_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="block bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md hover:border-blue-300 transition-all"
          >
            <div className="mb-3">{card.icon}</div>
            <h2 className="text-lg font-semibold text-gray-900">{card.title}</h2>
            <p className="text-sm text-gray-500 mt-1">{card.description}</p>
            <span className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline">
              View report →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
