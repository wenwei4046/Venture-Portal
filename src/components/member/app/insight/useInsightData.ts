"use client";

import { useEffect, useMemo, useState } from "react";
import type { MemberInsightBlock, MemberReadContext } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import type { RevenueSource } from "../source";
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

/**
 * Insight's reads for one period. A month already inside the two-month book
 * the app holds for Today (last month and this one) is cut from it, not read
 * again; a quarter or a year reads its own book and its team range.
 */
export function useInsightData({ source, membershipId, schemeId, context, readable, period, recent, recentFrom }: {
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
}): InsightData {
  const [book, setBook] = useState<MemberOrderBook | null>(null);
  const [block, setBlock] = useState<MemberInsightBlock | null>(null);
  const [range, setRange] = useState<MemberInsightRange | null>(null);
  const [kpi, setKpi] = useState<MemberKpiSummary | null>(null);
  const [doneKey, setDoneKey] = useState("");

  const kind = period?.kind;
  const from = period?.from;
  const through = period?.through;
  const fromRecent = !!recent && kind === "monthly" && !!from && from >= recentFrom && from <= recent.through;
  const key = [membershipId, context?.staffId ?? "", kind, from, through].join("|");
  const recentBook = useMemo(() => (fromRecent && recent && from ? bookMonth(recent, from) : null), [fromRecent, recent, from]);

  useEffect(() => {
    if (!membershipId || !readable || !kind || !from || !through) return;
    let stale = false;
    setBlock(null); setRange(null); setKpi(null);
    if (!fromRecent) setBook(null);
    const jobs: Promise<unknown>[] = [];
    if (!fromRecent) {
      jobs.push(source.orderBook(membershipId, from, through, context).then(r => { if (!stale && r.ok) setBook(r.data); }));
    }
    if (kind === "monthly") {
      jobs.push(source.insight(from, context).then(r => {
        if (!stale && r.ok) setBlock(r.data.blocks.find(b => b.membershipId === membershipId) ?? r.data.blocks[0] ?? null);
      }));
      jobs.push(source.kpi(schemeId, context, from).then(r => { if (!stale && r.ok) setKpi(r.data); }));
    } else {
      jobs.push(source.insightRange(membershipId, from, through, context).then(r => { if (!stale && r.ok) setRange(r.data); }));
    }
    void Promise.allSettled(jobs).then(() => { if (!stale) setDoneKey(key); });
    return () => { stale = true; };
  }, [source, membershipId, schemeId, context, readable, kind, from, through, fromRecent, key]);

  return { book: recentBook ?? book, block, range, kpi, loading: doneKey !== key };
}
