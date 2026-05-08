import { NextResponse } from "next/server";
import { z } from "zod";
import { searchPeople } from "@/lib/tmdb/search-people";
import { TmdbError } from "@/lib/tmdb/client";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const trimmed = (parsed.data.q ?? "").trim();
  if (trimmed.length < 2) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const results = await searchPeople(trimmed);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (err instanceof TmdbError) {
      console.error("TMDB search-people failed", {
        status: err.status,
        code: err.code,
      });
      return NextResponse.json(
        { error: err.code === "rate_limited" ? "tmdb_rate_limited" : "tmdb_unavailable" },
        { status: 502 },
      );
    }
    throw err;
  }
}
