"use client";

import { useState } from "react";
import {
  ActorSearchList,
  type ActorSlot,
} from "@/components/actor-search-list";
import { SharedProjectCard } from "@/components/shared-project-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  MediaTypeFilter,
  type MediaFilterValue,
} from "@/components/media-type-filter";
import type {
  ResolvedActor,
  SharedProject,
} from "@/lib/shared-projects/types";
import type { PersonSearchResult } from "@/lib/tmdb/types";

type ResultsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; actors: ResolvedActor[]; projects: SharedProject[] }
  | { kind: "error"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  invalid_request: "Something's off with the request — try again.",
  need_two_distinct_actors: "Pick at least two different actors.",
  actor_not_found: "One of the selected actors couldn't be found on TMDB.",
  tmdb_unavailable: "TMDB is unreachable. Try again in a moment.",
  tmdb_rate_limited: "TMDB is throttling us. Try again in a moment.",
  tmdb_timeout: "TMDB took too long to respond. Try again.",
};

function newSlot(): ActorSlot {
  return { id: crypto.randomUUID(), status: "empty" };
}

export default function HomePage() {
  const [slots, setSlots] = useState<ActorSlot[]>(() => [newSlot(), newSlot()]);
  const [results, setResults] = useState<ResultsState>({ kind: "idle" });
  const [mediaFilter, setMediaFilter] = useState<MediaFilterValue>("all");

  function pick(slotId: string, person: PersonSearchResult) {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { id: slot.id, status: "picked", person } : slot,
      ),
    );
  }

  function clear(slotId: string) {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.id === slotId ? { id: slot.id, status: "empty" } : slot,
      ),
    );
  }

  function add() {
    setSlots((prev) => [...prev, newSlot()]);
  }

  function remove(slotId: string) {
    setSlots((prev) => prev.filter((slot) => slot.id !== slotId));
  }

  async function submit() {
    const ids = slots
      .map((s) => (s.status === "picked" ? s.person.id : null))
      .filter((id): id is number => id !== null);
    if (ids.length < 2) return;
    setResults({ kind: "loading" });
    try {
      const response = await fetch("/api/shared", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorIds: ids }),
      });
      type SuccessBody = { actors: ResolvedActor[]; projects: SharedProject[] };
      type ErrorBody = { error: string };
      const body = (await response.json().catch(() => ({ error: `http_${response.status}` }))) as
        | SuccessBody
        | ErrorBody;
      if (!response.ok || "error" in body) {
        const code = "error" in body ? body.error : `http_${response.status}`;
        const message = ERROR_MESSAGES[code] ?? code;
        setResults({ kind: "error", message });
        return;
      }
      setResults({
        kind: "ok",
        actors: body.actors,
        projects: body.projects,
      });
    } catch {
      setResults({
        kind: "error",
        message: "Network error — try again.",
      });
    }
  }

  const isSubmitting = results.kind === "loading";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">actor-match</h1>
        <p className="text-muted-foreground">
          Find every movie and TV project two or more actors share.
        </p>
      </header>

      <ActorSearchList
        slots={slots}
        isSubmitting={isSubmitting}
        onPick={pick}
        onClear={clear}
        onAdd={add}
        onRemove={remove}
        onSubmit={submit}
      />

      {results.kind === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load results</AlertTitle>
          <AlertDescription>{results.message}</AlertDescription>
        </Alert>
      ) : null}

      {results.kind === "loading" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : null}

      {results.kind === "ok" ? (
        <ResultsView
          actors={results.actors}
          projects={results.projects}
          mediaFilter={mediaFilter}
          onMediaFilterChange={setMediaFilter}
        />
      ) : null}
    </main>
  );
}

function ResultsView({
  actors,
  projects,
  mediaFilter,
  onMediaFilterChange,
}: {
  actors: ResolvedActor[];
  projects: SharedProject[];
  mediaFilter: MediaFilterValue;
  onMediaFilterChange: (next: MediaFilterValue) => void;
}) {
  const resolvedMap = new Map(
    actors.map((a) => [a.id, { name: a.name, profilePath: a.profilePath }]),
  );

  if (projects.length === 0) {
    return (
      <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
        No projects in common — try fewer or different actors.
      </div>
    );
  }

  const counts = {
    all: projects.length,
    movie: projects.filter((p) => p.mediaType === "movie").length,
    tv: projects.filter((p) => p.mediaType === "tv").length,
  };
  const filtered =
    mediaFilter === "all"
      ? projects
      : projects.filter((p) => p.mediaType === mediaFilter);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <h2 className="text-lg font-semibold">
          Found {projects.length} project{projects.length === 1 ? "" : "s"} with{" "}
          {actors.map((a) => a.name).join(" & ")}
        </h2>
        <MediaTypeFilter
          value={mediaFilter}
          onChange={onMediaFilterChange}
          counts={counts}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyFilterMessage filter={mediaFilter} counts={counts} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((project) => (
            <SharedProjectCard
              key={`${project.mediaType}:${project.tmdbId}`}
              project={project}
              resolvedActors={resolvedMap}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyFilterMessage({
  filter,
  counts,
}: {
  filter: MediaFilterValue;
  counts: { all: number; movie: number; tv: number };
}) {
  if (filter === "all") {
    // Defensive: this branch is unreachable because filtered === projects when
    // filter is "all", and the projects.length === 0 guard above handles it.
    return (
      <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
        No projects to show.
      </div>
    );
  }
  const noun = filter === "movie" ? "movies" : "TV shows";
  const otherType = filter === "movie" ? "TV" : "Movies";
  return (
    <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
      No {noun} among the {counts.all} shared project
      {counts.all === 1 ? "" : "s"} — try <strong>All</strong> or{" "}
      <strong>{otherType}</strong>.
    </div>
  );
}
