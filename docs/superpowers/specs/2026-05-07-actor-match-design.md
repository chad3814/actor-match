# actor-match — Design Spec

**Date:** 2026-05-07
**Status:** Draft, pending review
**Author:** Chad Walker (with Claude Code)

## 1. Purpose

A small Next.js site, deployed on Vercel, where a user enters 2–5 actor names and
gets back the list of movies and TV projects those actors all worked on
together. Built on themoviedb.org (TMDB) data.

## 2. Goals & non-goals

**Goals**

- Type-ahead actor search backed by TMDB so users can pick the right person
  even when names collide.
- Compute the intersection of every selected actor's combined credits (cast +
  crew, movies + TV) and present each shared project with each selected
  actor's role on it.
- Server-only TMDB credentials: the API key never reaches the browser.
- Unit-tested intersection logic and TMDB response normalization.
- Production-ready on Vercel with a single environment variable.

**Non-goals (v1)**

- Persistent caching (Vercel runtime cache, KV, Redis). HTTP `Cache-Control`
  only.
- Shareable URLs encoding the selected actors.
- Filter UI (movie-only / TV-only / cast-only toggles).
- Analytics, auth, or rate limiting on our own endpoints.
- A theme toggle (theme follows system via `next-themes`).

## 3. Stack & conventions

- Next.js 16 (App Router) + TypeScript strict, deployed on Vercel.
- Tailwind CSS + shadcn/ui primitives (`Input`, `Button`, `Card`, `Avatar`,
  `Badge`, `Skeleton`, `Command`, `Alert`).
- Vitest for unit tests, fixtures hand-trimmed from real TMDB responses.
- 2-space indent, semicolons on, no `any` or `unknown` types.
- `tsc --noEmit` with `strict: true` and `noUncheckedIndexedAccess: true`.
- ESLint with `no-explicit-any` enabled.
- Node runtime for route handlers (we want `process.env` and aren't latency
  bound).

## 4. Architecture & file layout

