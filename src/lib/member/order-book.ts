/**
 * Insight's raw material (mig 20261004010000 / 020000 / 030000): one member's
 * bills line by line (`member_order_book`) and their team over a quarter or a
 * year (`member_insight_range`). Read here field by field, so a key a future
 * migration adds to the RPC's JSON stays on the server — and nothing in either
 * shape is a cost: a bill carries its layer-2 margin percentage only. The
 * scheme's cost ratio the RPC still returns (`costDivisor`) stays here too: no
 * screen says how the cost is made up (user 2026-10-05).
 */
import type { MemberDownlineRow, MemberScore } from "./types";

export interface MemberOrderLine {
  name: string;
  code: string | null;
  qty: number;
  amount: number;
  /** A commissionable line (its item group earns). */
  goods: boolean;
  /** KPI items this line carries, as at the end of the bill's month. */
  kpiQty: number;
}

export interface MemberBookOrder {
  id: string;
  number: string;
  /** The handwritten bill's number (the ERP's Ref No.), when it names one. */
  ref: string | null;
  customer: string;
  date: string;
  /** The bill's own month — the fair's. */
  sourceMonth: string;
  /** The month it counts in: its own while open, the release month once closed. */
  recognitionMonth: string;
  /** The bill's brand (the margin ladder it is read on); `UNCLASSIFIED` when none. */
  brand: string;
  /** The brand of the ERP booth the salesperson picked; null when none. */
  booth: string | null;
  venue: string;
  fairStart: string | null;
  fairEnd: string | null;
  organiser: string | null;
  /** The Friday of the fair weekend (or of the week it was written in). */
  week: string;
  /** What counts as sales: commissionable lines less KPI items. */
  revenue: number;
  /** Layer-2 margin, %, or null while a line has no cost — or while the bill has no sales of its own (`noSales`). */
  margin: number | null;
  /**
   * The bill has no sales of its own — a gift on a bill of its own at RM 0 — and every goods line is costed
   * (2026-10-30): no margin to read, and its cost counts against the month (the book's `margins`). Absent from an
   * answer the server gave before it knew.
   */
  noSales?: boolean;
  kpiQty: number;
  /** Deposit met (or released by a close). */
  cleared: boolean;
  /** Written in an earlier month than the one it counts in. */
  carried: boolean;
  /** A keyed-in margin. */
  manual: boolean;
  total: number;
  paid: number;
  depositNeeded: number | null;
  lines: MemberOrderLine[];
  /**
   * The bill is the reader's own — the salesperson the ERP put on it (2026-10-21). A bill somebody shared with them is
   * theirs in part only: never theirs to share. True when the answer predates it.
   */
  own: boolean;
  /**
   * Who holds a shared bill (2026-10-21, `sales_order_shares`): the reader's part and every holder's, the owner first.
   * Null when nobody shares it. `revenue` and the lines' `kpiQty` are already the reader's part; `total` is the bill's.
   */
  share: MemberBookShare | null;
  /**
   * Whose bill it is — the salesperson the ERP put on it — on a whole sub-department's book only (the Principal viewing
   * nobody, 2026-10-25), where every bill is whole (`revenue` the bill's, never a part). Null: the ERP named nobody.
   */
  seller?: { id: string; name: string } | null;
}

export interface MemberBookShare {
  /** The reader's part, 0.5 = half. */
  part: number;
  holders: { id: string; name: string; pct: number; owner: boolean }[];
}

function readShare(value: unknown): MemberBookShare | null {
  if (!isObject(value) || !Array.isArray(value.holders)) return null;
  const part = num(value.part);
  const holders = value.holders.flatMap(h => {
    if (!isObject(h)) return [];
    const id = text(h.id);
    const pct = num(h.pct);
    return id && pct !== null ? [{ id, name: text(h.name) ?? "", pct, owner: h.owner === true }] : [];
  });
  return part !== null && holders.length > 1 ? { part, holders } : null;
}

export interface MemberOrderBook {
  from: string;
  through: string;
  asOf: string;
  /** The first month the portal pays; before it a month was settled by hand. */
  paysFrom: string | null;
  /** Months closed for this member (a standing close, or the run applied). */
  closedMonths: string[];
  /** Stored brand-week picks: Friday → brand code. */
  brandWeeks: Record<string, string>;
  orders: MemberBookOrder[];
  /**
   * The margin the counted (deposit-cleared) bills make together, %, worked out by the server (2026-10-30): overall
   * and per brand, a bill with no sales counted at its cost — which no bill here carries, so the app cannot add it up
   * itself. Null where nothing is costed yet, or nothing sold. Absent from an answer given before.
   */
  margins?: BookMargins;
}

export interface MonthMargins {
  overall: number | null;
  brands: Record<string, number | null>;
}

