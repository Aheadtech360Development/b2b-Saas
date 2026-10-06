/**
 * The product's own dialogs, in place of the browser's confirm / alert / prompt:
 * in the middle of the screen, named buttons, Esc to cancel, Enter for the main one.
 */
// @vitest-environment jsdom
import { act } from "react";
import { describe, expect, it } from "vitest";
import { ask, askText, tell } from "@/lib/dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const dialog = () => document.querySelector<HTMLElement>(".pcdlg");
const buttons = () => [...document.querySelectorAll<HTMLButtonElement>(".pcdlg-btn")];
const key = (k: string) => act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })); });

describe("the product's own dialogs", () => {
  it("asks in the middle of the screen, the first sentence as its title, and answers with the button pressed", async () => {
    let answer: boolean | undefined;
    void ask("Use this as the footer on every page? It takes the place of the footer the other pages show now.").then((v) => { answer = v; });
    await flush();
    expect(dialog()).not.toBeNull();
    expect(document.querySelector(".pcdlg-head")!.textContent).toBe("Use this as the footer on every page?");
    expect(document.querySelector(".pcdlg-body")!.textContent).toContain("takes the place");
    expect(buttons().map((b) => b.textContent)).toEqual(["Cancel", "OK"]);
    await act(async () => { buttons()[1]!.click(); });
    await flush();
    expect(answer).toBe(true);
    expect(dialog()).toBeNull();
  });

  it("names the button for what it does when it deletes, and shows it in red", async () => {
    let answer: boolean | undefined;
    void ask("Delete this file?").then((v) => { answer = v; });
    await flush();
    const main = buttons()[1]!;
    expect(main.textContent).toBe("Delete");
    expect(main.className).toContain("danger");
    await key("Escape");
    await flush();
    expect(answer).toBe(false);
    expect(dialog()).toBeNull();
  });

  it("keeps keys from the page behind it while it is open", async () => {
    let heard = 0;
    const onKey = () => { heard++; };
    window.addEventListener("keydown", onKey);
    void ask("Remove the shipping policy?");
    await flush();
    await key("Delete");
    expect(heard).toBe(0);
    await key("Enter");
    await flush();
    expect(dialog()).toBeNull();
    window.removeEventListener("keydown", onKey);
  });

  it("tells with one button, and asks for text", async () => {
    let closed = false;
    void tell("Delete failed: the file is in use").then(() => { closed = true; });
    await flush();
    expect(buttons().map((b) => b.textContent)).toEqual(["OK"]);
    await act(async () => { buttons()[0]!.click(); });
    await flush();
    expect(closed).toBe(true);

    let name: string | null | undefined;
    void askText("Name this section", "Hero", { ok: "Save section" }).then((v) => { name = v; });
    await flush();
    const input = document.querySelector<HTMLInputElement>(".pcdlg-input")!;
    expect(input.value).toBe("Hero");
    expect(buttons().map((b) => b.textContent)).toEqual(["Cancel", "Save section"]);
    await key("Enter");
    await flush();
    expect(name).toBe("Hero");

    void askText("Link to").then((v) => { name = v; });
    await flush();
    await key("Escape");
    await flush();
    expect(name).toBeNull();
  });

  it("shows one at a time, in the order asked", async () => {
    const order: string[] = [];
    void ask("First?").then(() => order.push("first"));
    void ask("Second?").then(() => order.push("second"));
    await flush();
    expect(document.querySelector(".pcdlg-head")!.textContent).toBe("First?");
    await key("Enter");
    await flush();
    expect(document.querySelector(".pcdlg-head")!.textContent).toBe("Second?");
    await key("Enter");
    await flush();
    expect(order).toEqual(["first", "second"]);
  });
});
