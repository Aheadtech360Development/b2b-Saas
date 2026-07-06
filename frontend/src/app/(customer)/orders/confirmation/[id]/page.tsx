"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ordersService } from "@/services/orders.service";
import { formatCurrency } from "@/lib/utils";
import type { OrderDetail } from "@/types/order.types";

export default function OrderConfirmationPage() {
  const { id } = useParams<{ id: string }>();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    ordersService.getOrder(id)
      .then(setOrder)
      .catch(() => setNotFound(true));
  }, [id]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">Order Not Found</h1>
          <Link href="/account/orders" className="text-sm text-brand-600 hover:text-brand-700">
            View all orders
          </Link>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">Loading order…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Success icon */}
        <div className="text-center mb-8">
          <div className="mx-auto w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Order Confirmed!</h1>
          <p className="mt-2 text-gray-600">
            Thank you for your order. A confirmation email has been sent.
          </p>
        </div>

        {/* Order summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Order Number</p>
              <p className="font-semibold text-gray-900">{order.order_number}</p>
            </div>
            {order.po_number && (
              <div>
                <p className="text-gray-500">PO Number</p>
                <p className="font-semibold text-gray-900">{order.po_number}</p>
              </div>
            )}
            <div>
              <p className="text-gray-500">Status</p>
              <p className="font-semibold text-gray-900 capitalize">{order.status}</p>
            </div>
            <div>
              <p className="text-gray-500">Total</p>
              <p className="font-semibold text-gray-900">{formatCurrency(Number(order.total))}</p>
            </div>
          </div>

          {/* Items */}
          <div className="border-t border-gray-100 pt-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-3">Items</h2>
            <div className="space-y-2">
              {order.items?.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.product_name} — {item.color ?? ""} {item.size ?? ""} × {item.quantity}
                  </span>
                  <span className="text-gray-900 font-medium">
                    {formatCurrency(Number(item.line_total))}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Totals */}
          <div className="border-t border-gray-100 pt-4 space-y-1 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span>{formatCurrency(Number(order.subtotal))}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Shipping</span>
              <span>{formatCurrency(Number(order.shipping_cost))}</span>
            </div>
            <div className="flex justify-between font-bold text-gray-900 text-base">
              <span>Total</span>
              <span>{formatCurrency(Number(order.total))}</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col sm:flex-row gap-3">
          <Link
            href={`/account/orders/${order.id}`}
            className="flex-1 text-center rounded-md border border-brand-600 text-brand-600 py-3 text-sm font-medium hover:bg-brand-50"
          >
            View Order Details
          </Link>
          <Link
            href="/products"
            className="flex-1 text-center rounded-md bg-brand-600 text-white py-3 text-sm font-medium hover:bg-brand-700"
          >
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
