/**
 * Address suggestions under the street field.
 *
 * The checkout and saved-address forms had a Google widget that only woke up
 * with a Google key no store had set — and only if the field was on the page
 * in the first ten seconds. Now, without a Google key, the field asks the
 * store's server as the buyer types, lists whole addresses under it, and
 * choosing one fills the street, city, state and ZIP.
 */
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

const asked: string[] = [];
let reply: { enabled: boolean; suggestions: unknown[]; attribution?: string } = { enabled: true, suggestions: [] };
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (url: string) => {
      asked.push(decodeURIComponent(url.split("q=")[1] ?? ""));
      return Promise.resolve(reply);
    },
  },
}));

import { attachAddressSuggestions, type AddressSuggestion, type SuggestAnswer } from "@/lib/addressSuggest";
import { useAddressAutocomplete } from "@/hooks/useAddressAutocomplete";

const GOULD: AddressSuggestion = { label: "30 North Gould Street, Sheridan, WY 82801", line1: "30 North Gould Street",
  city: "Sheridan", state: "WY", postal_code: "82801", country: "US" };
const BROADWAY: AddressSuggestion = { label: "856 Broadway Street, Sheridan, WY 82801", line1: "856 Broadway Street",
  city: "Sheridan", state: "WY", postal_code: "82801", country: "US" };
const ANSWER: SuggestAnswer = { enabled: true, suggestions: [GOULD, BROADWAY], attribution: "Powered by Geoapify" };

function field() {
  const input = document.createElement("input");
  document.body.appendChild(input);
  input.focus();
  return input;
}

async function type(input: HTMLInputElement, value: string) {
  fireEvent.input(input, { target: { value } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

const options = () => screen.queryAllByRole("option");

beforeEach(() => {
  vi.useFakeTimers();
  asked.length = 0;
  reply = { enabled: true, suggestions: [] };
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("suggestions on a street field", () => {
  it("asks once the buyer has typed a little, lists whole addresses, and credits the source", async () => {
    const ask = vi.fn(() => Promise.resolve(ANSWER));
    const input = field();
    attachAddressSuggestions(input, () => {}, ask);
    await type(input, "30");
    expect(ask).not.toHaveBeenCalled();
    await type(input, "30  N Gould ");
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith("30 N Gould");
    expect(options().map((o) => o.textContent)).toEqual([
      "30 North Gould StreetSheridan, WY 82801", "856 Broadway StreetSheridan, WY 82801",
    ]);
    expect(screen.getByText("Powered by Geoapify")).toBeInTheDocument();
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("autocomplete")).toBe("off"); // not the browser's list over it
  });

  it("is chosen with the keyboard: down, down, Enter — and Escape closes it", async () => {
    const chosen: AddressSuggestion[] = [];
    const input = field();
    attachAddressSuggestions(input, (s) => chosen.push(s), () => Promise.resolve(ANSWER));
    await type(input, "30 N Gould");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[1]!.id);
    const enter = fireEvent.keyDown(input, { key: "Enter" });
    expect(enter).toBe(false); // the form is not submitted by it
    expect(chosen).toEqual([BROADWAY]);
    expect(options()).toHaveLength(0);

    await type(input, "30 N Gould S");
    expect(options()).toHaveLength(2);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(options()).toHaveLength(0);
  });

  it("is chosen with the mouse, before the field loses focus", async () => {
    const chosen: AddressSuggestion[] = [];
    const input = field();
    attachAddressSuggestions(input, (s) => chosen.push(s), () => Promise.resolve(ANSWER));
    await type(input, "30 N Gould");
    fireEvent.mouseDown(options()[0]!);
    expect(chosen).toEqual([GOULD]);
  });

  it("shows only the answer to what was typed last", async () => {
    let first: (a: SuggestAnswer) => void = () => {};
    const ask = vi.fn((q: string) => q === "30 N"
      ? new Promise<SuggestAnswer>((ok) => { first = ok; })
      : Promise.resolve({ ...ANSWER, suggestions: [GOULD] }));
    const input = field();
    attachAddressSuggestions(input, () => {}, ask);
    await type(input, "30 N");
    await type(input, "30 N Gould");
    await act(async () => { first({ ...ANSWER, suggestions: [BROADWAY] }); });
    expect(options().map((o) => o.textContent)).toEqual(["30 North Gould StreetSheridan, WY 82801"]);
  });

  it("stops asking when the store has suggestions off, and an error is just no list", async () => {
    const off = vi.fn(() => Promise.resolve({ enabled: false, suggestions: [] }));
    const input = field();
    attachAddressSuggestions(input, () => {}, off);
    await type(input, "30 N Gould");
    await type(input, "30 N Gould Street");
    expect(off).toHaveBeenCalledTimes(1);
    expect(options()).toHaveLength(0);

    const failing = field();
    attachAddressSuggestions(failing, () => {}, () => Promise.reject(new Error("429")));
    await type(failing, "30 N Gould");
    expect(options()).toHaveLength(0);
  });

  it("comes off cleanly: the list goes and the field is as it was", async () => {
    const input = field();
    input.setAttribute("autocomplete", "street-address");
    const detach = attachAddressSuggestions(input, () => {}, () => Promise.resolve(ANSWER));
    await type(input, "30 N Gould");
    detach();
    expect(document.querySelector("[data-address-suggestions]")).toBeNull();
    expect(input.getAttribute("autocomplete")).toBe("street-address");
    expect(input.hasAttribute("aria-controls")).toBe(false);
  });
});

function AddressForm() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ street: "", city: "", state: "", zip: "" });
  const ref = useAddressAutocomplete((a) => setForm({ street: a.street, city: a.city, state: a.state, zip: a.zipCode }));
  return (
    <div>
      <button onClick={() => setOpen(true)}>Use a new address</button>
      {open && (
        <input aria-label="Street" ref={ref} value={form.street}
          onChange={(e) => setForm((p) => ({ ...p, street: e.target.value }))} />
      )}
      <output>{[form.street, form.city, form.state, form.zip].join(" | ")}</output>
    </div>
  );
}

describe("the address forms", () => {
  it("get suggestions on a street field that appears later, from the store's server, and fill every field", async () => {
    reply = ANSWER;
    render(<AddressForm />);
    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); // long after page load
    fireEvent.click(screen.getByText("Use a new address"));
    const street = screen.getByLabelText("Street") as HTMLInputElement;
    street.focus();
    fireEvent.input(street, { target: { value: "856 Broad" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(asked).toEqual(["856 Broad"]);
    fireEvent.mouseDown(options()[1]!);
    expect(screen.getByText("856 Broadway Street | Sheridan | WY | 82801")).toBeInTheDocument();
  });
});
