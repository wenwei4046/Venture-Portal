import type { MemberBand, MemberDownlineRow, MemberScore, MemberTarget } from "@/lib/member/types";
import type { MemberKpiSummary } from "@/lib/member/kpi-summary";
import type { MemberBookOrder, MemberOrderBook } from "@/lib/member/order-book";
import { arenaMonthFridays } from "@/lib/member/arena";
import { holdersLine, pctLabel } from "@/lib/member/share-requests";
import { dayRange, initials, monthName, rm, shortDay } from "../format";
import { barPos, brandLadder, pctText, rowFor, TONES, type Ladder, type LadderRow, type Tone } from "./ladder";
import type { InsightPeriod } from "./period";

/**
 * Insight's screens as strings — every number is the backend's own: the bills
 * are `member_order_book`'s, the team `member_insight_snapshot` /
 * `member_insight_range`, the KPI threshold `member_kpi_summary`, each brand's
 * ladder its own `comm_margin_bands`. The prototype's wording, verbatim,
 * wherever the data allows it — except how the cost is made up, which no
 * screen says (user 2026-10-05: that leaks our numbers).
 */

export const BRAND_NAMES: Record<string, string> = { AKEMI: "Akemi", ERGOTEX: "Ergotex", DUNLOP: "Dunlopillo", ZANOTTI: "Zanotti", UNCLASSIFIED: "No brand" };
/** The prototype's `BILL_BRAND`: a brand's colour and its tint. */
const BRAND_COLORS: Record<string, { color: string; tint: string }> = {
  AKEMI: { color: "var(--rv-accent)", tint: "var(--rv-peach-bg)" },
  ERGOTEX: { color: "var(--rv-green)", tint: "var(--rv-green-bg)" },
  ZANOTTI: { color: "var(--rv-amber)", tint: "var(--rv-gold-tint)" },
  DUNLOP: { color: "var(--rv-brown)", tint: "var(--rv-sand)" },
};
const NEUTRAL_BRAND = { color: "var(--rv-sub)", tint: "var(--rv-sand)" };
const KPI_SHADES = ["--rv-tier-deep", "--rv-tier-top", "--rv-green", "--rv-kpi-4", "--rv-kpi-5", "--rv-kpi-6", "--rv-kpi-7", "--rv-kpi-8", "--rv-kpi-9"].map(v => `var(${v})`);

export const brandName = (code: string) => BRAND_NAMES[code] ?? code.charAt(0) + code.slice(1).toLowerCase();
export const brandColors = (code: string) => BRAND_COLORS[code] ?? NEUTRAL_BRAND;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface InsightInput {
  period: InsightPeriod;
  /** The member's bills over the period. Null while loading. */
  book: MemberOrderBook | null;
  /** The member's own score and team for the period. */
  me: MemberScore | null;
  downline: MemberDownlineRow[];
  /** Month only: this rung's gates. */
  target: MemberTarget | null;
  /** Month only: the KPI summary (enabled, threshold, items). */
  kpi: MemberKpiSummary | null;
  /** Whether KPI pays at all (the working month's summary) — read for a quarter or a year. */
  kpiEnabled?: boolean;
  bands: MemberBand[];
  name: string;
  title: string;
}

// ── shared derivations ─────────────────────────────────────────────────────
export interface BrandStat {
  code: string;
  goods: number;
  orders: number;
  /** Blended layer-2 margin of its costed bills, %, or null when none is costed. */
  margin: number | null;
  /** Counted bills of this brand still without a cost. */
  blind: number;
  ladder: Ladder;
  row: LadderRow | null;
}

const counted = (book: MemberOrderBook | null) => (book?.orders ?? []).filter(o => o.cleared);
const waiting = (book: MemberOrderBook | null) => (book?.orders ?? []).filter(o => !o.cleared);

function blend(orders: readonly MemberBookOrder[]): number | null {
  let revenue = 0;
  let cost = 0;
  for (const o of orders) {
    if (o.margin === null || !(o.revenue > 0)) continue;
    revenue += o.revenue;
    cost += o.revenue * (1 - o.margin / 100);
  }
  return revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;
}

