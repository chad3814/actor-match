# Media-Type Filter — Design Spec

**Date:** 2026-05-07
**Status:** Draft, pending review
**Author:** Chad Walker (with Claude Code)
**Depends on:** v1 (`docs/superpowers/specs/2026-05-07-actor-match-design.md`)

## 1. Purpose

Add a small filter above the shared-projects results that lets the user
narrow the displayed cards to **All**, **Movies**, or **TV** with an instant
client-side toggle. v1 fetches both media types in one response; this change
is purely about how that data is presented.

## 2. Goals & non-goals

**Goals**

- A segmented control (radio-group semantics) with three pills:
  `All (N) · Movies (N) · TV (N)`, where each `N` is the count of matching
  projects in the current `projects` array.
- Toggling is instant — pure client-side filter on the existing data, no
  refetch, no API change.
- Default is `All`. The selection persists across actor changes within the
  session (does not reset when the user submits a new actor combination).
- Distinct empty states: when the filtered set is empty but the unfiltered
  set is not, tell the user how many projects are hidden and which filter
  to flip.

**Non-goals**

- No server-side filtering or query-param API changes.
- No URL state (`?media=tv`).
- No localStorage / cookies — preference is session-only and resets on full
  page reload.
- No cast-only / crew-only / year-range filters.
- No new unit tests. The filter is a pure `.filter()` on derived data; the
  intersection algorithm is unchanged. Manual smoke covers the UI.

## 3. UX

### 3.1 Layout

The segmented control sits inside `<ResultsView>`, immediately above the
existing "Found N project(s) with X & Y" header line. Aligned right on
desktop (`md:` and up), full-width above the header on mobile. Approximate
mockup:

```
                       ┌────────────────────────────────────┐
                       │  All (21) · Movies (12) · TV (9)  │
                       └────────────────────────────────────┘
                       Found 21 projects with Keanu Reeves
                       & Carrie-Anne Moss
                       ┌──────────────────────────────────┐
                       │  [poster]  Title                 │
                       │            …                     │
                       └──────────────────────────────────┘
                       …
```

### 3.2 Visibility

- Render only when `results.kind === "ok"` AND `results.projects.length > 0`.
- Hidden during loading and idle states.
- Hidden when the unfiltered set is empty (the existing
  "No projects in common" empty state takes over the area).

### 3.3 Empty-filter state

If the user picks `Movies` but the unfiltered set has zero movies (only TV),
or vice versa, the segmented control stays visible above this message:

> No movies among the 21 shared projects — try **All** or **TV**.

