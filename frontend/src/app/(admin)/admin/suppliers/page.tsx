import { SuppliersManager } from "@/components/admin/suppliers/SuppliersManager";

/** One of the Products tabs: the manager draws the frame (components/admin/products/ProductsFrame),
 *  so its "Add manual supplier" button can open the form on the overview. */
export default function SuppliersPage() {
  return <SuppliersManager />;
}
