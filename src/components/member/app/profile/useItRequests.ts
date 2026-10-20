"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ItNoteInput, ItSubmitInput } from "@/app/(member)/member/it-actions";
import type { ItRequest } from "@/lib/it-requests/model";
import { settleRead, type RevenueSource } from "../source";

type Outcome<T> = { ok: true; data: T } | { ok: false; error: string };

/** The design preview's sample (fixtures): read from nowhere, sent nowhere. */
export interface ItFixture {
  mine: ItRequest[];
  desk: ItRequest[] | null;
}

/**
 * IT support's state (2026-10-20): one's own requests — read while its page is open, again on every pull — and, for
 * the desk (IT requests · View), everybody's, read with the app's open so the sidebar can count the new ones. Never kept
 * on the phone: a status IT set a moment ago shows the next time the page opens. A request sent or written on replaces
 * itself in both lists at once.
 */
export function useItRequests({ source, mineOn, deskOn, gen, fixture, selectedId }: {
  source: RevenueSource;
  /** IT support (or the desk) is on screen. */
  mineOn: boolean;
  /** The account holds IT requests · View and the app is ready to read. */
  deskOn: boolean;
  /** Pull to refresh: every read runs again. */
  gen: number;
  fixture?: ItFixture;
  /** The open request, also fetched directly so an old notification works beyond either list's limit. */
  selectedId?: string | null;
}): {
  mine: ItRequest[] | null;
  desk: ItRequest[] | null;
  mineError: string | null;
  deskError: string | null;
  /** Everybody's still New — the desk's to-do. */
  newCount: number;
  find: (id: string) => ItRequest | null;
  submit: (input: ItSubmitInput) => Promise<Outcome<ItRequest>>;
  note: (input: ItNoteInput) => Promise<Outcome<ItRequest>>;
} {
  const [mine, setMine] = useState<ItRequest[] | null>(fixture?.mine ?? null);
  const [desk, setDesk] = useState<ItRequest[] | null>(fixture?.desk ?? null);
  const [mineError, setMineError] = useState<string | null>(null);
  const [deskError, setDeskError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ source: RevenueSource; request: ItRequest } | null>(null);
  const written = useRef(new Map<string, number>());

  useEffect(() => {
    if (!mineOn || fixture || !source.itMine) return;
    let live = true;
    void settleRead(source.itMine()).then(res => {
      if (!live) return;
      if (res.ok) { setMine(res.data); setMineError(null); } else setMineError(res.error);
    });
    return () => { live = false; };
  }, [mineOn, gen, fixture, source]);

  useEffect(() => {
    if (!deskOn || fixture || !source.itDesk) return;
    let live = true;
    void settleRead(source.itDesk()).then(res => {
      if (!live) return;
      if (res.ok) { setDesk(res.data); setDeskError(null); } else setDeskError(res.error);
    });
    return () => { live = false; };
    // Read again whenever IT support opens too: the desk's list is its "All".
  }, [deskOn, mineOn, gen, fixture, source]);

  useEffect(() => {
    if ((!mineOn && !deskOn) || !selectedId || fixture || !source.itGet) {
      setSelected(null);
      return;
    }
    setSelected(current => current?.source === source && current.request.id === selectedId ? current : null);
    let live = true;
    const version = written.current.get(selectedId) ?? 0;
    void settleRead(source.itGet(selectedId)).then(res => {
      // A closed/changed request, View as, or a reply sent during this read must not receive its old answer.
      if (!live || version !== (written.current.get(selectedId) ?? 0)) return;
      const request = res.ok ? res.data : null;
      setSelected(request?.id === selectedId && (request.mine || deskOn) ? { source, request } : null);
      if (!res.ok) {
        if (mineOn) setMineError(res.error);
        else setDeskError(res.error);
      }
    });
    return () => { live = false; };
  }, [source, mineOn, deskOn, selectedId, gen, fixture]);

  /** A request as it now stands, in place in whichever list holds it — at the top of one's own when it is new. */
  const put = useCallback((r: ItRequest, fresh: boolean) => {
    written.current.set(r.id, (written.current.get(r.id) ?? 0) + 1);
    const swap = (list: ItRequest[] | null) => (list ? (list.some(x => x.id === r.id) ? list.map(x => (x.id === r.id ? r : x)) : fresh ? [r, ...list] : list) : list);
    if (r.mine) setMine(list => swap(list) ?? (fresh ? [r] : list));
    setDesk(list => swap(list));
    setSelected(current => current?.source === source && current.request.id === r.id ? { source, request: r } : current);
  }, [source]);

  const submit = useCallback(async (input: ItSubmitInput): Promise<Outcome<ItRequest>> => {
    if (fixture || !source.itSubmit) return { ok: false, error: "Preview data only." };
    const res = await settleRead(source.itSubmit(input));
    if (res.ok) put(res.data, true);
    return res;
  }, [fixture, source, put]);

  const note = useCallback(async (input: ItNoteInput): Promise<Outcome<ItRequest>> => {
    if (fixture || !source.itNote) return { ok: false, error: "Preview data only." };
    const res = await settleRead(source.itNote(input));
    if (res.ok) put(res.data, false);
    return res;
  }, [fixture, source, put]);

  const find = useCallback((id: string) => {
    if (!mineOn && !deskOn) return null;
    if (id === selectedId && selected?.source === source && selected.request.id === id && (selected.request.mine || deskOn)) return selected.request;
    return mine?.find(r => r.id === id) ?? (deskOn ? desk?.find(r => r.id === id) : null) ?? null;
  }, [mineOn, deskOn, selectedId, selected, source, mine, desk]);
  const newCount = useMemo(() => desk?.filter(r => r.status === "new").length ?? 0, [desk]);
  return { mine, desk, mineError, deskError, newCount, find, submit, note };
}