export function brandStats(book: MemberOrderBook | null, bands: readonly MemberBand[]): BrandStat[] {
  const byBrand = new Map<string, MemberBookOrder[]>();
  for (const o of counted(book)) byBrand.set(o.brand, [...(byBrand.get(o.brand) ?? []), o]);
  return [...byBrand.entries()]
    .map(([code, orders]) => {
      const ladder = brandLadder(bands.filter(b => b.brand === code));
      const margin = blend(orders);
      return {
        code, orders: orders.length, ladder, margin,
        goods: orders.reduce((s, o) => s + o.revenue, 0),
        blind: orders.filter(o => o.margin === null && o.revenue > 0).length,
        row: rowFor(margin, ladder),
      };
    })
    .sort((a, b) => b.goods - a.goods || a.code.localeCompare(b.code));
}

/** The tier label and its tone a brand reads as: a tier only once every bill is costed. */
function brandPill(b: BrandStat): { pill: string; tone: Tone } {
  if (b.code === "UNCLASSIFIED") return { pill: "No ladder", tone: "none" };
  if (b.margin === null || b.blind > 0) return { pill: "Cost pending", tone: "warn" };
  return b.row ? { pill: b.row.label, tone: b.row.tone } : { pill: "No ladder", tone: "none" };
}

/** A bill's margin read on its own brand's ladder. */
function billRow(o: MemberBookOrder, ladders: Map<string, Ladder>, bands: readonly MemberBand[]): LadderRow | null {
  let ladder = ladders.get(o.brand);
  if (!ladder) {
    ladder = brandLadder(bands.filter(b => b.brand === o.brand));
    ladders.set(o.brand, ladder);
  }
  return rowFor(o.margin, ladder);
}

const stillDue = (o: MemberBookOrder) => Math.max(0, (o.depositNeeded ?? 0) - o.paid);

// ── Insight › main ─────────────────────────────────────────────────────────
export interface InsightCardVM { right: string; rightAccent: boolean; amount: string; bar: number | null; sub: string }
export interface BrandRowVM { code: string; name: string; sub: string; pct: string; pill: string; tone: Tone }
export interface TeamRowVM { id: string; ini: string; name: string; title: string; sales: string; meta: string; mine: boolean }
export interface InsightMainVM {
  personal: {
    sales: InsightCardVM;
    kpi: { value: string; pill: string; pillTone: Tone; sub: string };
    orders: { value: string; pill: string; sub: string; subAmber: boolean };
    overall: string;
    brands: BrandRowVM[];
    notice: { title: string; body: string } | null;
  };
  team: {
    sales: InsightCardVM;
    members: { value: string; sub: string };
    kpiHit: { value: string; sub: string };
    rows: TeamRowVM[];
  };
}

function salesCard(sales: number, target: number | null, fallbackSub: string, whose: "your" | "the" = "your", team = ""): InsightCardVM {
  if (target && target > 0) {
    const pct = Math.round((sales / target) * 100);
    const gap = target - sales;
    return {
      right: `${pct}% of target`, rightAccent: true, amount: rm(sales), bar: Math.min(100, Math.max(0, pct)),
      sub: gap > 0 ? `${rm(gap)} to ${whose} ${rm(target)} ${team}target` : `${rm(target)} ${team}target reached`,
    };
  }
  return { right: "Counted sales", rightAccent: false, amount: rm(sales), bar: null, sub: fallbackSub };
}

/** What every brand's costed bills reach together — the run's rule: every brand must clear a tier. */
function tierReached(stats: readonly BrandStat[]): LadderRow | null {
  const costed = stats.filter(s => s.code !== "UNCLASSIFIED" && s.margin !== null);
  if (!costed.length) return null;
  let common: LadderRow[] | null = null;
  for (const s of costed) {
    const cleared = s.ladder.rows.filter(r => r.kind === "incentive" && s.margin! + 1e-9 >= r.threshold);
    common = common === null ? cleared : common.filter(c => cleared.some(r => r.label === c.label));
  }
  return (common ?? []).sort((a, b) => b.amount - a.amount || b.threshold - a.threshold)[0] ?? null;
}

export interface MarginStanding {
  /** Blended layer-2 margin of every counted, costed bill, %. */
  margin: number | null;
  /** The incentive tier every costed brand reaches together. */
  tier: LadderRow | null;
  /** A bill without cost (or without a brand) holds the incentive back. */
  held: boolean;
  /** Counted bills still without a cost. */
  blind: number;
  /** The lowest incentive's label, for "Below Tier 1". */
  lowest: string | null;
}

