# actor-match Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Project commit policy:** Chad's `~/.claude/INIT.md` and global rules say *NEVER* commit without explicit approval. Every "Commit" step in this plan is paired with "Pause and ask Chad to approve before running this commit." The executor MUST honor this — do not run `git commit` until the user says to.

**Goal:** Build a Next.js 16 site on Vercel where users enter 2–5 actor names, pick from TMDB-backed typeahead results, and see all movies and TV projects (cast + crew) those actors share, each card showing every selected actor's role.

**Architecture:** Server-only TMDB integration through `src/lib/tmdb/*`; pure intersection algorithm in `src/lib/shared-projects/intersect.ts`; two Node-runtime route handlers (`/api/actors/search`, `/api/shared`); a single client page composed of a search list, picker rows, and result cards. shadcn/ui primitives over Tailwind CSS.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS · shadcn/ui · `next-themes` · `zod` · Vitest · `vite-tsconfig-paths`

**Spec:** `docs/superpowers/specs/2026-05-07-actor-match-design.md`

---

## File structure

```
src/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   └── api/
│       ├── actors/search/route.ts
│       └── shared/route.ts
├── components/
│   ├── actor-search-row.tsx
│   ├── actor-search-list.tsx
│   ├── shared-project-card.tsx
│   └── ui/                        # shadcn-generated primitives
├── hooks/
│   └── use-typeahead.ts
├── lib/
│   ├── tmdb/
│   │   ├── client.ts
│   │   ├── search-people.ts
│   │   ├── combined-credits.ts
│   │   └── types.ts
│   └── shared-projects/
│       ├── intersect.ts
│       └── types.ts
└── env.ts

tests/
├── env.test.ts
├── tmdb-client.test.ts
├── tmdb-search-people.test.ts
├── tmdb-combined-credits.test.ts
├── intersect.test.ts
├── fixtures/
│   ├── search-person.json
│   └── combined-credits.json
└── setup.ts
```

**Spec deviation, intentional:** `NormalizedCredit` gains a `department: string | null` field beyond what the spec listed in §5. The crew-precedence rule in §6 needs the department to evaluate "Directing > Writing > Production > others (alphabetical)". The user-facing `role` field still follows the spec rule (`job ?? department ?? ""`).

---

## Task 1: Bootstrap the Next.js project

**Files:**
- Modify: `.gitignore`, `README.md` (replaced by create-next-app, then merged)
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `vitest.config.ts`, `.env.local.example`, `tests/setup.ts`, plus everything `create-next-app` scaffolds under `src/app/`.

- [ ] **Step 1: Move existing top-level files aside before scaffolding.**

```bash
cd /Users/cwalker/Projects/actor-match
mv README.md README.md.bak
mv .gitignore .gitignore.bak
```

- [ ] **Step 2: Run `create-next-app` in the current directory.**

```bash
npx --yes create-next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --use-npm \
  --import-alias "@/*"
```

Expected: scaffolds Next.js 16 with App Router under `src/`, generates a default `.gitignore`, `README.md`, `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `src/app/{layout,page,globals.css}`. If prompted to overwrite existing files, accept — we already moved the originals.

- [ ] **Step 3: Restore LICENSE, merge gitignore, restore short README.**

```bash
# LICENSE was untouched by create-next-app — verify it still exists
test -f LICENSE && echo "LICENSE intact"

# Merge any custom entries from the old gitignore into the new one
diff -u .gitignore .gitignore.bak || true
# Append any unique entries from the backup that aren't already present:
grep -F -v -f .gitignore .gitignore.bak >> .gitignore || true
rm .gitignore.bak

# Restore the original README content above the scaffold-generated README
mv README.md.bak README.md
```

If the original README is just a project title, leave it. Otherwise concatenate as desired.

- [ ] **Step 4: Append Vitest + env entries to `.gitignore`.**

Open `.gitignore` and ensure these lines are present (add any missing):

```
# tests
/coverage

# env
.env
.env.local
.env.*.local

