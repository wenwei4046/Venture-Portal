"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MemberInsight, MemberInsightBlock, MemberReadContext } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import { ask, untracked, type RevenueSource, type TrackRead } from "../source";
import type { InsightPeriod } from "./period";

export interface InsightData {
  book: MemberOrderBook | null;
  block: MemberInsightBlock | null;
  range: MemberInsightRange | null;
  kpi: MemberKpiSummary | null;
  loading: boolean;
}

/** The two-month book cut down to one month: the same bills, the same meta. */
export function bookMonth(book: MemberOrderBook, month: string): MemberOrderBook {
  return { ...book, from: month, through: month, orders: book.orders.filter(o => o.recognitionMonth === month) };
}

/** The sub-department's block of an Insight answer. */
export function blockOf(insight: MemberInsight | null | undefined, membershipId: string): MemberInsightBlock | null {
  if (!insight) return null;
  return insight.blocks.find(b => b.membershipId === membershipId) ?? insight.blocks[0] ?? null;
}

/**
 * Insight's reads for one period. A month inside the two-month book the app
 * reads for Today (last month and this one) is cut from it, never read on its
 * own — not even before that book has landed (2026-10-08: Today's reads leave
 * in ONE request, so this month's block, KPI and the book go together); a
 * quarter or a year reads its own book and its team range. What the phone kept
 * from an earlier open shows until the answers land.
 */
export function useInsightData({ source, membershipId, schemeId, context, readable, period, recent, recentFrom, recentUntil, recentFailed = false, gen = 0, track = untracked }: {
  source: RevenueSource;
  membershipId: string;
  schemeId: string;
  context: MemberReadContext | undefined;
  readable: boolean;
  period: InsightPeriod | null;
  /** The book of last month and this one, if loaded. */
  recent: MemberOrderBook | null;
  /** Its first month. */
  recentFrom: string;
  /** Its last month (this one). */
  recentUntil: string;
  /** It could not be read: a month inside it reads its own bills. */
  recentFailed?: boolean;
  /** Pull to refresh: a new number reads the period again, keeping what is on screen until it lands. */
  gen?: number;
  track?: TrackRead;
}): InsightData {
  const [book, setBook] = useState<MemberOrderBook | null>(null);
  const [block, setBlock] = useState<MemberInsightBlock | null>(null);
  const [range, setRange] = useState<MemberInsightRange | null>(null);
  const [kpi, setKpi] = useState<MemberKpiSummary | null>(null);
  const [doneKey, setDoneKey] = useState("");

  const kind = period?.kind;
  const from = period?.from;
  const through = period?.through;
  const fromRecent = !recentFailed && kind === "monthly" && !!from && from >= recentFrom && from <= recentUntil;
  const key = [membershipId, context?.staffId ?? "", kind, from, through].join("|");
  const recentBook = useMemo(() => (fromRecent && recent && from ? bookMonth(recent, from) : null), [fromRecent, recent, from]);
  const shown = useRef("");

  // The period's own bills — only for one the two-month book does not hold.
  const bookShown = useRef("");
  useEffect(() => {
    if (!membershipId || !readable || !kind || !from || !through || fromRecent) return;
    let stale = false;
    if (bookShown.current !== key) setBook(source.peek?.<MemberOrderBook>(ask.orderBook(membershipId, from, through, context)) ?? null);
    bookShown.current = key;
    void track(gen, source.orderBook(membershipId, from, through, context)).then(r => { if (!stale && r.ok) setBook(r.data); });
    return () => { stale = true; };
  }, [source, membershipId, context, readable, kind, from, through, fromRecent, key, gen, track]);

  useEffect(() => {
    if (!membershipId || !readable || !kind || !from || !through) return;
    let stale = false;
    // Another period or person: what is on screen was theirs — the phone's answers for this one stand in until
    // the server's land. The same one read again (a pull): it stays until the answers land.
    if (shown.current !== key) {
      const peek = source.peek;
      setBlock(blockOf(peek?.<MemberInsight>(ask.insight(from, context)), membershipId));
      setRange(kind === "monthly" ? null : peek?.<MemberInsightRange>(ask.insightRange(membershipId, from, through, context)) ?? null);
      setKpi(kind === "monthly" ? peek?.<MemberKpiSummary>(ask.kpi(schemeId, context, from)) ?? null : null);
    }
    shown.current = key;
    const jobs: Promise<unknown>[] = [];
    if (kind === "monthly") {
      jobs.push(track(gen, source.insight(from, context)).then(r => {
        if (!stale && r.ok) setBlock(blockOf(r.data, membershipId));
      }));
      jobs.push(track(gen, source.kpi(schemeId, context, from)).then(r => { if (!stale && r.ok) setKpi(r.data); }));
    } else {
      jobs.push(track(gen, source.insightRange(membershipId, from, through, context)).then(r => { if (!stale && r.ok) setRange(r.data); }));
    }
    void Promise.allSettled(jobs).then(() => { if (!stale) setDoneKey(key); });
    return () => { stale = true; };
  }, [source, membershipId, schemeId, context, readable, kind, from, through, key, gen, track]);

  return { book: fromRecent ? recentBook : book, block, range, kpi, loading: doneKey !== key };
}