/** Where the month's margin stands — one reading for Today and Insight alike. */
export function marginStanding(book: MemberOrderBook | null, bands: readonly MemberBand[]): MarginStanding {
  const stats = brandStats(book, bands);
  const lowest = stats.flatMap(s => s.ladder.incentives).sort((a, b) => a.threshold - b.threshold)[0]?.label ?? null;
  return {
    margin: blend(counted(book)),
    tier: tierReached(stats),
    held: stats.some(s => s.blind > 0 || s.code === "UNCLASSIFIED"),
    blind: stats.reduce((n, s) => n + s.blind, 0),
    lowest,
  };
}

function heldNotice(stats: readonly BrandStat[]): { title: string; body: string } | null {
  const tier = tierReached(stats);
  if (!tier) return null;
  const holders = stats.filter(s => s.code !== "UNCLASSIFIED" && s.blind > 0);
  const unbranded = stats.find(s => s.code === "UNCLASSIFIED");
  if (!holders.length && !unbranded) return null;
  const blind = holders.reduce((n, s) => n + s.blind, 0);
  const names = holders.map(s => brandName(s.code));
  const who = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}` : names[0];
  if (holders.length) {
    return {
      title: "Margin incentive held",
      body: `${who} ${names.length > 1 ? "have" : "has"} ${plural(blind, "bill")} without cost. Every brand must clear a tier, so ${tier.label} pays once ${blind === 1 ? "that bill is" : "those bills are"} costed.`,
    };
  }
  const n = unbranded!.orders;
  return {
    title: "Margin incentive held",
    body: `${plural(n, "bill")} ${n === 1 ? "has" : "have"} no brand. Every bill must be on a brand's ladder, so ${tier.label} pays once ${n === 1 ? "it has" : "they have"} one.`,
  };
}

function kpiTopItems(book: MemberOrderBook | null, kpi: MemberKpiSummary | null): string {
  if (kpi?.items.some(i => i.quantity > 0)) {
    return [...kpi.items].filter(i => i.quantity > 0).sort((a, b) => b.quantity - a.quantity).slice(0, 2).map(i => `${i.label} ${i.quantity}`).join(" · ");
  }
  const byName = new Map<string, number>();
  for (const o of counted(book)) for (const l of o.lines) if (l.kpiQty > 0) byName.set(l.name, (byName.get(l.name) ?? 0) + l.kpiQty);
  const top = [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2);
  return top.length ? top.map(([n, q]) => `${n} ${q}`).join(" · ") : "No KPI items yet";
}

export function kpiOn(input: Pick<InsightInput, "kpi" | "kpiEnabled">): boolean {
  return input.kpi ? input.kpi.enabled : input.kpiEnabled ?? true;
}

