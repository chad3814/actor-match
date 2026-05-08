# Media-Type Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Project commit policy:** Per Chad's standing pattern for plan-driven work, all commits in this plan are pre-approved. The 1Password ssh-agent's per-signature prompt remains the natural per-commit gate. Implementer subagents should run their commit step automatically; do NOT pause between tasks for textual approval.

**Goal:** Add a segmented control above the shared-projects results that filters cards to All / Movies / TV with an instant client-side toggle, including counts per option and a smart empty-filter message.

**Architecture:** A new `<MediaTypeFilter>` presentational component composed from shadcn's `<ToggleGroup>` primitive. Filter state lives on `HomePage`, is passed into `<ResultsView>`, and persists across actor changes within the session. `<ResultsView>` derives counts and a filtered list from the unfiltered `projects` array.

**Tech Stack:** React 19 · Next.js 16 (App Router) · TypeScript strict · shadcn/ui (`toggle-group` to be added)

**Spec:** `docs/superpowers/specs/2026-05-07-media-type-filter-design.md`

**Spec deviation, intentional:** The spec defines the type as `MediaTypeFilter` and the component as `<MediaTypeFilter>`. To avoid a same-name type-and-value identifier export, the type is renamed to `MediaFilterValue` in the implementation. The component keeps the name `MediaTypeFilter`.

---

## File structure

```
src/
├── app/
│   └── page.tsx                     # MODIFY: add filter state, pass into ResultsView
├── components/
│   ├── media-type-filter.tsx        # CREATE: segmented control + MediaFilterValue type
│   └── ui/
│       ├── toggle-group.tsx         # CREATE: shadcn-generated
│       └── toggle.tsx               # CREATE: shadcn-generated (transitive)
```

No tests added — the spec explicitly chose manual smoke over unit tests for this presentational change. Existing 27 tests stay green.

---

## Task 1: Install shadcn `toggle-group` primitive

**Files:**
- Create: `src/components/ui/toggle-group.tsx`, `src/components/ui/toggle.tsx`
- Modify: `package.json`, `package-lock.json` (shadcn adds `@radix-ui/react-toggle-group` and `@radix-ui/react-toggle`)

- [ ] **Step 1: Run shadcn add.**

```bash
cd /Users/cwalker/Projects/actor-match
npx --yes shadcn@latest add toggle-group
```

If shadcn prompts about installing a peer dep, accept. The base-nova registry's `toggle-group` is implemented on top of `@radix-ui/react-toggle-group` even within base-nova.

If the registry has changed and `toggle-group` is unavailable, abort and report DONE_WITH_CONCERNS — the spec's fallback (handcrafted three-button group) requires plan revision and shouldn't be done silently.

- [ ] **Step 2: Verify primitives compile.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0. Six static pages still generated; no new pages appear.

- [ ] **Step 3: Commit.**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: add shadcn toggle-group primitive

Adds the toggle-group and toggle components from shadcn's registry so the
upcoming media-type filter has a Radix-backed, accessible segmented
control to compose from.
EOF
)"
```

---

## Task 2: Create `<MediaTypeFilter>` component

**Files:**
- Create: `src/components/media-type-filter.tsx`

- [ ] **Step 1: Create the component file.**

`src/components/media-type-filter.tsx`:

```tsx
"use client";

import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";

export type MediaFilterValue = "all" | "movie" | "tv";

type Counts = {
  all: number;
  movie: number;
  tv: number;
};

type Props = {
  value: MediaFilterValue;
  onChange: (next: MediaFilterValue) => void;
  counts: Counts;
};

function isMediaFilterValue(value: string): value is MediaFilterValue {
  return value === "all" || value === "movie" || value === "tv";
}

export function MediaTypeFilter({ value, onChange, counts }: Props) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next === "") return;
        if (isMediaFilterValue(next)) onChange(next);
      }}
      aria-label="Filter by media type"
      className="justify-end"
    >
      <ToggleGroupItem
        value="all"
        aria-label={`All projects (${counts.all})`}
      >
        All ({counts.all})
      </ToggleGroupItem>
      <ToggleGroupItem
        value="movie"
        aria-label={`Movies (${counts.movie})`}
        disabled={counts.movie === 0 && value !== "movie"}
      >
        Movies ({counts.movie})
      </ToggleGroupItem>
      <ToggleGroupItem
        value="tv"
        aria-label={`TV shows (${counts.tv})`}
        disabled={counts.tv === 0 && value !== "tv"}
      >
        TV ({counts.tv})
      </ToggleGroupItem>
    </ToggleGroup>
  );
}
```

Notes:
- `onValueChange` from `ToggleGroup` (Radix) emits `""` when the user clicks the currently-selected item. We ignore that to enforce "exactly one selected".
- `isMediaFilterValue` is a type guard so we don't widen `string` into the typed `onChange` prop. No `any` / no `unknown` in hand-written code.
- `disabled` deliberately omits the currently-selected pill from being disabled, so a user who switches actors and lands on a 0-count selection still sees a visually-active pill (the empty-filter message in `<ResultsView>` handles communication).
- `className="justify-end"` aligns the group right on flex parents (the page composes it inside a `flex md:items-center md:justify-between` row).

- [ ] **Step 2: Verify the component compiles.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0. Lint must pass with no `react/no-unescaped-entities` (no apostrophes in this file) or `@typescript-eslint/no-explicit-any` issues.

- [ ] **Step 3: Commit.**

```bash
git add src/components/media-type-filter.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add MediaTypeFilter segmented control

