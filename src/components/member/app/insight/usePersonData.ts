"use client";

import { useEffect, useState } from "react";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { ask, untracked, type Outcome, type RevenueSource, type TrackRead } from "../source";
import type { InsightPeriod } from "./period";

export interface PersonData {
  /** Their bills over the period; null while loading. */
  book: MemberOrderBook | null;
  /** Month only: their KPI items. */
  kpi: MemberKpiSummary | null;
  /** The bills could not be read (not under the reader, or the read failed) — and nothing was kept to show. */
  failed: boolean;
}

interface Held extends PersonData {
  /** Whose and which period these are. */
  key: string;
}

const NOTHING: PersonData = { book: null, kpi: null, failed: false };

/**
 * Insight › My team › a person (2026-11-03): somebody the reader's My team lists — their bills over the period Insight
 * shows, and a month's KPI items, as their own Insight reads them. A member reads them with their own session
 * (`teamBook` / `teamKpi`: the database asks whether that person is under them); the Principal viewing somebody reads a
 * person as View as does, with its own context. What the phone kept stands in until the answers land, as on Insight.
 */
export function usePersonData({ source, membershipId, schemeId, staffId, period, viewAs, gen = 0, track = untracked }: {
  source: RevenueSource;
  membershipId: string;
  schemeId: string;
  /** Whose; empty = nobody is open. */
  staffId: string;
  period: InsightPeriod | null;
  /** The Principal viewing somebody: the person is read through View as's own context. */
  viewAs: boolean;
  gen?: number;
  track?: TrackRead;
}): PersonData {
  const [held, setHeld] = useState<Held>({ key: "", ...NOTHING });
  const kind = period?.kind;
  const from = period?.from;
  const through = period?.through;
  const key = [membershipId, staffId, viewAs ? "va" : "", kind, from, through].join("|");

  useEffect(() => {
    if (!membershipId || !staffId || !kind || !from || !through) return;
    let stale = false;
    const context = viewAs ? { staffId, subDepartmentId: membershipId } : undefined;
    const monthly = kind === "monthly";
    const bookAsk = context ? ask.orderBook(membershipId, from, through, context) : ask.teamBook(membershipId, staffId, from, through);
    const kpiAsk = !monthly ? null : context ? ask.kpi(schemeId, context, from) : ask.teamKpi(schemeId, staffId, from);
    // Another person or period: what the phone kept of them stands in, else nothing; the same again (a pull) stays up.
    setHeld(h => (h.key === key ? h : {
      key,
      book: source.peek?.<MemberOrderBook>(bookAsk) ?? null,
      kpi: kpiAsk ? source.peek?.<MemberKpiSummary>(kpiAsk) ?? null : null,
      failed: false,
    }));
    const readBook: Promise<Outcome<MemberOrderBook>> = context ? source.orderBook(membershipId, from, through, context)
      : source.teamBook ? source.teamBook(membershipId, staffId, from, through)
      : Promise.resolve({ ok: false, error: "Preview data only." });
    void track(gen, readBook).then(r => {
      if (stale) return;
      setHeld(h => (h.key !== key ? h : r.ok ? { ...h, book: r.data, failed: false } : { ...h, failed: true }));
    });
    const readKpi: Promise<Outcome<MemberKpiSummary>> | null = !monthly || !schemeId ? null
      : context ? source.kpi(schemeId, context, from) : source.teamKpi ? source.teamKpi(schemeId, staffId, from) : null;
    if (readKpi) {
      void track(gen, readKpi).then(r => {
        if (!stale && r.ok) setHeld(h => (h.key !== key ? h : { ...h, kpi: r.data }));
      });
    }
    return () => { stale = true; };
  }, [source, membershipId, schemeId, staffId, viewAs, kind, from, through, key, gen, track]);

  if (!staffId || held.key !== key) return NOTHING;
  return { book: held.book, kpi: held.kpi, failed: held.failed && !held.book };
}