export function insightMain(input: InsightInput): InsightMainVM {
  const { book, period } = input;
  const done = counted(book);
  const held = waiting(book);
  const sales = done.reduce((s, o) => s + o.revenue, 0);
  const heldSum = held.reduce((s, o) => s + o.revenue, 0);
  const monthly = period.kind === "monthly";
  const stats = brandStats(book, input.bands);
  const overall = blend(done);

  // KPI card
  const kpiEnabled = kpiOn(input);
  const kpiTotal = monthly && input.kpi ? input.kpi.total : done.reduce((s, o) => s + o.kpiQty, 0);
  const threshold = monthly ? input.kpi?.threshold ?? null : null;
  let kpiCard: InsightMainVM["personal"]["kpi"];
  if (!kpiEnabled) kpiCard = { value: "—", pill: "Not counted", pillTone: "none", sub: "KPI is off this month" };
  else if (threshold !== null) {
    kpiCard = kpiTotal >= threshold
      ? { value: String(kpiTotal), pill: `Hit · ${threshold} needed`, pillTone: "good", sub: kpiTopItems(book, input.kpi) }
      : { value: String(kpiTotal), pill: `${threshold - kpiTotal} to go · ${threshold} needed`, pillTone: "neutral", sub: kpiTopItems(book, input.kpi) };
  } else kpiCard = { value: String(kpiTotal), pill: monthly ? "No threshold" : "Sum of months", pillTone: "neutral", sub: kpiTopItems(book, input.kpi) };

  // Team
  const team = [input.me ? { ...input.me, name: input.name, title: input.title, mine: true } : null, ...input.downline.map(d => ({ ...d, mine: false }))]
    .filter((r): r is NonNullable<typeof r> => r !== null);
  const teamSales = team.reduce((s, r) => s + r.sales, 0);
  const teamOrders = team.reduce((s, r) => s + r.orders, 0);
  const members = team.length;
  const kpiCounts = kpiEnabled && threshold !== null;
  const hits = kpiCounts ? team.filter(r => r.kpiQty >= threshold!).length : 0;
  const rows: TeamRowVM[] = [...team].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name)).map(r => {
    const m = r.marginRevenue > 0 ? ((r.marginRevenue - r.marginCost) / r.marginRevenue) * 100 : null;
    const marginText = m === null ? "Cost pending" : `${m.toFixed(1)}%`;
    return {
      id: r.staffId || (r.mine ? "me" : r.name), ini: initials(r.name), name: r.mine ? `${r.name} (you)` : r.name, title: r.title,
      sales: rm(r.sales), meta: kpiCounts ? `${marginText} · ${r.kpiQty >= threshold! ? "KPI hit" : "KPI pending"}` : marginText, mine: r.mine,
    };
  });

  return {
    personal: {
      sales: salesCard(sales, monthly ? input.target?.personal ?? null : null,
        heldSum > 0 ? `${plural(done.length, "order")} · ${rm(heldSum)} waiting for deposit` : `${plural(done.length, "order")} counted`),
      kpi: kpiCard,
      orders: {
        value: String(done.length), pill: "Deposit cleared",
        sub: held.length ? `${held.length} waiting for deposit` : "Nothing waiting", subAmber: held.length > 0,
      },
      overall: overall === null ? (done.length ? "Cost pending" : "No sales yet") : `${overall.toFixed(1)}% overall`,
      brands: stats.map(b => {
        const { pill, tone } = brandPill(b);
        return { code: b.code, name: brandName(b.code), sub: `${rm(b.goods)} goods · ${plural(b.orders, "order")}`, pct: b.margin === null ? "—" : `${b.margin.toFixed(1)}%`, pill, tone };
      }),
      notice: heldNotice(stats),
    },
    team: {
      sales: salesCard(teamSales, monthly ? input.target?.group ?? null : null, `${plural(members, "person", "people")} · ${plural(teamOrders, "order")}`, "the", "team "),
      members: { value: String(members), sub: members <= 1 ? "Just you" : `You + ${plural(members - 1, "downline")}` },
      kpiHit: !kpiEnabled ? { value: "—", sub: "KPI not counted" }
        : threshold === null ? { value: "—", sub: monthly ? "No threshold set" : "Month view only" }
        : { value: `${hits} of ${members}`, sub: members - hits ? `${members - hits} still pending` : "Everyone hit" },
      rows,
    },
  };
}

// ── Insight › My sales orders ──────────────────────────────────────────────
export interface BillRowVM {
  id: string;
  no: string;
  sub: string;
  amt: string;
  amtMuted: boolean;
  pill: string;
  pillInk: string;
  kpiText: string | null;
}
export interface WeekTabVM { key: string; title: string; brand: string; dates: string; color: string; tint: string }
export interface WeekCardVM { brandWeek: string; total: string; place: string; dates: string; stats: string; tint: string; bills: BillRowVM[] }
export interface BillsVM {
  counted: { amount: string; sub: string };
  waiting: { amount: string; sub: string };
  tabs: WeekTabVM[];
  weeks: Record<string, WeekCardVM>;
  waitBills: BillRowVM[];
  footnote: string;
}

const EARLIER = "earlier";

interface Group { key: string; title: string; orders: MemberBookOrder[] }

/** A month's bills by fair weekend (named by the month's Fridays); a quarter's or a year's by month. */
export function billGroups(input: Pick<InsightInput, "book" | "period">): Group[] {
  const orders = input.book?.orders ?? [];
  if (input.period.kind !== "monthly") {
    const byMonth = new Map<string, MemberBookOrder[]>();
    for (const o of orders) byMonth.set(o.recognitionMonth, [...(byMonth.get(o.recognitionMonth) ?? []), o]);
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, list]) => ({ key: m, title: monthName(m).slice(0, 3), orders: list }));
  }
  const fridays = arenaMonthFridays(input.period.from);
  const byWeek = new Map<string, MemberBookOrder[]>();
  const earlier: MemberBookOrder[] = [];
  for (const o of orders) {
    if (o.carried) earlier.push(o);
    else byWeek.set(o.week, [...(byWeek.get(o.week) ?? []), o]);
  }
  const groups: Group[] = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, list]) => {
    const i = fridays.indexOf(week);
    return { key: week, title: i >= 0 ? `Week ${i + 1}` : shortDay(week), orders: list };
  });
  if (earlier.length) groups.unshift({ key: EARLIER, title: "Earlier", orders: earlier });
  return groups;
}

