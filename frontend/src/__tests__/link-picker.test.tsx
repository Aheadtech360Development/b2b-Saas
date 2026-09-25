/**
 * Typing a URL into the link picker.
 *
 * It used to re-derive which kind of destination it was showing from any new
 * value — including every keystroke it had just caused itself. So picking
 * "External URL" and typing `h` handed back "h", which reads as a page, and
 * the picker switched itself back to Pages mid-word: the field unmounted and
 * the focus went with it. Every link in the theme editor did it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { LinkPicker } from "@/components/admin/LinkPicker";

// The picker fetches the things you can link to; nothing here needs them.
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: vi.fn().mockResolvedValue({ pages: [], products: [], collections: [] }) },
}));

/** The picker as the editor actually uses it: it owns the value. */
function Host({ initial = "/" }: { initial?: string }) {
  const [url, setUrl] = useState(initial);
  return (
    <>
      <LinkPicker value={url} onChange={setUrl} />
      <output data-testid="value">{url}</output>
    </>
  );
}

describe("the link picker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stays on External URL while a URL is typed into it", async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "External URL" }));
    const field = screen.getByPlaceholderText("https://example.com");
    await user.click(field);
    await user.keyboard("https://innterflow.printcopilot.co/");

    // The same element is still there, still focused, with the whole address.
    expect(screen.getByPlaceholderText("https://example.com")).toBe(field);
    expect(field).toHaveFocus();
    expect((field as HTMLInputElement).value).toBe("https://innterflow.printcopilot.co/");
    expect(screen.getByTestId("value").textContent).toBe("https://innterflow.printcopilot.co/");
  });

  it("does not lose the first characters, which do not look like a URL", async () => {
    const user = userEvent.setup();
    render(<Host />);

    await user.click(screen.getByRole("button", { name: "External URL" }));
    await user.type(screen.getByPlaceholderText("https://example.com"), "ht");

    // "ht" reads as a page by itself — the picker used to switch on that.
    expect(screen.getByPlaceholderText("https://example.com")).toBeTruthy();
    expect(screen.getByTestId("value").textContent).toBe("ht");
  });

  it("still follows the editor when it moves to another link", async () => {
    const { rerender } = render(<LinkPicker value="https://example.com" onChange={() => {}} />);
    expect(screen.getByPlaceholderText("https://example.com")).toBeTruthy();

    // The editor jumped to a link that is a page: the picker follows.
    rerender(<LinkPicker value="/about" onChange={() => {}} />);
    expect(screen.queryByPlaceholderText("https://example.com")).toBeNull();
  });
});
