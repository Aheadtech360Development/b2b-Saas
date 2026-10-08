/**
 * "Build with AI" shows in a brand's builder only when the platform has it
 * switched on for that brand (Manage → "Build with AI in the builder").
 *
 * It used to be a constant in this page, off for every brand at once. The page
 * now asks the shop, and anything but a plain yes — no, a refusal, a network
 * failure — leaves the button out, without keeping the builder from opening.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const answer = vi.hoisted(() => ({ assistant: (): Promise<unknown> => Promise.resolve({ available: false }) }));

vi.mock("@/services/gangSheets.service", () => ({
  gangSheetsService: {
    listSizes: () => Promise.resolve([{ id: "s1", name: "22×24", width_in: 22, height_in: 24 }]),
    myOrder: () => Promise.resolve(null),
    assistantAvailable: () => answer.assistant(),
  },
}));
vi.mock("@/stores/auth.store", () => ({
  useAuthStore: () => ({ isAuthenticated: () => false, isLoading: false, user: null }),
}));
// The builder itself is not under test: it shows what it was told.
vi.mock("@/components/storefront/GangSheetStudio", () => ({
  GangSheetStudio: ({ assistant }: { assistant?: boolean }) => (
    <div>builder open{assistant ? " — Build with AI" : ""}</div>
  ),
}));

import GangSheetBuilderPage from "@/app/(customer)/gang-sheets/page";

describe("Build with AI, per brand", () => {
  beforeEach(() => { window.history.replaceState(null, "", "/gang-sheets"); });

  it("shows when the platform has it on for this brand", async () => {
    answer.assistant = () => Promise.resolve({ available: true });
    render(<GangSheetBuilderPage />);
    expect(await screen.findByText("builder open — Build with AI")).toBeTruthy();
  });

  it("stays out when it is off", async () => {
    answer.assistant = () => Promise.resolve({ available: false });
    render(<GangSheetBuilderPage />);
    expect(await screen.findByText("builder open")).toBeTruthy();
  });

  it("stays out, and the builder still opens, when the answer can't be had", async () => {
    answer.assistant = () => Promise.reject(new Error("403"));
    render(<GangSheetBuilderPage />);
    expect(await screen.findByText("builder open")).toBeTruthy();
  });
});
