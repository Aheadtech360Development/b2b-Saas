"use client";

import { IntegrationsPanel } from "@/components/admin/IntegrationsPanel";
import { DomainPanel } from "@/components/admin/DomainPanel";
import { ShopEmailPanel } from "@/components/admin/ShopEmailPanel";
import { StoreNamePanel } from "@/components/admin/StoreNamePanel";

// "General Settings" used to sit here: a minimum order value, a guest pricing
// mode, a low-stock threshold and a notification email. Nothing read any of the
// four, and they were one value shared by every shop on the platform, so a
// brand typing its own changed it for all of them. The email that does work is
// the one below.

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Your shop&apos;s name, its email and its address on the web.
        </p>
      </div>

      {/* What the shop calls itself. First, because it is the one setting a
          customer sees on every page and in every email. */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Store name</h2>
          <p className="text-sm text-gray-500 mt-1">
            The name your customers see. Change it here if your shop has been renamed.
          </p>
        </div>
        <div className="px-6 py-6">
          <StoreNamePanel />
        </div>
      </div>

      {/* Email: one address, and what a customer will see because of it. */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Email</h2>
          <p className="text-sm text-gray-500 mt-1">
            Every email to your customers goes out under your store name. Put your shop&apos;s
            email here and their replies come back to you.
          </p>
        </div>
        <div className="px-6 py-6 space-y-5">
          <ShopEmailPanel />
          {/* For the shop that wants more than one address: a sender name of
              its own, a separate reply address, or its own sending domain. */}
          <details className="border-t border-gray-100 pt-4">
            <summary className="text-sm font-medium text-gray-700 cursor-pointer select-none">More options</summary>
            <p className="text-xs text-gray-500 mt-2 mb-3">
              A different sender name, a separate reply address, or sending from an address on your own
              domain (needs a domain you have verified with Resend).
            </p>
            <IntegrationsPanel category="email" />
          </details>
        </div>
      </div>

      {/* The shop's own domain, once it has bought one. */}
      <div className="bg-white border border-gray-200 rounded-lg">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Your domain</h2>
          <p className="text-sm text-gray-500 mt-1">
            Bought a domain of your own? Point it here and your whole shop answers
            there — same products, same orders, same customers.
          </p>
        </div>
        <div className="px-6 py-6">
          <DomainPanel />
        </div>
      </div>

    </div>
  );
}
