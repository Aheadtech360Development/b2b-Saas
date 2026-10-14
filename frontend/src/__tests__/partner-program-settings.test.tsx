/**
 * The partner program's settings in the Platform Console: every number of the
 * deal is set here, the rate example reads the plan prices the API sends,
 * and one rate plan is the default the Approve and Add affiliate dialogs
 * start on, whatever its key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/font/google", () => ({ Outfit: () => ({ variable: "pcp-display", className: "" }) }));

const SETTINGS = {
  accepting_applications: true, accepting_referrals: true, earning: true, auto_approve: false, show_standard_rate: true,
  hold_days: 30, minimum_payout_cents: 5000, cookie_days: 90, return_window_days: 90,
  earning_months: 0, clawback_window_days: 0, w9_required_from_cents: 0, form_1099_threshold_cents: 0,
  application_response_days: 2, rate_change_notice_days: 30,
  commissionable_plans: ["starter", "wholesale", "scale"], support_email: "", captions: [],
};
// The default is Preferred here, not the plan keyed "standard".
const PLANS = [
  { id: "rp1", key: "standard", name: "Standard", rate_bps: 2000, rate: "20%", is_public: true, is_default: false },
  { id: "rp2", key: "preferred", name: "Preferred", rate_bps: 3000, rate: "30%", is_public: false, is_default: true },
];
const SETTINGS_PAGE = {
  settings: SETTINGS, rate_plans: PLANS, terms: null, assets: [],
  // Not the price the page used to have written in: the example must read this one.
  plans: [{ key: "starter", name: "Starter", price_cents: 9700 }, { key: "wholesale", name: "Wholesale", price_cents: 29700 },
          { key: "scale", name: "Scale", price_cents: 59900 }],
};
const APPLICATION = {
  id: "a1", name: "Ana Reyes", email: "ana@reyes.test", business_name: null, website: null, promote_how: "My newsletter",
  audience_size: null, flags: [], created_at: "2026-10-10T12:00:00Z", status: "waiting", waiting_days: 5,
  partner_id: null, terms_version: 1, terms_accepted_at: "2026-10-10T12:00:00Z", info_request: null, decided_by: null,
  decided_at: null, decision_reason: null, checks: [], notes: [], suggested_code: "ANAR", support_email: "partners@pc.test",
  rate_plans: PLANS.map((p) => ({ ...p, examples: { starter: 1940, wholesale: 5940, scale: 9940 } })),
};

const calls: { method: string; path: string; body?: unknown }[] = [];

vi.mock("@/components/platform/affiliates/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/components/platform/affiliates/api")>();
  const answer = (path: string): unknown => {
    if (path === "/settings") return structuredClone(SETTINGS_PAGE);
    if (path === "/applications/a1") return structuredClone(APPLICATION);
    if (path.startsWith("/affiliates?")) return { rows: [], counts: {}, rate_plans: [] };
    throw new Error(`no answer for ${path}`);
  };
  return {
    ...real,
    aff: {
      get: (path: string) => { calls.push({ method: "GET", path }); return Promise.resolve(answer(path)); },
      put: (path: string, body: unknown) => {
        calls.push({ method: "PUT", path, body });
        return Promise.resolve({ ok: true, settings: { ...SETTINGS, ...(body as object) } });
      },
      post: (path: string, body?: unknown) => { calls.push({ method: "POST", path, body }); return Promise.resolve({ ok: true }); },
    },
  };
});

import { AffiliatesList } from "@/components/platform/affiliates/AffiliatesList";
import { ApplicationDetail } from "@/components/platform/affiliates/Applications";
import { ProgramSettings } from "@/components/platform/affiliates/ProgramSettings";

const sent = (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path).map((c) => c.body);

async function openTab(name: string) {
  render(<ProgramSettings />);
  await screen.findByText("Program settings");
  fireEvent.click(screen.getByRole("button", { name }));
}

beforeEach(() => { calls.length = 0; });

describe("Program settings", () => {
  it("sets every number of the deal on Payout rules, each one at its default", async () => {
    await openTab("Payout rules");
    const numbers: [string, string][] = [["Earning period", "0"], ["Clawback window", "0"], ["W-9 needed from", "0"], ["1099 marker", "0"]];
    for (const [label, value] of numbers) {
      expect(screen.getByLabelText(label)).toHaveValue(value);
    }
    // The hints say what really happens.
    expect(screen.queryByText(/Refunds inside the hold never reach a payout/)).toBeNull();
    expect(screen.getByText(/An ended partnership's last balance is paid whatever the minimum/)).toBeInTheDocument();
    expect(screen.getByText(/A new minimum, clawback window or W-9 amount applies at once/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Earning period"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Clawback window"), { target: { value: "180" } });
    fireEvent.change(screen.getByLabelText("W-9 needed from"), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText("1099 marker"), { target: { value: "600" } });
    fireEvent.change(screen.getByLabelText("Reason, required"), { target: { value: "The manager's new deal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save payout rules" }));
    await waitFor(() => expect(sent("PUT", "/settings")).toHaveLength(1));
    expect(sent("PUT", "/settings")[0]).toEqual({
      hold_days: 30, minimum_payout_cents: 5000, cookie_days: 90, return_window_days: 90,
      earning_months: 12, clawback_window_days: 180, w9_required_from_cents: 60000, form_1099_threshold_cents: 60000,
      reason: "The manager's new deal",
    });
  });

  it("saves the answer time for applications on the Program tab", async () => {
    await openTab("Program");
    const days = screen.getByLabelText("Answer applications within");
    expect(days).toHaveValue("2");
    fireEvent.change(days, { target: { value: "5" } });
    fireEvent.click(within(days.closest(".setrow") as HTMLElement).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("PUT", "/settings")).toEqual([{ application_response_days: 5 }]));
  });

  it("shows the rate example at the price the API sends, and the rate change notice", async () => {
    await openTab("Rates and plans");
    expect(screen.getByText("Example, one Scale shop")).toBeInTheDocument();
    // 20% of $599.00, not of the $497.00 the page once had written in.
    expect(screen.getByText("$119.80 a month")).toBeInTheDocument();
    const notice = screen.getByLabelText("Rate change notice");
    expect(notice).toHaveValue("30");
    fireEvent.change(notice, { target: { value: "0" } });
    fireEvent.click(within(notice.closest(".setrow") as HTMLElement).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent("PUT", "/settings")).toEqual([{ rate_change_notice_days: 0 }]));
  });

  it("makes another plan the default, with a reason", async () => {
    await openTab("Rates and plans");
    // Only a plan that is not the default can be made it.
    const buttons = screen.getAllByRole("button", { name: "Make default" });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Make Standard the default")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("Reason, required"), { target: { value: "Back to the public rate" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Make default" }));
    await waitFor(() => expect(sent("POST", "/rate-plans/rp1/default")).toEqual([{ reason: "Back to the public rate" }]));
  });
});

describe("the default rate plan", () => {
  it("is the one the Approve dialog starts on", async () => {
    render(<ApplicationDetail id="a1" go={vi.fn()} onChanged={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(within(screen.getByRole("dialog")).getByLabelText("Rate plan")).toHaveValue("rp2");
    // And a question's answer goes where partner emails reply to.
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Request info" }));
    expect(screen.getByText("Emailed to the applicant. Their answer comes back to partners@pc.test.")).toBeInTheDocument();
  });

  it("is the one the Add affiliate dialog starts on", async () => {
    render(<AffiliatesList go={vi.fn()} adding />);
    await waitFor(() => expect(within(screen.getByRole("dialog")).getByLabelText("Rate plan")).toHaveValue("rp2"));
  });
});
