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
  const trimmed = query.trim();
  const isQueryValid = trimmed.length >= 2;
  const excludedKey = excludedIds.slice().sort((a, b) => a - b).join(",");

  useEffect(() => {
    if (!isQueryValid) {
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
  }, [trimmed, isQueryValid, excludedKey]);

  if (!isQueryValid) {
    return { results: [], isLoading: false };
  }
  return { results, isLoading };
}
