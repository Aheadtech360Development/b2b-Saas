/**
 * The builder's contact form: the fields a shop chose, checked in words before
 * anything is sent, and sent to the brand's Messages under the form's name.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const posted: { url: string; body: Record<string, unknown> }[] = [];
vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (url: string, body: Record<string, unknown>) => { posted.push({ url, body }); return Promise.resolve({ status: "received" }); } },
}));

import { ContactForm, formFields, problemWith, safeColor } from "@/components/builder/islands/ContactForm";
import { BY_TYPE } from "@/lib/builder/registry";
import { BASE_CSS } from "@/lib/builder/baseCss";

const defaults = () => BY_TYPE.contact_form!.create().props as Record<string, unknown>;
const mount = (over: Record<string, unknown> = {}, edit = false) => {
  const p = { ...defaults(), ...over };
  return render(<ContactForm id="cf1" formName={String(p.formName)} fields={p.fields} button={String(p.button)} success={String(p.success)}
                             buttonWidth={String(p.buttonWidth)} look={p as never} edit={edit} />);
};

beforeEach(() => { posted.length = 0; });

describe("the contact form", () => {
  it("starts with name, email, phone, company and a message — the ones a person must fill in marked", () => {
    mount();
    for (const label of ["Name", "Email", "Phone", "Company", "Message"]) expect(screen.getByLabelText(new RegExp(`^${label}`))).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone/).closest("[data-w]")!.getAttribute("data-w")).toBe("half");
    expect(screen.getByLabelText(/^Message/).tagName).toBe("TEXTAREA");
    expect(screen.getByText("Phone").parentElement).toHaveTextContent("(optional)");
    expect(screen.getByRole("button", { name: "Send message" })).toBeInTheDocument();
  });

  it("says what is missing, in words, and sends nothing", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getAllByRole("alert").map((a) => a.textContent)).toEqual(["Please fill this in.", "Please fill this in.", "Please fill this in."]);
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute("aria-invalid", "true");
    expect(posted).toHaveLength(0);
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "not-an-email" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByText("That email address does not look right.")).toBeInTheDocument();
  });

  it("sends what was written to Messages, under the form's name, and thanks them", async () => {
    mount({ formName: "Quote request" });
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: "Sam Lee" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "sam@example.com" } });
    fireEvent.change(screen.getByLabelText(/^Message/), { target: { value: "50 shirts, please." } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thanks — we got your message"));
    expect(posted).toHaveLength(1);
    expect(posted[0]!.url).toBe("/api/v1/storefront/contact");
    expect(posted[0]!.body.form_name).toBe("Quote request");
    // Only what was filled in, by the field's own label; the bot trap rides along empty.
    expect(posted[0]!.body.data).toEqual({ Name: "Sam Lee", Email: "sam@example.com", Message: "50 shirts, please.", _gotcha: "" });
  });

  it("has dropdowns and tick boxes too, and two fields with one label are kept apart", () => {
    const list = formFields([
      { label: "Size", type: "select", options: "Small\nMedium\n\nLarge" },
      { label: "Agree", type: "checkbox", required: true },
      { label: "Note" }, { label: "Note" }, { label: "", type: "nonsense" },
    ]);
    expect(list.map((f) => [f.name, f.type])).toEqual([["Size", "select"], ["Agree", "checkbox"], ["Note", "text"], ["Note (2)", "text"], ["Field 5", "text"]]);
    expect(list[0]!.choices).toEqual(["Small", "Medium", "Large"]);
    expect(problemWith("checkbox", true, false)).toBe("Please tick this.");
    expect(problemWith("tel", false, "12")).toBe("That phone number looks too short.");
    expect(problemWith("text", false, "")).toBe("");
  });

  it("takes the shop's colours, and only colours", () => {
    const out = renderToStaticMarkup(<ContactForm id="cf2" formName="" fields={[]} button="" success="" buttonWidth="full"
      look={{ buttonBg: "#B91C1C", fieldBorder: "red;background:url(https://x)", fieldRadius: 999 }} />);
    expect(out).toContain("--f-btn-bg:#B91C1C");
    expect(out).not.toContain("url(");
    expect(out).toContain("--f-radius:40px");
    expect(safeColor("rgb(10, 20, 30)")).toBe("rgb(10, 20, 30)");
    expect(safeColor("var(--x)")).toBeUndefined();
  });

  it("cannot be typed in or sent while the page is being edited", () => {
    mount({}, true);
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(posted).toHaveLength(0);
    expect(document.querySelector(".b-form-grid")!.hasAttribute("inert")).toBe(true);
  });

  it("puts every field under the one before it on a phone", () => {
    expect(BASE_CSS).toMatch(/@container bsite \(max-width:640px\)\{[\s\S]*\.b-form-grid\)\{grid-template-columns:minmax\(0,1fr\)\}/);
  });
});
