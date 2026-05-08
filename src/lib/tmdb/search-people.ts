import { tmdbFetch } from "./client";
import type { PersonSearchResult } from "./types";

type TmdbKnownFor = {
  title?: string | null;
  name?: string | null;
  media_type?: string;
};

type TmdbPerson = {
  id: number;
  name: string;
  profile_path: string | null;
  known_for?: TmdbKnownFor[];
};

type TmdbSearchResponse = { results: TmdbPerson[] };

export async function searchPeople(query: string): Promise<PersonSearchResult[]> {
  const response = await tmdbFetch<TmdbSearchResponse>("/search/person", {
    searchParams: { query, include_adult: "false" },
  });
  return mapSearchResults(response);
}

export function mapSearchResults(
  response: TmdbSearchResponse,
): PersonSearchResult[] {
  return response.results.slice(0, 8).map(toSlim);
}

function toSlim(person: TmdbPerson): PersonSearchResult {
  const knownFor = (person.known_for ?? [])
    .map((entry) => entry.title ?? entry.name ?? null)
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .slice(0, 3);
  return {
    id: person.id,
    name: person.name,
    profilePath: person.profile_path,
    knownFor,
  };
}
