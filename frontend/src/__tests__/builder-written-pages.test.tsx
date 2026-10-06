/**
 * Get a quote and the policies, on a shop that has switched to the visual
 * builder. They were drawn with the imported theme's classes, which a builder
 * shop no longer loads — so they came out unstyled. Now they wear the
 * builder's own, and send exactly what they sent before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

const posted: { url: string; body: Record<string, unknown> }[] = [];
vi.mock("@/lib/api-client", () => ({
  apiClient: { post: (url: string, body: Record<string, unknown>) => { posted.push({ url, body }); return Promise.resolve({}); } },
}));

import ThemeWrittenPage, { type WrittenPage } from "@/components/storefront/ThemeWrittenPage";

const QUOTE: WrittenPage = { slug: "quote", title: "Get a quote", intro: "Tell us what you need.", form: "quote", sections: [] };
const TERMS: WrittenPage = {
  slug: "terms", title: "Terms of service", intro: "", form: "",
  sections: [{ heading: "Orders", body: "We print what you send.\n\nProofs are emailed." }],
};

beforeEach(() => { posted.length = 0; });

describe("a written page on a builder shop", () => {
  it("is drawn in the builder's classes, none of the imported theme's", () => {
    const out = renderToStaticMarkup(<ThemeWrittenPage page={TERMS} builder />);
    expect(out).toContain('class="bsite"');
    expect(out).toMatch(/<h1 class="b-heading">Terms of service<\/h1>/);
    expect(out).toMatch(/<h2 class="b-heading"[^>]*>Orders<\/h2>/);
    expect(out.match(/<p class="b-text"/g)).toHaveLength(2);
    expect(out).not.toContain('class="wrap"');
  });

  it("asks for a quote with the builder's form", () => {
    const out = renderToStaticMarkup(<ThemeWrittenPage page={QUOTE} builder />);
    expect(out).toContain('class="b-form"');
    expect(out).toContain('class="b-form-grid"');
    expect(out.match(/class="b-form-in"/g)).toHaveLength(8);
    expect(out).toContain('class="b-form-btn"');
    expect(out).toContain("Request a quote");
    expect(out).not.toContain("btn-primary");
  });

  it("sends the quote where it always went, and thanks them", async () => {
    render(<ThemeWrittenPage page={QUOTE} builder />);
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: "Sam Lee" } });
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "sam@example.com" } });
    fireEvent.change(screen.getByLabelText(/^What do you need printed/), { target: { value: "500 DTF transfers" } });
    fireEvent.submit(screen.getByRole("button", { name: "Request a quote" }).closest("form")!);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Thanks — that is with us."));
    expect(posted).toHaveLength(1);
    expect(posted[0]!.url).toBe("/api/v1/storefront/contact");
    expect(posted[0]!.body).toMatchObject({ page_slug: "quote", form_name: "Quote request" });
    expect((posted[0]!.body.data as Record<string, string>).product).toBe("500 DTF transfers");
  });

  it("is unchanged on a shop that is not on the builder", () => {
    const out = renderToStaticMarkup(<ThemeWrittenPage page={TERMS} />);
    expect(out).toContain('class="wrap"');
    expect(out).not.toContain("bsite");
  });
});
