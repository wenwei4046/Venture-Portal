import type { MemberBand, MemberIncome, MemberInsightBlock, MemberMemo, MemberRequest } from "@/lib/member/types";
import type { MemberPay } from "@/lib/member/income-pay";
import type { MemberOrderBook } from "@/lib/member/order-book";
import { marginStanding } from "../insight/insight-model";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import { arenaIncentive, arenaMonthFridays, arenaRankings, arenaWeekFriday, type ArenaMetric, type MemberArenaSnapshot } from "@/lib/member/arena";
import { dayLabel, dayRange, firstName, monthName, ordinalSuffix, rm2 } from "../format";
import { ICON } from "../icons";

/**
 * What Today is built from — every number is the backend's own, and all of it
 * is the CURRENT month (user 2026-10-06: "on live date, not showing last
 * month"), even while the month just gone is still being closed.
 */
export interface TodayInput {
  /** Today in Kuala Lumpur, `YYYY-MM-DD`. */
  today: string;
  first: string;
  title: string;
  rank: string;
  /**
   * This month's income: Comm Cal's engine for the member (live until HR
   * closes them), or — a Principal viewing nobody — the department's.
   */
  income?: Pick<MemberIncome, "period" | "status" | "total">;
  /** The month's figure is still being worked out, or could not be. Absent: ready. */
  incomeStatus?: "loading" | "failed";
  salary: number | null;
  /**
   * What the month pays, as HR's payroll pays it (2026-10-20): the fixed
   * salary is paid OUT OF the commission, with every EPF / SOCSO / EIS and the
   * PCB — HR's figures (`lib/member/income-pay.ts`). The hero is what reaches
   * the bank: net basic + balance commission. Absent (the demo): the salary
   * and the commission as they are.
   */
  pay?: MemberPay | null;
  /**
   * A Principal viewing nobody: `income` is the whole sub-department's
   * commission, named so — it is nobody's income.
   */
  department?: string;
  /**
   * A Revenue Director (2026-10-14, the user's choice): the sub-department they
   * lead. The income stays their own; Sales / Margin / KPI are the whole
   * sub-department's — every bill of the month, the Insight block's `team` —
   * the Arena's cards name who leads (a director is on no board), and there is
   * no week of their own.
   */
  team?: string;
  hidden: boolean;
  /** This month's Insight block for this sub-department. */
  insight?: MemberInsightBlock;
  kpi?: MemberKpiSummary | null;
  /** This month's Arena (monthly window): the boards' ranks, and this week's booth (its history's `weeks`). */
  arena?: MemberArenaSnapshot | null;
  /** This month's bills and the brands' ladders — the margin's tier. */
  book?: MemberOrderBook | null;
  /**
   * Still on its way (2026-10-08): Sales / Margin / KPI and the Arena boards show a placeholder, never a
   * zero — "RM 0k · No sales yet" while loading read exactly like a month with no sales.
   */
  metricsLoading?: boolean;
  arenaLoading?: boolean;
  bands?: MemberBand[];
  memos: MemberMemo[];
  requests: MemberRequest[];
  /** RQ-2609-004 style code of a request. */
  requestCode: (request: MemberRequest) => string;
}

export type TodoTone = "memo" | "request" | "weeks";
/** `brandWeeks` / `weeks`: the prototype's "Save … brand weeks" (its fixtures); the live app has had nothing to save since 2026-10-12. */
export type TodoTarget = "memos" | "requests" | "brandWeeks";
export interface TodayTodo {
  key: string; tone: TodoTone; icon: string; title: string; sub: string; target: TodoTarget;
  /** A request's kind: where it is followed up depends on it (app-access.ts `requestPage`). */
  requestKind?: MemberRequest["kind"];
}
export interface TodayMetric { key: "sales" | "margin" | "kpi"; label: string; value: string; tag: string; tagTone: "sub" | "good"; loading?: boolean }
/**
 * `ranked` shows the place; `unranked` says so in words (nothing on that board yet); `loading` is a placeholder;
 * `off` is KPI not counted this period — nobody will ever have a place there; `lead` (a director, on no board) names
 * who leads it (`leader`, absent while nobody is placed).
 */