Three-pill ToggleGroup (All / Movies / TV) with per-option counts. The
currently-selected pill is never auto-disabled even when its count is 0,
so the page-level empty-filter message can communicate context without
producing a "selected and disabled" state.
EOF
)"
```

---

## Task 3: Wire filter into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the filter state and import.**

Open `src/app/page.tsx`. Below the existing imports, add:

```tsx
import {
  MediaTypeFilter,
  type MediaFilterValue,
} from "@/components/media-type-filter";
```

Inside `HomePage`, immediately after the `useState<ResultsState>` line, add:

```tsx
const [mediaFilter, setMediaFilter] = useState<MediaFilterValue>("all");
```

- [ ] **Step 2: Pass the filter into `<ResultsView>`.**

Find the existing call:

```tsx
{results.kind === "ok" ? (
  <ResultsView actors={results.actors} projects={results.projects} />
) : null}
```

Replace with:

```tsx
{results.kind === "ok" ? (
  <ResultsView
    actors={results.actors}
    projects={results.projects}
    mediaFilter={mediaFilter}
    onMediaFilterChange={setMediaFilter}
  />
) : null}
```

- [ ] **Step 3: Update `<ResultsView>` to consume the filter.**

Find the existing `ResultsView` function and replace its full body with:

```tsx
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
```

Note that the existing "No projects in common" text is preserved verbatim for the unfiltered-empty case, so v1 behavior for actor sets with zero overlap is unchanged.

- [ ] **Step 4: Verify lint, typecheck, and build.**

```bash
npm run lint
npm run typecheck
npm run build
```

Expected: all exit 0. The `react/no-unescaped-entities` rule may complain about the apostrophe in "isn't" or similar — there are none in the new code, but if a lint warning appears, escape with `&apos;`.

- [ ] **Step 5: Verify the existing test suite still passes.**

```bash
npm test
```

Expected: 27/27 still passing. No new tests, no regressions.

- [ ] **Step 6: Commit.**

```bash
git add src/app/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): wire MediaTypeFilter into the page state machine

Adds page-level mediaFilter state (defaults to "all", persists across
actor changes within the session), passes it into ResultsView, and
derives counts plus a filtered list. Renders an empty-filter hint when
the selected filter is movie/tv but the unfiltered set has none of that
media type.
EOF
)"
```

---

## Task 4: Final verification gates

**Files:** none (verification only).

- [ ] **Step 1: Full lint pass.**

```bash
npm run lint
```

Expected: exit 0.

- [ ] **Step 2: Full typecheck.**

```bash
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Full unit-test run.**

```bash
npm test
```

Expected: 27 passing across 5 files.

- [ ] **Step 4: Production build.**

```bash
npm run build
```

Expected: exit 0; no new routes; the home page still listed.

- [ ] **Step 5: Programmatic smoke against dev server.**

```bash
cd /Users/cwalker/Projects/actor-match
npm run dev > /tmp/actor-match-dev-filter.log 2>&1 &
sleep 6

# Confirm the page returns 200 and includes the segmented control's accessible name
curl -s -o /tmp/home.html -w 'HTTP %{http_code}\n' http://localhost:3000/

# (The filter doesn't render until results are loaded, so no DOM check from a static fetch
# will see "All (".  This step just confirms the page still serves.)

pkill -f "next dev" || true
```

Expected: HTTP 200; no server errors in `/tmp/actor-match-dev-filter.log`.

- [ ] **Step 6: Manual visual smoke (Chad).**

This is the actual confirmation the feature works. Steps for Chad to run:

```bash
npm run dev
```

Then in the browser at `http://localhost:3000`:
1. Search Keanu Reeves + Carrie-Anne Moss → submit.
2. Confirm the segmented control appears above the results header showing
   counts like `All (21) · Movies (~17) · TV (~4)`.
3. Click `Movies` — only movie cards remain; counts unchanged; selection
   visually persists.
4. Click `TV` — only TV cards.
5. Click `All` — all cards return.
6. Add a third actor whose intersection is movies-only. Click `TV` —
   verify the empty-filter message appears with "try **All** or **Movies**".
7. Submit a search with zero overlap — segmented control should NOT render;
   the existing "No projects in common" message should.
8. Tab through the page — the segmented control should be a single tab
   stop with arrow-key navigation between the three pills.
9. Confirm the filter selection persists after submitting a new search.

If any check fails, identify the affected task and fix in a follow-up.

- [ ] **Step 7: Report.**

Summarize for Chad:
- All five gates green: lint / typecheck / 27 tests / build / programmatic smoke ✔
- Spec coverage: every section of `2026-05-07-media-type-filter-design.md` is implemented (with the documented `MediaTypeFilter` → `MediaFilterValue` type rename to avoid type/value identifier collision).
- Outstanding: nothing in this enhancement's scope.
- Manual visual smoke pending Chad's confirmation.

No commit in this task — verification only.
