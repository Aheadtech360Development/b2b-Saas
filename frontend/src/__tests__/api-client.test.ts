import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiClient, setAccessToken, getAccessToken, ApiClientError } from "@/lib/api-client";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers({ "Content-Type": "application/json" }),
  } as unknown as Response;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("api-client", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setAccessToken(null);
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
  });

  it("adds Authorization header when token is set", async () => {
    setAccessToken("test-token-123");
    fetchSpy.mockResolvedValue(makeResponse(200, { data: "ok" }));

    await apiClient.get("/api/v1/test");

    const headers: Headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.get("Authorization")).toBe("Bearer test-token-123");
  });

  it("does not add Authorization header when no token", async () => {
    fetchSpy.mockResolvedValue(makeResponse(200, {}));

    await apiClient.get("/api/v1/test", { skipAuth: true });

    const headers: Headers = fetchSpy.mock.calls[0][1].headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("throws ApiClientError on 4xx response", async () => {
    // Refresh attempt also returns 401 so auto-refresh doesn't succeed
    fetchSpy.mockResolvedValue(
      makeResponse(401, { error: { code: "UNAUTHORIZED", message: "Token expired" } })
    );

    await expect(apiClient.get("/api/v1/test")).rejects.toBeInstanceOf(ApiClientError);
  });

  it("does not infinite loop when refresh itself returns 401", async () => {
    setAccessToken("stale-token");
    let callCount = 0;

    fetchSpy.mockImplementation((url: string) => {
      callCount++;
      // Both the original request AND the refresh endpoint return 401
      return Promise.resolve(
        makeResponse(401, { error: { code: "UNAUTHORIZED", message: "Expired" } })
      );
    });

    await expect(apiClient.get("/api/v1/orders")).rejects.toBeInstanceOf(ApiClientError);

    // Should call: (1) original request, (2) refresh endpoint, no more retries
    expect(callCount).toBeLessThanOrEqual(3);
  });

  it("retries with new token after successful refresh", async () => {
    setAccessToken("old-token");
    let callCount = 0;

    fetchSpy.mockImplementation((url: string) => {
      callCount++;
      if (url.includes("/api/v1/refresh")) {
        return Promise.resolve(makeResponse(200, { access_token: "new-token-456" }));
      }
      if (callCount === 1) {
        // First original call returns 401
        return Promise.resolve(
          makeResponse(401, { error: { code: "UNAUTHORIZED", message: "Expired" } })
        );
      }
      // Retry after refresh returns 200
      return Promise.resolve(makeResponse(200, { items: [] }));
    });

    const result = await apiClient.get<{ items: unknown[] }>("/api/v1/orders");
    expect(result).toEqual({ items: [] });
    expect(getAccessToken()).toBe("new-token-456");
  });

  it("deduplicates concurrent refresh calls (only one /refresh request)", async () => {
    setAccessToken("old-token");
    const refreshCalls: string[] = [];

    fetchSpy.mockImplementation((url: string) => {
      if (url.includes("/api/v1/refresh")) {
        refreshCalls.push(url);
        return new Promise((resolve) =>
          setTimeout(() => resolve(makeResponse(200, { access_token: "new-token" })), 10)
        );
      }
      // First calls all return 401
      return Promise.resolve(
        makeResponse(401, { error: { code: "UNAUTHORIZED", message: "Expired" } })
      );
    });

    // Fire 3 concurrent requests that all get 401
    await Promise.allSettled([
      apiClient.get("/api/v1/a"),
      apiClient.get("/api/v1/b"),
      apiClient.get("/api/v1/c"),
    ]);

    // refreshPromise deduplication means /refresh should only be called once
    expect(refreshCalls.length).toBe(1);
  });

  it("returns undefined for 204 responses", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    } as Response);

    const result = await apiClient.delete("/api/v1/resource/1");
    expect(result).toBeUndefined();
  });
});
