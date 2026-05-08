import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmdbFetch, TmdbError } from "@/lib/tmdb/client";

describe("tmdbFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls TMDB with bearer auth and JSON-parses the response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.themoviedb.org/3/x");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("appends searchParams", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await tmdbFetch("/search/person", {
      searchParams: { query: "chris evans", include_adult: "false" },
    });
    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("query")).toBe("chris evans");
    expect(parsed.searchParams.get("include_adult")).toBe("false");
  });

  it("retries once on 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 404 and throws TmdbError with status", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(tmdbFetch("/x")).rejects.toBeInstanceOf(TmdbError);
    await expect(tmdbFetch("/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a thrown network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits Retry-After then retries on 429", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const promise = tmdbFetch<{ ok: boolean }>("/x");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second 429 with code rate_limited", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(new Response("rate", { status: 429 }));
    const expectation = expect(tmdbFetch("/x")).rejects.toMatchObject({
      name: "TmdbError",
      code: "rate_limited",
      status: 429,
    });
    await vi.advanceTimersByTimeAsync(1000);
    await expectation;
  });
});
