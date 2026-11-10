/**
 * A sheet the customer uploaded, whose file the shop cannot use or lost,
 * is asked for again and sent again on the same order.
 *
 * Innterflow, order 1011 (2026-11-06): a buyer's own sheet's file was gone.
 * The shop's Production job page has "Ask for the file again" (the customer is
 * emailed with the shop's message); on the customer's print job page, sent
 * back, "Upload a new file" puts the new file on that same job, which goes
 * back to the print team.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { svc, askText } = vi.hoisted(() => ({
  svc: {
    adminOrder: vi.fn(), adminListSizes: vi.fn(async () => [] as unknown[]), adminSetStatus: vi.fn(),
    myOrder: vi.fn(), uploadArtwork: vi.fn(), replaceFile: vi.fn(), resubmit: vi.fn(), reorder: vi.fn(),
  },
  askText: vi.fn(),
}));
vi.mock("@/services/gangSheets.service", () => ({ gangSheetsService: svc }));
vi.mock("@/services/production.service", async (orig) => ({
  ...(await orig<typeof import("@/services/production.service")>()),
  productionService: { settings: vi.fn(async () => ({ cutoff: null })) },
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "job-1" }), useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/dialog", () => ({ ask: vi.fn(async () => true), askText: (...a: unknown[]) => askText(...a), tell: vi.fn() }));
vi.mock("@/components/storefront/GangSheetCanvas", () => ({ GangSheetCanvas: () => null }));

import ProductionJobPage from "@/app/(admin)/admin/production/[id]/page";
import CustomerJobPage from "@/app/(customer)/account/gang-sheets/[id]/page";

const job = (over: Record<string, unknown> = {}) => ({
  id: "job-1", reference: "GS-IC-2611-0042", status: "in_review", stage: "review", job_kind: "upload_own",
  steps: [], next: null, sheet_name: "22 x 30", sheet_width_in: 22, sheet_height_in: 30, sheet_quantity: 1,
  subtotal: 11.4, layout: [], artworks: [{ id: "a1", file_url: "/media/artwork/x/Dise%C3%B1o.png", file_name: "Diseño sin título.png", file_type: "png", width_in: 21.74, height_in: 29.65, quantity: 1 }],
  order_id: "o-1011", order_number: "1011", order_paid: true, contact_name: "Iris chavez", sheet_size_id: "s1",
  versions: [], internal_notes: "", ...over,
});

beforeEach(() => { Object.values(svc).forEach((f) => f.mockReset()); svc.adminListSizes.mockResolvedValue([]); askText.mockReset(); });

describe("the shop asks for the file again", () => {
  it("on a sheet the customer uploaded, with a message the customer is emailed", async () => {
    svc.adminOrder.mockResolvedValue(job());
    svc.adminSetStatus.mockResolvedValue(job({ status: "revision_requested", stage: "customer" }));
    askText.mockResolvedValue("Please upload your sheet again.");
    render(<ProductionJobPage />);
    const button = await screen.findByRole("button", { name: "Ask for the file again" });
    await act(async () => { fireEvent.click(button); });
    expect(askText.mock.calls[0]?.[1]).toContain("press Upload a new file");
    expect(svc.adminSetStatus).toHaveBeenCalledWith("job-1", "revision_requested", "Please upload your sheet again.");
    expect(await screen.findByText(/emailed a link to upload the file again/)).toBeInTheDocument();
  });

  it("not on a sheet built in the studio", async () => {
    svc.adminOrder.mockResolvedValue(job({ job_kind: "gang_sheet" }));
    render(<ProductionJobPage />);
    await screen.findByRole("button", { name: "Request revision" });
    expect(screen.queryByRole("button", { name: "Ask for the file again" })).toBeNull();
  });
});

describe("the customer sends a new file on the same order", () => {
  it("uploads it, puts it on the job, and says it is with the print team", async () => {
    svc.myOrder.mockResolvedValue(job({ status: "revision_requested", own_sheet: true, supplier_notes: "Please upload your sheet again." }));
    svc.uploadArtwork.mockResolvedValue({ url: "https://ik.imagekit.io/9vhlgquzw/tenants/innterflow/new.png", file_name: "new.png", type: "png", size: 10 });
    svc.replaceFile.mockResolvedValue(job({ status: "in_review", own_sheet: true }));
    const { container } = render(<CustomerJobPage />);
    await screen.findByRole("button", { name: "Upload a new file" });
    const input = container.querySelector("[data-new-file-input]") as HTMLInputElement;
    const file = new File(["png"], "new.png", { type: "image/png" });
    await act(async () => { fireEvent.change(input, { target: { files: [file] } }); });
    expect(svc.uploadArtwork).toHaveBeenCalledWith(file);
    expect(svc.replaceFile).toHaveBeenCalledWith("job-1", {
      file_url: "https://ik.imagekit.io/9vhlgquzw/tenants/innterflow/new.png", file_name: "new.png", file_type: "png",
    });
    await waitFor(() => expect(screen.getByText("Thanks! Your new file is with the print team.")).toBeInTheDocument());
  });

  it("is told plainly when the upload is refused, and nothing changes on the job", async () => {
    svc.myOrder.mockResolvedValue(job({ status: "revision_requested", own_sheet: true }));
    svc.uploadArtwork.mockRejectedValue(new Error("The file couldn't be saved just now. Please upload it again."));
    const { container } = render(<CustomerJobPage />);
    await screen.findByRole("button", { name: "Upload a new file" });
    const input = container.querySelector("[data-new-file-input]") as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } }); });
    expect(svc.replaceFile).not.toHaveBeenCalled();
    expect(await screen.findByText("The file couldn't be saved just now. Please upload it again.")).toBeInTheDocument();
  });

  it("only when the shop asked for it, on a sheet the customer uploaded", async () => {
    svc.myOrder.mockResolvedValue(job({ status: "in_review", own_sheet: true }));
    render(<CustomerJobPage />);
    await screen.findByText("GS-IC-2611-0042");
    expect(screen.queryByRole("button", { name: "Upload a new file" })).toBeNull();
  });
});
