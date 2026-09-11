"use client";

import { useMemo, useRef, useState } from "react";
import s from "./MemberSearch.module.css";

export type MemberSearchItem = {
  id: string;
  label: string;
  description?: string;
  keywords?: string;
  group: string;
};

type MemberSearchProps = {
  items: MemberSearchItem[];
  onSelect: (id: string) => void;
};

export default function MemberSearch({ items, onSelect }: MemberSearchProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const words = useMemo(
    () => query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean),
    [query],
  );
  const searching = words.length > 0;
  const results = useMemo(() => {
    if (!words.length) return items.slice(0, 6);
    return items
      .filter((item) => {
        const searchable = [item.label, item.description, item.keywords]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase();
        return words.every((word) => searchable.includes(word));
      })
      .slice(0, 10);
  }, [items, words]);

  return (
    <div className={s.search}>
      <div className={s.field}>
        <input
          ref={inputRef}
          type="search"
          aria-label="Search workspace"
          placeholder="Products, people, memos…"
          data-autofocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (results[0]) onSelect(results[0].id);
            }
          }}
        />
        {query && (
          <button
            type="button"
            className={s.clear}
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        )}
      </div>
      <p className={s.status} role="status" aria-live="polite">
        {searching
          ? `${results.length} result${results.length === 1 ? "" : "s"}`
          : "Quick links"}
      </p>
      {results.length ? (
        <div className={s.results} role="list" aria-label="Search results">
          {results.map((item) => (
            <div role="listitem" key={item.id}>
              <button
                type="button"
                className={s.result}
                onClick={() => onSelect(item.id)}
              >
                <span className={s.copy}>
                  <strong>{item.label}</strong>
                  {item.description && (
                    <span className={s.description}>{item.description}</span>
                  )}
                </span>
                <span className={s.group}>{item.group}</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className={s.empty}>
          {searching
            ? "No matches found. Try a product, tool, person or memo name."
            : "No workspace items are available yet."}
        </p>
      )}
    </div>
  );
}
