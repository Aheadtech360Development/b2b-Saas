"use client";
import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api-client";
import { useAuthStore } from "@/stores/auth.store";
import StorefrontCustomizer from "@/components/admin/StorefrontCustomizer";
import MenusManager from "@/components/admin/MenusManager";
import PagesManager from "@/components/admin/PagesManager";
// Real, already-built admin features — reused (not rebuilt) inside this shell so
// the new design has full parity with the old sidebar. All are self-contained
// client screens, store-isolated at the backend.
import SupplierCatalogPage from "@/app/(admin)/admin/supplier-catalog/page";
import AdminGangSheetsPage from "@/app/(admin)/admin/gang-sheets/page";
import MediaLibraryPage from "@/app/(admin)/admin/media/page";
import MessagesPage from "@/app/(admin)/admin/messages/page";
import AdminProductSpecsPage from "@/app/(admin)/admin/product-specs/page";
import AdminStyleSheetsPage from "@/app/(admin)/admin/style-sheets/page";
import StandardShippingPage from "@/app/(admin)/admin/standard-shipping/page";
import ShippingLabelsPage from "@/app/(admin)/admin/orders/shipping-labels/page";
import AdminSettingsPage from "@/app/(admin)/admin/settings/page";
import AdminUsersPage from "@/app/(admin)/admin/users/page";
import RolesPage from "@/app/(admin)/admin/users/roles/page";
import TaxesPage from "@/app/(admin)/admin/settings/taxes/page";
import SecurityPage from "@/app/(admin)/admin/settings/security/page";
import AuditLogPage from "@/app/(admin)/admin/settings/audit-log/page";
import {
  Home, ShoppingCart, Package, Users, Megaphone, Store, BarChart3,
  Settings as SettingsIcon, Search, Bell, ChevronDown, ChevronRight,
  ChevronLeft, Plus, X, Check, AlertTriangle, ArrowRight, Pencil,
  Trash2, ArrowUpDown, UserCheck, ArrowUp, ArrowDown, Image, Star, Truck,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from "recharts";

/** Two-letter avatar initials from a brand name: "Fresh Basics Co." -> "FB". */
function initialsOf(name) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ---------------------------------------------------------------------- */
/* MOCK DATA                                                              */
/* ---------------------------------------------------------------------- */

const seedCustomers = [
  { id: "c1", name: "Lofty Creations", email: "orders@loftycreations.com", phone: "(512) 555-0114", address: "4118 Guadalupe St, Austin, TX 78751", tier: "Gold", taxExempt: true, status: "approved", spend: 18400, orders: 24, location: "TX", notes: "Reorders every 3 weeks." },
  { id: "c2", name: "EZDTFMaker", email: "buying@ezdtfmaker.com", phone: "(312) 555-0198", address: "2200 W Fulton St, Chicago, IL 60612", tier: "Platinum", taxExempt: true, status: "approved", spend: 41200, orders: 51, location: "IL", notes: "Largest recurring account." },
  { id: "c3", name: "Ridge Apparel Co", email: "hello@ridgeapparel.com", phone: "(720) 555-0142", address: "890 S Broadway, Denver, CO 80209", tier: "Silver", taxExempt: false, status: "approved", spend: 6200, orders: 9, location: "CO", notes: "" },
  { id: "c4", name: "MACP Store", email: "team@macpstore.com", phone: "(305) 555-0177", address: "1450 NE 123rd St, North Miami, FL 33161", tier: "Bronze", taxExempt: false, status: "approved", spend: 2100, orders: 4, location: "FL", notes: "New account, watch for reorder." },
  { id: "c5", name: "Northfield Print Co", email: "orders@northfieldprint.com", phone: "(614) 555-0133", address: "77 Northfield Rd, Columbus, OH 43214", tier: "Bronze", taxExempt: false, status: "pending", spend: 0, orders: 0, location: "OH", notes: "Submitted resale certificate." },
  { id: "c6", name: "Whetne Perez Hair", email: "wholesale@whetneperez.com", phone: "(404) 555-0161", address: "310 Peachtree St, Atlanta, GA 30303", tier: "Bronze", taxExempt: false, status: "pending", spend: 0, orders: 0, location: "GA", notes: "" },
  { id: "c7", name: "Karma Organic Spa", email: "purchasing@karmaspa.com", phone: "(602) 555-0119", address: "5100 N Central Ave, Phoenix, AZ 85012", tier: "Silver", taxExempt: true, status: "approved", spend: 8700, orders: 12, location: "AZ", notes: "" },
  { id: "c8", name: "Hellanbach Moto", email: "supply@hellanbach.com", phone: "(214) 555-0188", address: "3700 Commerce St, Dallas, TX 75226", tier: "Gold", taxExempt: false, status: "approved", spend: 15300, orders: 19, location: "TX", notes: "Custom colorway program." },
  { id: "c9", name: "AF Apparels", email: "orders@afapparels.com", phone: "(718) 555-0155", address: "88 Flushing Ave, Brooklyn, NY 11205", tier: "Silver", taxExempt: false, status: "rejected", spend: 0, orders: 0, location: "NY", notes: "Missing business license." },
  { id: "c10", name: "Trashed Punk Studio", email: "buy@trashedpunk.com", phone: "(323) 555-0171", address: "1200 S Main St, Los Angeles, CA 90015", tier: "Bronze", taxExempt: false, status: "approved", spend: 3400, orders: 6, location: "CA", notes: "" },
  { id: "c11", name: "Maniyas Wholesale", email: "orders@maniyas.com", phone: "(469) 555-0102", address: "2801 Regal Row, Dallas, TX 75235", tier: "Platinum", taxExempt: true, status: "approved", spend: 52600, orders: 63, location: "TX", notes: "PO required on every order." },
  { id: "c12", name: "Latchmin Banks Co", email: "hello@latchminbanks.com", phone: "(919) 555-0147", address: "410 W Morgan St, Raleigh, NC 27601", tier: "Silver", taxExempt: false, status: "pending", spend: 0, orders: 0, location: "NC", notes: "" },
];

const seedProducts = [
  { id: "p1", name: "Classic Crewneck Tee", sku: "CT-100", barcode: "810040112301", price: 8.5, compareAtPrice: 10, costPerItem: 3.8, status: "active", revenue: 24800, vendor: "S&S Activewear", productType: "T-Shirt", weight: 0.35, trackQuantity: true, imageCount: 3, collections: ["Blanks"], tags: ["bestseller", "blank"], description: "Mid-weight 100% cotton crewneck built as the base blank for DTF and screen print runs. Consistent fit across the full size run.", seoTitle: "Classic Crewneck Tee, Wholesale Blank", seoDescription: "Wholesale blank crewneck tee, sold by the case, ideal for DTF and screen print production.", variants: [
    { size: "S", color: "Black", stock: 80 }, { size: "M", color: "Black", stock: 120 }, { size: "L", color: "Black", stock: 12 },
    { size: "S", color: "White", stock: 60 }, { size: "M", color: "White", stock: 70 },
  ]},
  { id: "p2", name: "Heavyweight Hoodie", sku: "HW-220", barcode: "810040112302", price: 21, compareAtPrice: null, costPerItem: 9.5, status: "active", revenue: 31200, vendor: "S&S Activewear", productType: "Hoodie", weight: 0.9, trackQuantity: true, imageCount: 4, collections: ["Blanks"], tags: ["blank", "heavyweight"], description: "Heavyweight fleece hoodie with a brushed interior, holds up well under high-heat DTF pressing.", seoTitle: "Heavyweight Hoodie, Wholesale Blank", seoDescription: "Heavyweight blank hoodie for print and embroidery, wholesale case pricing.", variants: [
    { size: "M", color: "Charcoal", stock: 45 }, { size: "L", color: "Charcoal", stock: 38 }, { size: "XL", color: "Charcoal", stock: 0 },
    { size: "M", color: "Navy", stock: 22 },
  ]},
  { id: "p3", name: "DTF Gang Sheet Roll", sku: "GS-40", barcode: "810040112303", price: 45, compareAtPrice: null, costPerItem: 18, status: "active", revenue: 18900, vendor: "In-house production", productType: "Supplies", weight: 1.2, trackQuantity: true, imageCount: 2, collections: ["Print Supplies"], tags: ["dtf", "supplies"], description: "Pre-pressed DTF gang sheet roll, ready to peel and press. Sold by the linear foot on 22in or 40in rolls.", seoTitle: "DTF Gang Sheet Roll", seoDescription: "Custom DTF gang sheet rolls, fast turnaround, wholesale pricing for print shops.", variants: [
    { size: "22in", color: "Standard", stock: 200 }, { size: "40in", color: "Standard", stock: 150 },
  ]},
  { id: "p4", name: "Poison Dart Frog Hoodie", sku: "TP-014", barcode: "810040112304", price: 59, compareAtPrice: 69, costPerItem: 24, status: "active", revenue: 14200, vendor: "TrashedPunk", productType: "Hoodie", weight: 0.95, trackQuantity: true, imageCount: 4, collections: ["Streetwear Drop"], tags: ["streetwear", "limited"], description: "Signature TrashedPunk graphic hoodie from the Neon Therapy drop, limited print run.", seoTitle: "Poison Dart Frog Hoodie, TrashedPunk", seoDescription: "Limited edition streetwear hoodie from TrashedPunk's Neon Therapy collection.", variants: [
    { size: "M", color: "Black", stock: 30 }, { size: "L", color: "Black", stock: 8 },
  ]},
  { id: "p5", name: "Performance Polo", sku: "PP-330", barcode: "810040112305", price: 14, compareAtPrice: null, costPerItem: 6, status: "draft", revenue: 0, vendor: "S&S Activewear", productType: "Polo", weight: 0.4, trackQuantity: true, imageCount: 1, collections: ["Blanks"], tags: ["polo"], description: "Moisture-wicking performance polo, not yet published while sizing samples are confirmed.", seoTitle: "Performance Polo, Wholesale Blank", seoDescription: "Performance polo blank for embroidery and print, wholesale availability coming soon.", variants: [
    { size: "M", color: "White", stock: 0 },
  ]},
  { id: "p6", name: "Fleece Crewneck", sku: "FC-500", barcode: "810040112306", price: 17.5, compareAtPrice: null, costPerItem: 7.5, status: "active", revenue: 9800, vendor: "S&S Activewear", productType: "Crewneck", weight: 0.6, trackQuantity: true, imageCount: 2, collections: ["Blanks"], tags: ["fleece"], description: "Mid-weight fleece crewneck, a lighter alternative to the hoodie for warmer climates.", seoTitle: "Fleece Crewneck, Wholesale Blank", seoDescription: "Wholesale fleece crewneck blank, sold by the case.", variants: [
    { size: "S", color: "Grey", stock: 55 }, { size: "M", color: "Grey", stock: 3 },
  ]},
  { id: "p7", name: "Ringspun Long Sleeve", sku: "RL-210", barcode: "810040112307", price: 11, compareAtPrice: null, costPerItem: 4.75, status: "active", revenue: 7600, vendor: "S&S Activewear", productType: "Long Sleeve", weight: 0.3, trackQuantity: true, imageCount: 2, collections: ["Blanks"], tags: ["longsleeve"], description: "Ringspun cotton long sleeve with a soft hand feel, prints clean on both DTF and screen.", seoTitle: "Ringspun Long Sleeve, Wholesale Blank", seoDescription: "Wholesale ringspun long sleeve blank tee.", variants: [
    { size: "M", color: "Black", stock: 90 }, { size: "L", color: "Black", stock: 65 },
  ]},
  { id: "p8", name: "UV DTF Sticker Sheet", sku: "UV-060", barcode: "810040112308", price: 12, compareAtPrice: null, costPerItem: 5, status: "active", revenue: 5200, vendor: "In-house production", productType: "Supplies", weight: 0.1, trackQuantity: true, imageCount: 2, collections: ["Print Supplies"], tags: ["dtf", "supplies"], description: "UV DTF sticker sheet, durable outdoor-rated adhesive, ready to apply to any surface.", seoTitle: "UV DTF Sticker Sheet", seoDescription: "Custom UV DTF sticker sheets, wholesale pricing for resellers.", variants: [
    { size: "12in", color: "Standard", stock: 140 },
  ]},
  { id: "p9", name: "Boxy Tee", sku: "BT-090", barcode: "810040112309", price: 9, compareAtPrice: null, costPerItem: 4, status: "inactive", revenue: 1100, vendor: "AT360 Apparel", productType: "T-Shirt", weight: 0.35, trackQuantity: true, imageCount: 1, collections: ["Discontinued"], tags: ["discontinued"], description: "Boxy fit tee, phased out of the active catalog after the fall reset.", seoTitle: "Boxy Tee, Discontinued", seoDescription: "Discontinued boxy fit tee.", variants: [
    { size: "M", color: "Sand", stock: 5 },
  ]},
  { id: "p10", name: "Snapback Cap", sku: "SC-075", barcode: "810040112310", price: 13, compareAtPrice: 15, costPerItem: 5.5, status: "active", revenue: 6700, vendor: "S&S Activewear", productType: "Headwear", weight: 0.2, trackQuantity: true, imageCount: 3, collections: ["Headwear"], tags: ["cap", "headwear"], description: "Structured six-panel snapback, flat brim, embroiders clean on the front panel.", seoTitle: "Snapback Cap, Wholesale Blank", seoDescription: "Wholesale blank snapback cap for embroidery and patches.", variants: [
    { size: "OS", color: "Black", stock: 210 }, { size: "OS", color: "Khaki", stock: 4 },
  ]},
];

const seedOrders = [
  { id: "#4521", customer: "Lofty Creations", date: "2026-08-10", status: "fulfilled", payment: "paid", shippingCost: 35, taxAmount: 0, discountCode: null, discountAmount: 0, total: 885, poNumber: null, netTermsDue: null, tags: ["Wholesale", "Repeat customer"], trackingNumber: "1Z999AA10123456784", carrier: "UPS Ground", notes: "Customer requested extra poly bags per order.",
    items: [{ product: "Classic Crewneck Tee", sku: "CT-100", size: "M", color: "Black", qty: 40, price: 8.5, fulfilled: true }, { product: "Classic Crewneck Tee", sku: "CT-100", size: "L", color: "Black", qty: 60, price: 8.5, fulfilled: true }],
    timeline: [{ date: "Aug 10, 9:14 AM", label: "Order placed", type: "order" }, { date: "Aug 10, 9:15 AM", label: "Payment captured, $885.00", type: "payment" }, { date: "Aug 10, 2:40 PM", label: "Fulfilled via UPS Ground", type: "fulfillment" }] },

  { id: "#4520", customer: "EZDTFMaker", date: "2026-08-10", status: "pending", payment: "authorized", shippingCost: 0, taxAmount: 0, discountCode: "WS10", discountAmount: 120, total: 1080, poNumber: "PO-EZ-4471", netTermsDue: null, tags: ["Wholesale", "Net terms eligible"], trackingNumber: null, carrier: "FedEx Freight, pending pickup", notes: "",
    items: [{ product: "DTF Gang Sheet Roll", sku: "GS-40", size: "40in", color: "Standard", qty: 20, price: 45, fulfilled: false }, { product: "UV DTF Sticker Sheet", sku: "UV-060", size: "12in", color: "Standard", qty: 25, price: 12, fulfilled: false }],
    timeline: [{ date: "Aug 10, 11:02 AM", label: "Order placed", type: "order" }, { date: "Aug 10, 11:02 AM", label: "Payment authorized, $1,080.00", type: "payment" }, { date: "Aug 10, 11:05 AM", label: "Awaiting production confirmation before capture", type: "note" }] },

  { id: "#4519", customer: "Ridge Apparel Co", date: "2026-08-09", status: "processing", payment: "paid", shippingCost: 35, taxAmount: 31, discountCode: null, discountAmount: 0, total: 444, poNumber: null, netTermsDue: null, tags: ["Reorder"], trackingNumber: "9400111899223197428370", carrier: "USPS Priority", notes: "",
    items: [{ product: "Heavyweight Hoodie", sku: "HW-220", size: "L", color: "Charcoal", qty: 18, price: 21, fulfilled: false }],
    timeline: [{ date: "Aug 9, 10:20 AM", label: "Order placed", type: "order" }, { date: "Aug 9, 10:21 AM", label: "Payment captured, $444.00", type: "payment" }, { date: "Aug 9, 3:10 PM", label: "Fulfillment in progress", type: "fulfillment" }] },

  { id: "#4518", customer: "MACP Store", date: "2026-08-09", status: "fulfilled", payment: "paid", shippingCost: 35, taxAmount: 17, discountCode: null, discountAmount: 0, total: 261, poNumber: null, netTermsDue: null, tags: ["New account"], trackingNumber: "1Z999AA10987654321", carrier: "UPS Ground", notes: "",
    items: [{ product: "Ringspun Long Sleeve", sku: "RL-210", size: "M", color: "Black", qty: 19, price: 11, fulfilled: true }],
    timeline: [{ date: "Aug 9, 8:45 AM", label: "Order placed", type: "order" }, { date: "Aug 9, 8:46 AM", label: "Payment captured, $261.00", type: "payment" }, { date: "Aug 9, 4:30 PM", label: "Fulfilled via UPS Ground", type: "fulfillment" }] },

  { id: "#4517", customer: "Maniyas Wholesale", date: "2026-08-08", status: "fulfilled", payment: "net terms", shippingCost: 0, taxAmount: 0, discountCode: null, discountAmount: 0, total: 4199, poNumber: "MAN-PO-7742", netTermsDue: "Sep 7, 2026", tags: ["Wholesale", "Net terms", "PO required"], trackingNumber: "1Z999AA10222333444", carrier: "Freight, XPO Logistics", notes: "",
    items: [{ product: "Classic Crewneck Tee", sku: "CT-100", size: "S", color: "White", qty: 200, price: 8.5, fulfilled: true }, { product: "Classic Crewneck Tee", sku: "CT-100", size: "M", color: "White", qty: 294, price: 8.5, fulfilled: true }],
    timeline: [{ date: "Aug 8, 7:55 AM", label: "Order placed", type: "order" }, { date: "Aug 8, 7:56 AM", label: "Invoiced on net terms, due Sep 7", type: "payment" }, { date: "Aug 8, 5:20 PM", label: "Fulfilled via freight carrier", type: "fulfillment" }] },

  { id: "#4516", customer: "Hellanbach Moto", date: "2026-08-08", status: "cancelled", payment: "refunded", shippingCost: 35, taxAmount: 49, discountCode: null, discountAmount: 0, total: 674, poNumber: null, netTermsDue: null, tags: ["Cancelled, sizing issue"], trackingNumber: null, carrier: null, notes: "Customer requested cancellation due to sizing mismatch. Full refund issued.",
    items: [{ product: "Poison Dart Frog Hoodie", sku: "TP-014", size: "L", color: "Black", qty: 10, price: 59, fulfilled: false }],
    timeline: [{ date: "Aug 8, 1:15 PM", label: "Order placed", type: "order" }, { date: "Aug 8, 1:16 PM", label: "Payment captured, $674.00", type: "payment" }, { date: "Aug 9, 9:00 AM", label: "Customer requested cancellation", type: "note" }, { date: "Aug 9, 9:05 AM", label: "Refunded $674.00", type: "payment" }] },

  { id: "#4515", customer: "Karma Organic Spa", date: "2026-08-07", status: "fulfilled", payment: "paid", shippingCost: 35, taxAmount: 0, discountCode: null, discountAmount: 0, total: 373, poNumber: null, netTermsDue: null, tags: ["Wholesale"], trackingNumber: "9405511899562537281940", carrier: "USPS Ground Advantage", notes: "",
    items: [{ product: "Snapback Cap", sku: "SC-075", size: "OS", color: "Black", qty: 26, price: 13, fulfilled: true }],
    timeline: [{ date: "Aug 7, 9:30 AM", label: "Order placed", type: "order" }, { date: "Aug 7, 9:31 AM", label: "Payment captured, $373.00", type: "payment" }, { date: "Aug 7, 6:00 PM", label: "Fulfilled via USPS", type: "fulfillment" }] },

  { id: "#4514", customer: "Trashed Punk Studio", date: "2026-08-06", status: "processing", payment: "paid", shippingCost: 35, taxAmount: 58, discountCode: null, discountAmount: 0, total: 801, poNumber: null, netTermsDue: null, tags: ["Rush order"], trackingNumber: "1Z999AA10555666777", carrier: "UPS 2nd Day Air", notes: "",
    items: [{ product: "Poison Dart Frog Hoodie", sku: "TP-014", size: "M", color: "Black", qty: 12, price: 59, fulfilled: false }],
    timeline: [{ date: "Aug 6, 3:40 PM", label: "Order placed", type: "order" }, { date: "Aug 6, 3:41 PM", label: "Payment captured, $801.00", type: "payment" }, { date: "Aug 6, 3:45 PM", label: "Marked as rush order", type: "note" }] },

  { id: "#4513", customer: "EZDTFMaker", date: "2026-08-05", status: "fulfilled", payment: "net terms", shippingCost: 0, taxAmount: 0, discountCode: null, discountAmount: 0, total: 2700, poNumber: "PO-EZ-4402", netTermsDue: "Sep 4, 2026", tags: ["Wholesale", "Net terms"], trackingNumber: "1Z999AA10888999000", carrier: "FedEx Freight", notes: "",
    items: [{ product: "DTF Gang Sheet Roll", sku: "GS-40", size: "22in", color: "Standard", qty: 60, price: 45, fulfilled: true }],
    timeline: [{ date: "Aug 5, 10:10 AM", label: "Order placed", type: "order" }, { date: "Aug 5, 10:11 AM", label: "Invoiced on net terms, due Sep 4", type: "payment" }, { date: "Aug 5, 4:50 PM", label: "Fulfilled via freight carrier", type: "fulfillment" }] },

  { id: "#4512", customer: "Lofty Creations", date: "2026-08-04", status: "pending", payment: "unpaid", shippingCost: 35, taxAmount: 0, discountCode: null, discountAmount: 0, total: 210, poNumber: null, netTermsDue: null, tags: ["Awaiting payment"], trackingNumber: null, carrier: null, notes: "Payment link sent, awaiting customer action.",
    items: [{ product: "Fleece Crewneck", sku: "FC-500", size: "S", color: "Grey", qty: 10, price: 17.5, fulfilled: false }],
    timeline: [{ date: "Aug 4, 11:25 AM", label: "Order placed", type: "order" }, { date: "Aug 4, 11:26 AM", label: "Payment link sent to customer", type: "note" }] },

  { id: "#4511", customer: "Ridge Apparel Co", date: "2026-08-03", status: "fulfilled", payment: "paid", shippingCost: 35, taxAmount: 78, discountCode: null, discountAmount: 0, total: 1058, poNumber: null, netTermsDue: null, tags: ["Wholesale"], trackingNumber: "1Z999AA10345678999", carrier: "UPS Ground", notes: "",
    items: [{ product: "Heavyweight Hoodie", sku: "HW-220", size: "M", color: "Charcoal", qty: 45, price: 21, fulfilled: true }],
    timeline: [{ date: "Aug 3, 9:05 AM", label: "Order placed", type: "order" }, { date: "Aug 3, 9:06 AM", label: "Payment captured, $1,058.00", type: "payment" }, { date: "Aug 3, 5:15 PM", label: "Fulfilled via UPS Ground", type: "fulfillment" }] },

  { id: "#4510", customer: "Maniyas Wholesale", date: "2026-08-02", status: "fulfilled", payment: "net terms", shippingCost: 0, taxAmount: 0, discountCode: null, discountAmount: 0, total: 5100, poNumber: "MAN-PO-7701", netTermsDue: "Sep 1, 2026", tags: ["Wholesale", "Net terms", "PO required"], trackingNumber: "1Z999AA10112233445", carrier: "Freight, XPO Logistics", notes: "",
    items: [{ product: "Classic Crewneck Tee", sku: "CT-100", size: "M", color: "Black", qty: 600, price: 8.5, fulfilled: true }],
    timeline: [{ date: "Aug 2, 8:00 AM", label: "Order placed", type: "order" }, { date: "Aug 2, 8:01 AM", label: "Invoiced on net terms, due Sep 1", type: "payment" }, { date: "Aug 2, 6:40 PM", label: "Fulfilled via freight carrier", type: "fulfillment" }] },
];

const seedAbandoned = [
  { id: "AC-901", customer: "Guest (unregistered)", email: "guest1@checkout.com", date: "2026-08-11", value: 372, itemsCount: 2, status: "open",
    items: [{ product: "Classic Crewneck Tee", size: "M", color: "Black", qty: 12, price: 8.5 }, { product: "Snapback Cap", size: "OS", color: "Black", qty: 6, price: 13 }] },
  { id: "AC-900", customer: "Northfield Print Co", email: "orders@northfieldprint.com", date: "2026-08-10", value: 915, itemsCount: 2, status: "recovered",
    items: [{ product: "DTF Gang Sheet Roll", size: "40in", color: "Standard", qty: 15, price: 45 }, { product: "UV DTF Sticker Sheet", size: "12in", color: "Standard", qty: 20, price: 12 }] },
  { id: "AC-899", customer: "Guest (unregistered)", email: "guest2@checkout.com", date: "2026-08-09", value: 105, itemsCount: 1, status: "open",
    items: [{ product: "Fleece Crewneck", size: "S", color: "Grey", qty: 6, price: 17.5 }] },
  { id: "AC-898", customer: "AF Apparels", email: "orders@afapparels.com", date: "2026-08-08", value: 525, itemsCount: 1, status: "open",
    items: [{ product: "Heavyweight Hoodie", size: "M", color: "Navy", qty: 25, price: 21 }] },
];

const seedDrafts = [
  { id: "DR-210", customer: "Latchmin Banks Co", date: "2026-08-10", value: 1496, status: "draft",
    items: [{ product: "Classic Crewneck Tee", sku: "CT-100", size: "M", color: "Black", qty: 100, price: 8.5 }, { product: "Classic Crewneck Tee", sku: "CT-100", size: "L", color: "Black", qty: 76, price: 8.5 }] },
  { id: "DR-209", customer: "Karma Organic Spa", date: "2026-08-09", value: 312, status: "draft",
    items: [{ product: "Snapback Cap", sku: "SC-075", size: "OS", color: "Black", qty: 24, price: 13 }] },
  { id: "DR-208", customer: "MACP Store", date: "2026-08-07", value: 88, status: "draft",
    items: [{ product: "Ringspun Long Sleeve", sku: "RL-210", size: "M", color: "Black", qty: 8, price: 11 }] },
];

const seedReturns = [
  { id: "RT-140", order: "#4516", customer: "Hellanbach Moto", date: "2026-08-09", reason: "Sizing issue", status: "approved", refundAmount: 674, resolution: "Full refund issued after cancellation.",
    items: [{ product: "Poison Dart Frog Hoodie", sku: "TP-014", size: "L", color: "Black", qty: 10 }] },
  { id: "RT-139", order: "#4498", customer: "Ridge Apparel Co", date: "2026-08-05", reason: "Damaged in transit", status: "pending", refundAmount: 105, resolution: "",
    items: [{ product: "Heavyweight Hoodie", sku: "HW-220", size: "L", color: "Charcoal", qty: 5 }] },
  { id: "RT-138", order: "#4470", customer: "MACP Store", date: "2026-07-30", reason: "Wrong item shipped", status: "resolved", refundAmount: 0, resolution: "Correct item reshipped at no charge, no refund issued.",
    items: [{ product: "Ringspun Long Sleeve", sku: "RL-210", size: "M", color: "Black", qty: 8 }] },
];

const seedPOs = [
  { id: "PO-3001", supplier: "S&S Activewear", date: "2026-08-10", value: 4750, status: "pending", expectedDate: "Aug 18, 2026", notes: "Restock ahead of the fall drop.",
    items: [{ product: "Classic Crewneck Tee", sku: "CT-100", qty: 500, cost: 3.8 }, { product: "Heavyweight Hoodie", sku: "HW-220", qty: 300, cost: 9.5 }] },
  { id: "PO-3000", supplier: "S&S Activewear", date: "2026-08-01", value: 1900, status: "received", expectedDate: "Aug 1, 2026", notes: "",
    items: [{ product: "Ringspun Long Sleeve", sku: "RL-210", qty: 400, cost: 4.75 }] },
  { id: "PO-2999", supplier: "Prime Print Services", date: "2026-07-24", value: 3600, status: "received", expectedDate: "Jul 24, 2026", notes: "Ahmed Amin account.",
    items: [{ product: "DTF Gang Sheet Roll", sku: "GS-40", qty: 200, cost: 18 }] },
];

const seedCollections = [
  { id: "col1", name: "Blanks", type: "manual", status: "active", description: "Core blank apparel used as the base for DTF, screen print, and embroidery orders.", seoTitle: "Wholesale Blank Apparel", seoDescription: "Shop wholesale blank apparel for print and embroidery production." },
  { id: "col2", name: "Streetwear Drop", type: "manual", status: "active", description: "Limited streetwear releases and brand collaborations.", seoTitle: "Streetwear Drop Collection", seoDescription: "Limited edition streetwear pieces and collaborations." },
  { id: "col3", name: "Headwear", type: "manual", status: "active", description: "Caps and headwear ready for embroidery or patch application.", seoTitle: "Wholesale Headwear", seoDescription: "Wholesale blank caps and headwear." },
  { id: "col4", name: "Print Supplies", type: "automated", status: "active", description: "Consumable print supplies including gang sheets and sticker sheets.", seoTitle: "DTF Print Supplies", seoDescription: "Gang sheets, sticker sheets, and DTF print supplies.", conditions: [{ field: "productType", op: "=", value: "Supplies" }] },
  { id: "col5", name: "Discontinued", type: "manual", status: "hidden", description: "Items phased out of the active catalog.", seoTitle: "Discontinued", seoDescription: "" },
];

const seedReviews = [
  { id: "rv1", product: "Classic Crewneck Tee", customer: "Ridge Apparel Co", rating: 5, status: "published", body: "Fabric held up great after multiple wash cycles, exactly what we needed for a bulk order.", reply: "" },
  { id: "rv2", product: "Heavyweight Hoodie", customer: "Hellanbach Moto", rating: 4, status: "published", body: "Heavyweight feel is perfect for our winter drop. Sizing ran slightly large.", reply: "Thanks for the feedback, we've flagged this for our next size chart update." },
  { id: "rv3", product: "DTF Gang Sheet Roll", customer: "EZDTFMaker", rating: 5, status: "published", body: "Consistent tack and easy peel every roll. Ordering again.", reply: "" },
  { id: "rv4", product: "Boxy Tee", customer: "Trashed Punk Studio", rating: 2, status: "pending", body: "Print cracked after a few washes on the boxy tee.", reply: "" },
];

const seedDiscounts = [
  { id: "d1", title: "Wholesale 10 off 500", type: "percentage", value: "10%", code: "WS10", status: "active" },
  { id: "d2", title: "Free shipping over 1000", type: "free shipping", value: "Free shipping", code: "FREESHIP", status: "active" },
  { id: "d3", title: "New account 5 off", type: "fixed", value: "$5", code: "WELCOME5", status: "active" },
  { id: "d4", title: "Summer clearance", type: "percentage", value: "20%", code: "SUMMER20", status: "expired" },
];

const seedBlogs = [
  { id: "b1", title: "How to price a wholesale tee line", author: "AT360 Team", status: "published" },
  { id: "b2", title: "DTF vs screen print for small runs", author: "AT360 Team", status: "published" },
  { id: "b3", title: "Fall drop lookbook notes", author: "AT360 Team", status: "draft" },
];

const seedPages = [
  { id: "pg1", title: "About us", status: "published" },
  { id: "pg2", title: "Wholesale terms", status: "published" },
  { id: "pg3", title: "Shipping and returns", status: "published" },
  { id: "pg4", title: "Holiday hours", status: "draft" },
];

const seedTiers = [
  { name: "Bronze", discount: 5 },
  { name: "Silver", discount: 10 },
  { name: "Gold", discount: 15 },
  { name: "Platinum", discount: 20 },
];

const salesTrend = [
  { week: "Wk 1", sales: 8200 }, { week: "Wk 2", sales: 9100 }, { week: "Wk 3", sales: 7600 },
  { week: "Wk 4", sales: 10400 }, { week: "Wk 5", sales: 11800 }, { week: "Wk 6", sales: 9900 },
  { week: "Wk 7", sales: 12600 }, { week: "Wk 8", sales: 13400 },
];

const PIE_COLORS = ["#9ca3af", "#60a5fa", "#facc15", "#4ade80"];

/* ---------------------------------------------------------------------- */
/* SHARED UI PRIMITIVES                                                   */
/* ---------------------------------------------------------------------- */

const STATUS_STYLES = {
  fulfilled: "bg-green-50 text-green-700", paid: "bg-green-50 text-green-700",
  approved: "bg-green-50 text-green-700", active: "bg-green-50 text-green-700",
  published: "bg-green-50 text-green-700", received: "bg-green-50 text-green-700",
  resolved: "bg-green-50 text-green-700", recovered: "bg-green-50 text-green-700",
  pending: "bg-amber-50 text-amber-700", processing: "bg-blue-50 text-blue-700",
  authorized: "bg-blue-50 text-blue-700", open: "bg-amber-50 text-amber-700",
  draft: "bg-gray-100 text-gray-600", inactive: "bg-gray-100 text-gray-600",
  hidden: "bg-gray-100 text-gray-600", cancelled: "bg-red-50 text-red-700",
  rejected: "bg-red-50 text-red-700", refunded: "bg-red-50 text-red-700",
  unpaid: "bg-red-50 text-red-700", expired: "bg-red-50 text-red-700",
  "net terms": "bg-blue-50 text-blue-700",
};

const POSITIVE_STATUSES = ["fulfilled", "paid", "approved", "active", "published", "received", "resolved", "recovered"];

function Badge({ status }) {
  const key = String(status || "").toLowerCase();
  if (POSITIVE_STATUSES.includes(key)) {
    return <span style={{ background: "rgba(36,181,116,0.13)", color: "#1a8f5c" }} className="inline-block px-2 py-0.5 rounded text-xs font-medium capitalize">{status}</span>;
  }
  const cls = STATUS_STYLES[key] || "bg-gray-100 text-gray-600";
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${cls}`}>{status}</span>;
}

function Btn({ children, onClick, variant = "secondary", className = "" }) {
  const base = "text-sm px-3 py-1.5 rounded font-medium inline-flex items-center gap-1.5 transition-colors";
  if (variant === "primary") {
    return <button onClick={onClick} style={{ background: "#1d3c73" }} className={`${base} text-white hover:opacity-90 ${className}`}>{children}</button>;
  }
  const styles = variant === "danger"
    ? "border border-red-200 text-red-700 hover:bg-red-50"
    : "border border-gray-300 text-gray-700 hover:bg-gray-50";
  return <button onClick={onClick} className={`${base} ${styles} ${className}`}>{children}</button>;
}

function Toggle({ checked, onChange }) {
  return (
    <button onClick={() => onChange(!checked)} style={{ background: checked ? "#1d3c73" : undefined }} className={`w-9 h-5 rounded-full relative transition-colors ${checked ? "" : "bg-gray-200"}`}>
      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${checked ? "left-4" : "left-0.5"}`} />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-sm text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function TextInput(props) {
  return <input {...props} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500" />;
}

function TextArea(props) {
  return <textarea {...props} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-gray-500" />;
}

function Select({ value, onChange, options }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function MetricCard({ label, value, warn }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4" style={{ borderTop: "3px solid #1d3c73" }}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-medium mt-1" style={{ color: warn ? "#d97706" : "#1d3c73" }}>{value}</div>
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="text-center py-14 text-sm text-gray-400">{label}</div>;
}

function Drawer({ title, record, fields, onClose }) {
  if (!record) return null;
  return (
    <div style={{ background: "rgba(0,0,0,0.35)" }} className="fixed inset-0 z-40 flex justify-end">
      <div className="w-96 bg-white h-full p-6 overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="text-base font-medium">{title}</div>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f.key} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
              <span className="text-gray-500">{f.label}</span>
              <span className="text-gray-900 font-medium">{f.render ? f.render(record[f.key], record) : record[f.key]}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* GENERIC LIST VIEW                                                      */
/* ---------------------------------------------------------------------- */

function ListView({ title, data, columns, statusField, statusOptions, searchFields, onRowClick, onCreate, createLabel, bulkLabel, onBulkAction, pageSize = 6 }) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let rows = data;
    if (statusField && statusFilter !== "all") {
      rows = rows.filter((r) => String(r[statusField] || "").toLowerCase() === statusFilter);
    }
    if (query) {
      const q = query.toLowerCase();
      rows = rows.filter((r) => searchFields.some((f) => String(r[f] || "").toLowerCase().includes(q)));
    }
    if (sortKey) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === "number" && typeof bv === "number") return sortDir === "asc" ? av - bv : bv - av;
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      });
    }
    return rows;
  }, [data, statusFilter, query, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }
  function toggleSelect(id) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }
  function toggleSelectAll() {
    setSelected((s) => (s.length === pageRows.length ? [] : pageRows.map((r) => r.id)));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {onCreate && <Btn variant="primary" onClick={onCreate}><Plus size={14} />{createLabel || "Create"}</Btn>}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2 border border-gray-300 rounded px-2.5 py-1.5 flex-1 max-w-xs">
          <Search size={14} className="text-gray-400" />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder={`Search ${title.toLowerCase()}`} className="text-sm flex-1 outline-none" />
        </div>
        {statusOptions && (
          <div className="flex gap-1">
            {["all", ...statusOptions].map((s) => (
              <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} className={`text-xs px-2.5 py-1 rounded capitalize ${statusFilter === s ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-3 text-sm">
          <span>{selected.length} selected</span>
          <button onClick={() => { onBulkAction && onBulkAction(selected); setSelected([]); }} className="text-red-700 font-medium">{bulkLabel || "Delete"}</button>
          <button onClick={() => setSelected([])} className="text-gray-500">Clear</button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState label={`No ${title.toLowerCase()} match your filters.`} />
      ) : (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="w-8 py-2"><input type="checkbox" checked={selected.length === pageRows.length && pageRows.length > 0} onChange={toggleSelectAll} /></th>
                {columns.map((c) => (
                  <th key={c.key} onClick={() => toggleSort(c.key)} className="text-left text-gray-500 font-normal py-2 cursor-pointer select-none">
                    <span className="inline-flex items-center gap-1">{c.label}<ArrowUpDown size={11} /></span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-2.5" onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleSelect(r.id)} /></td>
                  {columns.map((c) => (
                    <td key={c.key} className="py-2.5 cursor-pointer" onClick={() => onRowClick && onRowClick(r)}>
                      {c.render ? c.render(r) : r[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
            <span>{filtered.length} results</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30"><ChevronLeft size={14} /></button>
              <span>Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30"><ChevronRight size={14} /></button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* HOME                                                                    */
/* ---------------------------------------------------------------------- */

function HomeScreen({ orders, customers, products, goTo, dash, brandName }) {
  // `dash` = real data from the backend; when absent the mock arrays drive it so
  // this screen still renders standalone.
  const pendingApprovals = dash ? dash.pendingApprovals : customers.filter((c) => c.status === "pending").length;
  const lowStock = dash ? dash.lowStock : products.filter((p) => p.variants.some((v) => v.stock > 0 && v.stock <= 15)).length;
  const awaitingFulfillment = dash ? dash.awaitingFulfillment : orders.filter((o) => o.status === "pending" || o.status === "processing").length;
  const netTermsOutstanding = dash ? dash.netTermsOutstanding : orders.filter((o) => o.payment === "net terms").reduce((s, o) => s + o.total, 0);
  const salesThisWeek = dash ? dash.salesThisWeek : orders.reduce((s, o) => s + o.total, 0);
  const ordersCount = dash ? dash.ordersCount : orders.length;
  const aov = dash ? dash.aov : Math.round(salesThisWeek / (orders.length || 1));
  const recent = dash ? dash.recent : orders.slice(0, 5);
  const topProducts = dash && dash.topProducts ? dash.topProducts : [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  const trend = dash && dash.salesTrend ? dash.salesTrend : salesTrend;

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-lg font-medium">Good morning</h2>
        <div className="text-sm text-gray-500">{brandName ? `Here's how ${brandName} is doing this week.` : "Here's how your store is doing this week."}</div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <MetricCard label="Sales this week" value={`$${salesThisWeek.toLocaleString()}`} />
        <MetricCard label="Orders" value={ordersCount} />
        <MetricCard label="Avg. order value" value={`$${aov.toLocaleString()}`} />
        <MetricCard label="Net terms outstanding" value={`$${netTermsOutstanding.toLocaleString()}`} />
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Sales, last 8 weeks</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={40} />
                  <Tooltip />
                  <Line type="monotone" dataKey="sales" stroke="#1d3c73" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium">Recent orders</div>
              <button onClick={() => goTo("orders")} style={{ color: "#1a8f5c" }} className="text-xs flex items-center gap-1">View all <ArrowRight size={12} /></button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Order</th><th className="text-left py-2 font-normal">Customer</th><th className="text-left py-2 font-normal">Status</th><th className="text-left py-2 font-normal">Total</th></tr></thead>
              <tbody>{recent.map((o) => (
                <tr key={o.id} className="border-b border-gray-100"><td className="py-2">{o.id}</td><td className="py-2">{o.customer}</td><td className="py-2"><Badge status={o.status} /></td><td className="py-2">${o.total.toLocaleString()}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="text-sm font-medium mb-2">Needs attention</div>
            <div className="space-y-2">
              <div onClick={() => goTo("approvals")} className="bg-gray-50 rounded-lg p-3 cursor-pointer flex gap-2">
                <UserCheck size={16} className="text-amber-600 mt-0.5" />
                <div><div className="text-sm">{pendingApprovals} wholesale accounts pending</div><div className="text-xs text-gray-500">Awaiting approval</div></div>
              </div>
              <div onClick={() => goTo("inventory")} className="bg-gray-50 rounded-lg p-3 cursor-pointer flex gap-2">
                <AlertTriangle size={16} className="text-red-600 mt-0.5" />
                <div><div className="text-sm">{lowStock} products low in stock</div><div className="text-xs text-gray-500">Below reorder threshold</div></div>
              </div>
              <div onClick={() => goTo("orders")} className="bg-gray-50 rounded-lg p-3 cursor-pointer flex gap-2">
                <ShoppingCart size={16} style={{ color: "#1d3c73" }} className="mt-0.5" />
                <div><div className="text-sm">{awaitingFulfillment} orders awaiting fulfillment</div><div className="text-xs text-gray-500">Pending or in progress</div></div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-2">Top products</div>
            <div className="space-y-1">
              {topProducts.map((p) => (
                <div key={p.id} onClick={() => goTo("products")} className="flex items-center justify-between text-sm py-1.5 cursor-pointer">
                  <span className="text-gray-700">{p.name}</span>
                  <span className="text-gray-500">${p.revenue.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ORDERS                                                                  */
/* ---------------------------------------------------------------------- */

const TIMELINE_DOT = { order: "#6b7280", payment: "#1a8f5c", fulfillment: "#1d3c73", note: "#d97706" };

function OrderDetail({ order, customer, relatedOrders, onBack, onUpdateStatus, onToggleItemFulfilled, onSaveNote, onUpdateTags, onOpenCustomer }) {
  const [noteDraft, setNoteDraft] = useState(order.notes || "");
  const [tagDraft, setTagDraft] = useState("");
  const subtotal = order.items.reduce((s, it) => s + it.qty * it.price, 0);
  const fulfilledCount = order.items.filter((it) => it.fulfilled).length;

  function addTag() {
    if (!tagDraft.trim()) return;
    onUpdateTags(order.id, [...(order.tags || []), tagDraft.trim()]);
    setTagDraft("");
  }
  function removeTag(t) {
    onUpdateTags(order.id, order.tags.filter((x) => x !== t));
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to orders</button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-lg font-medium flex items-center gap-2">{order.id} <Badge status={order.status} /> <Badge status={order.payment} /></div>
          <div className="text-sm text-gray-500 mt-0.5">Placed {order.date} &middot; {order.items.reduce((s, it) => s + it.qty, 0)} items{order.poNumber ? ` \u00b7 PO ${order.poNumber}` : ""}</div>
        </div>
        <div className="flex items-center gap-2">
          <Btn>Print packing slip</Btn>
          <Btn>Print invoice</Btn>
          <Select value={order.status} onChange={(v) => onUpdateStatus(order.id, v)} options={["pending", "processing", "fulfilled", "cancelled"]} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main column */}
        <div className="col-span-2 space-y-6">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-medium">Line items</div>
              <div className="text-xs text-gray-500">{fulfilledCount} of {order.items.length} fulfilled</div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 font-normal w-8"></th>
                  <th className="text-left py-2 font-normal">Product</th>
                  <th className="text-left py-2 font-normal">SKU</th>
                  <th className="text-left py-2 font-normal">Size</th>
                  <th className="text-left py-2 font-normal">Color</th>
                  <th className="text-left py-2 font-normal">Qty</th>
                  <th className="text-left py-2 font-normal">Price</th>
                  <th className="text-left py-2 font-normal">Total</th>
                </tr>
              </thead>
              <tbody>
                {order.items.map((it, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2.5"><input type="checkbox" checked={!!it.fulfilled} onChange={() => onToggleItemFulfilled(order.id, i)} /></td>
                    <td className="py-2.5">{it.product}</td>
                    <td className="py-2.5" style={{ fontFamily: "monospace" }}>{it.sku}</td>
                    <td className="py-2.5">{it.size}</td>
                    <td className="py-2.5">{it.color}</td>
                    <td className="py-2.5">{it.qty}</td>
                    <td className="py-2.5">${it.price.toFixed(2)}</td>
                    <td className="py-2.5">${(it.qty * it.price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 pt-3 border-t border-gray-100 ml-auto max-w-xs space-y-1 text-sm">
              <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>${subtotal.toFixed(2)}</span></div>
              {order.discountAmount > 0 && <div className="flex justify-between" style={{ color: "#1a8f5c" }}><span>Discount {order.discountCode}</span><span>-${order.discountAmount.toFixed(2)}</span></div>}
              <div className="flex justify-between text-gray-500"><span>Shipping</span><span>{order.shippingCost === 0 ? "Free" : `$${order.shippingCost.toFixed(2)}`}</span></div>
              <div className="flex justify-between text-gray-500"><span>Tax{customer?.taxExempt ? " (exempt)" : ""}</span><span>${order.taxAmount.toFixed(2)}</span></div>
              <div className="flex justify-between font-medium text-base pt-1"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Notes</div>
            <TextArea rows={3} value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Add an internal note about this order" />
            <div className="mt-2"><Btn variant="primary" onClick={() => onSaveNote(order.id, noteDraft)}>Save note</Btn></div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Timeline</div>
            <div className="space-y-3">
              {order.timeline.map((t, i) => (
                <div key={i} className="flex gap-2.5 text-sm">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: TIMELINE_DOT[t.type] || "#9ca3af" }} />
                  <div>
                    <div className="text-gray-800">{t.label}</div>
                    <div className="text-xs text-gray-400">{t.date}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar column */}
        <div className="space-y-5">
          {customer && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium mb-2">Customer</div>
              <div onClick={() => onOpenCustomer(customer.id)} className="text-sm font-medium cursor-pointer" style={{ color: "#1a8f5c" }}>{customer.name}</div>
              <div className="text-xs text-gray-500 mt-1">{customer.email}</div>
              <div className="text-xs text-gray-500">{customer.phone}</div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{customer.tier} tier</span>
                {customer.taxExempt && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">Tax exempt</span>}
              </div>
              <div className="text-xs text-gray-400 mt-2">{customer.orders} orders &middot; ${customer.spend.toLocaleString()} lifetime spend</div>
            </div>
          )}

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Shipping address</div>
            <div className="text-sm text-gray-700">{customer?.address || "No address on file"}</div>
            <div className="text-sm font-medium mt-3 mb-1 text-gray-500">Billing address</div>
            <div className="text-xs text-gray-400">Same as shipping</div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Fulfillment</div>
            <div className="text-sm text-gray-700">{order.carrier || "No carrier assigned yet"}</div>
            {order.trackingNumber && <div className="text-xs mt-1" style={{ fontFamily: "monospace", color: "#1d3c73" }}>{order.trackingNumber}</div>}
            {order.netTermsDue && <div className="text-xs text-amber-600 mt-2">Net terms balance due {order.netTermsDue}</div>}
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Tags</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {(order.tags || []).map((t) => (
                <span key={t} className="text-xs bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">{t}<button onClick={() => removeTag(t)}><X size={10} /></button></span>
              ))}
            </div>
            <div className="flex gap-2">
              <TextInput value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add tag" />
              <Btn onClick={addTag}><Plus size={13} /></Btn>
            </div>
          </div>

          {relatedOrders.length > 0 && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium mb-2">Other orders from {order.customer}</div>
              <div className="space-y-1.5">
                {relatedOrders.slice(0, 3).map((o) => (
                  <div key={o.id} className="flex justify-between text-sm">
                    <span>{o.id}</span>
                    <span className="text-gray-500">${o.total.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReturnDetail({ ret, onBack, onSave }) {
  const [status, setStatus] = useState(ret.status);
  const [resolution, setResolution] = useState(ret.resolution || "");
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to returns</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{ret.id} <Badge status={status} /></h2>
        <Select value={status} onChange={setStatus} options={["pending", "approved", "resolved"]} />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Items requested for return</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Product</th><th className="text-left py-2 font-normal">SKU</th><th className="text-left py-2 font-normal">Size</th><th className="text-left py-2 font-normal">Color</th><th className="text-left py-2 font-normal">Qty</th></tr></thead>
              <tbody>{ret.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100"><td className="py-2">{it.product}</td><td className="py-2" style={{ fontFamily: "monospace" }}>{it.sku}</td><td className="py-2">{it.size}</td><td className="py-2">{it.color}</td><td className="py-2">{it.qty}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <Field label="Resolution notes"><TextArea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
            <Btn variant="primary" onClick={() => onSave({ ...ret, status, resolution })}>Save</Btn>
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Return details</div>
            <div className="text-sm text-gray-500">Order</div><div className="text-sm mb-2">{ret.order}</div>
            <div className="text-sm text-gray-500">Customer</div><div className="text-sm mb-2">{ret.customer}</div>
            <div className="text-sm text-gray-500">Reason</div><div className="text-sm mb-2">{ret.reason}</div>
            <div className="text-sm text-gray-500">Refund amount</div><div className="text-sm font-medium">${ret.refundAmount.toFixed(2)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PODetail({ po, onBack, onReceive }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to purchase orders</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{po.id} <Badge status={po.status} /></h2>
        {po.status === "pending" && <Btn variant="primary" onClick={() => onReceive(po.id)}><Check size={13} />Mark as received</Btn>}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Items ordered</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Product</th><th className="text-left py-2 font-normal">SKU</th><th className="text-left py-2 font-normal">Qty</th><th className="text-left py-2 font-normal">Cost</th><th className="text-left py-2 font-normal">Total</th></tr></thead>
              <tbody>{po.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100"><td className="py-2">{it.product}</td><td className="py-2" style={{ fontFamily: "monospace" }}>{it.sku}</td><td className="py-2">{it.qty}</td><td className="py-2">${it.cost.toFixed(2)}</td><td className="py-2">${(it.qty * it.cost).toFixed(2)}</td></tr>
              ))}</tbody>
            </table>
            <div className="text-right text-sm font-medium mt-2">Total: ${po.value.toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Supplier</div><div className="text-sm mb-2">{po.supplier}</div>
            <div className="text-sm text-gray-500">Expected</div><div className="text-sm mb-2">{po.expectedDate}</div>
            {po.notes && <><div className="text-sm text-gray-500">Notes</div><div className="text-sm">{po.notes}</div></>}
          </div>
        </div>
      </div>
    </div>
  );
}

function AbandonedDetail({ checkout, onBack, onSendRecovery }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to abandoned checkouts</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{checkout.id} <Badge status={checkout.status} /></h2>
        {checkout.status === "open" && <Btn variant="primary" onClick={() => onSendRecovery(checkout.id)}>Send recovery email</Btn>}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Cart contents</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Product</th><th className="text-left py-2 font-normal">Size</th><th className="text-left py-2 font-normal">Color</th><th className="text-left py-2 font-normal">Qty</th><th className="text-left py-2 font-normal">Price</th></tr></thead>
              <tbody>{checkout.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100"><td className="py-2">{it.product}</td><td className="py-2">{it.size}</td><td className="py-2">{it.color}</td><td className="py-2">{it.qty}</td><td className="py-2">${it.price}</td></tr>
              ))}</tbody>
            </table>
            <div className="text-right text-sm font-medium mt-2">Cart value: ${checkout.value.toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Customer</div><div className="text-sm mb-2">{checkout.customer}</div>
            <div className="text-sm text-gray-500">Email</div><div className="text-sm">{checkout.email}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DraftDetail({ draft, onBack, onConvert }) {
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to drafts</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{draft.id} <Badge status={draft.status} /></h2>
        <Btn variant="primary" onClick={() => onConvert(draft.id)}>Convert to order</Btn>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Line items</div>
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Product</th><th className="text-left py-2 font-normal">SKU</th><th className="text-left py-2 font-normal">Size</th><th className="text-left py-2 font-normal">Color</th><th className="text-left py-2 font-normal">Qty</th><th className="text-left py-2 font-normal">Price</th></tr></thead>
              <tbody>{draft.items.map((it, i) => (
                <tr key={i} className="border-b border-gray-100"><td className="py-2">{it.product}</td><td className="py-2" style={{ fontFamily: "monospace" }}>{it.sku}</td><td className="py-2">{it.size}</td><td className="py-2">{it.color}</td><td className="py-2">{it.qty}</td><td className="py-2">${it.price}</td></tr>
              ))}</tbody>
            </table>
            <div className="text-right text-sm font-medium mt-2">Total: ${draft.value.toLocaleString()}</div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm text-gray-500">Customer</div><div className="text-sm">{draft.customer}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* PRODUCTS                                                                */
/* ---------------------------------------------------------------------- */

function ProductDetail({ product, onBack, onSave, allCollections, reviews }) {
  const isNew = !product;
  const [name, setName] = useState(product?.name || "");
  const [description, setDescription] = useState(product?.description || "");
  const [sku, setSku] = useState(product?.sku || "");
  const [barcode, setBarcode] = useState(product?.barcode || "");
  const [price, setPrice] = useState(product?.price ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(product?.compareAtPrice ?? "");
  const [costPerItem, setCostPerItem] = useState(product?.costPerItem ?? "");
  const [weight, setWeight] = useState(product?.weight ?? "");
  const [status, setStatus] = useState(product?.status || "active");
  const [vendor, setVendor] = useState(product?.vendor || "");
  const [productType, setProductType] = useState(product?.productType || "");
  const [trackQuantity, setTrackQuantity] = useState(product?.trackQuantity ?? true);
  const [imageCount, setImageCount] = useState(product?.imageCount || 0);
  const [collectionsSel, setCollectionsSel] = useState(product?.collections || []);
  const [tags, setTags] = useState(product?.tags || []);
  const [tagDraft, setTagDraft] = useState("");
  const [seoTitle, setSeoTitle] = useState(product?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(product?.seoDescription || "");
  const [variants, setVariants] = useState(product?.variants || []);
  const [newSize, setNewSize] = useState("");
  const [newColor, setNewColor] = useState("");

  const margin = price && costPerItem ? (((Number(price) - Number(costPerItem)) / Number(price)) * 100).toFixed(1) : null;
  const totalStock = variants.reduce((s, v) => s + v.stock, 0);
  const productReviews = (reviews || []).filter((r) => r.product === (product?.name || name));

  function addVariant() {
    if (!newSize || !newColor) return;
    setVariants((v) => [...v, { size: newSize, color: newColor, stock: 0 }]);
    setNewSize(""); setNewColor("");
  }
  function updateStock(idx, val) {
    setVariants((v) => v.map((row, i) => (i === idx ? { ...row, stock: Number(val) || 0 } : row)));
  }
  function removeVariant(idx) {
    setVariants((v) => v.filter((_, i) => i !== idx));
  }
  function toggleCollection(name) {
    setCollectionsSel((c) => (c.includes(name) ? c.filter((x) => x !== name) : [...c, name]));
  }
  function addTag() {
    if (!tagDraft.trim()) return;
    setTags((t) => [...t, tagDraft.trim()]);
    setTagDraft("");
  }
  function handleSave() {
    onSave({
      id: product?.id || `p${Date.now()}`, name, description, sku, barcode, price: Number(price) || 0,
      compareAtPrice: compareAtPrice === "" ? null : Number(compareAtPrice), costPerItem: Number(costPerItem) || 0,
      weight: Number(weight) || 0, status, vendor, productType, trackQuantity, imageCount, collections: collectionsSel,
      tags, seoTitle, seoDescription, variants, revenue: product?.revenue || 0,
    });
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to products</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{isNew ? "New product" : name} {!isNew && <Badge status={status} />}</h2>
        <div className="flex gap-2"><Btn onClick={onBack}>Discard</Btn><Btn variant="primary" onClick={handleSave}>Save product</Btn></div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <Field label="Title"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Classic Crewneck Tee" /></Field>
            <Field label="Description"><TextArea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the product for your buyers" /></Field>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Media</div>
            <div className="flex flex-wrap gap-2">
              {Array.from({ length: imageCount }).map((_, i) => (
                <div key={i} className="w-16 h-16 bg-gray-100 rounded flex items-center justify-center"><Image size={20} className="text-gray-400" /></div>
              ))}
              <button onClick={() => setImageCount((n) => n + 1)} className="w-16 h-16 border border-dashed border-gray-300 rounded flex items-center justify-center text-gray-400 hover:bg-gray-50"><Plus size={16} /></button>
            </div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Pricing</div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Price"><TextInput value={price} onChange={(e) => setPrice(e.target.value)} placeholder="8.50" /></Field>
              <Field label="Compare-at price"><TextInput value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="10.00" /></Field>
              <Field label="Cost per item"><TextInput value={costPerItem} onChange={(e) => setCostPerItem(e.target.value)} placeholder="3.80" /></Field>
            </div>
            {margin && <div className="text-xs text-gray-500">Margin: <span style={{ color: "#1a8f5c" }} className="font-medium">{margin}%</span></div>}
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Inventory</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="SKU"><TextInput value={sku} onChange={(e) => setSku(e.target.value)} placeholder="CT-100" /></Field>
              <Field label="Barcode"><TextInput value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="810040112301" /></Field>
            </div>
            <div className="flex items-center justify-between"><span className="text-sm">Track quantity</span><Toggle checked={trackQuantity} onChange={setTrackQuantity} /></div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Shipping</div>
            <Field label="Weight (lb)"><TextInput value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="0.35" /></Field>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Size &times; color variants</div>
            <table className="w-full text-sm mb-3">
              <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-1.5 font-normal">Size</th><th className="text-left py-1.5 font-normal">Color</th><th className="text-left py-1.5 font-normal">Stock</th><th></th></tr></thead>
              <tbody>{variants.map((v, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1.5">{v.size}</td><td className="py-1.5">{v.color}</td>
                  <td className="py-1.5"><input value={v.stock} onChange={(e) => updateStock(i, e.target.value)} className="w-16 border border-gray-300 rounded px-1.5 py-0.5" /></td>
                  <td className="py-1.5"><button onClick={() => removeVariant(i)}><Trash2 size={13} className="text-gray-400" /></button></td>
                </tr>
              ))}</tbody>
            </table>
            <div className="flex gap-2">
              <TextInput value={newSize} onChange={(e) => setNewSize(e.target.value)} placeholder="Size (e.g. M)" />
              <TextInput value={newColor} onChange={(e) => setNewColor(e.target.value)} placeholder="Color (e.g. Black)" />
              <Btn onClick={addVariant}><Plus size={13} />Add</Btn>
            </div>
            <div className="text-xs text-gray-400 mt-2">{totalStock} units in stock across {variants.length} variants</div>
          </div>

          {!isNew && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium mb-3">Reviews</div>
              {productReviews.length === 0 ? <div className="text-sm text-gray-400">No reviews yet.</div> : (
                <div className="space-y-3">
                  {productReviews.map((r) => (
                    <div key={r.id} className="border-b border-gray-100 pb-2 last:border-0">
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} fill={i < r.rating ? "#f59e0b" : "none"} stroke={i < r.rating ? "#f59e0b" : "#d1d5db"} />)}
                        <span>{r.customer}</span>
                      </div>
                      <div className="text-sm text-gray-700 mt-1">{r.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Status</div>
            <Select value={status} onChange={setStatus} options={["active", "draft", "inactive"]} />
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-3">Organization</div>
            <Field label="Vendor"><TextInput value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="S&S Activewear" /></Field>
            <Field label="Product type"><TextInput value={productType} onChange={(e) => setProductType(e.target.value)} placeholder="T-Shirt" /></Field>
            <div className="mb-3">
              <div className="text-sm text-gray-700 mb-1">Collections</div>
              <div className="space-y-1">
                {(allCollections || []).map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={collectionsSel.includes(c)} onChange={() => toggleCollection(c)} />{c}
                  </label>
                ))}
              </div>
            </div>
            <div className="text-sm text-gray-700 mb-1">Tags</div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.map((t) => <span key={t} className="text-xs bg-gray-100 px-2 py-0.5 rounded flex items-center gap-1">{t}<button onClick={() => setTags((ts) => ts.filter((x) => x !== t))}><X size={10} /></button></span>)}
            </div>
            <div className="flex gap-2"><TextInput value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} placeholder="Add tag" /><Btn onClick={addTag}><Plus size={13} /></Btn></div>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Search engine listing</div>
            <Field label="Page title"><TextInput value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} /></Field>
            <Field label="Meta description"><TextArea rows={2} value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} /></Field>
            <div className="bg-gray-50 rounded p-2 mt-2">
              <div className="text-xs" style={{ color: "#1a0dab" }}>{seoTitle || name || "Product title"}</div>
              <div className="text-xs text-green-700">freshbasicsco.myat360.com/products/{(sku || "product").toLowerCase()}</div>
              <div className="text-xs text-gray-500">{seoDescription || "Meta description preview appears here."}</div>
            </div>
          </div>

          {!isNew && (
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-medium mb-2">Sales performance</div>
              <div className="text-2xl font-medium" style={{ color: "#1d3c73" }}>${(product.revenue || 0).toLocaleString()}</div>
              <div className="text-xs text-gray-500">Total revenue to date</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function InventoryView({ products }) {
  const rows = products.flatMap((p) => p.variants.map((v) => ({ id: `${p.id}-${v.size}-${v.color}`, product: p.name, size: v.size, color: v.color, stock: v.stock })));
  return (
    <ListView
      title="Inventory"
      data={rows}
      searchFields={["product", "size", "color"]}
      columns={[
        { key: "product", label: "Product" }, { key: "size", label: "Size" }, { key: "color", label: "Color" },
        { key: "stock", label: "Stock", render: (r) => (
          <span className={r.stock === 0 ? "text-red-600 font-medium" : r.stock <= 15 ? "text-amber-600 font-medium" : ""}>
            {r.stock} {r.stock === 0 ? "(out of stock)" : r.stock <= 15 ? "(low)" : ""}
          </span>
        )},
      ]}
    />
  );
}

function CollectionDetail({ collection, allProducts, onBack, onSave }) {
  const isNew = !collection;
  const [name, setName] = useState(collection?.name || "");
  const [description, setDescription] = useState(collection?.description || "");
  const [type, setType] = useState(collection?.type || "manual");
  const [status, setStatus] = useState(collection?.status || "active");
  const [seoTitle, setSeoTitle] = useState(collection?.seoTitle || "");
  const [conditions, setConditions] = useState(collection?.conditions || [{ field: "productType", op: "=", value: "" }]);
  const members = allProducts.filter((p) => (p.collections || []).includes(collection?.name));

  function updateCond(i, patch) { setConditions((c) => c.map((cond, idx) => (idx === i ? { ...cond, ...patch } : cond))); }
  function addCond() { setConditions((c) => [...c, { field: "productType", op: "=", value: "" }]); }

  function handleSave() {
    onSave({ id: collection?.id || `col${Date.now()}`, name, description, type, status, seoTitle, seoDescription: collection?.seoDescription || "", conditions: type === "automated" ? conditions : undefined });
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to collections</button>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-medium flex items-center gap-2">{isNew ? "New collection" : name} {!isNew && <Badge status={status} />}</h2>
        <div className="flex gap-2"><Btn onClick={onBack}>Discard</Btn><Btn variant="primary" onClick={handleSave}>Save collection</Btn></div>
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <Field label="Title"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Description"><TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Collection type</div>
            <Select value={type} onChange={setType} options={["manual", "automated"]} />
            {type === "automated" ? (
              <div className="mt-3 space-y-2">
                <div className="text-xs text-gray-500 mb-1">Products matching these conditions are added automatically.</div>
                {conditions.map((c, i) => (
                  <div key={i} className="flex gap-2">
                    <Select value={c.field} onChange={(v) => updateCond(i, { field: v })} options={["productType", "vendor", "tags"]} />
                    <Select value={c.op} onChange={(v) => updateCond(i, { op: v })} options={["=", "contains"]} />
                    <TextInput value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} placeholder="Value" />
                  </div>
                ))}
                <Btn onClick={addCond}><Plus size={13} />Add condition</Btn>
              </div>
            ) : (
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-2">{members.length} products in this collection</div>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {allProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50">
                      <span>{p.name}</span>
                      <Badge status={members.includes(p) ? "active" : "inactive"} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Status</div>
            <Select value={status} onChange={setStatus} options={["active", "hidden"]} />
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Search engine listing</div>
            <Field label="Page title"><TextInput value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} /></Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewDetail({ review, onBack, onSave }) {
  const [reply, setReply] = useState(review.reply || "");
  const [status, setStatus] = useState(review.status);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to reviews</button>
      <div className="max-w-lg">
        <div className="flex items-center gap-2 mb-1">
          {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={16} fill={i < review.rating ? "#f59e0b" : "none"} stroke={i < review.rating ? "#f59e0b" : "#d1d5db"} />)}
          <Badge status={status} />
        </div>
        <div className="text-sm text-gray-500 mb-4">{review.product} &middot; {review.customer}</div>
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <div className="text-sm text-gray-700">{review.body}</div>
        </div>
        <Field label="Reply to this review"><TextArea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} /></Field>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm">Published</span>
          <Toggle checked={status === "published"} onChange={(v) => setStatus(v ? "published" : "pending")} />
        </div>
        <Btn variant="primary" onClick={() => onSave({ ...review, reply, status })}>Save</Btn>
      </div>
    </div>
  );
}

function CustomerDetail({ customer, orders, onBack, onSave, onOpenOrder }) {
  const [tier, setTier] = useState(customer.tier);
  const [taxExempt, setTaxExempt] = useState(customer.taxExempt);
  const [notes, setNotes] = useState(customer.notes);
  const history = orders.filter((o) => o.customer === customer.name);
  const lifetimeSpend = history.reduce((s, o) => s + o.total, 0);

  function handleSave() {
    onSave({ ...customer, tier, taxExempt, notes });
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to customers</button>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-5">
          <div>
            <h2 className="text-lg font-medium mb-1">{customer.name}</h2>
            <div className="text-sm text-gray-500">{customer.email} &middot; {customer.phone}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Order history</div>
            {history.length === 0 ? <EmptyState label="No orders yet." /> : (
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Order</th><th className="text-left py-2 font-normal">Date</th><th className="text-left py-2 font-normal">Status</th><th className="text-left py-2 font-normal">Total</th></tr></thead>
                <tbody>{history.map((o) => (
                  <tr key={o.id} onClick={() => onOpenOrder(o.id)} className="border-b border-gray-100 cursor-pointer hover:bg-gray-50"><td className="py-2">{o.id}</td><td className="py-2">{o.date}</td><td className="py-2"><Badge status={o.status} /></td><td className="py-2">${o.total.toLocaleString()}</td></tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
        <div className="space-y-5">
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Address</div>
            <div className="text-sm text-gray-700">{customer.address}</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="text-sm font-medium mb-2">Lifetime value</div>
            <div className="text-2xl font-medium" style={{ color: "#1d3c73" }}>${lifetimeSpend.toLocaleString()}</div>
            <div className="text-xs text-gray-500">{history.length} orders placed</div>
          </div>
          <div className="border border-gray-200 rounded-lg p-4">
            <Field label="Tier"><Select value={tier} onChange={setTier} options={["Bronze", "Silver", "Gold", "Platinum"]} /></Field>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-gray-700">Tax exempt</span>
              <Toggle checked={taxExempt} onChange={setTaxExempt} />
            </div>
            <Field label="Internal notes"><TextArea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
            <Btn variant="primary" onClick={handleSave}>Save changes</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalsView({ customers, onDecision }) {
  const [tab, setTab] = useState("pending");
  const [reasonId, setReasonId] = useState(null);
  const [reason, setReason] = useState("");
  const rows = customers.filter((c) => c.status === tab);
  const counts = { pending: customers.filter((c) => c.status === "pending").length, approved: customers.filter((c) => c.status === "approved").length, rejected: customers.filter((c) => c.status === "rejected").length };

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Wholesale approvals</h2>
      <div className="flex gap-1 mb-4">
        {["pending", "approved", "rejected"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`text-xs px-3 py-1.5 rounded capitalize ${tab === t ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>{t} ({counts[t]})</button>
        ))}
      </div>
      {rows.length === 0 ? <EmptyState label={`No ${tab} accounts.`} /> : (
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{c.name}</div>
                  <div className="text-xs text-gray-500">{c.email} &middot; {c.location}</div>
                </div>
                {tab === "pending" && (
                  <div className="flex gap-2">
                    <Btn variant="primary" onClick={() => onDecision(c.id, "approved")}><Check size={13} />Approve</Btn>
                    <Btn variant="danger" onClick={() => setReasonId(c.id)}><X size={13} />Reject</Btn>
                  </div>
                )}
              </div>
              {reasonId === c.id && (
                <div className="mt-2 flex gap-2">
                  <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" />
                  <Btn variant="danger" onClick={() => { onDecision(c.id, "rejected"); setReasonId(null); setReason(""); }}>Confirm</Btn>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SegmentsView({ customers }) {
  const [conditions, setConditions] = useState([{ field: "spend", op: ">", value: "" }]);
  const [segments, setSegments] = useState([{ name: "Big spenders", conditions: [{ field: "spend", op: ">", value: "10000" }] }]);
  const [segName, setSegName] = useState("");

  function updateCond(i, patch) { setConditions((c) => c.map((cond, idx) => (idx === i ? { ...cond, ...patch } : cond))); }
  function addCond() { setConditions((c) => [...c, { field: "spend", op: ">", value: "" }]); }
  function removeCond(i) { setConditions((c) => c.filter((_, idx) => idx !== i)); }
  function matches(customer, conds) {
    return conds.every((c) => {
      const val = customer[c.field];
      if (!c.value) return true;
      if (c.op === ">") return Number(val) > Number(c.value);
      if (c.op === "<") return Number(val) < Number(c.value);
      return String(val).toLowerCase() === String(c.value).toLowerCase();
    });
  }
  const preview = customers.filter((c) => matches(c, conditions));
  function saveSegment() {
    if (!segName) return;
    setSegments((s) => [...s, { name: segName, conditions }]);
    setSegName(""); setConditions([{ field: "spend", op: ">", value: "" }]);
  }

  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Customer segments</h2>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm font-medium mb-2">Build a segment</div>
          {conditions.map((c, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <Select value={c.field} onChange={(v) => updateCond(i, { field: v })} options={["spend", "orders", "tier", "location"]} />
              <Select value={c.op} onChange={(v) => updateCond(i, { op: v })} options={[">", "<", "="]} />
              <TextInput value={c.value} onChange={(e) => updateCond(i, { value: e.target.value })} placeholder="Value" />
              <button onClick={() => removeCond(i)}><X size={14} className="text-gray-400" /></button>
            </div>
          ))}
          <Btn onClick={addCond} className="mb-4"><Plus size={13} />Add condition</Btn>
          <div className="text-xs text-gray-500 mb-3">{preview.length} customers match</div>
          <div className="flex gap-2">
            <TextInput value={segName} onChange={(e) => setSegName(e.target.value)} placeholder="Segment name" />
            <Btn variant="primary" onClick={saveSegment}>Save segment</Btn>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Saved segments</div>
          <div className="space-y-2">
            {segments.map((s, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-3 text-sm flex justify-between">
                <span>{s.name}</span>
                <span className="text-gray-500">{customers.filter((c) => matches(c, s.conditions)).length} customers</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TiersView({ tiers, setTiers, customers }) {
  function updateDiscount(name, val) {
    setTiers((t) => t.map((row) => (row.name === name ? { ...row, discount: Number(val) || 0 } : row)));
  }
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Discount groups and tiers</h2>
      <table className="w-full text-sm">
        <thead><tr className="border-b border-gray-200 text-gray-500"><th className="text-left py-2 font-normal">Tier</th><th className="text-left py-2 font-normal">Discount</th><th className="text-left py-2 font-normal">Members</th></tr></thead>
        <tbody>{tiers.map((t) => (
          <tr key={t.name} className="border-b border-gray-100">
            <td className="py-2.5">{t.name}</td>
            <td className="py-2.5"><input value={t.discount} onChange={(e) => updateDiscount(t.name, e.target.value)} className="w-14 border border-gray-300 rounded px-1.5 py-0.5" />%</td>
            <td className="py-2.5">{customers.filter((c) => c.tier === t.name).length}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* MARKETING / ONLINE STORE                                                */
/* ---------------------------------------------------------------------- */

function DiscountForm({ record, onBack, onSave }) {
  const [title, setTitle] = useState(record?.title || "");
  const [type, setType] = useState(record?.type || "percentage");
  const [value, setValue] = useState(record?.value || "");
  const [code, setCode] = useState(record?.code || "");
  const [active, setActive] = useState(record ? record.status === "active" : true);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to discounts</button>
      <h2 className="text-lg font-medium mb-4">{record ? "Edit discount" : "New discount"}</h2>
      <div className="max-w-md">
        <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Type"><Select value={type} onChange={setType} options={["percentage", "fixed", "bogo", "free shipping"]} /></Field>
        <Field label="Value"><TextInput value={value} onChange={(e) => setValue(e.target.value)} placeholder="10%" /></Field>
        <Field label="Discount code"><TextInput value={code} onChange={(e) => setCode(e.target.value)} placeholder="CODE10" /></Field>
        <div className="flex items-center justify-between mb-4"><span className="text-sm">Active</span><Toggle checked={active} onChange={setActive} /></div>
        <Btn variant="primary" onClick={() => onSave({ id: record?.id || `d${Date.now()}`, title, type, value, code, status: active ? "active" : "expired" })}>Save discount</Btn>
      </div>
    </div>
  );
}

function EditorForm({ record, onBack, onSave, kind }) {
  const [title, setTitle] = useState(record?.title || "");
  const [body, setBody] = useState(record?.body || "");
  const [published, setPublished] = useState(record ? record.status === "published" : false);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-gray-500 mb-4"><ChevronLeft size={14} />Back to {kind === "blog" ? "blogs" : "pages"}</button>
      <h2 className="text-lg font-medium mb-4">{record ? "Edit" : "New"} {kind === "blog" ? "post" : "page"}</h2>
      <div className="max-w-lg">
        <Field label="Title"><TextInput value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Content"><TextArea rows={8} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex items-center justify-between mb-4"><span className="text-sm">Published</span><Toggle checked={published} onChange={setPublished} /></div>
        <Btn variant="primary" onClick={() => onSave({ id: record?.id || `${kind}${Date.now()}`, title, body, author: record?.author || "AT360 Team", status: published ? "published" : "draft" })}>Save {kind === "blog" ? "post" : "page"}</Btn>
      </div>
    </div>
  );
}

function SeoPanel({ pages }) {
  const [pageId, setPageId] = useState(pages[0]?.id);
  const [meta, setMeta] = useState({});
  const current = meta[pageId] || { title: "", desc: "" };
  function update(field, val) { setMeta((m) => ({ ...m, [pageId]: { ...current, [field]: val } })); }
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">On page SEO</h2>
      <div className="max-w-md">
        <Field label="Page"><Select value={pageId} onChange={setPageId} options={pages.map((p) => p.id)} /></Field>
        <Field label="Meta title"><TextInput value={current.title} onChange={(e) => update("title", e.target.value)} /></Field>
        <Field label="Meta description"><TextArea rows={3} value={current.desc} onChange={(e) => update("desc", e.target.value)} /></Field>
        <Btn variant="primary">Save SEO settings</Btn>
      </div>
    </div>
  );
}

function MenusBuilder() {
  const [items, setItems] = useState([{ label: "Shop", link: "/shop" }, { label: "About", link: "/about" }, { label: "Wholesale", link: "/wholesale" }]);
  const [label, setLabel] = useState("");
  const [link, setLink] = useState("");
  function add() { if (!label) return; setItems((i) => [...i, { label, link }]); setLabel(""); setLink(""); }
  function remove(i) { setItems((it) => it.filter((_, idx) => idx !== i)); }
  function move(i, dir) {
    setItems((it) => {
      const copy = [...it];
      const target = i + dir;
      if (target < 0 || target >= copy.length) return copy;
      [copy[i], copy[target]] = [copy[target], copy[i]];
      return copy;
    });
  }
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Menus</h2>
      <div className="max-w-md space-y-2 mb-4">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 border border-gray-200 rounded px-3 py-2 text-sm">
            <span className="flex-1">{it.label} &rarr; {it.link}</span>
            <button onClick={() => move(i, -1)}><ArrowUp size={13} className="text-gray-400" /></button>
            <button onClick={() => move(i, 1)}><ArrowDown size={13} className="text-gray-400" /></button>
            <button onClick={() => remove(i)}><Trash2 size={13} className="text-gray-400" /></button>
          </div>
        ))}
      </div>
      <div className="flex gap-2 max-w-md">
        <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />
        <TextInput value={link} onChange={(e) => setLink(e.target.value)} placeholder="/link" />
        <Btn onClick={add}><Plus size={13} />Add</Btn>
      </div>
    </div>
  );
}

const THEME_COLORS = ["#111827", "#1d4ed8", "#0f766e", "#b45309", "#7e22ce"];

function StorefrontTheme() {
  const [color, setColor] = useState(THEME_COLORS[0]);
  const [logoText, setLogoText] = useState("Fresh Basics Co.");
  const [font, setFont] = useState("Inter");
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Storefront theme</h2>
      <div className="grid grid-cols-2 gap-6 max-w-2xl">
        <div>
          <Field label="Store name / logo text"><TextInput value={logoText} onChange={(e) => setLogoText(e.target.value)} /></Field>
          <Field label="Font"><Select value={font} onChange={setFont} options={["Inter", "Sohne", "Georgia", "Helvetica"]} /></Field>
          <div className="mb-2 text-sm text-gray-700">Primary color</div>
          <div className="flex gap-2">
            {THEME_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ background: c }} className={`w-8 h-8 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-gray-400" : ""}`} />
            ))}
          </div>
        </div>
        <div>
          <div className="text-sm text-gray-700 mb-2">Preview</div>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <div style={{ background: color, fontFamily: font }} className="px-4 py-3 text-white text-sm font-medium">{logoText}</div>
            <div className="p-4 text-sm text-gray-500">Storefront content preview</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomainsPanel() {
  // The live store address, derived from the real host + the current brand —
  // no placeholders. Custom domains are provisioned at the platform level
  // (DNS + TLS), so this screen reports the real URL rather than faking an add.
  const [storeUrl, setStoreUrl] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const slug = new URLSearchParams(window.location.search).get("tenant");
    setStoreUrl(slug ? `${window.location.origin}/?tenant=${slug}` : window.location.origin + "/");
  }, []);
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Domains</h2>
      <div className="max-w-lg space-y-3">
        <div className="border border-gray-200 rounded px-3 py-2.5 text-sm flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500 mb-0.5">Primary store address</div>
            {storeUrl
              ? <a href={storeUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline break-all">{storeUrl}</a>
              : <span className="text-gray-400">—</span>}
          </div>
          <span className="text-xs bg-gray-100 px-2 py-0.5 rounded shrink-0 ml-2">Live</span>
        </div>
        <div className="text-sm text-gray-500 leading-relaxed">
          Connecting a custom domain (e.g. <span className="text-gray-700">www.yourbrand.com</span>) requires DNS and TLS
          setup handled at the platform level. Ask your platform administrator to provision it for this brand.
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* ANALYTICS                                                               */
/* ---------------------------------------------------------------------- */

function AnalyticsScreen({ products, customers }) {
  const topProducts = [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const tierCounts = ["Bronze", "Silver", "Gold", "Platinum"].map((t) => ({ name: t, value: customers.filter((c) => c.tier === t).length }));
  return (
    <div>
      <h2 className="text-lg font-medium mb-4">Analytics</h2>
      <div className="mb-6">
        <div className="text-sm font-medium mb-2">Sales, last 8 weeks</div>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={salesTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="week" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="sales" stroke="#111827" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div>
          <div className="text-sm font-medium mb-2">Top products by revenue</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topProducts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#111827" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium mb-2">Customers by tier</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierCounts} dataKey="value" nameKey="name" outerRadius={80} label>
                  {tierCounts.map((entry, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* SETTINGS                                                                 */
/* ---------------------------------------------------------------------- */

// Each section renders the REAL, already-built settings screen (saves to the
// backend, store-isolated). No mock users/plans/locations — the earlier
// prototype hardcoded those and never persisted anything.
const SETTINGS_SECTIONS = [
  { id: "general", label: "General", Comp: AdminSettingsPage },
  { id: "users", label: "Users & roles", Comp: AdminUsersPage },
  { id: "roles", label: "Roles & permissions", Comp: RolesPage },
  { id: "tax", label: "Taxes & duties", Comp: TaxesPage },
  { id: "security", label: "Security (2FA)", Comp: SecurityPage },
  { id: "audit", label: "Audit log", Comp: AuditLogPage },
];

function SettingsScreen() {
  const [sectionId, setSectionId] = useState("general");
  const active = SETTINGS_SECTIONS.find((s) => s.id === sectionId) || SETTINGS_SECTIONS[0];
  const ActiveComp = active.Comp;
  return (
    <div className="flex gap-8">
      <div className="w-48 flex-shrink-0">
        {SETTINGS_SECTIONS.map((s) => (
          <button key={s.id} onClick={() => setSectionId(s.id)} className={`block w-full text-left text-sm px-3 py-2 rounded mb-0.5 ${sectionId === s.id ? "bg-gray-100 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>{s.label}</button>
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <ActiveComp />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* NAV + SHELL                                                             */
/* ---------------------------------------------------------------------- */

const NAV = [
  { id: "home", label: "Home", icon: Home },
  { id: "orders-group", label: "Orders", icon: ShoppingCart, children: [
    { id: "orders", label: "Orders" }, { id: "abandoned", label: "Abandoned checkouts" }, { id: "drafts", label: "Drafts" },
    { id: "shipping-labels", label: "Shipping labels" }, { id: "returns", label: "Returns" }, { id: "pos", label: "Purchase orders" },
  ]},
  { id: "products-group", label: "Products", icon: Package, children: [
    { id: "products", label: "Products" }, { id: "collections", label: "Collections" }, { id: "inventory", label: "Inventory" }, { id: "reviews", label: "Reviews" },
    { id: "supplier", label: "Supplier catalog (S&S)" }, { id: "gangsheets", label: "Gang sheets" }, { id: "productspecs", label: "Product specs" },
  ]},
  { id: "customers-group", label: "Customers", icon: Users, children: [
    { id: "customers", label: "Customers" }, { id: "approvals", label: "Wholesale approvals" }, { id: "segments", label: "Segments" }, { id: "tiers", label: "Discount groups" },
    { id: "messages", label: "Messages" },
  ]},
  { id: "marketing-group", label: "Marketing", icon: Megaphone, children: [
    { id: "discounts", label: "Discounts" }, { id: "stdshipping", label: "Standard shipping" }, { id: "blogs", label: "Blogs" }, { id: "stylesheets", label: "Style sheets" }, { id: "seo", label: "SEO" },
  ]},
  { id: "store-group", label: "Online Store", icon: Store, children: [
    { id: "pages", label: "Pages" }, { id: "menus", label: "Menus" }, { id: "theme", label: "Storefront theme" }, { id: "media", label: "Media library" }, { id: "domains", label: "Domains" },
  ]},
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function findGroupFor(view) {
  for (const item of NAV) if (item.children && item.children.some((c) => c.id === view)) return item.id;
  return null;
}

function Sidebar({ view, setView, expanded, setExpanded, brandName }) {
  return (
    <div style={{ background: "#1d3c73" }} className="w-56 flex-shrink-0 p-3">
      <style>{`.nav-dark:hover { background: rgba(255,255,255,0.07); }`}</style>
      <div className="text-sm font-medium px-2 pb-4 text-white">{brandName || " "}</div>
      <nav className="space-y-0.5">
        {NAV.map((item) => {
          const Icon = item.icon;
          if (!item.children) {
            const active = view === item.id;
            return (
              <div
                key={item.id}
                onClick={() => setView(item.id)}
                style={{ borderLeft: active ? "3px solid #24b574" : "3px solid transparent", background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? "#ffffff" : "rgba(255,255,255,0.65)" }}
                className="nav-dark flex items-center gap-2 pl-2.5 pr-2.5 py-2 rounded text-sm cursor-pointer"
              >
                <Icon size={16} />{item.label}
              </div>
            );
          }
          const isOpen = expanded === item.id;
          return (
            <div key={item.id}>
              <div onClick={() => setExpanded(isOpen ? null : item.id)} style={{ color: "rgba(255,255,255,0.65)" }} className="nav-dark flex items-center justify-between px-2.5 py-2 rounded text-sm cursor-pointer">
                <span className="flex items-center gap-2"><Icon size={16} />{item.label}</span>
                <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
              {isOpen && (
                <div className="ml-4 space-y-0.5 mb-1">
                  {item.children.map((c) => {
                    const active = view === c.id;
                    return (
                      <div
                        key={c.id}
                        onClick={() => setView(c.id)}
                        style={{ borderLeft: active ? "3px solid #24b574" : "3px solid transparent", background: active ? "rgba(255,255,255,0.08)" : "transparent", color: active ? "#ffffff" : "rgba(255,255,255,0.6)" }}
                        className="nav-dark pl-2.5 pr-2.5 py-1.5 rounded text-sm cursor-pointer"
                      >
                        {c.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}

function Topbar({ brandName }) {
  const initials = initialsOf(brandName);
  return (
    <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200">
      <div className="flex items-center gap-2 border border-gray-300 rounded px-2.5 py-1.5 w-64">
        <Search size={14} className="text-gray-400" />
        <input placeholder="Search" className="text-sm outline-none flex-1" />
      </div>
      <div className="flex items-center gap-4 text-gray-500">
        <Bell size={18} />
        <div title={brandName || ""} style={{ background: "rgba(36,181,116,0.14)", color: "#1a8f5c" }} className="w-7 h-7 rounded-full text-xs font-medium flex items-center justify-center">{initials}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* APP ROOT                                                                 */
/* ---------------------------------------------------------------------- */

export default function App() {
  // Auth guard — this is the real admin now. Wait a beat so an impersonation
  // token (#session=…) can be processed by AuthInitializer before bouncing.
  const router = useRouter();
  const { isAuthenticated, isLoading } = useAuthStore();
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (!useAuthStore.getState().isAuthenticated()) router.replace("/login");
      else setAuthChecked(true);
    }, 450);
    return () => clearTimeout(t);
  }, [router]);

  const [view, setViewRaw] = useState("home");
  const [expanded, setExpanded] = useState("orders-group");
  const [openId, setOpenId] = useState(null);
  const [drawer, setDrawer] = useState(null);

  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [discounts, setDiscounts] = useState([]);
  const [blogs, setBlogs] = useState([]);
  const [pages, setPages] = useState([]);
  const [abandoned, setAbandoned] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [returns, setReturns] = useState([]);
  const [pos, setPos] = useState([]);
  const [collections, setCollections] = useState([]);
  const [reviews, setReviews] = useState([]);

  // The brand whose admin this is — its store name drives the sidebar title,
  // greeting and avatar initials. Comes from the tenant's own branding record.
  const [brandName, setBrandName] = useState("");
  useEffect(() => {
    let alive = true;
    apiClient.get("/api/v1/admin/storefront")
      .then((b) => { if (alive && b?.store_name && b.store_name !== "Store") setBrandName(b.store_name); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Real dashboard data — loads when an admin is signed in (api-client attaches
  // the token); otherwise the screen keeps its mock data. First wired screen of
  // the real-data migration.
  const [dash, setDash] = useState(null);
  useEffect(() => {
    Promise.allSettled([
      apiClient.get("/api/v1/admin/reports/sales?period=week"),
      apiClient.get("/api/v1/admin/wholesale-applications?status=pending"),
      apiClient.get("/api/v1/admin/reports/inventory?low_stock_only=true"),
      apiClient.get("/api/v1/admin/orders?page_size=10"),
      apiClient.get("/api/v1/admin/orders?status=pending&page_size=50"),
    ]).then(([salesRes, appsRes, stockRes, ordersRes, pendingRes]) => {
      const d = {};
      let any = false;
      if (salesRes.status === "fulfilled") {
        const s = salesRes.value?.summary || {};
        d.salesThisWeek = s.total_revenue ?? 0;
        d.ordersCount = s.total_orders ?? 0;
        d.aov = Math.round(s.avg_order_value ?? 0);
        any = true;
      }
      d.netTermsOutstanding = 0;
      if (appsRes.status === "fulfilled") { d.pendingApprovals = Array.isArray(appsRes.value) ? appsRes.value.length : 0; any = true; }
      if (stockRes.status === "fulfilled") { d.lowStock = Array.isArray(stockRes.value) ? stockRes.value.length : 0; any = true; }
      if (pendingRes.status === "fulfilled") { d.awaitingFulfillment = (pendingRes.value?.items || []).length; any = true; }
      if (ordersRes.status === "fulfilled") {
        const items = ordersRes.value?.items || [];
        d.recent = items.slice(0, 5).map((o) => ({ id: o.order_number, customer: o.company?.name ?? o.company_name ?? "—", status: o.status, total: Number(o.total) || 0 }));
        const now = new Date();
        d.salesTrend = Array.from({ length: 8 }, (_, i) => {
          const dt = new Date(now); dt.setDate(dt.getDate() - (7 - i));
          const key = dt.toISOString().split("T")[0];
          const sales = items.filter((o) => o.created_at?.startsWith(key)).reduce((s, o) => s + (Number(o.total) || 0), 0);
          return { week: dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }), sales };
        });
        any = true;
      }
      if (any) setDash(d);
    }).catch(() => {});
  }, []);

  // Real catalog / orders / customers — replaces the old mock seeds. When an
  // endpoint returns nothing, the screen shows its "nothing found" empty state.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await apiClient.get("/api/v1/admin/orders?page_size=100");
        const items = res?.items || [];
        if (alive) setOrders(items.map((o) => ({
          id: o.order_number || o.id, _id: o.id,
          customer: o.company?.name || o.company_name || o.guest_name || "Guest",
          date: o.created_at ? new Date(o.created_at).toLocaleDateString() : "—",
          status: o.status, total: Number(o.total) || 0,
          payment: o.payment_terms === "net_30" ? "net terms" : (o.payment_status || "—"),
          items: (o.items || []).map((it) => ({ name: it.product_name, qty: it.quantity, price: Number(it.unit_price) || 0, fulfilled: o.status === "fulfilled" || o.status === "delivered" })),
          timeline: [], tags: [],
        })));
      } catch { /* leave empty */ }
      try {
        const list = await apiClient.get("/api/v1/admin/products");
        const arr = Array.isArray(list) ? list : (list?.items || []);
        if (alive) setProducts(arr.map((p) => ({
          id: p.id, name: p.name, sku: p.sku || p.product_code || p.variants?.[0]?.sku || "—",
          price: Number(p.price ?? p.variants?.[0]?.retail_price ?? 0), compareAtPrice: null, costPerItem: 0,
          status: p.status || "active", revenue: 0, vendor: p.vendor || "", productType: p.product_type || "",
          weight: 0, trackQuantity: true, imageCount: p.images?.length ?? 0, collections: [], tags: [],
          description: p.description || "", seoTitle: "", seoDescription: "",
          variants: (p.variants || []).map((v) => ({ size: v.size || "—", color: v.color || "—", stock: v.stock_quantity ?? 0 })),
        })));
      } catch { /* leave empty */ }
      try {
        const res = await apiClient.get("/api/v1/admin/companies?page_size=100");
        const items = res?.items || [];
        if (alive) setCustomers(items.map((c) => ({
          id: c.id, name: c.name || c.trading_name || "—", email: c.company_email || "—",
          phone: c.phone || "", address: [c.address_line1, c.city, c.state_province].filter(Boolean).join(", ") || "—",
          tier: c.pricing_tier_name || "—", taxExempt: !!c.tax_exempt,
          status: c.status === "active" ? "approved" : (c.status || "pending"),
          spend: Number(c.total_spend ?? 0), orders: c.order_count ?? 0,
          location: c.state_province || c.country || "—", notes: c.admin_notes || "",
        })));
      } catch { /* leave empty */ }
    })();
    return () => { alive = false; };
  }, []);

  function setView(v) {
    setOpenId(null);
    setDrawer(null);
    setViewRaw(v);
    const g = findGroupFor(v);
    if (g) setExpanded(g);
  }

  function openDrawer(title, record, fields) { setDrawer({ title, record, fields }); }

  function updateOrder(id, patch) {
    setOrders((os) => os.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function logOrderEvent(id, label, type) {
    setOrders((os) => os.map((o) => (o.id === id ? { ...o, timeline: [...o.timeline, { date: "Just now", label, type }] } : o)));
  }
  function handleUpdateStatus(id, status) {
    updateOrder(id, { status });
    logOrderEvent(id, `Status changed to ${status}`, "note");
  }
  function handleToggleItemFulfilled(id, itemIndex) {
    setOrders((os) => os.map((o) => {
      if (o.id !== id) return o;
      const items = o.items.map((it, i) => (i === itemIndex ? { ...it, fulfilled: !it.fulfilled } : it));
      const allDone = items.every((it) => it.fulfilled);
      const noneDone = items.every((it) => !it.fulfilled);
      const status = o.status === "cancelled" ? o.status : allDone ? "fulfilled" : noneDone ? "pending" : "processing";
      return { ...o, items, status };
    }));
    logOrderEvent(id, "Fulfillment updated", "fulfillment");
  }
  function handleSaveNote(id, note) {
    updateOrder(id, { notes: note });
    logOrderEvent(id, "Note added", "note");
  }
  function handleUpdateTags(id, tags) {
    updateOrder(id, { tags });
  }
  function handleOpenCustomerFromOrder(customerId) {
    setView("customers");
    setOpenId(customerId);
  }
  function handleOpenOrderFromCustomer(orderId) {
    setView("orders");
    setOpenId(orderId);
  }
  function handleReceivePO(id) {
    setPos((ps) => ps.map((p) => (p.id === id ? { ...p, status: "received" } : p)));
  }
  function handleSendRecovery(id) {
    setAbandoned((a) => a.map((r) => (r.id === id ? { ...r, status: "recovered" } : r)));
  }
  function handleConvertDraft(id) {
    const d = drafts.find((x) => x.id === id);
    if (!d) return;
    const newOrder = {
      id: `#${4500 + Math.floor(Math.random() * 90)}`, customer: d.customer, date: "2026-08-11", status: "pending", payment: "unpaid",
      shippingCost: 0, taxAmount: 0, discountCode: null, discountAmount: 0, total: d.value, poNumber: null, netTermsDue: null,
      tags: ["Converted from draft"], trackingNumber: null, carrier: null, notes: "",
      items: d.items.map((it) => ({ ...it, sku: it.sku || "", fulfilled: false })),
      timeline: [{ date: "Just now", label: "Converted from draft order", type: "order" }],
    };
    setOrders((os) => [newOrder, ...os]);
    setDrafts((ds) => ds.filter((x) => x.id !== id));
    setView("orders");
    setOpenId(newOrder.id);
  }

  let content = null;

  if (view === "home") content = <HomeScreen orders={orders} customers={customers} products={products} goTo={setView} dash={dash} brandName={brandName} />;

  else if (view === "orders") {
    const open = orders.find((o) => o.id === openId);
    content = open
      ? <OrderDetail
          order={open}
          customer={customers.find((c) => c.name === open.customer)}
          relatedOrders={orders.filter((o) => o.customer === open.customer && o.id !== open.id)}
          onBack={() => setOpenId(null)}
          onUpdateStatus={handleUpdateStatus}
          onToggleItemFulfilled={handleToggleItemFulfilled}
          onSaveNote={handleSaveNote}
          onUpdateTags={handleUpdateTags}
          onOpenCustomer={handleOpenCustomerFromOrder}
        />
      : <ListView title="Orders" data={orders} statusField="status" statusOptions={["pending", "processing", "fulfilled", "cancelled"]} searchFields={["id", "customer"]}
          columns={[{ key: "id", label: "Order" }, { key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }, { key: "total", label: "Total", render: (r) => `$${r.total.toLocaleString()}` }]}
          onRowClick={(r) => setOpenId(r.id)}
        />;
  }

  else if (view === "abandoned") {
    const open = abandoned.find((a) => a.id === openId);
    content = open
      ? <AbandonedDetail checkout={open} onBack={() => setOpenId(null)} onSendRecovery={handleSendRecovery} />
      : <ListView title="Abandoned checkouts" data={abandoned} statusField="status" statusOptions={["open", "recovered"]} searchFields={["id", "customer"]}
          columns={[{ key: "id", label: "Checkout" }, { key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "value", label: "Value", render: (r) => `$${r.value}` }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
          onRowClick={(r) => setOpenId(r.id)}
          onBulkAction={(ids) => setAbandoned((a) => a.filter((r) => !ids.includes(r.id)))}
        />;
  }

  else if (view === "drafts") {
    const open = drafts.find((d) => d.id === openId);
    content = open
      ? <DraftDetail draft={open} onBack={() => setOpenId(null)} onConvert={handleConvertDraft} />
      : <ListView title="Drafts" data={drafts} searchFields={["id", "customer"]}
          columns={[{ key: "id", label: "Draft" }, { key: "customer", label: "Customer" }, { key: "date", label: "Date" }, { key: "value", label: "Value", render: (r) => `$${r.value}` }]}
          onRowClick={(r) => setOpenId(r.id)}
        />;
  }

  else if (view === "returns") {
    const open = returns.find((r) => r.id === openId);
    content = open
      ? <ReturnDetail ret={open} onBack={() => setOpenId(null)} onSave={(nr) => { setReturns((rs) => rs.map((r) => (r.id === nr.id ? nr : r))); setOpenId(null); }} />
      : <ListView title="Returns" data={returns} statusField="status" statusOptions={["pending", "approved", "resolved"]} searchFields={["id", "customer", "order"]}
          columns={[{ key: "id", label: "Return" }, { key: "order", label: "Order" }, { key: "customer", label: "Customer" }, { key: "reason", label: "Reason" }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
          onRowClick={(r) => setOpenId(r.id)}
        />;
  }

  else if (view === "pos") {
    const open = pos.find((p) => p.id === openId);
    content = open
      ? <PODetail po={open} onBack={() => setOpenId(null)} onReceive={handleReceivePO} />
      : <ListView title="Purchase orders" data={pos} statusField="status" statusOptions={["pending", "received"]} searchFields={["id", "supplier"]}
          columns={[{ key: "id", label: "PO" }, { key: "supplier", label: "Supplier" }, { key: "date", label: "Date" }, { key: "value", label: "Value", render: (r) => `$${r.value.toLocaleString()}` }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
          onRowClick={(r) => setOpenId(r.id)}
        />;
  }

  else if (view === "products") {
    if (openId === "new") content = <ProductDetail allCollections={collections.map((c) => c.name)} reviews={reviews} onBack={() => setOpenId(null)} onSave={(p) => { setProducts((ps) => [p, ...ps]); setOpenId(null); }} />;
    else if (openId) {
      const p = products.find((x) => x.id === openId);
      content = <ProductDetail product={p} allCollections={collections.map((c) => c.name)} reviews={reviews} onBack={() => setOpenId(null)} onSave={(np) => { setProducts((ps) => ps.map((x) => (x.id === np.id ? np : x))); setOpenId(null); }} />;
    } else content = <ListView title="Products" data={products} statusField="status" statusOptions={["active", "draft", "inactive"]} searchFields={["name", "sku"]}
        columns={[{ key: "name", label: "Product" }, { key: "sku", label: "SKU" }, { key: "price", label: "Price", render: (r) => `$${r.price}` }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }, { key: "stock", label: "Stock", render: (r) => r.variants.reduce((s, v) => s + v.stock, 0) }]}
        onRowClick={(r) => setOpenId(r.id)} onCreate={() => setOpenId("new")} createLabel="Add product"
        onBulkAction={(ids) => setProducts((ps) => ps.filter((p) => !ids.includes(p.id)))}
      />;
  }

  else if (view === "collections") {
    if (openId === "new") content = <CollectionDetail allProducts={products} onBack={() => setOpenId(null)} onSave={(c) => { setCollections((cs) => [c, ...cs]); setOpenId(null); }} />;
    else if (openId) {
      const c = collections.find((x) => x.id === openId);
      content = <CollectionDetail collection={c} allProducts={products} onBack={() => setOpenId(null)} onSave={(nc) => { setCollections((cs) => cs.map((x) => (x.id === nc.id ? nc : x))); setOpenId(null); }} />;
    } else content = <ListView title="Collections" data={collections} statusField="status" statusOptions={["active", "hidden"]} searchFields={["name"]}
        columns={[{ key: "name", label: "Collection" }, { key: "type", label: "Type" }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
        onRowClick={(r) => setOpenId(r.id)} onCreate={() => setOpenId("new")} createLabel="Create collection"
      />;
  }

  else if (view === "inventory") content = <InventoryView products={products} />;

  else if (view === "reviews") {
    const open = reviews.find((r) => r.id === openId);
    content = open
      ? <ReviewDetail review={open} onBack={() => setOpenId(null)} onSave={(nr) => { setReviews((rs) => rs.map((r) => (r.id === nr.id ? nr : r))); setOpenId(null); }} />
      : <ListView title="Reviews" data={reviews} statusField="status" statusOptions={["published", "pending"]} searchFields={["product", "customer"]}
          columns={[{ key: "product", label: "Product" }, { key: "customer", label: "Customer" }, { key: "rating", label: "Rating", render: (r) => `${r.rating} / 5` }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
          onRowClick={(r) => setOpenId(r.id)}
        />;
  }

  else if (view === "customers") {
    if (openId) {
      const c = customers.find((x) => x.id === openId);
      content = <CustomerDetail customer={c} orders={orders} onBack={() => setOpenId(null)} onSave={(nc) => { setCustomers((cs) => cs.map((x) => (x.id === nc.id ? nc : x))); setOpenId(null); }} onOpenOrder={handleOpenOrderFromCustomer} />;
    } else content = <ListView title="Customers" data={customers} statusField="status" statusOptions={["approved", "pending", "rejected"]} searchFields={["name", "email"]}
        columns={[{ key: "name", label: "Customer" }, { key: "tier", label: "Tier" }, { key: "taxExempt", label: "Tax exempt", render: (r) => (r.taxExempt ? "Yes" : "No") }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }, { key: "spend", label: "Spend", render: (r) => `$${r.spend.toLocaleString()}` }]}
        onRowClick={(r) => setOpenId(r.id)}
      />;
  }

  else if (view === "approvals") content = <ApprovalsView customers={customers} onDecision={(id, status) => setCustomers((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)))} />;

  else if (view === "segments") content = <SegmentsView customers={customers} />;

  else if (view === "tiers") content = <TiersView tiers={tiers} setTiers={setTiers} customers={customers} />;

  else if (view === "discounts") {
    if (openId === "new") content = <DiscountForm onBack={() => setOpenId(null)} onSave={(d) => { setDiscounts((ds) => [d, ...ds]); setOpenId(null); }} />;
    else if (openId) content = <DiscountForm record={discounts.find((d) => d.id === openId)} onBack={() => setOpenId(null)} onSave={(nd) => { setDiscounts((ds) => ds.map((d) => (d.id === nd.id ? nd : d))); setOpenId(null); }} />;
    else content = <ListView title="Discounts" data={discounts} statusField="status" statusOptions={["active", "expired"]} searchFields={["title", "code"]}
        columns={[{ key: "title", label: "Title" }, { key: "type", label: "Type" }, { key: "value", label: "Value" }, { key: "code", label: "Code" }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
        onRowClick={(r) => setOpenId(r.id)} onCreate={() => setOpenId("new")} createLabel="Create discount"
      />;
  }

  else if (view === "blogs") {
    if (openId === "new") content = <EditorForm kind="blog" onBack={() => setOpenId(null)} onSave={(b) => { setBlogs((bs) => [b, ...bs]); setOpenId(null); }} />;
    else if (openId) content = <EditorForm kind="blog" record={blogs.find((b) => b.id === openId)} onBack={() => setOpenId(null)} onSave={(nb) => { setBlogs((bs) => bs.map((b) => (b.id === nb.id ? nb : b))); setOpenId(null); }} />;
    else content = <ListView title="Blogs" data={blogs} statusField="status" statusOptions={["published", "draft"]} searchFields={["title"]}
        columns={[{ key: "title", label: "Title" }, { key: "author", label: "Author" }, { key: "status", label: "Status", render: (r) => <Badge status={r.status} /> }]}
        onRowClick={(r) => setOpenId(r.id)} onCreate={() => setOpenId("new")} createLabel="New post"
      />;
  }

  else if (view === "seo") content = <SeoPanel pages={pages} />;

  // Storefront builders — the real, full-featured tools (sections + live
  // preview) rendered inside this shell, not the prototype's stub screens.
  else if (view === "pages") content = <PagesManager />;
  else if (view === "menus") content = <MenusManager />;
  else if (view === "theme") content = <StorefrontCustomizer />;
  else if (view === "domains") content = <DomainsPanel />;

  // Real, already-built features brought to full parity with the old sidebar —
  // rendered in-shell (reused, not rebuilt).
  else if (view === "supplier") content = <SupplierCatalogPage />;
  else if (view === "gangsheets") content = <AdminGangSheetsPage />;
  else if (view === "media") content = <MediaLibraryPage />;
  else if (view === "messages") content = <MessagesPage />;
  else if (view === "productspecs") content = <AdminProductSpecsPage />;
  else if (view === "stylesheets") content = <AdminStyleSheetsPage />;
  else if (view === "stdshipping") content = <StandardShippingPage />;
  else if (view === "shipping-labels") content = <ShippingLabelsPage />;
  else if (view === "analytics") content = <AnalyticsScreen products={products} customers={customers} />;
  else if (view === "settings") content = <SettingsScreen />;

  // While auth is still resolving (e.g. an impersonation token being processed),
  // hold a neutral loading state instead of flashing an empty admin.
  if (!isAuthenticated() && !authChecked) {
    return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: "14px" }}>Loading…</div>;
  }

  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap" />
      <div className="flex overflow-hidden" style={{ minHeight: "100vh", fontFamily: "'Outfit', sans-serif" }}>
        <Sidebar view={view} setView={setView} expanded={expanded} setExpanded={setExpanded} brandName={brandName} />
        <div className="flex-1 min-w-0 flex flex-col">
          <Topbar brandName={brandName} />
          <div className="p-6 overflow-y-auto flex-1">{content}</div>
        </div>
        <Drawer title={drawer?.title} record={drawer?.record} fields={drawer?.fields} onClose={() => setDrawer(null)} />
      </div>
    </>
  );
}