export interface BookMargins extends MonthMargins {
  /** Each month's own, `YYYY-MM` — the app cuts one month out of a two-month book (`bookMonth`). */
  months?: Record<string, MonthMargins>;
}

export interface MemberInsightRange {
  from: string;
  through: string;
  asOf: string;
  me: MemberScore & { name: string };
  downline: MemberDownlineRow[];
}

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" ? v : null);
const day = (v: unknown): string | null => (typeof v === "string" && DAY.test(v.slice(0, 10)) ? v.slice(0, 10) : null);

function readLine(value: unknown): MemberOrderLine | null {
  if (!isObject(value)) return null;
  const qty = num(value.qty);
  const amount = num(value.amount);
  const kpiQty = num(value.kpiQty);
  if (typeof value.name !== "string" || qty === null || amount === null || kpiQty === null || typeof value.goods !== "boolean") return null;
  return { name: value.name, code: text(value.code), qty, amount, goods: value.goods, kpiQty };
}

function readOrder(value: unknown): MemberBookOrder | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  const number = text(value.number);
  const date = day(value.date);
  const week = day(value.week);
  const revenue = num(value.revenue);
  const kpiQty = num(value.kpiQty);
  const total = num(value.total);
  const paid = num(value.paid);
  const sourceMonth = text(value.sourceMonth);
  const recognitionMonth = text(value.recognitionMonth);
  if (!id || !number || !date || !week || revenue === null || kpiQty === null || total === null || paid === null
    || !sourceMonth || !MONTH.test(sourceMonth) || !recognitionMonth || !MONTH.test(recognitionMonth)
    || typeof value.cleared !== "boolean" || typeof value.carried !== "boolean" || !Array.isArray(value.lines)) return null;
  const margin = value.margin === null ? null : num(value.margin);
  if (margin === null && value.margin !== null) return null;
  const lines: MemberOrderLine[] = [];
  for (const line of value.lines) {
    const read = readLine(line);
    if (!read) return null;
    lines.push(read);
  }
  return {
    id, number,
    ref: text(value.ref),
    customer: text(value.customer) ?? "",
    date, sourceMonth, recognitionMonth,
    brand: text(value.brand) ?? "UNCLASSIFIED",
    booth: text(value.booth),
    venue: text(value.venue) ?? "",
    fairStart: day(value.fairStart),
    fairEnd: day(value.fairEnd),
    organiser: text(value.organiser),
    week, revenue, margin, kpiQty,
    ...(typeof value.noSales === "boolean" ? { noSales: value.noSales } : {}),
    cleared: value.cleared,
    carried: value.carried,
    manual: value.manual === true,
    total, paid,
    depositNeeded: num(value.depositNeeded),
    lines,
    own: value.own !== false,
    share: readShare(value.share),
    ...("seller" in value ? { seller: readSeller(value.seller) } : {}),
  };
}

function readSeller(value: unknown): { id: string; name: string } | null {
  if (!isObject(value)) return null;
  const id = text(value.id);
  return id ? { id, name: text(value.name) ?? "" } : null;
}

/** Validate and project `member_order_book`; null when its shape is not the one this app reads. */
export function readOrderBook(value: unknown): MemberOrderBook | null {
  if (!isObject(value) || !Array.isArray(value.orders)) return null;
  const from = text(value.from);
  const through = text(value.through);
  const asOf = text(value.asOf);
  if (!from || !MONTH.test(from) || !through || !MONTH.test(through) || !asOf) return null;
  const orders: MemberBookOrder[] = [];
  for (const order of value.orders) {
    const read = readOrder(order);
    if (!read) return null;
    orders.push(read);
  }
  const paysFrom = text(value.paysFrom);
  const closedMonths = Array.isArray(value.closedMonths)
    ? value.closedMonths.filter((m): m is string => typeof m === "string" && MONTH.test(m))
    : [];
  const brandWeeks: Record<string, string> = {};
  if (isObject(value.brandWeeks)) {
    for (const [friday, brand] of Object.entries(value.brandWeeks)) {
      if (DAY.test(friday) && typeof brand === "string" && brand.trim()) brandWeeks[friday] = brand.trim().toUpperCase();
    }
  }
  const margins = readMargins(value.margins);
  return {
    from, through, asOf,
    paysFrom: paysFrom && MONTH.test(paysFrom) ? paysFrom : null,
    closedMonths,
    brandWeeks,
    orders,
    ...(margins ? { margins } : {}),
  };
}

/** One set of margins: percentages only, a number or null each; anything else and the app adds the bills up itself. */
function readMonthMargins(value: unknown): MonthMargins | null {
  if (!isObject(value) || !isObject(value.brands)) return null;
  const overall = value.overall === null ? null : num(value.overall);
  if (overall === null && value.overall !== null) return null;
  const brands: Record<string, number | null> = {};
  for (const [code, pct] of Object.entries(value.brands)) {
    const read = pct === null ? null : num(pct);
    if (read === null && pct !== null) return null;
    brands[code] = read;
  }
  return { overall, brands };
}

