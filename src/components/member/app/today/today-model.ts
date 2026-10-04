import type { MemberBand, MemberIncome, MemberInsightBlock, MemberMemo, MemberRequest } from "@/lib/member/types";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { marginStanding } from "../insight/insight-model";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import { arenaIncentive, arenaMonthFridays, arenaRankings, type ArenaMetric, type MemberArenaSnapshot } from "@/lib/member/arena";
import { dayLabel, dayRange, monthName, ordinalSuffix, rm2, shortDay } from "../format";
import { ICON } from "../icons";

/** What Today is built from — every number is the backend's own. */
export interface TodayInput {
  /** Today in Kuala Lumpur, `YYYY-MM-DD`. */
  today: string;
  first: string;
  title: string;
  rank: string;
  /** The latest commission statement of this sub-department, if any. */
  income?: MemberIncome;
  salary: number | null;
  hidden: boolean;
  /**
   * The working month's Insight block for this sub-department — the month still
   * being closed (September until it closes, then October), as Insight opens on.
   */
  insight?: MemberInsightBlock;
  kpi?: MemberKpiSummary | null;
  /** The working month's Arena (monthly window) — the boards' ranks and the margin tier. */
  arena?: MemberArenaSnapshot | null;
  /**
   * The current month's Arena, for this week's fair and the brand weeks still to
   * save. Absent = `arena` (the working month IS the current month).
   */
  arenaNow?: MemberArenaSnapshot | null;
  /** The working month's bills and the brands' ladders — the margin's tier. */
  book?: MemberOrderBook | null;
  bands?: MemberBand[];
  memos: MemberMemo[];
  requests: MemberRequest[];
  /** RQ-2609-004 style code of a request. */
  requestCode: (request: MemberRequest) => string;
}

export type TodoTone = "memo" | "request" | "weeks";
export type TodoTarget = "memos" | "requests" | "brandWeeks";
export interface TodayTodo { key: string; tone: TodoTone; icon: string; title: string; sub: string; target: TodoTarget }
export interface TodayMetric { key: "sales" | "margin" | "kpi"; label: string; value: string; tag: string; tagTone: "sub" | "good" }
export interface TodayBoard { id: "sales" | "margin" | "kpi" | "champ"; label: string; rankNum: string; rankSuf: string }
export interface TodayWeek { title: string; dates: string; venue: string | null; org: string | null }
export interface TodayModel {
  hello: string;
  helloSub: string;
  heroLabel: string;
  heroAmount: string;
  heroSplit: string;
  metrics: TodayMetric[];
  todo: TodayTodo[];
  week: TodayWeek | null;
  boards: TodayBoard[];
}

const SETTLED = new Set(["applied", "locked"]);
const KIND: Record<MemberRequest["kind"], string> = { claim: "Claim", replacement: "Replacement", waiting: "Waiting list" };
const BRAND_NAME: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", ZANOTTI: "Zanotti", DUNLOP: "Dunlopillo" };

/** `70k` for 70,000 — the hero's "of RM 70k". */
export function thousands(n: number): string {
  const k = n / 1000;
  return (Number.isInteger(k) ? String(k) : k.toFixed(1)) + "k";
}

/** `Incentive Tier 1` → `Tier 1`: the hero has room for the tier, not the word. */
export function shortTier(label: string): string {
  return label.replace(/^incentive\s+/i, "");
}

/** The Friday of the fair weekend this week belongs to (Mon–Sun). */
export function weekFriday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 Sun … 6 Sat
  const offset = dow === 0 ? -2 : 5 - dow; // Sun → back to Fri; Mon–Sat → this week's Fri
  return new Date(d.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
}

function salesMetric(input: TodayInput): TodayMetric {
  const sales = input.insight?.me.sales ?? 0;
  const target = input.insight?.target?.personal ?? null;
  if (target && target > 0) {
    return { key: "sales", label: "Sales", value: `${Math.round((sales / target) * 100)}%`, tag: `of RM ${thousands(target)}`, tagTone: "sub" };
  }
  return { key: "sales", label: "Sales", value: `RM ${thousands(sales)}`, tag: "Counted sales", tagTone: "sub" };
}

/**
 * The incentive tier the costed brands reach together — what the margin has
 * EARNED, whether or not an uncosted bill is still holding the payment back
 * (Insight and My income say "held"; the hero names the tier). Same rule as
 * the run: every brand must clear a tier, so it is the intersection.
 */
export function reachedTier(input: TodayInput): string | null {
  const person = input.arena?.people.find(p => p.self);
  if (!person || !input.arena) return null;
  const costed = arenaIncentive(person, input.arena.tiers).brands.filter(b => b.marginPct !== null);
  if (!costed.length) return null;
  let keys = new Set(costed[0].cleared);
  for (const b of costed.slice(1)) keys = new Set([...keys].filter(k => b.cleared.includes(k)));
  const tiers = input.arena.tiers.filter(t => keys.has(t.bandKey)).sort((a, b) => b.amount - a.amount || b.marginPct - a.marginPct);
  return tiers[0]?.label ?? null;
}

