import type {
  MediaType,
  NormalizedCredit,
} from "@/lib/shared-projects/types";

type TmdbCreditBase = {
  id?: number;
  media_type?: string;
  title?: string | null;
  name?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
  overview?: string | null;
};

type TmdbCastCredit = TmdbCreditBase & {
  character?: string | null;
};

type TmdbCrewCredit = TmdbCreditBase & {
  job?: string | null;
  department?: string | null;
};

export type TmdbCombinedCredits = {
  cast?: TmdbCastCredit[];
  crew?: TmdbCrewCredit[];
};

export function normalizeCombinedCredits(
  combined: TmdbCombinedCredits,
): NormalizedCredit[] {
  const out: NormalizedCredit[] = [];
  for (const cast of combined.cast ?? []) {
    const credit = toCast(cast);
    if (credit) out.push(credit);
  }
  for (const crew of combined.crew ?? []) {
    const credit = toCrew(crew);
    if (credit) out.push(credit);
  }
  return out;
}

function toCast(c: TmdbCastCredit): NormalizedCredit | null {
  const base = baseCredit(c);
  if (!base) return null;
  return {
    ...base,
    kind: "cast",
    role: c.character ?? "",
    department: null,
  };
}

function toCrew(c: TmdbCrewCredit): NormalizedCredit | null {
  const base = baseCredit(c);
  if (!base) return null;
  return {
    ...base,
    kind: "crew",
    role: c.job ?? c.department ?? "",
    department: c.department ?? null,
  };
}

function baseCredit(
  c: TmdbCreditBase,
): Omit<NormalizedCredit, "kind" | "role" | "department"> | null {
  if (typeof c.id !== "number") return null;
  if (c.media_type !== "movie" && c.media_type !== "tv") return null;
  const mediaType = c.media_type as MediaType;
  const title = mediaType === "movie" ? c.title ?? "" : c.name ?? "";
  const releaseDate =
    (mediaType === "movie" ? c.release_date : c.first_air_date) ?? null;
  return {
    mediaType,
    tmdbId: c.id,
    title,
    releaseDate,
    posterPath: c.poster_path ?? null,
    overview: c.overview ?? "",
  };
}
