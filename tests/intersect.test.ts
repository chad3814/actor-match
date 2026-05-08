import { describe, it, expect } from "vitest";
import { intersectCredits } from "@/lib/shared-projects/intersect";
import type { NormalizedCredit } from "@/lib/shared-projects/types";

const movie = (
  tmdbId: number,
  partial: Partial<NormalizedCredit> = {},
): NormalizedCredit => ({
  mediaType: "movie",
  tmdbId,
  kind: "cast",
  role: "Self",
  department: null,
  title: `Movie ${tmdbId}`,
  releaseDate: "2020-01-01",
  posterPath: `/poster${tmdbId}.jpg`,
  overview: `Overview ${tmdbId}`,
  ...partial,
});

const tv = (
  tmdbId: number,
  partial: Partial<NormalizedCredit> = {},
): NormalizedCredit => ({
  mediaType: "tv",
  tmdbId,
  kind: "cast",
  role: "Self",
  department: null,
  title: `Show ${tmdbId}`,
  releaseDate: "2020-01-01",
  posterPath: `/poster${tmdbId}.jpg`,
  overview: `Overview ${tmdbId}`,
  ...partial,
});

describe("intersectCredits", () => {
  it("finds one shared movie when both actors have it as cast", () => {
    const result = intersectCredits([
      { id: 1, name: "Alice", credits: [movie(100, { role: "Hero" })] },
      { id: 2, name: "Bob", credits: [movie(100, { role: "Villain" })] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(100);
    expect(result[0]!.roles).toEqual([
      { actorId: 1, actorName: "Alice", kind: "cast", role: "Hero" },
      { actorId: 2, actorName: "Bob", kind: "cast", role: "Villain" },
    ]);
  });

  it("preserves cast/crew kinds for a shared TV series", () => {
    const result = intersectCredits([
      { id: 1, name: "Alice", credits: [tv(200, { role: "Detective" })] },
      {
        id: 2,
        name: "Bob",
        credits: [
          tv(200, {
            kind: "crew",
            role: "Director",
            department: "Directing",
          }),
        ],
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.roles[0]!.kind).toBe("cast");
    expect(result[0]!.roles[1]!.kind).toBe("crew");
    expect(result[0]!.roles[1]!.role).toBe("Director");
  });

  it("narrows the intersection across three actors", () => {
    const result = intersectCredits([
      { id: 1, name: "A", credits: [movie(1), movie(2), movie(3), movie(4), movie(5)] },
      { id: 2, name: "B", credits: [movie(2), movie(3), movie(4), movie(5), movie(6)] },
      { id: 3, name: "C", credits: [movie(5)] },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]!.tmdbId).toBe(5);
  });

  it("prefers cast over crew when an actor has both on the same project", () => {
    const result = intersectCredits([
      {
        id: 1,
        name: "Alice",
        credits: [
          movie(100, { kind: "crew", role: "Producer", department: "Production" }),
          movie(100, { kind: "cast", role: "Hero" }),
        ],
      },
      { id: 2, name: "Bob", credits: [movie(100, { role: "Villain" })] },
    ]);
    expect(result[0]!.roles[0]!.kind).toBe("cast");
    expect(result[0]!.roles[0]!.role).toBe("Hero");
  });

  it("prefers Directing over Production when both crew", () => {
    const result = intersectCredits([
      {
        id: 1,
        name: "Alice",
        credits: [
          movie(100, { kind: "crew", role: "Producer", department: "Production" }),
          movie(100, { kind: "crew", role: "Director", department: "Directing" }),
        ],
      },
      {
        id: 2,
        name: "Bob",
        credits: [movie(100, { kind: "crew", role: "Writer", department: "Writing" })],
      },
    ]);
    expect(result[0]!.roles[0]!.role).toBe("Director");
  });

  it("returns [] when there is no overlap", () => {
    const result = intersectCredits([
      { id: 1, name: "A", credits: [movie(1)] },
      { id: 2, name: "B", credits: [movie(2)] },
    ]);
    expect(result).toEqual([]);
  });

  it("sorts by release date desc with nulls last; tie-breaks by title asc", () => {
    const result = intersectCredits([
      {
        id: 1,
        name: "A",
        credits: [
          movie(1, { releaseDate: "2020-01-01", title: "Alpha" }),
          movie(2, { releaseDate: "2022-05-10", title: "Beta" }),
          movie(3, { releaseDate: null, title: "Gamma" }),
          movie(4, { releaseDate: "2022-05-10", title: "Aardvark" }),
        ],
      },
      {
        id: 2,
        name: "B",
        credits: [
          movie(1, { releaseDate: "2020-01-01", title: "Alpha" }),
          movie(2, { releaseDate: "2022-05-10", title: "Beta" }),
          movie(3, { releaseDate: null, title: "Gamma" }),
          movie(4, { releaseDate: "2022-05-10", title: "Aardvark" }),
        ],
      },
    ]);
    expect(result.map((p) => p.title)).toEqual(["Aardvark", "Beta", "Alpha", "Gamma"]);
  });

  it("preserves submission order in roles regardless of credit input order", () => {
    const result = intersectCredits([
      { id: 7, name: "Seven", credits: [movie(100, { role: "S" })] },
      { id: 3, name: "Three", credits: [movie(100, { role: "T" })] },
      { id: 5, name: "Five", credits: [movie(100, { role: "F" })] },
    ]);
    expect(result[0]!.roles.map((r) => r.actorId)).toEqual([7, 3, 5]);
  });
});
