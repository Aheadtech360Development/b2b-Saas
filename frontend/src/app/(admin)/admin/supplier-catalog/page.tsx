"use client";

/**
 * The old supplier screen. Everything it did — connection, browsing, markup,
 * syncing — now lives in Manage Suppliers, where it is per brand and actually
 * runs in production (the old sync depended on a worker that was never
 * deployed). Kept as a component so embeds of it keep working.
 */
import { SuppliersManager } from "@/components/admin/suppliers/SuppliersManager";

export default function SupplierCatalogPage() {
  return <SuppliersManager />;
}