# editors
.vscode/
.idea/
```

- [ ] **Step 5: Install runtime + dev dependencies.**

```bash
npm install zod next-themes
npm install -D vitest @vitest/coverage-v8 vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom
```

(`@testing-library/*` and `jsdom` are installed for future use; v1 only unit-tests pure modules but the deps are cheap and let the executor add component tests without a separate install.)

- [ ] **Step 6: Update `package.json` scripts.**

Open `package.json`. Replace the `"scripts"` block with:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "test:watch": "vitest"
}
```

- [ ] **Step 7: Tighten `tsconfig.json`.**

Open `tsconfig.json`. In `compilerOptions`, ensure these are present:

```json
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitOverride": true,
"forceConsistentCasingInFileNames": true
```

`strict` is already on by default; add the others if missing. Leave the rest of the config untouched.

- [ ] **Step 8: Create `vitest.config.ts` at the repo root.**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 9: Create `tests/setup.ts`.**

```ts
process.env.TMDB_API_KEY ||= "test-key";
```

- [ ] **Step 10: Create `tests/` directory with a sentinel test so `npm test` exits 0.**

```bash
mkdir -p tests/fixtures
```

Create `tests/sanity.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 11: Create `.env.local.example`.**

```bash
TMDB_API_KEY=
```

- [ ] **Step 12: Verify everything works.**

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Expected: all four exit 0. The dev server is not started in this task — just static checks.

- [ ] **Step 13: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: bootstrap Next.js 16 + Tailwind + Vitest scaffold

Sets up the App Router project under src/, configures strict TypeScript,
adds Vitest with vite-tsconfig-paths and a setup file that primes
TMDB_API_KEY for unit tests, and wires npm scripts for lint, typecheck,
test, and build.
EOF
)"
```

---

## Task 2: Add shadcn/ui primitives

**Files:**
- Create: `components.json`, `src/components/ui/{button,input,card,avatar,badge,skeleton,command,popover,alert,dialog}.tsx` (shadcn-generated).
- Modify: `src/app/globals.css`, possibly `tailwind.config.*` (shadcn init may rewrite).

- [ ] **Step 1: Initialize shadcn/ui.**

```bash
npx --yes shadcn@latest init -d
```

`-d` accepts defaults (style: default, base color: neutral, CSS variables: yes). It will detect the existing Tailwind setup and add tokens to `globals.css`.

- [ ] **Step 2: Add the primitives we'll use.**

```bash
npx --yes shadcn@latest add button input card avatar badge skeleton command popover alert
```

If shadcn prompts about `lucide-react` or other deps, accept.

- [ ] **Step 3: Verify scaffold compiles.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: add shadcn/ui primitives

Initializes shadcn with default style and adds the components used by
the actor-match UI: button, input, card, avatar, badge, skeleton,
command, popover, alert.
EOF
)"
```

---

## Task 3: Env validation (`src/env.ts`)

**Files:**
- Create: `src/env.ts`
- Test: `tests/env.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/env.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { envSchema } from "@/env";

describe("envSchema", () => {
  it("rejects when TMDB_API_KEY is missing", () => {
    const result = envSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an empty TMDB_API_KEY", () => {
    const result = envSchema.safeParse({ TMDB_API_KEY: "" });
    expect(result.success).toBe(false);
  });

  it("accepts a non-empty TMDB_API_KEY", () => {
    const result = envSchema.safeParse({ TMDB_API_KEY: "abc" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.TMDB_API_KEY).toBe("abc");
    }
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.**

```bash
npm test -- tests/env.test.ts
```

Expected: failure — `Cannot find module '@/env'`.

- [ ] **Step 3: Implement `src/env.ts`.**

```ts
import { z } from "zod";

export const envSchema = z.object({
  TMDB_API_KEY: z.string().min(1, "TMDB_API_KEY is required"),
});

export type Env = z.infer<typeof envSchema>;

export const env: Env = envSchema.parse(process.env);
```

- [ ] **Step 4: Run the test, confirm it passes.**

```bash
npm test -- tests/env.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Remove the sentinel test from Task 1.**

```bash
rm tests/sanity.test.ts
```

- [ ] **Step 6: Run lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 7: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/env.ts tests/env.test.ts
git rm tests/sanity.test.ts
git commit -m "$(cat <<'EOF'
feat(env): zod-validated env loader for TMDB_API_KEY

Module-level parse means the dev server and Vercel build fail loud at
startup if TMDB_API_KEY is missing or empty, instead of producing a
confusing 401 at first request.
EOF
)"
```

---

## Task 4: Shared-projects domain types (`src/lib/shared-projects/types.ts`)

**Files:**
- Create: `src/lib/shared-projects/types.ts`

This task introduces shared types used by the intersect algorithm and the TMDB normalizer. No test — types are exercised by Tasks 5 and 8.

- [ ] **Step 1: Create `src/lib/shared-projects/types.ts`.**

```ts
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
```

- [ ] **Step 2: Verify typecheck.**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/lib/shared-projects/types.ts
git commit -m "feat(shared-projects): add domain types"
```

---

## Task 5: Intersection algorithm (`src/lib/shared-projects/intersect.ts`)

**Files:**
- Create: `src/lib/shared-projects/intersect.ts`
- Test: `tests/intersect.test.ts`

- [ ] **Step 1: Write the failing tests.**

Create `tests/intersect.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests, confirm they fail.**

```bash
npm test -- tests/intersect.test.ts
```

Expected: failure — `Cannot find module '@/lib/shared-projects/intersect'`.

- [ ] **Step 3: Implement `src/lib/shared-projects/intersect.ts`.**

```ts
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
```

- [ ] **Step 4: Run the tests, confirm they pass.**

```bash
npm test -- tests/intersect.test.ts
```

Expected: 8 passing.

- [ ] **Step 5: Lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/lib/shared-projects/intersect.ts tests/intersect.test.ts
git commit -m "$(cat <<'EOF'
feat(shared-projects): add pure intersection algorithm

Pure (no I/O) function that takes per-actor normalized credit lists and
returns the projects all actors share. Resolves cast/crew duplicates
via cast > crew and the Directing > Writing > Production > alphabetical
fallback ordering. Sorted desc by release date, nulls last, ties broken
by title asc.
EOF
)"
```

---

## Task 6: TMDB client wrapper (`src/lib/tmdb/client.ts`)

**Files:**
- Create: `src/lib/tmdb/client.ts`
- Test: `tests/tmdb-client.test.ts`

- [ ] **Step 1: Write the failing test.**

Create `tests/tmdb-client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmdbFetch, TmdbError } from "@/lib/tmdb/client";

describe("tmdbFetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("calls TMDB with bearer auth and JSON-parses the response", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.themoviedb.org/3/x");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-key");
  });

  it("appends searchParams", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await tmdbFetch("/search/person", {
      searchParams: { query: "chris evans", include_adult: "false" },
    });
    const [url] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.searchParams.get("query")).toBe("chris evans");
    expect(parsed.searchParams.get("include_adult")).toBe("false");
  });

  it("retries once on 5xx", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("err", { status: 500 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry on 404 and throws TmdbError with status", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 404 }));
    await expect(tmdbFetch("/x")).rejects.toBeInstanceOf(TmdbError);
    await expect(tmdbFetch("/x")).rejects.toMatchObject({ status: 404 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retries once on a thrown network error", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const result = await tmdbFetch<{ ok: boolean }>("/x");
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("waits Retry-After then retries on 429", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      );
    const promise = tmdbFetch<{ ok: boolean }>("/x");
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after a second 429 with code rate_limited", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response("rate", {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      )
      .mockResolvedValueOnce(new Response("rate", { status: 429 }));
    const promise = tmdbFetch("/x");
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).rejects.toMatchObject({
      name: "TmdbError",
      code: "rate_limited",
      status: 429,
    });
  });
});
```

- [ ] **Step 2: Run the test, confirm it fails.**

```bash
npm test -- tests/tmdb-client.test.ts
```

Expected: failure — `Cannot find module '@/lib/tmdb/client'`.

- [ ] **Step 3: Implement `src/lib/tmdb/client.ts`.**

```ts
import { env } from "@/env";

const TMDB_BASE = "https://api.themoviedb.org/3";
const USER_AGENT = "actor-match/0.1 (+github)";
const TIMEOUT_MS = 10_000;
const MAX_RETRY_AFTER_MS = 2_000;

export class TmdbError extends Error {
  status: number;
  code: string;

  constructor(code: string, status: number, message?: string) {
    super(message ?? code);
    this.name = "TmdbError";
    this.code = code;
    this.status = status;
  }
}

export type TmdbFetchInit = {
  searchParams?: Record<string, string>;
};

export async function tmdbFetch<T>(
  path: string,
  init: TmdbFetchInit = {},
): Promise<T> {
  const url = new URL(TMDB_BASE + path);
  if (init.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      url.searchParams.set(k, v);
    }
  }
  return doFetch<T>(url.toString(), 0);
}

async function doFetch<T>(url: string, attempt: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.TMDB_API_KEY}`,
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    if (attempt < 1) return doFetch<T>(url, attempt + 1);
    const message = err instanceof Error ? err.message : "network error";
    throw new TmdbError("network_error", 0, message);
  }

  if (response.status === 429 && attempt < 1) {
    const waitMs = Math.min(
      parseRetryAfter(response.headers.get("Retry-After")),
      MAX_RETRY_AFTER_MS,
    );
    await sleep(waitMs);
    return doFetch<T>(url, attempt + 1);
  }
  if (response.status === 429) {
    throw new TmdbError("rate_limited", 429);
  }

  if (response.status >= 500 && attempt < 1) {
    return doFetch<T>(url, attempt + 1);
  }

  if (!response.ok) {
    throw new TmdbError("upstream_error", response.status);
  }

  return (await response.json()) as T;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 1000;
  const seconds = Number(header);
  if (!Number.isFinite(seconds) || seconds < 0) return 1000;
  return seconds * 1000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

- [ ] **Step 4: Run the test, confirm it passes.**

```bash
npm test -- tests/tmdb-client.test.ts
```

Expected: 7 passing.

- [ ] **Step 5: Lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 6: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/lib/tmdb/client.ts tests/tmdb-client.test.ts
git commit -m "$(cat <<'EOF'
feat(tmdb): add fetch wrapper with retry, timeout, error mapping

Wraps global fetch with bearer auth, 10s timeout, one retry on network
errors and 5xx, Retry-After-aware retry on 429, and TmdbError throws
with structured status + code so route handlers can map to safe client
responses.
EOF
)"
```

---

## Task 7: Person search module (`src/lib/tmdb/search-people.ts`)

**Files:**
- Create: `src/lib/tmdb/search-people.ts`, `src/lib/tmdb/types.ts`
- Test: `tests/tmdb-search-people.test.ts`, `tests/fixtures/search-person.json`

- [ ] **Step 1: Create the fixture.**

Create `tests/fixtures/search-person.json`:

```json
{
  "page": 1,
  "results": [
    {
      "id": 6384,
      "name": "Keanu Reeves",
      "profile_path": "/4D0PpNI0kmP58hgrwGC3wCjxhnm.jpg",
      "popularity": 28.5,
      "known_for": [
        { "id": 603, "title": "The Matrix", "media_type": "movie" },
        { "id": 27205, "title": "Inception", "media_type": "movie" },
        { "id": 245891, "title": "John Wick", "media_type": "movie" },
        { "id": 999, "title": "Should Not Appear", "media_type": "movie" }
      ]
    },
    {
      "id": 999991,
      "name": "Null Title Person",
      "profile_path": null,
      "popularity": 0.1,
      "known_for": [
        { "id": 1, "title": null, "name": null, "media_type": "movie" },
        { "id": 2, "name": "Some Show", "media_type": "tv" }
      ]
    }
  ],
  "total_pages": 1,
  "total_results": 2
}
```

- [ ] **Step 2: Create slim types in `src/lib/tmdb/types.ts`.**

```ts
export type PersonSearchResult = {
  id: number;
  name: string;
  profilePath: string | null;
  knownFor: string[];
};
```

- [ ] **Step 3: Write the failing test.**

Create `tests/tmdb-search-people.test.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests, confirm they fail.**

```bash
npm test -- tests/tmdb-search-people.test.ts
```

Expected: failure — `Cannot find module '@/lib/tmdb/search-people'`.

- [ ] **Step 5: Implement `src/lib/tmdb/search-people.ts`.**

```ts
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
```

- [ ] **Step 6: Configure JSON imports in TS.**

Open `tsconfig.json` and ensure `"resolveJsonModule": true` is in `compilerOptions`. (`create-next-app` sets this by default — verify, no action if already present.)

- [ ] **Step 7: Run the tests, confirm they pass.**

```bash
npm test -- tests/tmdb-search-people.test.ts
```

Expected: 4 passing.

- [ ] **Step 8: Lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 9: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/lib/tmdb/search-people.ts src/lib/tmdb/types.ts tests/tmdb-search-people.test.ts tests/fixtures/search-person.json
git commit -m "$(cat <<'EOF'
feat(tmdb): add person search with slim mapping

Calls TMDB /search/person and maps the first 8 results into
PersonSearchResult, capping knownFor at 3, preferring title over name,
and dropping null entries.
EOF
)"
```

---

## Task 8: Combined-credits normalizer (`src/lib/tmdb/combined-credits.ts`)

**Files:**
- Create: `src/lib/tmdb/combined-credits.ts`
- Test: `tests/tmdb-combined-credits.test.ts`, `tests/fixtures/combined-credits.json`

- [ ] **Step 1: Create the fixture.**

Create `tests/fixtures/combined-credits.json`:

```json
{
  "id": 6384,
  "name": "Keanu Reeves",
  "profile_path": "/keanu.jpg",
  "combined_credits": {
    "cast": [
      {
        "id": 603,
        "media_type": "movie",
        "title": "The Matrix",
        "release_date": "1999-03-30",
        "poster_path": "/matrix.jpg",
        "overview": "A hacker discovers reality is a simulation.",
        "character": "Neo"
      },
      {
        "id": 245891,
        "media_type": "movie",
        "title": "John Wick",
        "release_date": "2014-10-22",
        "poster_path": "/jw.jpg",
        "overview": "An ex-hitman seeks revenge.",
        "character": "John Wick"
      },
      {
        "id": 1234,
        "media_type": "tv",
        "name": "Generic Show",
        "first_air_date": "2010-01-01",
        "poster_path": "/show.jpg",
        "overview": "Self appearance.",
        "character": "Self"
      },
      {
        "id": 5678,
        "title": "No media_type"
      }
    ],
    "crew": [
      {
        "id": 999,
        "media_type": "movie",
        "title": "Side Project",
        "release_date": "2020-05-05",
        "poster_path": "/sp.jpg",
        "overview": "A passion project.",
        "job": "Producer",
        "department": "Production"
      },
      {
        "id": 7777
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing test.**

Create `tests/tmdb-combined-credits.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests, confirm they fail.**

```bash
npm test -- tests/tmdb-combined-credits.test.ts
```

Expected: failure — `Cannot find module '@/lib/tmdb/combined-credits'`.

- [ ] **Step 4: Implement `src/lib/tmdb/combined-credits.ts`.**

```ts
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
```

- [ ] **Step 5: Run the tests, confirm they pass.**

```bash
npm test -- tests/tmdb-combined-credits.test.ts
```

Expected: 5 passing.

- [ ] **Step 6: Lint + typecheck + full test pass.**

```bash
npm run lint
npm run typecheck
npm test
```

Expected: all exit 0; full suite green (env, intersect, tmdb-client, search-people, combined-credits).

- [ ] **Step 7: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/lib/tmdb/combined-credits.ts tests/tmdb-combined-credits.test.ts tests/fixtures/combined-credits.json
git commit -m "$(cat <<'EOF'
feat(tmdb): normalize combined credits to NormalizedCredit[]

Maps TMDB person.combined_credits cast and crew rows into the internal
NormalizedCredit shape, dropping rows missing id or media_type and
preserving department for the intersect algorithm's crew tie-breaker.
EOF
)"
```

---

## Task 9: Route handler `GET /api/actors/search`

**Files:**
- Create: `src/app/api/actors/search/route.ts`

No unit test (per spec §10). Manual verification with `curl`.

- [ ] **Step 1: Implement the route.**

Create `src/app/api/actors/search/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { searchPeople } from "@/lib/tmdb/search-people";
import { TmdbError } from "@/lib/tmdb/client";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({ q: searchParams.get("q") ?? undefined });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const trimmed = (parsed.data.q ?? "").trim();
  if (trimmed.length < 2) {
    return NextResponse.json([], {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  }

  try {
    const results = await searchPeople(trimmed);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    if (err instanceof TmdbError) {
      console.error("TMDB search-people failed", {
        status: err.status,
        code: err.code,
      });
      return NextResponse.json(
        { error: err.code === "rate_limited" ? "tmdb_rate_limited" : "tmdb_unavailable" },
        { status: 502 },
      );
    }
    throw err;
  }
}
```

- [ ] **Step 2: Set `TMDB_API_KEY` in `.env.local`.**

Open `.env.local` (creating it if absent) and add:

```
TMDB_API_KEY=<paste your TMDB v4 read access token here>
```

(`.env.local` is git-ignored.)

- [ ] **Step 3: Start the dev server.**

```bash
npm run dev
```

Wait for "Ready in" output (typically a few seconds).

- [ ] **Step 4: Verify the endpoint with `curl`.**

In a separate terminal:

```bash
curl -s 'http://localhost:3000/api/actors/search?q=keanu' | jq '.[0]'
```

Expected: a JSON object with `id`, `name`, `profilePath`, `knownFor`. Example:

```json
{
  "id": 6384,
  "name": "Keanu Reeves",
  "profilePath": "/...jpg",
  "knownFor": ["The Matrix", "John Wick", "..."]
}
```

Try edge cases:

```bash
curl -s 'http://localhost:3000/api/actors/search?q=' | jq        # → []
curl -s 'http://localhost:3000/api/actors/search?q=k' | jq       # → []
curl -s 'http://localhost:3000/api/actors/search' | jq           # → []
```

Stop the dev server (`ctrl-c` in the dev terminal) when done.

- [ ] **Step 5: Lint + typecheck + build.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 6: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/app/api/actors/search/route.ts
git commit -m "$(cat <<'EOF'
feat(api): add /api/actors/search route handler

Validates the q query param, returns [] for queries shorter than 2 chars,
and forwards the rest to TMDB via searchPeople, returning slim
PersonSearchResult[] with private 60s cache headers. Maps TmdbError
into 502 with safe error codes.
EOF
)"
```

---

## Task 10: Route handler `POST /api/shared`

**Files:**
- Create: `src/app/api/shared/route.ts`, `src/lib/tmdb/get-actor-with-credits.ts`

- [ ] **Step 1: Add a small helper that fetches one actor's name + normalized credits.**

Create `src/lib/tmdb/get-actor-with-credits.ts`:

```ts
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
```

- [ ] **Step 2: Implement the route.**

Create `src/app/api/shared/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { intersectCredits } from "@/lib/shared-projects/intersect";
import type { ResolvedActor } from "@/lib/shared-projects/types";
import { TmdbError } from "@/lib/tmdb/client";
import { getActorWithCredits } from "@/lib/tmdb/get-actor-with-credits";

export const runtime = "nodejs";

const bodySchema = z.object({
  actorIds: z.array(z.number().int().positive()).min(2).max(5),
});

export async function POST(request: Request): Promise<NextResponse> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const dedupedIds = Array.from(new Set(parsed.data.actorIds));
  if (dedupedIds.length < 2) {
    return NextResponse.json(
      { error: "need_two_distinct_actors" },
      { status: 400 },
    );
  }

  const settled = await Promise.allSettled(
    dedupedIds.map((id) => getActorWithCredits(id)),
  );

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i]!;
    if (result.status === "rejected") {
      const err = result.reason;
      if (err instanceof TmdbError) {
        if (err.status === 404) {
          return NextResponse.json(
            { error: "actor_not_found", actorId: dedupedIds[i] },
            { status: 404 },
          );
        }
        if (err.code === "rate_limited") {
          return NextResponse.json(
            { error: "tmdb_rate_limited" },
            { status: 502 },
          );
        }
        if (err.code === "network_error") {
          return NextResponse.json({ error: "tmdb_timeout" }, { status: 504 });
        }
        return NextResponse.json(
          { error: "tmdb_unavailable" },
          { status: 502 },
        );
      }
      throw err;
    }
  }

  const fulfilled = settled.map((r) => {
    if (r.status !== "fulfilled") throw new Error("unreachable");
    return r.value;
  });

  const projects = intersectCredits(
    fulfilled.map((a) => ({ id: a.id, name: a.name, credits: a.credits })),
  );
  const actors: ResolvedActor[] = fulfilled.map((a) => ({
    id: a.id,
    name: a.name,
    profilePath: a.profilePath,
  }));

  return NextResponse.json(
    { actors, projects },
    { headers: { "Cache-Control": "private, max-age=300" } },
  );
}
```

- [ ] **Step 3: Start the dev server.**

```bash
npm run dev
```

- [ ] **Step 4: Verify with `curl`.**

In another terminal — first find two actor IDs from the search endpoint:

```bash
curl -s 'http://localhost:3000/api/actors/search?q=keanu' | jq '.[0].id'
# → 6384
curl -s 'http://localhost:3000/api/actors/search?q=carrie-anne' | jq '.[0].id'
# → 9189 (or similar)
```

Then call shared:

```bash
curl -s -X POST 'http://localhost:3000/api/shared' \
  -H 'content-type: application/json' \
  -d '{"actorIds":[6384,9189]}' | jq '.projects[0]'
```

Expected: a JSON object with `mediaType`, `tmdbId`, `title`, `releaseDate`, `year`, `posterPath`, `overview`, and `roles` (length 2).

Edge cases:

```bash
# Bad body
curl -s -X POST 'http://localhost:3000/api/shared' -H 'content-type: application/json' \
  -d '{}' | jq      # → invalid_request, 400

# Single actor
curl -s -X POST 'http://localhost:3000/api/shared' -H 'content-type: application/json' \
  -d '{"actorIds":[6384]}' | jq    # → invalid_request, 400

# Unknown actor
curl -s -X POST 'http://localhost:3000/api/shared' -H 'content-type: application/json' \
  -d '{"actorIds":[6384,999999999]}' | jq    # → actor_not_found, 404
```

Stop the dev server when done.

- [ ] **Step 5: Lint + typecheck + build.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 6: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/app/api/shared/route.ts src/lib/tmdb/get-actor-with-credits.ts
git commit -m "$(cat <<'EOF'
feat(api): add POST /api/shared route handler

Validates actorIds (2-5, distinct), fetches each actor's combined
credits via append_to_response in parallel, intersects with the pure
algorithm, and returns { actors, projects }. Maps TmdbError categories
into 404 (actor_not_found), 502 (tmdb_unavailable / tmdb_rate_limited),
and 504 (tmdb_timeout).
EOF
)"
```

---

## Task 11: `useTypeahead` hook + `<ActorSearchRow>` component

**Files:**
- Create: `src/hooks/use-typeahead.ts`, `src/components/actor-search-row.tsx`

- [ ] **Step 1: Create the typeahead hook.**

Create `src/hooks/use-typeahead.ts`:

```ts
"use client";

import { useEffect, useRef, useState } from "react";
import type { PersonSearchResult } from "@/lib/tmdb/types";

type UseTypeaheadResult = {
  results: PersonSearchResult[];
  isLoading: boolean;
};

export function useTypeahead(
  query: string,
  excludedIds: number[],
): UseTypeaheadResult {
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const requestId = useRef(0);
  const excludedKey = excludedIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsLoading(false);
      return;
    }
    const myId = ++requestId.current;
    const controller = new AbortController();
    const excluded = new Set(excludedKey ? excludedKey.split(",").map(Number) : []);

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const url = `/api/actors/search?q=${encodeURIComponent(trimmed)}`;
        const response = await fetch(url, { signal: controller.signal });
        if (myId !== requestId.current) return;
        if (!response.ok) {
          setResults([]);
          return;
        }
        const data = (await response.json()) as PersonSearchResult[];
        setResults(data.filter((p) => !excluded.has(p.id)));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setResults([]);
      } finally {
        if (myId === requestId.current) setIsLoading(false);
      }
    }, 200);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, excludedKey]);

  return { results, isLoading };
}
```

- [ ] **Step 2: Create the row component.**

Create `src/components/actor-search-row.tsx`:

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTypeahead } from "@/hooks/use-typeahead";
import type { PersonSearchResult } from "@/lib/tmdb/types";

const TMDB_PROFILE_BASE = "https://image.tmdb.org/t/p/w185";

type Props = {
  excludedIds: number[];
  picked: PersonSearchResult | null;
  onPick: (person: PersonSearchResult) => void;
  onClear: () => void;
  onRemove: (() => void) | null;
};

export function ActorSearchRow(props: Props) {
  const { excludedIds, picked, onPick, onClear, onRemove } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { results, isLoading } = useTypeahead(query, excludedIds);

  if (picked) {
    return (
      <div className="flex items-center gap-3 rounded-md border bg-card p-3">
        <Avatar>
          {picked.profilePath ? (
            <AvatarImage
              src={`${TMDB_PROFILE_BASE}${picked.profilePath}`}
              alt={picked.name}
            />
          ) : null}
          <AvatarFallback>{initials(picked.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{picked.name}</div>
          {picked.knownFor.length > 0 ? (
            <div className="text-sm text-muted-foreground truncate">
              {picked.knownFor.join(" · ")}
            </div>
          ) : null}
        </div>
        <Button variant="ghost" onClick={onClear}>
          Change
        </Button>
        {onRemove ? (
          <Button variant="ghost" aria-label="Remove actor" onClick={onRemove}>
            ✕
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-start text-muted-foreground"
          >
            {query.length > 0 ? query : "Type an actor's name…"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Search for an actor…"
              value={query}
              onValueChange={setQuery}
            />
            <CommandList>
              {isLoading ? (
                <div className="p-3 text-sm text-muted-foreground">Searching…</div>
              ) : null}
              {!isLoading && results.length === 0 && query.trim().length >= 2 ? (
                <CommandEmpty>No matches</CommandEmpty>
              ) : null}
              <CommandGroup>
                {results.map((person) => (
                  <CommandItem
                    key={person.id}
                    value={`${person.id}-${person.name}`}
                    onSelect={() => {
                      onPick(person);
                      setQuery("");
                      setOpen(false);
                    }}
                    className="flex items-center gap-2"
                  >
                    {person.profilePath ? (
                      <Image
                        src={`${TMDB_PROFILE_BASE}${person.profilePath}`}
                        alt=""
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials(person.name)}</AvatarFallback>
                      </Avatar>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{person.name}</div>
                      {person.knownFor.length > 0 ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {person.knownFor.join(" · ")}
                        </div>
                      ) : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {onRemove ? (
        <Button variant="ghost" aria-label="Remove actor" onClick={onRemove}>
          ✕
        </Button>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
```

- [ ] **Step 3: Configure remote images for TMDB.**

Open `next.config.ts` and replace its content with:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 4: Lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 5: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/hooks/use-typeahead.ts src/components/actor-search-row.tsx next.config.ts
git commit -m "$(cat <<'EOF'
feat(ui): add useTypeahead hook and ActorSearchRow component

Debounced TMDB-backed typeahead that aborts in-flight requests, ignores
stale responses by request-id, and filters out actor IDs already picked
in other rows. Picked state shows the actor's avatar + known-for chips
with change/remove controls. next.config.ts whitelists image.tmdb.org
for next/image.
EOF
)"
```

---

## Task 12: `<ActorSearchList>` component (slot orchestration)

**Files:**
- Create: `src/components/actor-search-list.tsx`

- [ ] **Step 1: Define the slot type and create the component.**

Create `src/components/actor-search-list.tsx`:

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { ActorSearchRow } from "./actor-search-row";
import type { PersonSearchResult } from "@/lib/tmdb/types";

export type ActorSlot =
  | { id: string; status: "empty" }
  | { id: string; status: "picked"; person: PersonSearchResult };

export const MIN_SLOTS = 2;
export const MAX_SLOTS = 5;

type Props = {
  slots: ActorSlot[];
  isSubmitting: boolean;
  onPick: (slotId: string, person: PersonSearchResult) => void;
  onClear: (slotId: string) => void;
  onAdd: () => void;
  onRemove: (slotId: string) => void;
  onSubmit: () => void;
};

export function ActorSearchList(props: Props) {
  const { slots, isSubmitting, onPick, onClear, onAdd, onRemove, onSubmit } = props;
  const pickedIds = slots
    .map((s) => (s.status === "picked" ? s.person.id : null))
    .filter((id): id is number => id !== null);
  const lastSlot = slots[slots.length - 1];
  const canAdd = slots.length < MAX_SLOTS && lastSlot?.status === "picked";
  const canSubmit = pickedIds.length >= MIN_SLOTS && !isSubmitting;
  const canRemove = slots.length > MIN_SLOTS;

  return (
    <div className="flex flex-col gap-3">
      {slots.map((slot) => {
        const excludedIds =
          slot.status === "picked"
            ? pickedIds.filter((id) => id !== slot.person.id)
            : pickedIds;
        return (
          <ActorSearchRow
            key={slot.id}
            excludedIds={excludedIds}
            picked={slot.status === "picked" ? slot.person : null}
            onPick={(person) => onPick(slot.id, person)}
            onClear={() => onClear(slot.id)}
            onRemove={canRemove ? () => onRemove(slot.id) : null}
          />
        );
      })}
      <div className="flex items-center justify-between gap-2 pt-2">
        <Button variant="outline" disabled={!canAdd} onClick={onAdd}>
          Add actor
        </Button>
        <Button onClick={onSubmit} disabled={!canSubmit} aria-busy={isSubmitting}>
          {isSubmitting ? "Searching…" : "Find shared projects"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint + typecheck.**

```bash
npm run lint
npm run typecheck
```

Expected: both exit 0.

- [ ] **Step 3: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/components/actor-search-list.tsx
git commit -m "feat(ui): add ActorSearchList for slot orchestration"
```

---

## Task 13: `<SharedProjectCard>`, page state machine, and full UI wire-up

**Files:**
- Create: `src/components/shared-project-card.tsx`
- Modify: `src/app/page.tsx`, `src/app/globals.css` (line-clamp utility if absent)

- [ ] **Step 1: Create `<SharedProjectCard>`.**

Create `src/components/shared-project-card.tsx`:

```tsx
import Image from "next/image";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { SharedProject } from "@/lib/shared-projects/types";

const POSTER_BASE = "https://image.tmdb.org/t/p/w185";
const PROFILE_BASE = "https://image.tmdb.org/t/p/w92";

type Props = {
  project: SharedProject;
  resolvedActors: Map<number, { name: string; profilePath: string | null }>;
};

export function SharedProjectCard({ project, resolvedActors }: Props) {
  return (
    <Card>
      <CardContent className="flex gap-4 p-4">
        <div className="shrink-0">
          {project.posterPath ? (
            <Image
              src={`${POSTER_BASE}${project.posterPath}`}
              alt={`${project.title}${project.year ? ` (${project.year})` : ""}`}
              width={92}
              height={138}
              className="rounded-md"
            />
          ) : (
            <div className="flex h-[138px] w-[92px] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
              {initials(project.title)}
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold truncate">{project.title}</h3>
            {project.year !== null ? (
              <span className="text-sm text-muted-foreground">{project.year}</span>
            ) : null}
            <Badge variant="secondary">
              {project.mediaType === "movie" ? "Movie" : "TV"}
            </Badge>
          </div>
          {project.overview ? (
            <p className="text-sm text-muted-foreground line-clamp-3">
              {project.overview}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1 pt-1">
            {project.roles.map((role) => {
              const actor = resolvedActors.get(role.actorId);
              return (
                <li
                  key={role.actorId}
                  className="flex items-center gap-2 text-sm"
                >
                  <Avatar className="h-6 w-6">
                    {actor?.profilePath ? (
                      <AvatarImage
                        src={`${PROFILE_BASE}${actor.profilePath}`}
                        alt=""
                      />
                    ) : null}
                    <AvatarFallback className="text-xs">
                      {initials(role.actorName)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium">{role.actorName}</span>
                  <span className="text-muted-foreground">
                    — {role.kind === "crew" ? `crew: ${role.role || "—"}` : role.role || "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}
```

- [ ] **Step 2: Implement the page.**

Replace `src/app/page.tsx` with:

```tsx
"use client";

import { useState } from "react";
import {
  ActorSearchList,
  type ActorSlot,
} from "@/components/actor-search-list";
import { SharedProjectCard } from "@/components/shared-project-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
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
          <AlertTitle>Couldn't load results</AlertTitle>
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
        <ResultsView actors={results.actors} projects={results.projects} />
      ) : null}
    </main>
  );
}

function ResultsView({
  actors,
  projects,
}: {
  actors: ResolvedActor[];
  projects: SharedProject[];
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

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">
        Found {projects.length} project{projects.length === 1 ? "" : "s"} with{" "}
        {actors.map((a) => a.name).join(" & ")}
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <SharedProjectCard
            key={`${project.mediaType}:${project.tmdbId}`}
            project={project}
            resolvedActors={resolvedMap}
          />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Verify line-clamp utility is available.**

`@tailwindcss/line-clamp` is built into Tailwind v3.3+ and Tailwind v4. If `npm run build` later complains about `line-clamp-3`, run:

```bash
npm install -D @tailwindcss/line-clamp
```

and add the plugin to `tailwind.config.{ts,js}`. Otherwise no action.

- [ ] **Step 4: Start the dev server and run the golden path.**

```bash
npm run dev
```

In the browser at `http://localhost:3000`:
1. Type "Keanu" in row 1 → confirm dropdown shows Keanu Reeves with photo.
2. Pick Keanu → row 1 becomes a chip.
3. Type "Carrie-Anne" in row 2 → pick Carrie-Anne Moss.
4. Click "Find shared projects" → skeleton cards appear, then real cards.
5. Confirm The Matrix appears with both actors' character names.
6. Click "Add actor" (should appear and be enabled), pick a third → submit again, confirm narrowing.
7. Remove a slot via "✕" → submit button stays enabled if ≥ 2 still picked.
8. Submit with only 2 actors but where one has no overlap with the other → confirm "No projects in common" empty state renders.

Stop the dev server when done.

- [ ] **Step 5: Lint + typecheck + build.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 6: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/components/shared-project-card.tsx src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): wire page state machine, results rendering, project cards

Single-page flow: ActorSearchList drives 2-5 slots, submit POSTs to
/api/shared, ResultsState drives loading skeletons, error alert, empty
state, and a 1/2-column grid of SharedProjectCards. Each card shows
poster, title, year, type badge, line-clamped overview, and one
avatar-and-role line per submitted actor.
EOF
)"
```

---

## Task 14: Layout, theme provider, attribution, polish

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/theme-provider.tsx`

- [ ] **Step 1: Create the theme provider wrapper.**

Create `src/components/theme-provider.tsx`:

```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps, ReactNode } from "react";

type Props = ComponentProps<typeof NextThemesProvider> & {
  children: ReactNode;
};

export function ThemeProvider({ children, ...props }: Props) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

- [ ] **Step 2: Update `src/app/layout.tsx`.**

Replace its content with:

```tsx
import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "actor-match",
  description: "Find every movie and TV project two or more actors share.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <footer className="mx-auto max-w-3xl px-4 py-8 text-xs text-muted-foreground">
            Data provided by{" "}
            <a
              href="https://www.themoviedb.org/"
              target="_blank"
              rel="noreferrer"
              className="underline hover:no-underline"
            >
              TMDB
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

(Keeps any font setup `create-next-app` added if you want — only the body className and the wrapping ThemeProvider/footer are required additions.)

- [ ] **Step 3: Verify build + lint + typecheck.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0.

- [ ] **Step 4: Manual smoke.**

```bash
npm run dev
```

In the browser:
- Confirm the footer is visible at the bottom of the home page.
- Confirm the page renders correctly in both light and dark system themes (toggle macOS Appearance).

Stop the dev server.

- [ ] **Step 5: Commit.**

**Pause and ask Chad to approve before running this commit.**

```bash
git add src/app/layout.tsx src/components/theme-provider.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add layout shell, system-themed dark mode, TMDB attribution

Wraps the app in next-themes with system default and class attribute,
adds the metadata block, and a footer that satisfies TMDB's attribution
requirement.
EOF
)"
```

---

## Task 15: Final verification gates

**Files:** none (verification only).

- [ ] **Step 1: Full lint pass.**

```bash
npm run lint
```

Expected: exit 0, no warnings or errors.

- [ ] **Step 2: Full typecheck.**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Full unit-test run.**

```bash
npm test
```

Expected: all suites pass — env (3), intersect (8), tmdb-client (7), tmdb-search-people (4), tmdb-combined-credits (5). 27 tests total.

- [ ] **Step 4: Production build.**

```bash
npm run build
```

Expected: exit 0; both API routes listed as dynamic Node-runtime routes; the home page listed as a static or prerendered route depending on Next 16 defaults.

- [ ] **Step 5: Manual golden-path smoke against the dev server.**

```bash
npm run dev
```

Run through these scenarios in the browser at `http://localhost:3000`:

1. Type a partial name → see typeahead with photos and "known for" chips.
2. Pick two actors whose careers overlap (e.g., Keanu Reeves + Carrie-Anne Moss) → submit → see The Matrix and sequels.
3. Pick three actors where the third narrows the result set.
4. Add up to 5 slots, then remove → confirm controls behave.
5. Pick the same actor in another slot → confirm typeahead filters them out.
6. Pick two actors with no overlap → confirm "No projects in common" empty state.
7. Stop the dev server and start it without `TMDB_API_KEY` in `.env.local` (temporarily) → confirm `npm run dev` fails fast with a zod error mentioning `TMDB_API_KEY`. Restore the key.

- [ ] **Step 6: Report.**

Summarize for Chad:
- All gates green: lint / typecheck / 27 tests / build / manual smoke ✔
- Spec coverage: every section of `2026-05-07-actor-match-design.md` is implemented.
- Outstanding: nothing in v1 scope.
- Out of scope (per spec §2 non-goals): persistent caching, share URLs, filter UI, analytics, auth, theme toggle.

No commit in this task — verification only. If anything fails, fix it under whichever earlier task owns the affected files.

---

## Optional Task 16: Vercel deploy (only when Chad says so)

**Do not run any of this without explicit approval.**

- [ ] **Step 1: Link the Vercel project.**

```bash
npx vercel link
```

Follow the prompts to create or link the actor-match project under Chad's account.

- [ ] **Step 2: Set the env var on all scopes.**

```bash
npx vercel env add TMDB_API_KEY production
npx vercel env add TMDB_API_KEY preview
npx vercel env add TMDB_API_KEY development
```

Paste the v4 read-access token at each prompt.

- [ ] **Step 3: Trigger a deploy.**

```bash
npx vercel              # preview
# or, with explicit approval:
npx vercel --prod       # production
```

- [ ] **Step 4: Smoke the deployed URL.**

Run the same golden-path scenarios from Task 15 against the deployed URL.
