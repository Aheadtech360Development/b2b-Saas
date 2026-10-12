import { SuppliersManager } from "@/components/admin/suppliers/SuppliersManager";
import { ProductsFrame } from "@/components/admin/products/ProductsFrame";

function SuppliersPageBody() {
  return <SuppliersManager />;
}


/** This screen as one of the Products tabs (components/admin/products/ProductsFrame). */
export default function SuppliersPage() {
  return (
    <ProductsFrame active="suppliers">
      <SuppliersPageBody />
    </ProductsFrame>
  );
}
