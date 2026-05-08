export type MediaType = "movie" | "tv";

export type ActorRole = {
  actorId: number;
  actorName: string;
  kind: "cast" | "crew";
  role: string;
};

export type NormalizedCredit = {
  mediaType: MediaType;
  tmdbId: number;
  kind: "cast" | "crew";
  role: string;
  department: string | null;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  overview: string;
};

export type SharedProject = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;
  releaseDate: string | null;
  year: number | null;
  posterPath: string | null;
  overview: string;
  roles: ActorRole[];
};

export type ResolvedActor = {
  id: number;
  name: string;
  profilePath: string | null;
};