/** The brand a week is worked for: the stored brand-week pick, else the booth (or brand) with the most bills. */
function weekBrand(group: Group, picks: Record<string, string>): string | null {
  if (picks[group.key]) return picks[group.key];
  const count = new Map<string, { n: number; revenue: number }>();
  for (const o of group.orders) {
    const b = o.booth ?? (o.brand === "UNCLASSIFIED" ? null : o.brand);
    if (!b) continue;
    const c = count.get(b) ?? { n: 0, revenue: 0 };
    count.set(b, { n: c.n + 1, revenue: c.revenue + o.revenue });
  }
  return [...count.entries()].sort((a, b) => b[1].n - a[1].n || b[1].revenue - a[1].revenue)[0]?.[0] ?? null;
}

/** The fair a week's bills were mostly written at (for the brand worked). */
function weekFair(group: Group, brand: string | null) {
  const pool = group.orders.filter(o => !brand || (o.booth ?? o.brand) === brand);
  const tally = new Map<string, { n: number; o: MemberBookOrder }>();
  for (const o of pool.length ? pool : group.orders) {
    const key = `${o.venue}|${o.fairStart ?? ""}|${o.organiser ?? ""}`;
    tally.set(key, { n: (tally.get(key)?.n ?? 0) + 1, o });
  }
  return [...tally.values()].sort((a, b) => b.n - a.n)[0]?.o ?? null;
}

