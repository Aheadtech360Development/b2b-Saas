/**
 * The designer's Garment tab: Change product (Ikrash, 2026-11-10: it opened an
 * empty list, so it seemed to do nothing). The list is the shop's other
 * products in the designer; with none, a customer is not offered the button,
 * and the shop's own people are told where to add more.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const who = vi.hoisted(() => ({ admin: false }));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: who.admin ? { is_admin: true } : null }),
}));
// Garment pictures are recoloured on a canvas, which jsdom does not have.
vi.mock("@/components/designer/context", () => ({ useGarmentUrl: () => null }));

import { ProductPanel } from "@/components/designer/panels/ProductPanel";
import { DEMO_GARMENTS } from "@/lib/designer/catalog";
import { emptyDoc, useDesigner } from "@/stores/designer.store";

const tee = DEMO_GARMENTS.find((g) => g.id === "classic-tee")!;
const longSleeve = DEMO_GARMENTS.find((g) => g.id === "long-sleeve-tee")!;

// The first render loads the designer's modules: slow on a cold run.
vi.setConfig({ testTimeout: 30000 });

beforeEach(() => { who.admin = false; });

describe("Change product", () => {
  it("lists the shop's other products, and changes the shirt to the one picked", async () => {
    useDesigner.getState().init([tee, longSleeve], emptyDoc(tee));
    render(<ProductPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Change product/ }));
    const pick = screen.getByRole("button", { name: /Long Sleeve Tee/ });
    expect(screen.queryByRole("button", { name: /Classic Tee CT100/ })).toBeNull();
    await act(async () => { fireEvent.click(pick); });
    const doc = useDesigner.getState().doc!;
    expect(doc.products.map((p) => p.garmentId)).toEqual(["long-sleeve-tee"]);
    expect(Object.keys(doc.designs).every((k) => k.startsWith("long-sleeve-tee:"))).toBe(true);
    expect(useDesigner.getState().active).toEqual({ product: 0, colorId: doc.products[0]!.colorIds[0] });
    expect(screen.getByText("Long Sleeve Tee")).toBeInTheDocument();
  });

  it("keeps the colours the new product also comes in", async () => {
    useDesigner.getState().init([tee, longSleeve], emptyDoc(tee));
    useDesigner.getState().toggleColor(0, "navy");
    render(<ProductPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Change product/ }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Long Sleeve Tee/ })); });
    expect(useDesigner.getState().doc!.products[0]!.colorIds).toEqual(["white", "navy"]);
  });

  it("is not offered to a customer when the shop has only this product in the designer", () => {
    useDesigner.getState().init([tee], emptyDoc(tee));
    render(<ProductPanel />);
    expect(screen.getByText("Classic Tee")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Change product/ })).toBeNull();
  });

  it("tells the shop's own people where to add more products", () => {
    who.admin = true;
    useDesigner.getState().init([tee], emptyDoc(tee));
    render(<ProductPanel />);
    fireEvent.click(screen.getByRole("button", { name: /Change product/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Classic Tee is the only product in the designer");
    expect(screen.getByRole("status")).toHaveTextContent("Products → T-shirt designer → Add products");
  });
});
