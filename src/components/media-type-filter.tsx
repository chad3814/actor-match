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
      value={[value]}
      onValueChange={(groupValue) => {
        const next = groupValue[0];
        if (!next) return;
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