function weekDates(group: Group, fair: MemberBookOrder | null): string {
  if (fair?.fairStart && fair.fairEnd) return dayRange(fair.fairStart, fair.fairEnd);
  if (group.key === EARLIER) return "Carried in";
  if (/^\d{4}-\d{2}-\d{2}$/.test(group.key)) {
    const sunday = new Date(new Date(`${group.key}T00:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
    return dayRange(group.key, sunday);
  }
  return plural(group.orders.length, "bill");
}

export function billsView(input: InsightInput): BillsVM {
  const { book } = input;
  const kpiEnabled = kpiOn(input);
  const ladders = new Map<string, Ladder>();
  const picks = book?.brandWeeks ?? {};
  const groups = billGroups(input);
  const weekOf = new Map<string, string>();
  for (const g of groups) for (const o of g.orders) weekOf.set(o.id, g.title);

  const row = (o: MemberBookOrder, sub: string): BillRowVM => {
    const band = billRow(o, ladders, input.bands);
    const due = stillDue(o);
    const pill = !o.cleared ? (due > 0 ? `Due ${rm(due)}` : "Deposit due") : o.margin === null ? "Cost pending" : `${o.margin.toFixed(1)}%`;
    const ink = !o.cleared || o.margin === null ? TONES.warn.ink : TONES[band?.tone ?? "neutral"].ink;
    return { id: o.id, no: o.number, sub, amt: rm(o.revenue), amtMuted: !o.cleared, pill, pillInk: ink, kpiText: kpiEnabled ? `KPI ${o.kpiQty}` : null };
  };

  const tabs: WeekTabVM[] = [];
  const weeks: Record<string, WeekCardVM> = {};
  for (const g of groups) {
    const brand = g.key === EARLIER ? null : weekBrand(g, picks);
    const colors = brand ? brandColors(brand) : NEUTRAL_BRAND;
    const fair = g.key === EARLIER ? null : weekFair(g, brand);
    const dates = weekDates(g, fair);
    const done = g.orders.filter(o => o.cleared);
    const wait = g.orders.length - done.length;
    const kpi = done.reduce((s, o) => s + o.kpiQty, 0);
    const monthly = input.period.kind === "monthly";
    tabs.push({ key: g.key, title: g.title, brand: g.key === EARLIER ? "Carried in" : brand ? brandName(brand) : "No booth", dates: g.key === EARLIER ? plural(g.orders.length, "bill") : monthly ? dates : plural(g.orders.length, "bill"), ...colors });
    weeks[g.key] = {
      brandWeek: g.key === EARLIER ? "From earlier months" : !monthly ? monthName(g.key) : brand ? `${brandName(brand)} week` : "No brand week",
      total: rm(done.reduce((s, o) => s + o.revenue, 0)),
      place: g.key === EARLIER ? "Bills written before this month, paying in it" : [fair?.venue || null, fair?.organiser ?? null].filter(Boolean).join(" · ") || "No fair",
      dates: g.key === EARLIER || !monthly ? `${plural(g.orders.length, "bill")}` : dates,
      stats: `${plural(done.length, "order")}${kpiEnabled ? ` · KPI ${kpi}` : ""}${wait ? ` · ${wait} waiting` : ""}`,
      tint: colors.tint,
      bills: [...g.orders].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number))
        .map(o => row(o, `${o.customer || "Walk-in"} · ${plural(o.lines.length, "line")}`)),
    };
  }

  const done = counted(book);
  const held = waiting(book);
  const kpiSum = done.reduce((s, o) => s + o.kpiQty, 0);
  const heldSum = held.reduce((s, o) => s + o.revenue, 0);
  return {
    counted: { amount: rm(done.reduce((s, o) => s + o.revenue, 0)), sub: `${plural(done.length, "order")}${kpiEnabled ? ` · ${kpiSum} KPI items` : ""}` },
    waiting: { amount: rm(heldSum), sub: held.length ? `${plural(held.length, "order")} · not counted yet` : "Nothing waiting" },
    tabs, weeks,
    waitBills: [...held].sort((a, b) => a.date.localeCompare(b.date)).map(o => row(o, `${o.customer || "Walk-in"} · ${weekOf.get(o.id) ?? "—"}${o.venue ? ` · ${o.venue}` : ""}`)),
    footnote: "Sales count once the deposit clears, in the bill's commission month. A bill without cost stays pending.",
  };
}

// ── the order sheet ────────────────────────────────────────────────────────
export interface OrderSheetVM {
  no: string;
  ref: string | null;
  cust: string;
  where: string;
  status: string;
  statusTone: Tone;
  amt: string;
  margin: string;
  marginInk: string;
  tier: string;
  kpi: string;
  lines: { name: string; qty: string; amt: string; kpi: number; isKpi: boolean }[];
  /** The reader's own bill — the ERP's salesperson on it — so theirs to share (2026-10-21). The preview's has none. */
  own?: boolean;
  /**
   * A shared bill: every holder's part ("LUCAS 50% · ANTHONY 50%"), and the reader's — whose bill it is when it is
   * somebody else's, and what of it counts in their sales.
   */
  share?: { line: string; sub: string } | null;
}

export function orderSheet(input: InsightInput, orderId: string): OrderSheetVM | null {
  const o = input.book?.orders.find(x => x.id === orderId);
  if (!o) return null;
  const band = billRow(o, new Map(), input.bands);
  const group = billGroups(input).find(g => g.orders.some(x => x.id === o.id));
  const due = stillDue(o);
  const qty = (q: number) => (Number.isInteger(q) ? String(q) : String(Math.round(q * 100) / 100));
  return {
    no: o.number,
    ref: o.ref,
    cust: o.customer || "Walk-in",
    where: [group?.title, o.venue || null].filter(Boolean).join(" · "),
    status: o.cleared ? "Deposit cleared" : due > 0 ? `Deposit due ${rm(due)}` : "Deposit due",
    statusTone: o.cleared ? "good" : "warn",
    amt: rm(o.total),
    margin: o.margin === null ? "—" : `${o.margin.toFixed(1)}%`,
    marginInk: o.margin === null ? TONES.warn.ink : TONES[band?.tone ?? "neutral"].ink,
    tier: o.margin === null ? "Cost pending" : band?.label ?? "No ladder",
    kpi: kpiOn(input) ? String(o.kpiQty) : "—",
    lines: o.lines.map(l => ({ name: l.name, qty: qty(l.qty), amt: l.amount ? rm(l.amount) : "Free", kpi: l.kpiQty, isKpi: l.kpiQty > 0 })),
    own: o.own,
    share: o.share ? {
      line: holdersLine(o.share.holders),
      sub: `${o.own ? "Your" : `${o.share.holders.find(h => h.owner)?.name ?? "Another salesperson"}’s bill · your`} part ${pctLabel(o.share.part)} · ${rm(o.revenue)} in your sales`,
    } : null,
  };
}

// ── KPI items ──────────────────────────────────────────────────────────────
export interface KpiVM {
  enabled: boolean;
  total: string;
  pill: string;
  hit: boolean;
  fill: number;
  marker: number | null;
  need: string;
  above: string;
  how: { title: string; threshold: string; thLeft: string | null; items: { name: string; n: number; color: string }[]; total: string } | null;
  weeks: { key: string; week: string; n: number; brand: string; color: string; tint: string }[];
  orders: { id: string; no: string; items: string; kpi: number }[];
  orderCount: string;
}

export function kpiView(input: InsightInput, subName: string): KpiVM {
  const enabled = kpiOn(input);
  const done = counted(input.book);
  const monthly = input.period.kind === "monthly";
  const total = monthly && input.kpi ? input.kpi.total : done.reduce((s, o) => s + o.kpiQty, 0);
  const threshold = monthly ? input.kpi?.threshold ?? null : null;
  const byName = new Map<string, number>();
  for (const o of done) for (const l of o.lines) if (l.kpiQty > 0) byName.set(l.name, (byName.get(l.name) ?? 0) + l.kpiQty);
  const items = [...byName.entries()].sort((a, b) => b[1] - a[1]).map(([name, n], k) => ({ name, n, color: KPI_SHADES[k % KPI_SHADES.length] }));
  const max = Math.max(total, threshold ?? 0, 1);
  const groups = billGroups(input).filter(g => g.key !== EARLIER);
  const picks = input.book?.brandWeeks ?? {};
  return {
    enabled,
    total: enabled ? String(total) : "—",
    pill: !enabled ? "Not counted" : threshold === null ? (monthly ? "No threshold" : "Sum of months") : total >= threshold ? "Threshold hit" : `${threshold - total} to go`,
    hit: enabled && threshold !== null && total >= threshold,
    fill: enabled ? Math.round((total / max) * 100) : 0,
    marker: enabled && threshold !== null ? Math.round((threshold / max) * 1000) / 10 : null,
    need: !enabled ? `KPI pay is off for ${subName} this month` : threshold === null ? "No threshold this month" : `${threshold} needed for the threshold`,
    above: !enabled || threshold === null ? "" : total >= threshold ? `${total - threshold} above` : `${threshold - total} to go`,
    how: enabled && items.length ? {
      title: `How you reached ${total}`,
      threshold: threshold === null ? "" : `Threshold ${threshold}`,
      thLeft: threshold === null || total <= 0 ? null : `${Math.min(100, (threshold / Math.max(total, threshold)) * 100).toFixed(1)}%`,
      items,
      total: `${total} items`,
    } : null,
    weeks: enabled ? groups.map((g, i) => {
      const brand = monthly ? weekBrand(g, picks) : null;
      const colors = brand ? brandColors(brand) : NEUTRAL_BRAND;
      return { key: g.key, week: monthly ? (g.title.startsWith("Week ") ? `W${g.title.slice(5)}` : g.title) : g.title, n: g.orders.filter(o => o.cleared).reduce((s, o) => s + o.kpiQty, 0), brand: brand ? brandName(brand) : monthly ? "No booth" : `Month ${i + 1}`, ...colors };
    }) : [],
    orders: enabled ? done.filter(o => o.kpiQty > 0).map(o => ({ id: o.id, no: o.number, kpi: o.kpiQty, items: o.lines.filter(l => l.kpiQty > 0).map(l => `${l.name} × ${l.kpiQty}`).join(" · ") })) : [],
    orderCount: plural(enabled ? done.filter(o => o.kpiQty > 0).length : 0, "order"),
  };
}

// ── one brand's margin ─────────────────────────────────────────────────────
export interface TrioVM { name: string; range: string; isCur: boolean; op: number; bg: string; border: string; capInk: string; wide: boolean }
export interface BrandPageVM {
  code: string;
  tabs: { code: string; label: string; dot: string }[];
  title: string;
  goods: string;
  pct: string;
  tier: string;
  tone: Tone;
  tint: string;
  ink: string;
  bar: { zones: Ladder["zones"]; markers: Ladder["markers"]; pos: string } | null;
  nextTitle: string;
  nextSub: string;
  trio: TrioVM[] | null;
  ladder: { name: string; range: string; effect: string; dot: string; on: boolean }[];
  ladderCount: string;
  orders: { id: string; no: string; meta: string; pct: string; tier: string; ink: string }[];
  footnote: string;
}

export function brandPage(input: InsightInput, code: string): BrandPageVM | null {
  const stats = brandStats(input.book, input.bands);
  const b = stats.find(s => s.code === code) ?? stats[0];
  if (!b) return null;
  const colors = brandColors(b.code);
  const { pill, tone } = brandPill(b);
  const rows = b.ladder.rows;
  const cur = b.row ? rows.indexOf(b.row) : -1;
  const top = b.ladder.incentives[b.ladder.incentives.length - 1];

  let nextTitle: string;
  let nextSub: string;
  if (b.margin === null || b.blind > 0) {
    nextTitle = "Waiting for supplier cost";
    nextSub = b.margin === null
      ? `${plural(b.orders, "order")} ${b.orders === 1 ? "has" : "have"} no cost yet. Margin and tier show once every order is costed.`
      : `${b.blind} of ${plural(b.orders, "order")} ${b.blind === 1 ? "has" : "have"} no cost yet. Margin and tier show once every order is costed.`;
  } else if (!top) {
    nextTitle = "No margin incentive for this brand";
    nextSub = `${brandName(b.code)} has no incentive tier in this sub-department's rules.`;
  } else if (b.margin + 1e-9 >= top.threshold) {
    nextTitle = "Top tier reached";
    nextSub = `You are ${(b.margin - top.threshold).toFixed(1)}% above ${top.label}. Keep new orders at ${pctText(top.threshold)}% or more to hold it.`;
  } else {
    const next = b.ladder.incentives.find(i => i.threshold > b.margin! + 1e-9)!;
    const gap = next.threshold - b.margin;
    nextTitle = `${gap.toFixed(1)}% more to reach ${next.label}`;
    nextSub = `About ${rm(Math.ceil((gap / 100) * b.goods / 10) * 10)} more margin on the same ${rm(b.goods)} goods, or sell new ${brandName(b.code)} orders above ${pctText(next.threshold)}%.`;
  }

  const trio: TrioVM[] | null = cur < 0 ? null : [cur + 1, cur, cur - 1].map((k, j) => {
    if (k < 0 || k >= rows.length) {
      return { name: j === 2 ? "Top tier" : "—", range: j === 2 ? "Reached" : "", isCur: false, op: 0.6, bg: "var(--rv-white)", border: "var(--rv-line)", capInk: "var(--rv-sub)", wide: false };
    }
    const isCur = j === 1;
    return {
      name: rows[k].short, range: rows[k].range, isCur, op: isCur ? 1 : 0.75,
      bg: isCur ? colors.tint : "var(--rv-white)", border: isCur ? colors.color : "var(--rv-line)", capInk: isCur ? colors.color : "var(--rv-sub)", wide: isCur,
    };
  });

  const ladders = new Map<string, Ladder>([[b.code, b.ladder]]);
  const orders = counted(input.book).filter(o => o.brand === b.code).sort((x, y) => (x.margin ?? -1) - (y.margin ?? -1));
  const groups = billGroups(input);
  const titleOf = (o: MemberBookOrder) => groups.find(g => g.orders.some(x => x.id === o.id))?.title;
  return {
    code: b.code,
    tabs: stats.map(s => ({ code: s.code, label: brandName(s.code), dot: brandColors(s.code).color })),
    title: brandName(b.code),
    goods: `${rm(b.goods)} goods`,
    pct: b.margin === null ? "—" : `${b.margin.toFixed(1)}%`,
    tier: pill,
    tone,
    tint: colors.tint,
    ink: colors.color,
    bar: b.margin === null || !rows.length ? null : { zones: b.ladder.zones, markers: b.ladder.markers, pos: barPos(b.margin) },
    nextTitle, nextSub, trio,
    ladder: rows.map((r, i) => ({ name: r.label, range: r.range, effect: r.effect, dot: r.dot, on: i === cur })),
    ladderCount: `All ${rows.length} margin tiers`,
    orders: orders.map(o => {
      const r = billRow(o, ladders, input.bands);
      return {
        id: o.id, no: o.number,
        meta: [o.customer || "Walk-in", titleOf(o), rm(o.revenue)].filter(Boolean).join(" · "),
        pct: o.margin === null ? "No cost" : `${o.margin.toFixed(1)}%`,
        tier: o.margin === null ? "Cost pending" : r?.label ?? "No ladder",
        ink: o.margin === null ? TONES.warn.ink : TONES[r?.tone ?? "neutral"].ink,
      };
    }),
    footnote: "Brand margin uses commissionable goods. Bed frames and accessories follow their mattress brand. Delivery and disposal are excluded.",
  };
}