/** The book's `margins`, and each month's when it gives them. */
function readMargins(value: unknown): BookMargins | null {
  const whole = readMonthMargins(value);
  if (!whole || !isObject(value)) return null;
  if (!isObject(value.months)) return whole;
  const months: Record<string, MonthMargins> = {};
  for (const [month, set] of Object.entries(value.months)) {
    const read = readMonthMargins(set);
    if (!read || !MONTH.test(month)) return null;
    months[month] = read;
  }
  return { ...whole, months };
}

function readScore(value: unknown): MemberScore | null {
  if (!isObject(value)) return null;
  const keys = ["sales", "held", "orders", "kpiQty", "marginRevenue", "marginCost", "blindOrders"] as const;
  const out: Partial<Record<(typeof keys)[number], number>> = {};
  for (const key of keys) {
    const v = num(value[key]);
    if (v === null) return null;
    out[key] = v;
  }
  const staffId = text(value.staffId);
  if (!staffId) return null;
  return {
    staffId,
    sales: out.sales!, held: out.held!, orders: out.orders!, kpiQty: out.kpiQty!,
    marginRevenue: out.marginRevenue!, marginCost: out.marginCost!, blindOrders: out.blindOrders!,
    lastOrder: day(value.lastOrder),
  };
}

/** Validate and project `member_insight_range` — the `me` and `downline` of a month, over a range. */
export function readInsightRange(value: unknown): MemberInsightRange | null {
  if (!isObject(value) || !Array.isArray(value.downline)) return null;
  const from = text(value.from);
  const through = text(value.through);
  const asOf = text(value.asOf);
  if (!from || !MONTH.test(from) || !through || !MONTH.test(through) || !asOf) return null;
  const meScore = readScore(value.me);
  if (!meScore || !isObject(value.me)) return null;
  const downline: MemberDownlineRow[] = [];
  for (const row of value.downline) {
    const score = readScore(row);
    if (!score || !isObject(row)) return null;
    const depth = num(row.depth);
    if (depth === null) return null;
    downline.push({ ...score, name: text(row.name) ?? "", title: text(row.title) ?? "", uplineId: text(row.uplineId), depth });
  }
  return { from, through, asOf, me: { ...meScore, name: text(value.me.name) ?? "" }, downline };
}

/**
 * The Principal viewing nobody (2026-10-25, mig 20261026014700 — `member_principal_department_insight`): a window's
 * every bill summed (`team` — the directors' own and a bill the ERP named nobody for included, as a Revenue
 * Director's "All of Fair"), everybody who sits there or wrote a bill with their own figures, and whether KPI counts.
 * Sales and margin only, as Insight's.
 */
export interface DepartmentInsight {
  membershipId: string;
  schemeId: string;
  department: string;
  from: string;
  through: string;
  asOf: string;
  /** The window holds the current month: the figures are still moving. */
  live: boolean;
  team: Omit<MemberScore, "staffId" | "lastOrder">;
  /** Everybody, by sales. */
  people: MemberDownlineRow[];
  /** `threshold`: a PERSON's first rung, never the sub-department's. */
  kpi: { enabled: boolean; threshold: number | null };
}

/** Validate and project `member_principal_department_insight`; null when its shape is not the one this app reads. */
export function readDepartmentInsight(value: unknown): DepartmentInsight | null {
  if (!isObject(value) || !Array.isArray(value.people) || !isObject(value.team) || !isObject(value.kpi)) return null;
  const membershipId = text(value.membershipId);
  const schemeId = text(value.schemeId);
  const from = text(value.from);
  const through = text(value.through);
  const asOf = text(value.asOf);
  if (!membershipId || !schemeId || !from || !MONTH.test(from) || !through || !MONTH.test(through) || !asOf) return null;
  const team = readScore({ ...value.team, staffId: membershipId });
  if (!team || typeof value.kpi.enabled !== "boolean") return null;
  const people: MemberDownlineRow[] = [];
  for (const row of value.people) {
    const score = readScore(row);
    if (!score || !isObject(row)) return null;
    people.push({ ...score, name: text(row.name) ?? "", title: text(row.title) ?? "", uplineId: text(row.uplineId), depth: num(row.depth) ?? 1 });
  }
  return {
    membershipId, schemeId, department: text(value.department) ?? "", from, through, asOf, live: value.live === true,
    team: { sales: team.sales, held: team.held, orders: team.orders, kpiQty: team.kpiQty, marginRevenue: team.marginRevenue,
      marginCost: team.marginCost, blindOrders: team.blindOrders },
    people,
    kpi: { enabled: value.kpi.enabled, threshold: value.kpi.enabled ? num(value.kpi.threshold) : null },
  };
}
