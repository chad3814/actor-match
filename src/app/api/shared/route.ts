import { NextResponse } from "next/server";
import { z } from "zod";
import { intersectCredits } from "@/lib/shared-projects/intersect";
import type { ResolvedActor } from "@/lib/shared-projects/types";
import { TmdbError } from "@/lib/tmdb/client";
import { getActorWithCredits } from "@/lib/tmdb/get-actor-with-credits";

export const runtime = "nodejs";

const bodySchema = z.object({
  actorIds: z.array(z.number().int().positive()).min(2).max(5),
});

export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const dedupedIds = Array.from(new Set(parsed.data.actorIds));
  if (dedupedIds.length < 2) {
    return NextResponse.json(
      { error: "need_two_distinct_actors" },
      { status: 400 },
    );
  }

  const settled = await Promise.allSettled(
    dedupedIds.map((id) => getActorWithCredits(id)),
  );

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    if (result.status === "rejected") {
      const err = result.reason;
      if (err instanceof TmdbError) {
        if (err.status === 404) {
          return NextResponse.json(
            { error: "actor_not_found", actorId: dedupedIds[i] },
            { status: 404 },
          );
        }
        if (err.code === "rate_limited") {
          return NextResponse.json(
            { error: "tmdb_rate_limited" },
            { status: 502 },
          );
        }
        if (err.code === "network_error") {
          return NextResponse.json({ error: "tmdb_timeout" }, { status: 504 });
        }
        return NextResponse.json(
          { error: "tmdb_unavailable" },
          { status: 502 },
        );
      }
      throw err;
    }
  }

  const fulfilled = settled.map((r) => {
    if (r.status !== "fulfilled") throw new Error("unreachable");
    return r.value;
  });

  const projects = intersectCredits(
    fulfilled.map((a) => ({ id: a.id, name: a.name, credits: a.credits })),
  );
  const actors: ResolvedActor[] = fulfilled.map((a) => ({
    id: a.id,
    name: a.name,
    profilePath: a.profilePath,
  }));

  return NextResponse.json(
    { actors, projects },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
