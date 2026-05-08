import { tmdbFetch } from "./client";
import {
  normalizeCombinedCredits,
  type TmdbCombinedCredits,
} from "./combined-credits";
import type {
  NormalizedCredit,
} from "@/lib/shared-projects/types";

type TmdbPersonWithCredits = {
  id: number;
  name: string;
  profile_path: string | null;
  combined_credits?: TmdbCombinedCredits;
};

export type ActorWithCredits = {
  id: number;
  name: string;
  profilePath: string | null;
  credits: NormalizedCredit[];
};

export async function getActorWithCredits(id: number): Promise<ActorWithCredits> {
  const response = await tmdbFetch<TmdbPersonWithCredits>(`/person/${id}`, {
    searchParams: { append_to_response: "combined_credits" },
  });
  return {
    id: response.id,
    name: response.name,
    profilePath: response.profile_path,
    credits: normalizeCombinedCredits(response.combined_credits ?? {}),
  };
}