```
actor-match/
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── actors/search/route.ts
│   │       └── shared/route.ts
│   ├── components/
│   │   ├── actor-search-row.tsx
│   │   ├── actor-search-list.tsx
│   │   ├── shared-project-card.tsx
│   │   └── ui/                              # shadcn-generated primitives
│   ├── lib/
│   │   ├── tmdb/
│   │   │   ├── client.ts
│   │   │   ├── search-people.ts
│   │   │   ├── combined-credits.ts
│   │   │   └── types.ts
│   │   └── shared-projects/
│   │       ├── intersect.ts
│   │       └── types.ts
│   └── env.ts
├── tests/
│   ├── intersect.test.ts
│   ├── tmdb-search-people.test.ts
│   ├── tmdb-combined-credits.test.ts
│   └── fixtures/
├── .env.local.example
├── components.json
├── next.config.ts
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

Boundaries:

- Components and route handlers never call `fetch` directly. All TMDB I/O is
  gated through `src/lib/tmdb/*`.
- `src/lib/shared-projects/intersect.ts` is pure (no I/O). It takes normalized
  credits in and returns the shared-project list out, so unit tests don't need
  the network.

## 5. Data shapes

```ts
// src/lib/tmdb/types.ts — what our route handlers expose
export type PersonSearchResult = {
  id: number;
  name: string;
  profilePath: string | null;        // e.g. "/xyz.jpg"; full URL built client-side
  knownFor: string[];                // up to 3 movie/TV titles, no nulls
};

// src/lib/shared-projects/types.ts
export type MediaType = "movie" | "tv";

export type ActorRole = {
  actorId: number;
  actorName: string;
  kind: "cast" | "crew";
  role: string;                       // character (cast) or job (crew)
};

export type SharedProject = {
  mediaType: MediaType;
  tmdbId: number;
  title: string;                      // movie title or TV name
  releaseDate: string | null;         // YYYY-MM-DD or null
  year: number | null;
  posterPath: string | null;
  overview: string;
  roles: ActorRole[];                 // exactly actorIds.length entries
};

export type NormalizedCredit = {
  mediaType: MediaType;
  tmdbId: number;
  kind: "cast" | "crew";
  role: string;
  title: string;
  releaseDate: string | null;
  posterPath: string | null;
  overview: string;
};

export type ResolvedActor = {
  id: number;
  name: string;
  profilePath: string | null;
};
```

`SharedProject.roles` always contains exactly `actorIds.length` entries, in the
order actor IDs were submitted. If an actor has multiple credits on the same
project (cast + crew, or two crew jobs), normalization keeps the most
informative one using this precedence:

1. `cast` beats `crew`.
2. Within crew, prefer the highest-billed department in this order:
   `Directing` > `Writing` > `Production` > others (alphabetical fallback).

Outcome: one role per actor per project, deterministic.

## 6. Intersection algorithm

`src/lib/shared-projects/intersect.ts`, pure and synchronous:

```ts
export function intersectCredits(
  actors: { id: number; name: string; credits: NormalizedCredit[] }[],
): SharedProject[];
```

Algorithm:

1. For each actor, group credits by key `${mediaType}:${tmdbId}`. For each
   key, reduce to one credit using the precedence rule above.
2. Compute the set intersection of keys across all actors (a key must appear
   in every actor's reduced map).
3. For each shared key, build a `SharedProject`:
   - `title`, `releaseDate`, `posterPath`, `overview` taken from the first
     actor (in submission order) whose credit has them populated. TMDB
     occasionally returns nulls per credit even when a sibling credit on the
     same media has the data.
   - `year` derived from `releaseDate` (`null` when `releaseDate` is null).
   - `roles` built in submission order: `[{actorId, actorName, kind, role}, ...]`.
4. Sort `SharedProject[]` by `releaseDate` desc, nulls last; tie-break by
   `title` ascending.

Complexity: O(total credits) for normalization + O(min actor's credit count)
for the intersection.

## 7. API surface

Two route handlers, both Node runtime, both server-only.

### 7.1 `GET /api/actors/search?q=<string>`

Used by the typeahead.

- Trim `q`. If empty or fewer than 2 characters → respond `200` with `[]`.
- Calls `src/lib/tmdb/search-people.ts`, which calls TMDB
  `GET /search/person?query=…&include_adult=false`.
- Maps the first 8 results to `PersonSearchResult[]`.
- `knownFor` is built from each TMDB person's `known_for` array: each entry's
  `title` (movie) or `name` (tv), capped at 3, drop nulls.
- Response: `200 application/json`, body is `PersonSearchResult[]`.
- Cache headers: `Cache-Control: private, max-age=60`.

Validation: `q` is parsed with a small zod schema. Anything malformed →
`400 { error: string }`. TMDB upstream failure → `502 { error: "tmdb_unavailable" }`
(we don't leak TMDB's body).

### 7.2 `POST /api/shared`

Used by the "Find shared projects" submit.

- Body: `{ actorIds: number[] }`. Validated with zod:
  `actorIds.length` between 2 and 5, each value a positive integer. The
  server dedupes silently before fetching.
- For each actor, fetch in parallel via `Promise.all`:
  TMDB `GET /person/{id}?append_to_response=combined_credits`. One call per
  actor (the `append_to_response` trick avoids a second hop).
- Normalize each actor's `combined_credits` in
  `src/lib/tmdb/combined-credits.ts`:
  - `cast` rows → `{ kind: "cast", role: character ?? "" }`.
  - `crew` rows → `{ kind: "crew", role: job ?? department ?? "" }`.
  - Drop rows missing `id` or `media_type`.
- Call `intersectCredits(...)`.
- Response shape:
  ```ts
  {
    actors: ResolvedActor[],            // resolved name + photo per submitted ID
    projects: SharedProject[]
  }
  ```
- Returning the resolved actor list lets the client render an
  "X & Y & Z together in:" header without a re-query.
- Cache headers: `Cache-Control: private, max-age=300`.

Errors:

- `actorIds` validation fails → `400 { error: "invalid_request", details: ... }`.
- After dedupe, fewer than 2 distinct IDs → `400 { error: "need_two_distinct_actors" }`.
- A single actor 404 from TMDB → `404 { error: "actor_not_found", actorId: number }`.
- Any other upstream failure → `502 { error: "tmdb_unavailable" }`.
- TMDB rate limit not recovered after one retry → `502 { error: "tmdb_rate_limited" }`.

### 7.3 `src/lib/tmdb/client.ts`

Cross-cutting concerns:

- Reads `TMDB_API_KEY` from validated env (`src/env.ts`, zod-checked at module
  load). Throws fast if missing.
- Sends `Authorization: Bearer ${TMDB_API_KEY}` (TMDB v4 token style). Env var
  name is `TMDB_API_KEY`.
- Wraps `fetch` with:
  - 10s timeout via `AbortSignal.timeout(10_000)`.
  - One retry on network error or 5xx (no retry on 4xx).
  - On 429: sleep `min(Retry-After, 2000)` ms, retry once, then give up.
  - Structured error throws via `TmdbError { status, code }`.
- Sends `User-Agent: actor-match/0.1 (+github)`.

## 8. UI

Single page at `/`. `page.tsx` is a client component. No router state, no URL
params for v1.

### 8.1 State (in `page.tsx`)

```ts
type ActorSlot =
  | { id: string; status: "empty"; query: string }
  | { id: string; status: "picked"; person: PersonSearchResult };

type ResultsState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; actors: ResolvedActor[]; projects: SharedProject[] }
  | { kind: "error"; message: string };
```

`ActorSlot.id` is `crypto.randomUUID()` so add/remove doesn't shuffle React
keys. The list starts with two empty slots.

### 8.2 Components

**`<ActorSearchList>`**

- Renders 2 to 5 `<ActorSearchRow>` slots.
- "Add actor" button visible when `slots.length < 5` and the last slot is
  `picked`.
- Each row has a small "✕" remove button, enabled only when `slots.length > 2`.
- "Find shared projects" button at the bottom; disabled unless at least 2
  slots are `picked`.

**`<ActorSearchRow>`** — two visual states:

- *Empty*: shadcn `Command` popover triggered by the input. A `useTypeahead`
  hook debounces 200ms, calls `/api/actors/search?q=…`, aborts in-flight
  requests on new keystrokes, and ignores stale responses by request-id. Each
  option shows `Avatar` (profile photo or initials fallback), name, and a
  muted `knownFor.join(" · ")`. Enter or click selects → slot becomes
  *Picked*. The hook filters out actor IDs already picked in other slots.
- *Picked*: a compact chip card — avatar, name, "change" button that returns
  the slot to *Empty* with an empty query.

**`<SharedProjectCard>`**

- Left: poster via Next `<Image>` against `image.tmdb.org/t/p/w185/...`, or a
  placeholder tile if `posterPath` is null.
- Right: title, year, `<Badge>` for `mediaType` ("Movie" / "TV"), overview
  line-clamped to 3 lines.
- Below: one line per actor in submission order: `Avatar (xs) · Name — role`.
  When `kind === "crew"`, the role is suffixed with " (crew: <job>)".

**Results header** — "Found N projects with `<actor name chips>`" or
"No shared projects." when `projects.length === 0`.

### 8.3 Interaction flow

1. User types in row 1. Typeahead fires after 200ms idle. Picks an actor.
2. Row 2 becomes focusable; same flow. With ≥ 2 picked, "Find shared
   projects" enables.
3. Optional: "Add actor" → adds an empty row 3 (max 5).
4. Click "Find shared projects" → `ResultsState = "loading"`, POST to
   `/api/shared`, render skeleton cards.
5. On `200`: render the project cards. On error: inline `<Alert>` above the
   form with a "Retry" button.

### 8.4 Loading & empty states

- Typeahead: small spinner inside the popover while a request is in flight;
  "No matches" if a finished response is empty.
- Submit: 6 skeleton cards in a 1-column (mobile) / 2-column (≥ md) grid.
- Zero results: "No projects in common — try fewer or different actors."

### 8.5 Visuals & layout

- Centered single column, `max-w-3xl` with `px-4`.
- Header: app name + one-line tagline.
- No nav. Footer: TMDB attribution line ("Data provided by TMDB" with logo
  per their attribution requirement).
- Light/dark via `next-themes`, follows system. No toggle in v1.
- Posters: `next.config.ts` adds `image.tmdb.org` to `images.remotePatterns`.

### 8.6 Accessibility

- Inputs carry `aria-label`. shadcn `Command` already implements `combobox`
  ARIA semantics.
- Submit button announces busy state via `aria-busy`.
- Card images carry meaningful `alt` (`${title} (${year})`).

## 9. Error handling & edge cases

- **Missing `TMDB_API_KEY`**: zod parse in `src/env.ts` throws at module load.
  Dev server and Vercel build both fail loud rather than producing a
  confusing 401 at runtime.
- **TMDB 401 / 403**: server logs the response, returns
  `502 { error: "tmdb_unavailable" }` to the client. We don't surface "your
  API key is bad" to end users.
- **TMDB 429**: client wrapper sleeps for `Retry-After` (capped at 2s) and
  retries once. Still 429 → `502 { error: "tmdb_rate_limited" }`. UI: "TMDB
  is throttling us, try again in a moment."
- **Single-actor 404 in `/api/shared`**:
  `404 { error: "actor_not_found", actorId }`. UI flags the offending row
  with "Actor not found" and asks the user to re-pick.
- **Network/timeout (10s)**: route handler returns `504`. UI: generic retry.
- **Empty intersection**: not an error. `200 { actors, projects: [] }`; UI
  shows the "no overlap" empty state.
- **Duplicate actor IDs in submit**: server dedupes. Fewer than 2 distinct
  IDs after dedupe → `400 { error: "need_two_distinct_actors" }`.
- **Same actor picked in two rows**: client prevents this — the typeahead
  filters out already-picked actor IDs.
- **TMDB credit with `null` `id` or `media_type`**: dropped in normalization,
  logged at debug level only.
- **Missing poster**: shadcn `Avatar`-style fallback for actor photos; for
  project posters, a neutral placeholder tile with the title initials.
- **Adult content**: `include_adult=false` on person search; no further
  filtering of the credit list.

## 10. Testing

Vitest, all under `tests/`, fixtures hand-trimmed from real TMDB responses.

**`tests/intersect.test.ts`** — the meat:

1. Two actors, one shared movie, both cast → one project, two roles, cast
   `kind`.
2. Two actors, shared TV series, one cast + one crew → roles preserve `kind`.
3. Three actors, intersection narrows correctly (A∩B has 5, A∩B∩C has 1).
4. Same project on an actor's list twice (cast + crew) → role precedence
   picks cast.
5. Same project on an actor's list as two crew jobs → highest-precedence
   department wins.
6. No overlap → `[]`.
7. Sort: mixed release dates including nulls → desc with nulls last; ties
   sorted by title ascending.
8. `roles` order matches submission order of `actorIds` regardless of credit
   input order.

**`tests/tmdb-search-people.test.ts`** — fixture-driven: feed canned TMDB
JSON, assert the slim `PersonSearchResult[]` shape, including `knownFor`
capping at 3 and dropping null titles.

**`tests/tmdb-combined-credits.test.ts`** — fixture-driven: cast row + crew
row + malformed row → produces correct `NormalizedCredit[]` and drops the
malformed one.

No route-handler or component tests in v1. The route handlers are thin
compositions of the modules above; the algorithmic surface is what's worth
pinning down.

## 11. Verification gates

Per project rule "not done until verified", every change must pass:

1. `npm run lint` — ESLint, Next.js config, `no-explicit-any` on.
2. `npm run typecheck` — `tsc --noEmit`, strict.
3. `npm test` — Vitest, all green.
4. `npm run build` — `next build` succeeds.
5. Manual smoke: `npm run dev`, run the golden path
   (search → pick 2 → submit → see results), verify in browser.

## 12. Deployment

- Vercel project linked via `vercel link` against the existing account.
- Single env var: `TMDB_API_KEY`, set on Production, Preview, and Development
  scopes via `vercel env add`.
- `.env.local.example` is committed with a `TMDB_API_KEY=` placeholder;
  `.env.local` is git-ignored.
- No custom `vercel.json` — defaults are fine for Node runtime route
  handlers.
- No commit, push, or deploy is performed without explicit user approval.
