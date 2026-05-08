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
