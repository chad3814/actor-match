import { describe, it, expect } from "vitest";
import fixture from "./fixtures/search-person.json";
import { mapSearchResults } from "@/lib/tmdb/search-people";

describe("mapSearchResults", () => {
  it("maps TMDB results into slim shape", () => {
    const slim = mapSearchResults(fixture);
    expect(slim).toHaveLength(2);
    expect(slim[0]).toEqual({
      id: 6384,
      name: "Keanu Reeves",
      profilePath: "/4D0PpNI0kmP58hgrwGC3wCjxhnm.jpg",
      knownFor: ["The Matrix", "Inception", "John Wick"],
    });
  });

  it("caps knownFor at 3", () => {
    const slim = mapSearchResults(fixture);
    expect(slim[0]!.knownFor).toHaveLength(3);
  });

  it("drops null titles and prefers title over name", () => {
    const slim = mapSearchResults(fixture);
    expect(slim[1]!.knownFor).toEqual(["Some Show"]);
    expect(slim[1]!.profilePath).toBeNull();
  });

  it("limits to 8 results", () => {
    const big = {
      results: Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        name: `Person ${i}`,
        profile_path: null,
        known_for: [],
      })),
    };
    const slim = mapSearchResults(big);
    expect(slim).toHaveLength(8);
  });
});
