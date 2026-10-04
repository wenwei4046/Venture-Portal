"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MemberReadContext } from "@/lib/member/types";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import type { ArenaHistorySnapshot } from "@/lib/member/arena-history";
import { championshipMonth, championshipStandings, type ChampMonth, type ChampStanding } from "@/lib/member/championship";
import type { Outcome, RevenueSource } from "../source";
import { addMonths, type InsightPeriod } from "../insight/period";

export interface ArenaData {
  /** The window's Arena — sales, margin and KPI for the period picked. */
  snapshot: MemberArenaSnapshot | null;
  /** Every completed fair, booth by booth (the same whatever the period). */
  history: ArenaHistorySnapshot | null;
  /** The window's Championship, month by month and added up. */
  months: ChampMonth[][] | null;
  standings: ChampStanding[] | null;
  failed: string | null;
}

interface Args {
  source: RevenueSource;
  membershipId: string;
  context?: MemberReadContext;
  readable: boolean;
  /** Null: nothing to load (Arena not open). */
  period: InsightPeriod | null;
  /** The working month's Arena the app already holds (it carries the history). */
  known: MemberArenaSnapshot | null;
  kpi: { enabled: boolean; threshold: number | null };
  /** A Principal views as somebody: mark them as "you". */
  mark: (snapshot: MemberArenaSnapshot) => MemberArenaSnapshot;
}

/** The months of a window, first to last (never past `through`). */
export function windowMonths(period: InsightPeriod): string[] {
  const out: string[] = [];
  for (let m = period.from; m <= period.through && out.length < 12; m = addMonths(m, 1)) out.push(m);
  return out;
}

/**
 * Arena's reads: the window's snapshot and, for the Championship, each of its
 * months. A month already read is not read again while the app is open —
 * switching Monthly → Quarterly → back costs nothing.
 */
export function useArenaData({ source, membershipId, context, readable, period, known, kpi, mark }: Args): ArenaData {
  const cache = useRef(new Map<string, Promise<Outcome<MemberArenaSnapshot>>>());
  const [snapshot, setSnapshot] = useState<MemberArenaSnapshot | null>(null);
  const [monthSnaps, setMonthSnaps] = useState<MemberArenaSnapshot[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const viewer = context?.staffId ?? "";

  // A different person or department is a different cache.
  useEffect(() => { cache.current.clear(); }, [viewer, membershipId]);

  const read = (month: string, window: ArenaWindow, history: boolean) => {
    const key = `${viewer}|${membershipId}|${window}|${month}|${history ? "h" : ""}`;
    let hit = cache.current.get(key);
    if (!hit) {
      hit = source.arena(membershipId, month, window, context, { history });
      cache.current.set(key, hit);
      // A failed read is tried again next time.
      void hit.then(r => { if (!r.ok) cache.current.delete(key); });
    }
    return hit;
  };

  const knownMonth = known && known.window === "monthly" ? known.period : null;
  const from = period?.from ?? "";
  const kind = period?.kind ?? "monthly";
  const through = period?.through ?? "";

  useEffect(() => {
    if (!period || !membershipId || !readable) return;
    let stale = false;
    setFailed(null);
    // The window: the working month is already here; anything else is read.
    if (kind === "monthly" && from === knownMonth && known) {
      setSnapshot(known);
    } else {
      setSnapshot(null);
      void read(from, kind, !known?.history).then(r => {
        if (stale) return;
        if (r.ok) setSnapshot(mark(r.data)); else setFailed(r.error);
      });
    }
    // The Championship: each month of the window.
    setMonthSnaps(null);
    const months = windowMonths(period);
    void Promise.all(months.map(m => (m === knownMonth && known ? Promise.resolve({ ok: true as const, data: known }) : read(m, "monthly", false))))
      .then(results => {
        if (stale) return;
        const bad = results.find(r => !r.ok);
        if (bad && !bad.ok) { setFailed(bad.error); return; }
        setMonthSnaps(results.map(r => (r.ok ? r.data : null)).filter((x): x is MemberArenaSnapshot => !!x));
      });
    return () => { stale = true; };
    // `read` and `mark` are stable in effect: they close over the same keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [membershipId, readable, kind, from, through, knownMonth, known, viewer]);

  const history = known?.history ?? snapshot?.history ?? null;
  const champ = useMemo(() => {
    if (!monthSnaps) return null;
    const months = monthSnaps.map(snap => championshipMonth({
      month: snap.period, people: snap.people, brands: snap.brands.map(b => b.code), tiers: snap.tiers, history, kpi,
    }));
    return { months, standings: championshipStandings(months) };
  }, [monthSnaps, history, kpi]);

  return { snapshot, history, months: champ?.months ?? null, standings: champ?.standings ?? null, failed };
}