The `21` is the unfiltered count. The fallback hint names the other two
filter values that *would* show projects (so we don't tell the user to
switch to a filter that's also empty). If exactly one alternative has data,
mention only that one. The exact mapping:

| Filter | Movies count | TV count | Hint |
|--------|--------------|----------|------|
| Movies | 0            | > 0      | "try **All** or **TV**" |
| TV     | > 0          | 0        | "try **All** or **Movies**" |
| All    | 0            | 0        | (impossible — projects.length = 0) |

`All` cannot reach this message because the unfiltered count must be > 0
for the filter to render at all (per §3.2).

### 3.4 Defaults & persistence

- Initial value: `"all"` on first mount.
- Selection persists when the user changes actor slots, adds/removes slots,
  and submits a new search. The page-level state holds the filter; only a
  full page reload resets it.
- No URL or storage persistence beyond the React state.

### 3.5 Accessibility

- The control is a single `radiogroup` (semantically: "Filter by media
  type") with three `radio` children. `aria-label="Filter by media type"`
  on the group; each child carries an accessible name like
  "All projects (21)", "Movies (12)", "TV shows (9)".
- Keyboard: arrow keys move between options; `Tab` enters and exits the
  group as a single focusable unit. shadcn's `ToggleGroup` (Radix-based)
  ships these semantics out of the box.

## 4. Implementation

### 4.1 New shadcn primitive

Install `toggle-group` via shadcn:

```
npx shadcn@latest add toggle-group
```

This pulls in `toggle.tsx` and `toggle-group.tsx` under `src/components/ui/`,
and adds `@radix-ui/react-toggle-group` as a dependency. Note the v1 build
uses `base-nova` style (Base UI), but `toggle-group` is one of the few
primitives that ships against Radix even within the base-nova registry —
fine. If the registry has changed and `toggle-group` is unavailable, fall
back to a handcrafted three-button group in `media-type-filter.tsx` using
the existing `<Button>` primitive.

### 4.2 Types

```ts
// src/components/media-type-filter.tsx (top of file)
export type MediaTypeFilter = "all" | "movie" | "tv";
```

This is the only new type. The page can import it where needed.

### 4.3 Component: `<MediaTypeFilter>`

`src/components/media-type-filter.tsx`:

```ts
type Counts = { all: number; movie: number; tv: number };

type Props = {
  value: MediaTypeFilter;
  onChange: (next: MediaTypeFilter) => void;
  counts: Counts;
};
```

- Renders a `<ToggleGroup type="single" value={value}>` with three
  `<ToggleGroupItem>`s. The `onValueChange` handler coerces an empty string
  back to `value` (Radix emits `""` if the user clicks the active item — we
  ignore that to enforce "exactly one selected").
- Each item shows `Label (count)`. A pill is visually disabled
  (`aria-disabled`, muted) when its count is 0 **and** it is not the
  currently-selected value. This avoids the awkward "selected and
  disabled" state when the user keeps `Movies` selected, then submits a
  new search that yields zero movies — the disabled-state styling drops,
  and the empty-filter message from §3.3 handles communication. The
  `All` pill is never disabled because the segmented control only renders
  when the unfiltered count is > 0.

### 4.4 Page integration

`src/app/page.tsx`:

- Add a state hook at the top of `HomePage`:
  `const [mediaFilter, setMediaFilter] = useState<MediaTypeFilter>("all");`
- Pass `mediaFilter` and `setMediaFilter` into `<ResultsView>`. The filter
  state outlives any single submission so that toggling it after a new
  search keeps the user's preference.

`<ResultsView>`:

- Compute counts:
  ```ts
  const counts = {
    all: projects.length,
    movie: projects.filter((p) => p.mediaType === "movie").length,
    tv: projects.filter((p) => p.mediaType === "tv").length,
  };
  ```
- Compute filtered list:
  ```ts
  const filtered = mediaFilter === "all"
    ? projects
    : projects.filter((p) => p.mediaType === mediaFilter);
  ```
- Render `<MediaTypeFilter value={mediaFilter} onChange={setMediaFilter} counts={counts} />` above the existing header (`md:` flex row, mobile stacked).
- When `filtered.length === 0` AND `projects.length > 0`, render the
  empty-filter state from §3.3. Otherwise render the existing project grid
  using `filtered` instead of `projects`.

### 4.5 What does NOT change

- `src/lib/shared-projects/intersect.ts` — untouched. The algorithm already
  carries `mediaType` per project.
- API route handlers — untouched.
- All existing unit tests — untouched, still 27/27.
- TMDB integration — untouched.

## 5. Testing

- No new unit tests. The change is presentational and a one-line array
  filter; testing it would add fixtures without revealing real bugs.
- Existing 27 tests still pass.
- Manual verification:
  1. Search Keanu + Carrie-Anne. Confirm segmented control appears with
     correct counts (e.g., `All (21) · Movies (~17) · TV (~4)`).
  2. Click `Movies` — only movie cards remain; counts unchanged; selection
     persists. Click `TV` — only TV cards. Click `All` — all cards return.
  3. Add a third actor whose intersection is movies-only. Click `TV` —
     verify the empty-filter message appears with the correct "try **All**
     or **Movies**" hint.
  4. Submit a search with zero overlap — segmented control should NOT
     render; the existing "No projects in common" message should.
  5. Tab through the page; the segmented control should be a single tab
     stop with arrow-key navigation between the three pills.

## 6. Verification gates

Per project rule "not done until verified", every change must pass:

1. `npm run lint` — clean.
2. `npm run typecheck` — clean.
3. `npm test` — still 27 passing.
4. `npm run build` — clean.
5. Manual smoke per §5.
