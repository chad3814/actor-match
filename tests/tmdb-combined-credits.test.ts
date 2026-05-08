import { describe, it, expect } from "vitest";
import fixture from "./fixtures/combined-credits.json";
import { normalizeCombinedCredits } from "@/lib/tmdb/combined-credits";

describe("normalizeCombinedCredits", () => {
  const credits = normalizeCombinedCredits(fixture.combined_credits);

  it("normalizes cast rows with character as role", () => {
    const matrix = credits.find((c) => c.tmdbId === 603);
    expect(matrix).toMatchObject({
      mediaType: "movie",
      kind: "cast",
      role: "Neo",
      title: "The Matrix",
      releaseDate: "1999-03-30",
      posterPath: "/matrix.jpg",
    });
  });

  it("normalizes TV cast rows using name and first_air_date", () => {
    const show = credits.find((c) => c.tmdbId === 1234);
    expect(show).toMatchObject({
      mediaType: "tv",
      kind: "cast",
      title: "Generic Show",
      releaseDate: "2010-01-01",
    });
  });

  it("normalizes crew rows with job + department", () => {
    const side = credits.find((c) => c.tmdbId === 999);
    expect(side).toMatchObject({
      kind: "crew",
      role: "Producer",
      department: "Production",
    });
  });

  it("drops rows missing id or media_type", () => {
    const ids = credits.map((c) => c.tmdbId);
    expect(ids).not.toContain(5678);
    expect(ids).not.toContain(7777);
  });

  it("returns 4 valid credits from the fixture", () => {
    expect(credits).toHaveLength(4);
  });
});
