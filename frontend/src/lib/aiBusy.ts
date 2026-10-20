/**
 * The AI is busy or down for now, and asking again later will work.
 *
 * The server says so with the code AI_BUSY and its own words, the same in every
 * chat (backend api/v1/copilot.py, services/copilot/agent.py BUSY). A gateway in
 * front of it that gave up waiting answers 502 or 504 with nothing of ours in
 * the body (code UNKNOWN): the same thing, as far as the person asking can tell.
 * The chats show it calmly, not as a red error.
 */
export const AI_BUSY_MESSAGE =
  "Sorry, our AI is helping a lot of people right now. Please try again in a few minutes.";

export function aiBusy(e: unknown): boolean {
  const err = e as { status?: number; code?: string } | null | undefined;
  if (err?.code === "AI_BUSY") return true;
  return (err?.status === 502 || err?.status === 504) && err?.code === "UNKNOWN";
}

/** The words for it: the server's own when it sent them. */
export function aiBusyMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null | undefined;
  return err?.code === "AI_BUSY" && err.message ? err.message : AI_BUSY_MESSAGE;
}
