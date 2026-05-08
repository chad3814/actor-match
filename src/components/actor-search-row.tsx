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
        <PopoverTrigger
          render={
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-start text-muted-foreground"
            >
              {query.length > 0 ? query : "Type an actor's name…"}
            </Button>
          }
        />
        <PopoverContent className="p-0 w-[var(--positioner-width)]">
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
