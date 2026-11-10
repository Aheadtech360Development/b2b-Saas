/**
 * Products → a product → Duplicate, as Shopify's: a name ("Copy of …"), a
 * status (Draft to start), images (on) and inventory quantities (off); the
 * copy opens once it is made.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const { duplicateProduct } = vi.hoisted(() => ({ duplicateProduct: vi.fn() }));
vi.mock("@/services/admin.service", () => ({ adminService: { duplicateProduct } }));

import { DuplicateProductModal } from "@/components/admin/products/DuplicateProductModal";

const product = { id: "p-1", name: "Gildan 5000" };

beforeEach(() => { duplicateProduct.mockReset(); });

describe("Duplicate product", () => {
  it("offers Shopify's defaults and makes the copy with them", async () => {
    const copy = { id: "p-2", slug: "copy-of-gildan-5000", name: "Copy of Gildan 5000", status: "draft" };
    duplicateProduct.mockResolvedValue(copy);
    const onDone = vi.fn();
    render(<DuplicateProductModal product={product} onClose={vi.fn()} onDone={onDone} />);
    expect(screen.getByRole("textbox")).toHaveValue("Copy of Gildan 5000");
    expect(screen.getByRole("radio", { name: "Draft" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Images" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Inventory quantities" })).not.toBeChecked();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); });
    expect(duplicateProduct).toHaveBeenCalledWith("p-1", { name: "Copy of Gildan 5000", status: "draft", images: true, stock: false });
    expect(onDone).toHaveBeenCalledWith(copy);
  });

  it("takes the admin's name, status and choices", async () => {
    duplicateProduct.mockResolvedValue({ id: "p-3", slug: "gildan-5000-red", name: "Gildan 5000 Red", status: "active" });
    render(<DuplicateProductModal product={product} onClose={vi.fn()} onDone={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Gildan 5000 Red " } });
    fireEvent.click(screen.getByRole("radio", { name: "Active" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Images" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Inventory quantities" }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); });
    expect(duplicateProduct).toHaveBeenCalledWith("p-1", { name: "Gildan 5000 Red", status: "active", images: false, stock: true });
  });

  it("says plainly when the copy was not made, and stays open", async () => {
    duplicateProduct.mockRejectedValue(new Error("The copy couldn't be saved just now. Please try again."));
    const onDone = vi.fn();
    render(<DuplicateProductModal product={product} onClose={vi.fn()} onDone={onDone} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); });
    expect(await screen.findByRole("alert")).toHaveTextContent("The copy couldn't be saved just now.");
    expect(onDone).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Duplicate" })).toBeEnabled();
  });
});
