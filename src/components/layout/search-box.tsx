"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Suggestion {
  slug: string;
  name: string;
  imageUrl: string | null;
  categoryName: string;
}

const DEBOUNCE_MS = 250;

/** Product search with debounced suggestions (ARIA combobox pattern). */
export function SearchBox({ className, initialQuery = "" }: { className?: string; initialQuery?: string }) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const containerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
        if (!response.ok) return;
        const data = (await response.json()) as { results: Suggestion[] };
        setResults(data.results);
        setActive(-1);
        setOpen(true);
      } catch {
        // Aborted or offline: keep the previous suggestions.
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const showList = open && query.trim().length >= 2;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const selected = active >= 0 ? results[active] : undefined;
    setOpen(false);
    if (selected) {
      router.push(`/products/${selected.slug}`);
      return;
    }
    const term = query.trim();
    router.push(term ? `/shop?q=${encodeURIComponent(term)}` : "/shop");
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <form ref={containerRef} role="search" onSubmit={submit} className={cn("relative", className)}>
      <label htmlFor={`${listId}-input`} className="sr-only">
        Search groceries
      </label>
      <div className="flex h-11 items-center rounded-md border border-line-strong bg-soft/60 transition-colors focus-within:border-brand-500 focus-within:bg-surface focus-within:ring-2 focus-within:ring-brand-500/15">
        <Search className="ml-3 h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <input
          id={`${listId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          autoComplete="off"
          placeholder="Search for rice, tomatoes, cooking oil…"
          value={query}
          maxLength={100}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-sm text-ink placeholder:text-ink-subtle focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            className="mr-1 rounded p-1.5 text-ink-subtle hover:text-ink"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        <button type="submit" className="mr-1 h-9 rounded-[5px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800">
          Search
        </button>
      </div>

      {showList ? (
        <ul
          id={listId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-md border border-line bg-surface py-1 shadow-[var(--shadow-overlay)]"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-ink-muted" role="option" aria-selected="false" aria-disabled="true">
              No products match “{query.trim()}”. Press Enter to search the full catalogue.
            </li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.slug}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className={cn("cursor-pointer", index === active && "bg-brand-50")}
                onPointerDown={(event) => {
                  event.preventDefault();
                  setOpen(false);
                  router.push(`/products/${item.slug}`);
                }}
              >
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-soft">
                    {item.imageUrl ? <Image src={item.imageUrl} alt="" fill sizes="40px" className="object-cover" /> : null}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-ink-muted">{item.categoryName}</p>
                  </div>
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </form>
  );
}
