/**
 * "Website template" on the product and collection admin pages.
 *
 * The one thing this field must never do is look like the instant-saving
 * fields around it: a choice here waits in the Website builder's draft, and
 * the field has to say so — and say what shoppers see in the meantime.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TemplateAssignment } from "@/services/builder.service";

const assignment = vi.fn();
const assign = vi.fn();
vi.mock("@/services/builder.service", () => ({
  builderService: { assignment: (...a: unknown[]) => assignment(...a), assign: (...a: unknown[]) => assign(...a) },
}));
vi.mock("@/lib/api-client", () => ({
  ApiClientError: class ApiClientError extends Error {},
}));

import { WebsiteTemplateField } from "@/components/admin/WebsiteTemplateField";

const TEMPLATES = [{ id: "default", name: "Default product" }, { id: "apparel", name: "Apparel" }, { id: "dtf", name: "DTF transfers" }];
const state = (over: Partial<TemplateAssignment> = {}): TemplateAssignment => ({
  available: true, mode: "visual_builder", templates: TEMPLATES, defaultId: "default", assigned: "", effective: "default",
  live: { id: "default", name: "Default product" }, pending: false, revision: 4, ...over,
});
const field = (kind: "product" | "collection" = "product") =>
  render(<WebsiteTemplateField kind={kind} recordId="p-1" wrap={(body) => <section aria-label="card"><h3>Website template</h3>{body}</section>} />);
const select = () => screen.getByLabelText("Website template") as HTMLSelectElement;
const status = () => screen.getByRole("status");

beforeEach(() => { assignment.mockReset(); assign.mockReset(); });

describe("the Website template field", () => {
  it("draws nothing — not even its card — for a shop that has not opened the Website builder", async () => {
    assignment.mockResolvedValue({ available: false });
    const { container } = field();
    await waitFor(() => expect(assignment).toHaveBeenCalledWith("product", "p-1"));
    expect(container).toBeEmptyDOMElement();
  });

  it("draws nothing when the shop's design is not this person's to see", async () => {
    assignment.mockRejectedValue(new Error("403"));
    const { container } = field();
    await waitFor(() => expect(assignment).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it("lists the templates with the default first, and selects the one in use", async () => {
    assignment.mockResolvedValue(state({ assigned: "apparel", effective: "apparel", live: { id: "apparel", name: "Apparel" } }));
    field();
    await screen.findByLabelText("card");
    expect([...select().options].map((o) => o.textContent)).toEqual(["Default — Default product", "Apparel", "DTF transfers"]);
    expect(select().value).toBe("apparel");
    expect(status().textContent).toMatch(/Live: shoppers see this product with “Apparel”/);
    expect(status().getAttribute("data-template-status")).toBe("live");
  });

  it("treats a product pinned to the default template as simply on the default", async () => {
    assignment.mockResolvedValue(state({ assigned: "default" }));
    field();
    await screen.findByLabelText("card");
    expect(select().value).toBe("");
  });

  it("saves a choice to the draft at once, and says it is not live and what shoppers still see", async () => {
    assignment.mockResolvedValue(state());
    assign.mockResolvedValue(state({ assigned: "dtf", effective: "dtf", pending: true }));
    field();
    await screen.findByLabelText("card");
    fireEvent.change(select(), { target: { value: "dtf" } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("product", "p-1", "dtf"));
    await waitFor(() => expect(status().getAttribute("data-template-status")).toBe("draft"));
    expect(select().value).toBe("dtf");
    expect(status().textContent).toMatch(/In the website draft — not live yet/);
    expect(status().textContent).toMatch(/Shoppers still see “Default product” until you publish the website/);
    const link = screen.getByRole("link", { name: /Open Website builder to publish/ });
    expect(link.getAttribute("href")).toBe("/site-builder");
    // A new tab: going to publish must not throw away what is unsaved on this page.
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("sends an empty choice for Default", async () => {
    assignment.mockResolvedValue(state({ assigned: "apparel", effective: "apparel", live: { id: "apparel", name: "Apparel" } }));
    assign.mockResolvedValue(state({ pending: true, live: { id: "apparel", name: "Apparel" } }));
    field();
    await screen.findByLabelText("card");
    fireEvent.change(select(), { target: { value: "" } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith("product", "p-1", ""));
    await waitFor(() => expect(status().textContent).toMatch(/Shoppers still see “Apparel”/));
  });

  it("always says the change belongs to the website draft and its Publish, not this page's Save", async () => {
    assignment.mockResolvedValue(state());
    field("collection");
    const card = await screen.findByLabelText("card");
    expect(card.textContent).toMatch(/saved to the website draft straight away/);
    expect(card.textContent).toMatch(/not with this page’s Save button|not with this page's Save button/);
    expect(card.textContent).toMatch(/goes live when you publish the website/);
    expect(card.textContent).toMatch(/this collection/);
  });

  it("says so when the website has never been published", async () => {
    assignment.mockResolvedValue(state({ live: null }));
    field();
    await screen.findByLabelText("card");
    expect(status().textContent).toMatch(/has not been published yet/);
    expect(status().getAttribute("data-template-status")).toBe("unpublished");
  });

  it("says so when the shop has not been switched to the builder", async () => {
    assignment.mockResolvedValue(state({ mode: "legacy", live: null }));
    field();
    await screen.findByLabelText("card");
    expect(status().textContent).toMatch(/not showing the builder site yet/);
  });

  it("points to where another template is made when there is only the default", async () => {
    assignment.mockResolvedValue(state({ templates: [TEMPLATES[0]!] }));
    field();
    const card = await screen.findByLabelText("card");
    expect([...select().options]).toHaveLength(1);
    expect(card.textContent).toMatch(/You have one product template so far/);
  });

  describe("telling its page whether the Website builder is what shoppers see", () => {
    const settled = vi.fn();
    const mount = () => render(<WebsiteTemplateField kind="product" recordId="p-1" onSettled={settled} wrap={(body) => <div>{body}</div>} />);
    beforeEach(() => settled.mockReset());

    it("says yes for a shop switched to the builder with a site published", async () => {
      assignment.mockResolvedValue(state({ builderLive: true }));
      mount();
      await waitFor(() => expect(settled).toHaveBeenCalledWith(true));
      expect(settled).toHaveBeenCalledTimes(1);
    });

    it("says no for a shop that has a builder draft but has not been switched to it", async () => {
      assignment.mockResolvedValue(state({ mode: "legacy", builderLive: false }));
      mount();
      await waitFor(() => expect(settled).toHaveBeenCalledWith(false));
    });

    it("says no for a shop that never opened the builder", async () => {
      assignment.mockResolvedValue({ available: false, builderLive: false });
      mount();
      await waitFor(() => expect(settled).toHaveBeenCalledWith(false));
    });

    it("says no when it cannot find out, so the page shows what it always has", async () => {
      assignment.mockRejectedValue(new Error("403"));
      mount();
      await waitFor(() => expect(settled).toHaveBeenCalledWith(false));
    });
  });

  it("shows what is really saved when a choice is refused", async () => {
    assignment.mockResolvedValueOnce(state()).mockResolvedValueOnce(state());
    assign.mockRejectedValue(new Error("gone"));
    field();
    await screen.findByLabelText("card");
    fireEvent.change(select(), { target: { value: "dtf" } });
    await waitFor(() => expect(status().getAttribute("data-template-status")).toBe("error"));
    expect(status().textContent).toMatch(/Nothing was changed/);
    await waitFor(() => expect(assignment).toHaveBeenCalledTimes(2));
    expect(select().value).toBe("");
  });
});