export interface TodayBoard {
  id: "sales" | "margin" | "kpi" | "champ"; label: string; rankNum: string; rankSuf: string;
  state: "ranked" | "unranked" | "loading" | "off" | "lead"; leader?: string;
}
export interface TodayWeek { title: string; dates: string; venue: string | null; org: string | null }
export interface TodayModel {
  hello: string;
  helloSub: string;
  heroLabel: string;
  heroAmount: string;
  /** The figure is still being worked out: a placeholder where it goes, not "RM —". */
  heroLoading: boolean;
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

/** The Friday of the fair weekend this week belongs to (Mon–Sun) — My brand weeks cuts at the same one. */
export const weekFriday = arenaWeekFriday;

/**
 * A director's figures: the whole sub-department — the block's `team`, every bill of the month, the directors' own
 * included (side review 2026-10-14: their own and everybody under them left out the other director's bills, so PETER
 * and KRIS read two different "All of Fair"); without it, their own and everybody under them.
 */
function groupScore(insight: MemberInsightBlock | undefined) {
  if (insight?.team) return insight.team;
  const rows = insight ? [insight.me, ...insight.downline] : [];
  const sum = (key: "sales" | "marginRevenue" | "marginCost" | "kpiQty" | "blindOrders") => rows.reduce((a, r) => a + (Number(r[key]) || 0), 0);
  return { sales: sum("sales"), marginRevenue: sum("marginRevenue"), marginCost: sum("marginCost"), kpiQty: sum("kpiQty"), blindOrders: sum("blindOrders") };
}

/** `RM 906.9k`, and `RM 1.24M` past a million — a whole sub-department's month. */
function teamAmount(n: number): string {
  return n >= 1_000_000 ? `RM ${(Math.round(n / 10_000) / 100).toFixed(2)}M` : `RM ${thousands(n)}`;
}

function teamMetrics(input: TodayInput, team: string): TodayMetric[] {
  const g = groupScore(input.insight);
  const tag = `All of ${team}`;
  const margin = g.marginRevenue > 0 ? ((g.marginRevenue - g.marginCost) / g.marginRevenue) * 100 : null;
  const kpiOff = !!input.kpi && !input.kpi.enabled;
  return [
    { key: "sales", label: "Sales", value: teamAmount(g.sales), tag, tagTone: "sub" },
    { key: "margin", label: "Margin", value: margin === null ? "—" : `${margin.toFixed(1)}%`,
      tag: margin === null ? (g.blindOrders > 0 ? "Cost pending" : "No sales yet") : tag, tagTone: "sub" },
    { key: "kpi", label: "KPI", value: kpiOff ? "—" : String(g.kpiQty), tag: kpiOff ? "Not counted" : tag, tagTone: "sub" },
  ];
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
  const out: TodayTodo[] = [];
  const memos = input.memos.filter(m => m.requiresAck && !m.acknowledgedAt);
  if (memos.length) {
    out.push({ key: "memos", tone: "memo", icon: ICON.bell, target: "memos",
      title: `Acknowledge ${memos.length} memo${memos.length === 1 ? "" : "s"}`, sub: memos.map(m => m.title).join(" · ") });
  }
  for (const request of input.requests.filter(r => r.status === "needs_info")) {
    out.push({ key: `rq-${request.id}`, tone: "request", icon: ICON.receipt, target: "requests", requestKind: request.kind,
      title: `${KIND[request.kind]} needs info`, sub: `${input.requestCode(request)} · HR returned it` });
  }
  return out;
}

function thisWeek(input: TodayInput): TodayWeek | null {
  const arena = input.arena;
  // A director works no booth of their own.
  if (!arena || input.team) return null;
  const friday = weekFriday(input.today);
  const fridays = arenaMonthFridays(friday.slice(0, 7));
  const index = fridays.indexOf(friday);
  if (index < 0) return null;
  const end = new Date(new Date(`${friday}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  // The week's booth (2026-10-12): where the ERP's Sales Attending lists them — this weekend's too, before
  // its fair ends — else, once the fair is over, the booth with the most of their bills.
  const week = arena.history?.weeks?.find(w => w.week === friday && (!arena.selfId || w.staffId === arena.selfId));
  const brand = week?.brand ? BRAND_NAME[week.brand] ?? week.brand : null;
  return {
    title: `Week ${index + 1} · ${brand ? `${brand} week` : "No brand week yet"}`,
    dates: week?.start && week.end ? dayRange(week.start, week.end) : dayRange(friday, end),
    venue: week?.venue ?? null,
    org: week?.organizer ?? null,
  };
}

const BOARDS: { id: TodayBoard["id"]; label: string; metric?: ArenaMetric }[] = [
  { id: "sales", label: "Sales", metric: "sales" },
  { id: "margin", label: "Margin", metric: "margin" },
  { id: "kpi", label: "KPI", metric: "kpi" },
  { id: "champ", label: "Championship" },
];

function boards(input: TodayInput, championRank: number | null, championLeader: string | null): TodayBoard[] {
  return BOARDS.map(({ id, label, metric }) => {
    if (input.arenaLoading && !input.arena) return { id, label, rankNum: "", rankSuf: "", state: "loading" as const };
    if (id === "kpi" && input.kpi && !input.kpi.enabled) return { id, label, rankNum: "—", rankSuf: "", state: "off" as const };
    const people = input.arena?.people ?? [];
    if (input.team) {
      const leader = metric ? arenaRankings(people, metric).find(row => row.position === 1)?.name ?? null : championLeader;
      return { id, label, rankNum: "", rankSuf: "", state: "lead" as const, ...(leader ? { leader: firstName(leader) } : {}) };
    }
    const position = metric ? arenaRankings(people, metric).find(row => row.self)?.position ?? null : championRank;
    return position
      ? { id, label, rankNum: String(position), rankSuf: ordinalSuffix(position), state: "ranked" as const }
      : { id, label, rankNum: "—", rankSuf: "", state: "unranked" as const };
  });
}

const LOADING_METRICS: TodayMetric[] = [
  { key: "sales", label: "Sales", value: "", tag: "", tagTone: "sub", loading: true },
  { key: "margin", label: "Margin", value: "", tag: "", tagTone: "sub", loading: true },
  { key: "kpi", label: "KPI", value: "", tag: "", tagTone: "sub", loading: true },
];

/** The income hidden — "RM ••••", as the refresh handoff's statement draws it (2026-10-14; it was six dots). */
const HIDDEN_AMOUNT = "RM ••••";
const HIDDEN_SPLIT = "Amounts hidden";

/** "RM 6,842.50" → the currency and the figure, drawn apart in Today's statement ("RM ••••", "RM —" and "−RM 697.70" alike). */
export function amountParts(amount: string): { cur: string; num: string } {
  const m = /^(−?)(RM)\s+(.*)$/.exec(amount);
  return m ? { cur: m[2], num: m[1] + m[3] } : { cur: "", num: amount };
}

/** `−RM 697.70` — a month whose commission does not yet cover the fixed salary says so, never a floored zero. */
const rmSigned = (n: number) => (n < 0 ? `−${rm2(-n)}` : rm2(n));

/**
 * The income card as the eye hides it — and as My income closed keeps it
 * (2026-10-11). The preview's figures are written out, not worked out, so it
 * hides them through this too.
 */
export function hideIncome<T extends Pick<TodayModel, "heroAmount" | "heroLoading" | "heroSplit">>(model: T): T {
  return { ...model, heroAmount: HIDDEN_AMOUNT, heroLoading: false, heroSplit: HIDDEN_SPLIT };
}

export function todayModel(input: TodayInput, championRank: number | null = null, championLeader: string | null = null): TodayModel {
  const income = input.income;
  const commission = income?.total ?? null;
  const fixed = input.salary ?? 0;
  const settled = income ? SETTLED.has(income.status) : false;
  const month = income ? monthName(income.period) : monthName(input.today.slice(0, 7));
  const dept = input.department;
  const pending = input.incomeStatus;
  // HR's pay (2026-10-20): the fixed salary comes out of the commission, never on top of it.
  const pay = commission === null ? null : input.pay ?? null;
  return {
    hello: `Hello, ${input.first}`,
    helloSub: [dayLabel(input.today), input.title, input.rank].filter(Boolean).join(" · "),
    heroLabel: dept ? `${month} · ${dept} commission` : `${month} · ${settled ? "Settled income" : "Estimated income"}`,
    heroAmount: input.hidden ? HIDDEN_AMOUNT : pending ? "RM —" : dept ? rm2(commission ?? 0)
      : pay ? rmSigned(pay.net) : commission === null ? rm2(fixed) : rm2(fixed + commission),
    heroLoading: !input.hidden && pending === "loading",
    heroSplit: input.hidden ? HIDDEN_SPLIT
      : pending === "loading" ? `Working out ${month}'s commission…`
      : pending === "failed" ? `${month}'s commission is unavailable right now`
      : dept ? `Everybody in ${dept}, before salaries · View as a member for their own`
      : pay ? (pay.fixed > 0 ? `Net basic ${rmSigned(pay.netBasic)} + balance commission ${rmSigned(pay.balance)}` : "Commission only")
      : commission === null ? `Fixed salary ${rm2(fixed)} · commission shows once ${month} is computed`
      : `Fixed salary ${rm2(fixed)} + commission ${rm2(commission)}`,
    metrics: input.metricsLoading && !input.insight ? LOADING_METRICS
      : input.team ? teamMetrics(input, input.team) : [salesMetric(input), marginMetric(input), kpiMetric(input)],
    todo: todos(input),
    week: thisWeek(input),
    boards: boards(input, championRank, championLeader),
  };
}
