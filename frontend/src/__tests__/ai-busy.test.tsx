/**
 * A busy AI is said in our own words, calmly, in each of the three chats.
 *
 * Gemini's free model often answers "high demand", and the chats showed what
 * the provider said in a red error box. The server now answers AI_BUSY with
 * our own message (backend tests/test_copilot_busy.py). Here each chat shows it
 * as a pause, not a fault, gives the question back for another try, and stays
 * switched on; any other failure still shows as before.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const post = vi.fn();
vi.mock("@/lib/api-client", () => ({ apiClient: { post: (...a: unknown[]) => post(...a) } }));

import { AI_BUSY_MESSAGE, aiBusy, aiBusyMessage } from "@/lib/aiBusy";
import { CopilotChat } from "@/components/admin/CopilotChat";
import { SupportChat } from "@/components/storefront/SupportChat";
import { StudioAssistant } from "@/components/storefront/StudioAssistant";

// jsdom has no scrolling; the chats scroll to their newest line.
Object.defineProperty(Element.prototype, "scrollTo", { value: () => {}, configurable: true, writable: true });

const failure = (status: number, code: string, message: string) => Object.assign(new Error(message), { status, code });
const BUSY = failure(502, "AI_BUSY", AI_BUSY_MESSAGE);

beforeEach(() => { post.mockReset(); });

describe("telling a busy AI apart", () => {
  it("is the server's AI_BUSY, or a gateway that gave up waiting", () => {
    expect(aiBusy(BUSY)).toBe(true);
    expect(aiBusy(failure(504, "UNKNOWN", "Gateway Timeout"))).toBe(true);
    expect(aiBusy(failure(502, "UNKNOWN", "Bad Gateway"))).toBe(true);
    // Our other answers keep their own words: switched off, a used-up day, a bad key.
    expect(aiBusy(failure(503, "ERROR", "The assistant isn't available right now."))).toBe(false);
    expect(aiBusy(failure(429, "ERROR", "Today's copilot limit has been reached."))).toBe(false);
    expect(aiBusy(failure(502, "ERROR", "The AI service rejected the platform's API key."))).toBe(false);
    expect(aiBusy(new TypeError("Failed to fetch"))).toBe(false);
    expect(aiBusy(null)).toBe(false);
  });

  it("says it in the server's words, or ours when a gateway answered", () => {
    expect(aiBusyMessage(failure(502, "AI_BUSY", "Back soon."))).toBe("Back soon.");
    expect(aiBusyMessage(failure(504, "UNKNOWN", "Gateway Timeout"))).toBe(AI_BUSY_MESSAGE);
  });
});

describe("the owner's copilot", () => {
  async function askCopilot(question: string) {
    fireEvent.change(screen.getByLabelText("Ask the copilot"), { target: { value: question } });
    fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  }

  it("says a busy AI calmly and gives the question back", async () => {
    post.mockRejectedValueOnce(BUSY);
    render(<CopilotChat />);
    await askCopilot("How were sales this week?");
    const note = await screen.findByRole("status");
    expect(note).toHaveTextContent(AI_BUSY_MESSAGE);
    expect(note).toHaveAttribute("data-tone", "blue");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Ask the copilot")).toHaveValue("How were sales this week?");
  });

  it("still shows any other failure as an error", async () => {
    post.mockRejectedValueOnce(failure(502, "ERROR", "The AI service rejected the platform's API key."));
    render(<CopilotChat />);
    await askCopilot("Which print jobs are waiting?");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("rejected the platform's API key");
    expect(alert).toHaveAttribute("data-tone", "red");
  });
});

describe("a customer's order chat", () => {
  it("says a busy AI calmly and stays on", async () => {
    post.mockRejectedValueOnce(BUSY);
    render(<SupportChat />);
    fireEvent.click(screen.getByRole("button", { name: "Ask a question" }));
    const input = screen.getByPlaceholderText("e.g. How much for 50 hoodies?");
    fireEvent.change(input, { target: { value: "Where is my latest order?" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("status")).toHaveTextContent(AI_BUSY_MESSAGE);
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue("Where is my latest order?");
  });
});

describe("the gang sheet builder's assistant", () => {
  function renderAssistant() {
    render(
      <StudioAssistant open onClose={() => {}} getContext={() => null} preview={vi.fn()} run={vi.fn()}
        upload={async () => []} accept="image/*" uploading={false} />,
    );
    return screen.getByPlaceholderText("e.g. 10 of my logo, 4 inches wide, on a 22x10");
  }

  it("says a busy AI calmly and stays on", async () => {
    post.mockRejectedValueOnce(BUSY);
    const input = renderAssistant();
    fireEvent.change(input, { target: { value: "Build my sheet for me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("status")).toHaveTextContent(AI_BUSY_MESSAGE);
    expect(input).not.toBeDisabled();
    expect(input).toHaveValue("Build my sheet for me");
  });

  it("still switches itself off when the shop does not have it", async () => {
    post.mockRejectedValueOnce(failure(503, "ERROR", "The assistant isn't available right now."));
    const input = renderAssistant();
    fireEvent.change(input, { target: { value: "Build my sheet for me" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(input).toBeDisabled());
    expect(screen.queryByRole("status")).toBeNull();
  });
});
