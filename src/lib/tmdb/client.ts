import { env } from "@/env";

const TMDB_BASE = "https://api.themoviedb.org/3";
const USER_AGENT = "actor-match/0.1 (+github)";
const TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_MS = 2_000;

export class TmdbError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "TmdbError";
    this.code = code;
    this.status = status;
  }
}

export type TmdbFetchInit = {
  searchParams?: Record<string, string>;
};

export async function tmdbFetch<T>(
  path: string,
  init: TmdbFetchInit = {},
): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  if (init.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return doFetch<T>(url.toString(), 0);
}

async function doFetch<T>(url: string, attempt: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.TMDB_API_KEY}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt < 1) return doFetch<T>(url, attempt + 1);
    const message = err instanceof Error ? err.message : "network error";
    throw new TmdbError("network_error", 0, message);
  }

  if (response.status === 429 && attempt < 1) {
    const waitMs = Math.min(
      parseRetryAfter(response.headers.get("Retry-After")),
      MAX_RETRY_AFTER_MS,
    );
    await sleep(waitMs);
    return doFetch<T>(url, attempt + 1);
  }
  if (response.status === 429) {
    throw new TmdbError("rate_limited", 429);
  }

  if (response.status >= 500 && attempt < 1) {
    return doFetch<T>(url, attempt + 1);
  }

  if (!response.ok) {
    throw new TmdbError("upstream_error", response.status);
  }

  return (await response.json()) as T;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 1000;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return 1000;
  return seconds * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
