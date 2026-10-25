import type { MemberInsight, MemberReadContext } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { DepartmentInsight, MemberInsightRange, MemberOrderBook } from "@/lib/member/order-book";
import type { ArenaWindow, MemberArenaSnapshot } from "@/lib/member/arena";
import { departmentInsight, departmentKpi, departmentRange } from "@/lib/member/department-view";
import { klToday } from "./format";
import { ask, type MemberRead, type Outcome, type RevenueSource } from "./source";

/**
 * The Principal's own app, viewing nobody (2026-10-25 — a salesperson's note the user passed on, over the Principal's
 * Today, Insight and Arena standing as placeholders: "要看销售额的话，就是把全部的加起来 … 要不然一直这样漏单的话，其实
 * 很容易让人以为是出 bug"): the reads Today, Insight and the Arena make, answered for the WHOLE sub-department
 * (mig 20261026014700). The pages ask as they always do:
 *   - `insight`, `kpi` and `insightRange` → one read, `departmentInsight` (every bill summed, everybody's figures) —
 *     a month's block and its KPI share it;
 *   - `orderBook` → every bill of the window, each with its salesperson;
 *   - `arena` → the boards with nobody the reader, and every fair's booths.
 * What the phone kept for them shows first, as for every read. Everything else is the source's own.
 */
export function departmentSource(base: RevenueSource, subDepartmentId: string): RevenueSource {
  const unavailable = <T,>(): Promise<Outcome<T>> => Promise.resolve({ ok: false, error: "Preview data only." });
  // A month's block and its KPI are asked in the same moment: one read answers both.
  const asked = new Map<string, Promise<Outcome<DepartmentInsight>>>();
  const insightOf = (from: string, until: string): Promise<Outcome<DepartmentInsight>> => {
    const key = `${from}|${until}`;
    let read = asked.get(key);
    if (!read) {
      read = base.departmentInsight ? base.departmentInsight(subDepartmentId, from, until) : unavailable<DepartmentInsight>();
      asked.set(key, read);
      // Answered (or not): the next pull asks again.
      void read.then(() => { asked.delete(key); }, () => { asked.delete(key); });
    }
    return read;
  };
  const as = <T,>(read: Promise<Outcome<DepartmentInsight>>, shape: (d: DepartmentInsight) => T): Promise<Outcome<T>> =>
    read.then(r => (r.ok ? { ok: true as const, data: shape(r.data) } : r));
  // The office's month (a read asks for none: the current one).
  const current = () => klToday().slice(0, 7);

  /** The department read that answers a page's read — null for one the source answers itself. */
  const answers = (read: MemberRead): { read: MemberRead; shape?: (d: DepartmentInsight) => unknown } | null => {
    switch (read.kind) {
      case "insight": {
        const month = read.period ?? current();
        return { read: ask.departmentInsight(subDepartmentId, month, month), shape: departmentInsight };
      }
      case "kpi": {
        const month = read.period ?? current();
        return { read: ask.departmentInsight(subDepartmentId, month, month), shape: departmentKpi };
      }
      case "insightRange": return { read: ask.departmentInsight(subDepartmentId, read.from, read.until), shape: departmentRange };
      case "orderBook": return { read: ask.departmentBook(subDepartmentId, read.from, read.until) };
      case "arena": return { read: ask.departmentArena(subDepartmentId, read.period, read.window, read.options) };
      default: return null;
    }
  };

  return {
    ...base,
    insight: (period?: string): Promise<Outcome<MemberInsight>> => {
      const month = period ?? current();
      return as(insightOf(month, month), departmentInsight);
    },
    kpi: (_schemeId: string, _context?: MemberReadContext, period?: string): Promise<Outcome<MemberKpiSummary>> => {
      const month = period ?? current();
      return as(insightOf(month, month), departmentKpi);
    },
    insightRange: (_sub: string, from: string, until: string): Promise<Outcome<MemberInsightRange>> =>
      as(insightOf(from, until), departmentRange),
    orderBook: (_sub: string, from: string, until: string): Promise<Outcome<MemberOrderBook>> =>
      base.departmentBook ? base.departmentBook(subDepartmentId, from, until) : unavailable<MemberOrderBook>(),
    arena: (_membershipId: string, period: string, window: ArenaWindow, _context?: MemberReadContext, options?: { history?: boolean }): Promise<Outcome<MemberArenaSnapshot>> =>
      base.departmentArena ? base.departmentArena(subDepartmentId, period, window, options) : unavailable<MemberArenaSnapshot>(),
    ...(base.peek ? {
      peek: <T,>(read: MemberRead): T | undefined => {
        const to = answers(read);
        if (!to) return base.peek!<T>(read);
        const kept = base.peek!<unknown>(to.read);
        if (kept === undefined) return undefined;
        return (to.shape ? to.shape(kept as DepartmentInsight) : kept) as T;
      },
    } : {}),
  };
}
