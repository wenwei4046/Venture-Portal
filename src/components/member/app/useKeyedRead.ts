"use client";

import { useEffect, useRef, useState } from "react";
import type { Outcome, TrackRead } from "./source";

interface Entry<T> { value: T | null; error: string | null }

/**
 * One read per key, kept while the app is open: read when a page first needs
 * it, read again after a pull — the old answer stays on screen until the new
 * one lands, and a failed pull keeps it rather than putting an error in its
 * place. `need` false = the page is not open; nothing is read.
 *
 * `peek` (2026-10-08): what the phone kept from an earlier open. A key not yet
 * answered in this session shows it while the read runs, then the answer
 * replaces it — so the app opens on the last figures, not on a blank.
 */
export function useKeyedRead<T>(key: string, need: boolean, gen: number, read: () => Promise<Outcome<T>>, track: TrackRead,
  peek?: () => T | undefined): Entry<T> {
  const [store, setStore] = useState<Record<string, Entry<T>>>({});
  // Which pull each key was last asked for — a ref, so an answer landing does not ask again.
  const asked = useRef<Record<string, number>>({});
  const latest = useRef(read);
  latest.current = read;
  const latestPeek = useRef(peek);
  latestPeek.current = peek;

  useEffect(() => {
    if (!need || asked.current[key] === gen) return;
    asked.current[key] = gen;
    let stale = false, done = false;
    void track(gen, latest.current()).then(r => {
      done = true;
      if (stale) return;
      setStore(prev => {
        // A refusal keeps what is on screen — this session's answer, else the phone's.
        const kept = prev[key]?.value ?? latestPeek.current?.() ?? null;
        return { ...prev, [key]: r.ok ? { value: r.data, error: null } : { value: kept, error: kept === null ? r.error : null } };
      });
    });
    // Left before it answered: the next visit asks again.
    return () => { stale = true; if (!done && asked.current[key] === gen) delete asked.current[key]; };
  }, [key, need, gen, track]);

  const entry = store[key];
  if (entry) return entry;
  const kept = peek?.();
  return kept === undefined ? NONE : { value: kept, error: null };
}

const NONE = { value: null, error: null };