function marginMetric(input: TodayInput): TodayMetric {
  if (input.book) {
    // Insight's own reading (insight-model.marginStanding): the bills' layer-2
    // margin, the tier every costed brand clears on its own ladder, held while
    // a bill has no cost — so Today and Insight can never disagree.
    const st = marginStanding(input.book, input.bands ?? []);
    const tag = st.margin === null ? (st.blind > 0 ? "Cost pending" : "No sales yet")
      : st.tier ? `${shortTier(st.tier.label)}${st.held ? " · held" : ""}`
      : st.lowest ? `Below ${shortTier(st.lowest)}` : "No ladder";
    return { key: "margin", label: "Margin", value: st.margin === null ? "—" : `${st.margin.toFixed(1)}%`, tag, tagTone: st.tier && !st.held ? "good" : "sub" };
  }
  const me = input.insight?.me;
  // Uncosted bills stay in sales and out of the blended margin (Insight's rule).
  const margin = me && me.marginRevenue > 0 ? ((me.marginRevenue - me.marginCost) / me.marginRevenue) * 100 : null;
  const tier = reachedTier(input);
  const tag = margin === null ? (me && me.blindOrders > 0 ? "Cost pending" : "No sales yet") : tier ? shortTier(tier) : "Standard";
  return { key: "margin", label: "Margin", value: margin === null ? "—" : `${margin.toFixed(1)}%`, tag, tagTone: "good" };
}

function kpiMetric(input: TodayInput): TodayMetric {
  const kpi = input.kpi;
  if (kpi && !kpi.enabled) return { key: "kpi", label: "KPI", value: "—", tag: "Not counted", tagTone: "good" };
  const total = kpi?.total ?? input.insight?.me.kpiQty ?? 0;
  return { key: "kpi", label: "KPI", value: String(total), tag: kpi?.hit ? "Threshold hit" : "Below threshold", tagTone: "good" };
}

function todos(input: TodayInput): TodayTodo[] {
  const now = input.arenaNow ?? input.arena;
  const out: TodayTodo[] = [];
  const memos = input.memos.filter(m => m.requiresAck && !m.acknowledgedAt);
  if (memos.length) {
    out.push({ key: "memos", tone: "memo", icon: ICON.bell, target: "memos",
      title: `Acknowledge ${memos.length} memo${memos.length === 1 ? "" : "s"}`, sub: memos.map(m => m.title).join(" · ") });
  }
  for (const request of input.requests.filter(r => r.status === "needs_info")) {
    out.push({ key: `rq-${request.id}`, tone: "request", icon: ICON.receipt, target: "requests",
      title: `${KIND[request.kind]} needs info`, sub: `${input.requestCode(request)} · HR returned it` });
  }
  const arena = now;
  const period = input.today.slice(0, 7);
  if (arena && arena.period === period && arena.weekLocks?.length) {
    const picks = arena.brandWeeks?.picks ?? {};
    const open = arena.weekLocks.filter(lock => !lock.locked && !picks[lock.week]).sort((a, b) => a.closesOn.localeCompare(b.closesOn));
    if (open.length) {
      out.push({ key: "weeks", tone: "weeks", icon: ICON.calendar, target: "brandWeeks",
        title: `Save ${monthName(period)} brand weeks`, sub: `Due ${shortDay(open[0].closesOn)}` });
    }
  }
  return out;
}

function thisWeek(input: TodayInput): TodayWeek | null {
  const arena = input.arenaNow ?? input.arena;
  if (!arena) return null;
  const friday = weekFriday(input.today);
  const fridays = arenaMonthFridays(friday.slice(0, 7));
  const index = fridays.indexOf(friday);
  if (index < 0) return null;
  const end = new Date(new Date(`${friday}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  const pick = arena.period === friday.slice(0, 7) ? arena.brandWeeks?.picks?.[friday] : undefined;
  const brand = pick ? BRAND_NAME[pick] ?? pick : null;
  const booth = pick ? arena.history?.events.find(event => event.week === friday && event.brand === pick) : undefined;
  return {
    title: `Week ${index + 1} · ${brand ? `${brand} week` : "Brand week not picked"}`,
    dates: booth ? dayRange(booth.start, booth.end) : dayRange(friday, end),
    venue: booth?.venue ?? (brand ? null : "Pick your brand in My brand weeks"),
    org: booth?.organizer ?? null,
  };
}

const BOARDS: { id: TodayBoard["id"]; label: string; metric?: ArenaMetric }[] = [
  { id: "sales", label: "Sales", metric: "sales" },
  { id: "margin", label: "Margin", metric: "margin" },
  { id: "kpi", label: "KPI", metric: "kpi" },
  { id: "champ", label: "Championship" },
];

function boards(input: TodayInput, championRank: number | null): TodayBoard[] {
  return BOARDS.map(({ id, label, metric }) => {
    const people = input.arena?.people ?? [];
    const position = metric ? arenaRankings(people, metric).find(row => row.self)?.position ?? null : championRank;
    return { id, label, rankNum: position ? String(position) : "—", rankSuf: position ? ordinalSuffix(position) : "" };
  });
}

export function todayModel(input: TodayInput, championRank: number | null = null): TodayModel {
  const income = input.income;
  const commission = income?.total ?? null;
  const fixed = input.salary ?? 0;
  const settled = income ? SETTLED.has(income.status) : false;
  const month = income ? monthName(income.period) : monthName(input.today.slice(0, 7));
  return {
    hello: `Hello, ${input.first}`,
    helloSub: [dayLabel(input.today), input.title, input.rank].filter(Boolean).join(" · "),
    heroLabel: `${month} · ${settled ? "Settled income" : "Estimated income"}`,
    heroAmount: input.hidden ? "RM ••••••" : commission === null ? rm2(fixed) : rm2(fixed + commission),
    heroSplit: input.hidden ? "Amounts hidden"
      : commission === null ? `Fixed salary ${rm2(fixed)} · commission shows once ${month} is computed`
      : `Fixed salary ${rm2(fixed)} + commission ${rm2(commission)}`,
    metrics: [salesMetric(input), marginMetric(input), kpiMetric(input)],
    todo: todos(input),
    week: thisWeek(input),
    boards: boards(input, championRank),
  };
}
