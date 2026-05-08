import type {
  ActorRole,
  NormalizedCredit,
  SharedProject,
} from "./types";

const CREW_DEPARTMENT_PRIORITY = ["Directing", "Writing", "Production"];

type ActorInput = { id: number; name: string; credits: NormalizedCredit[] };

export function intersectCredits(actors: ActorInput[]): SharedProject[] {
  if (actors.length < 2) return [];

  const reducedByActor = actors.map((actor) => ({
    actor,
    byKey: reduceCredits(actor.credits),
  }));

  const sharedKeys = intersectKeys(reducedByActor.map((entry) => entry.byKey));

  const projects: SharedProject[] = [];
  for (const key of sharedKeys) {
    const sourceCredits = reducedByActor.map((entry) => {
      const credit = entry.byKey.get(key);
      if (!credit) {
        throw new Error(`Invariant violation: missing credit for key ${key}`);
      }
      return { actor: entry.actor, credit };
    });

    const firstWith = (predicate: (c: NormalizedCredit) => boolean) =>
      sourceCredits.find(({ credit }) => predicate(credit))?.credit;

    const titleSource =
      firstWith((c) => c.title.length > 0) ?? sourceCredits[0]!.credit;
    const dateSource = firstWith((c) => c.releaseDate !== null);
    const posterSource = firstWith((c) => c.posterPath !== null);
    const overviewSource = firstWith((c) => c.overview.length > 0);

    const releaseDate = dateSource?.releaseDate ?? null;
    const yearNum = releaseDate ? Number(releaseDate.slice(0, 4)) : null;

    const roles: ActorRole[] = sourceCredits.map(({ actor, credit }) => ({
      actorId: actor.id,
      actorName: actor.name,
      kind: credit.kind,
      role: credit.role,
    }));

    projects.push({
      mediaType: titleSource.mediaType,
      tmdbId: titleSource.tmdbId,
      title: titleSource.title,
      releaseDate,
      year: yearNum !== null && Number.isFinite(yearNum) ? yearNum : null,
      posterPath: posterSource?.posterPath ?? null,
      overview: overviewSource?.overview ?? "",
      roles,
    });
  }

  projects.sort(byReleaseDateDescThenTitle);
  return projects;
}

function reduceCredits(
  credits: NormalizedCredit[],
): Map<string, NormalizedCredit> {
  const byKey = new Map<string, NormalizedCredit>();
  for (const credit of credits) {
    const key = creditKey(credit);
    const existing = byKey.get(key);
    if (!existing || winsOver(credit, existing)) {
      byKey.set(key, credit);
    }
  }
  return byKey;
}

function creditKey(c: NormalizedCredit): string {
  return `${c.mediaType}:${c.tmdbId}`;
}

function winsOver(
  candidate: NormalizedCredit,
  existing: NormalizedCredit,
): boolean {
  if (candidate.kind === "cast" && existing.kind === "crew") return true;
  if (candidate.kind === "crew" && existing.kind === "cast") return false;
  if (candidate.kind === "cast" && existing.kind === "cast") return false;
  const candDept = candidate.department ?? "";
  const existDept = existing.department ?? "";
  const candRank = crewRank(candDept);
  const existRank = crewRank(existDept);
  if (candRank !== existRank) return candRank < existRank;
  return candDept.localeCompare(existDept) < 0;
}

function crewRank(department: string): number {
  const idx = CREW_DEPARTMENT_PRIORITY.indexOf(department);
  return idx === -1 ? CREW_DEPARTMENT_PRIORITY.length : idx;
}

function intersectKeys(maps: Map<string, NormalizedCredit>[]): Set<string> {
  if (maps.length === 0) return new Set();
  const [first, ...rest] = maps;
  const result = new Set<string>(first!.keys());
  for (const next of rest) {
    for (const key of result) {
      if (!next.has(key)) result.delete(key);
    }
  }
  return result;
}

function byReleaseDateDescThenTitle(a: SharedProject, b: SharedProject): number {
  if (a.releaseDate === null && b.releaseDate !== null) return 1;
  if (a.releaseDate !== null && b.releaseDate === null) return -1;
  if (a.releaseDate !== null && b.releaseDate !== null) {
    if (a.releaseDate < b.releaseDate) return 1;
    if (a.releaseDate > b.releaseDate) return -1;
  }
  return a.title.localeCompare(b.title);
}
