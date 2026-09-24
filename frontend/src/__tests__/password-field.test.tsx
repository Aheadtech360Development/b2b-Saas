/**
 * Typing a password you cannot see is how people lock themselves out of an
 * account they have only just made.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PasswordField } from "@/components/ui/PasswordField";

describe("the password box", () => {
  it("hides what is typed until asked", async () => {
    render(<PasswordField defaultValue="hunter2" aria-label="Password" />);
    const box = screen.getByLabelText("Password") as HTMLInputElement;
    expect(box.type).toBe("password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(box.type).toBe("text");
    expect(box.value).toBe("hunter2");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(box.type).toBe("password");
  });

  it("does not submit the form it sits in", async () => {
    render(<PasswordField aria-label="Password" />);
    expect(screen.getByRole("button", { name: "Show password" })).toHaveProperty("type", "button");
  });

  it("keeps the page's own styling and leaves room for the eye", () => {
    render(<PasswordField aria-label="Password" style={{ border: "1px solid red", padding: "11px" }} />);
    const box = screen.getByLabelText("Password");
    expect(box.style.border).toBe("1px solid red");
    expect(box.style.paddingRight).toBe("44px");
  });

  it("passes everything else straight through", () => {
    render(<PasswordField aria-label="Password" required minLength={8} autoComplete="new-password" />);
    const box = screen.getByLabelText("Password") as HTMLInputElement;
    expect(box.required).toBe(true);
    expect(box.minLength).toBe(8);
    expect(box.autocomplete).toBe("new-password");
  });
});
