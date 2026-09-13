import { people, selectOrders, summarize, summarizeKpi } from "./insight-model";
import type { InsightOrder, InsightPerson } from "./insight-model";

/** Fixed preview snapshot. Compare like-for-like month-to-date windows, across all venues. */
export const quickInsightWindow = {
  currentStart: "2026-09-01",
  currentEnd: "2026-09-13",
  previousStart: "2026-08-01",
  previousEnd: "2026-08-13",
} as const;

export interface QuickInsightMetrics {
  sales: number;
  margin: number | null;
  kpi: number;
  orders: number;
  unknownMarginCount: number;
}

export interface QuickInsightReport {
  title: string;
  subject: string;
  periodLabel: string;
  comparisonLabel: string;
  summary: string;
  current: QuickInsightMetrics;
  previous: QuickInsightMetrics | null;
  salesChangePercent: number | null;
  marginChangePoints: number | null;
  kpiChange: number | null;
  target: number | null;
  targetPercent: number | null;
  /** Percentage of current orders containing at least one qualifying KPI item. */
  coverage: number | null;
  highlights: Array<{
    title: string;
    body: string;
    tone: "positive" | "attention" | "neutral";
    personId?: string;
  }>;
  lowOrders: Array<{
    order: InsightOrder;
    personName: string;
    /** Share of the report's sales, including uncosted sales. */
    sharePercent: number;
    /** Recomputed weighted margin for this report, excluding this one order. */
    withoutMargin: number | null;
    delta: number | null;
  }>;
  members?: Array<{
    personId: string;
    name: string;
    salesChangePercent: number | null;
    marginChangePoints: number | null;
  }>;
}

type BaselineSeed = Pick<InsightOrder, "staffId" | "date" | "sales" | "margin" | "kpi">;

/** Fictional August facts for this preview only. These are not ERP or commission records. */
export const quickInsightBaselineOrders: InsightOrder[] = ([
  { staffId: "jia", date: "2026-08-04", sales: 20000, margin: 42, kpi: 4 },
  { staffId: "jia", date: "2026-08-08", sales: 15000, margin: 39, kpi: 4 },
  { staffId: "jia", date: "2026-08-12", sales: 7000, margin: 35, kpi: 2 },
  { staffId: "marcus", date: "2026-08-05", sales: 20000, margin: 40, kpi: 5 },
  { staffId: "marcus", date: "2026-08-11", sales: 30000, margin: 38, kpi: 7 },
  { staffId: "aisyah", date: "2026-08-06", sales: 18000, margin: 36, kpi: 6 },
  { staffId: "aisyah", date: "2026-08-13", sales: 14000, margin: 38, kpi: 4 },
  { staffId: "wei", date: "2026-08-04", sales: 12000, margin: 38, kpi: 3 },
  { staffId: "wei", date: "2026-08-09", sales: 14000, margin: 36, kpi: 4 },
  { staffId: "wei", date: "2026-08-13", sales: 8000, margin: null, kpi: 3 },
] satisfies BaselineSeed[]).map((seed, index) => ({
  ...seed,
  id: `baseline-aug-${index + 1}`,
  number: `DEMO-AUG-${String(index + 1).padStart(3, "0")}`,
  fairId: "demo-aug-all-venues",
  category: "Living",
  tier: seed.margin === null ? "unknown" : seed.margin >= 36 ? "tier1" : "standard",
  commission: null,
  commissionStatus: "pending",
  brand: "August comparison sample",
  items: [{ name: "KPI care bundle", qty: seed.kpi, kpi: true }],
}));

function metrics(orders: readonly InsightOrder[]): QuickInsightMetrics {
  const totals = summarize(orders);
  return {
    sales: totals.sales,
    margin: totals.margin,
    kpi: totals.kpi,
    orders: totals.orderCount,
    unknownMarginCount: totals.unknownMarginCount,
  };
}

function changes(current: QuickInsightMetrics, previous: QuickInsightMetrics | null) {
  return {
    salesChangePercent: previous && previous.sales > 0
      ? (current.sales - previous.sales) / previous.sales * 100 : null,
    marginChangePoints: current.margin !== null && previous?.margin !== null && previous?.margin !== undefined
      ? current.margin - previous.margin : null,
    kpiChange: previous ? current.kpi - previous.kpi : null,
  };
}

function salesSentence(current: QuickInsightMetrics, previous: QuickInsightMetrics | null, change: number | null) {
  if (!previous) return "Last month's comparison is unavailable.";
  if (previous.sales === 0) return current.sales > 0
    ? "Sales have started from RM 0 on the same dates last month; percentage growth is unavailable."
    : "No sales were recorded in either comparison window.";
  if (change === 0) return "Sales match the same dates last month.";
  return `Sales are ${change! > 0 ? "up" : "down"} ${Math.abs(change!).toFixed(1)}% on the same dates last month.`;
}

function headline(current: QuickInsightMetrics, deltas: ReturnType<typeof changes>, team = false) {
  if (current.orders === 0) return "No sales recorded yet";
  if (deltas.salesChangePercent !== null && deltas.salesChangePercent > 0) {
    if (deltas.marginChangePoints !== null && deltas.marginChangePoints < -0.05) return "Sales up, margin lower";
    if (deltas.marginChangePoints !== null && deltas.marginChangePoints >= 0.05) return "Growing sales and margin";
    return "Sales are moving forward";
  }
  if (deltas.salesChangePercent !== null && deltas.salesChangePercent < 0) return "Sales below last month's pace";
  if (deltas.marginChangePoints !== null && deltas.marginChangePoints < -0.05) return "A closer look at margin";
  return team ? "Your team, in perspective" : "Your month in perspective";
}

interface QuickInsightInput {
  subject: string;
  people: readonly InsightPerson[];
  currentOrders: readonly InsightOrder[];
  /** null means missing history; [] explicitly means a known zero-order baseline. */
  previousOrders: readonly InsightOrder[] | null;
  team?: boolean;
}

/** Pure calculation shared by the preview and tests; excludes other sellers and out-of-window orders. */
export function buildQuickInsight(input: QuickInsightInput): QuickInsightReport {
  const personIds = new Set(input.people.map((person) => person.id));
  const currentOrders = input.currentOrders.filter((order) => personIds.has(order.staffId)
    && order.date >= quickInsightWindow.currentStart && order.date <= quickInsightWindow.currentEnd);
  const previousOrders = input.previousOrders?.filter((order) => personIds.has(order.staffId)
    && order.date >= quickInsightWindow.previousStart && order.date <= quickInsightWindow.previousEnd) ?? null;
  const current = metrics(currentOrders);
  const previous = previousOrders === null ? null : metrics(previousOrders);
  const deltas = changes(current, previous);
  const target = input.people.length > 0 ? input.people.reduce((sum, person) => sum + person.target, 0) : null;
  const coverage = summarizeKpi(currentOrders).coverage;
  const highlights: QuickInsightReport["highlights"] = [];
  let summary = salesSentence(current, previous, deltas.salesChangePercent);
  const members = input.team ? input.people.map((person) => ({
    personId: person.id,
    name: person.name,
    ...changes(metrics(currentOrders.filter((order) => order.staffId === person.id)), previousOrders === null
      ? null : metrics(previousOrders.filter((order) => order.staffId === person.id))),
  })) : undefined;

  if (members) {
    const progressing = members.filter((person) => person.salesChangePercent !== null && person.salesChangePercent > 0)
      .sort((a, b) => b.salesChangePercent! - a.salesChangePercent!)[0];
    const marginDecline = members.filter((person) => person.marginChangePoints !== null && person.marginChangePoints < -0.05)
      .sort((a, b) => a.marginChangePoints! - b.marginChangePoints!)[0];
    if (progressing) {
      highlights.push({ title: "Strongest sales progress", body: `${progressing.name}'s sales are up ${progressing.salesChangePercent!.toFixed(1)}% versus 1–13 August.`, tone: "positive", personId: progressing.personId });
      summary += ` ${progressing.name} has the strongest sales growth (+${progressing.salesChangePercent!.toFixed(1)}%).`;
    }
    if (marginDecline) {
      const hasLowOrders = currentOrders.some((order) => order.staffId === marginDecline.personId && order.tier === "low" && order.margin !== null);
      highlights.push({ title: "Margin to review", body: `${marginDecline.name}'s weighted margin is down ${Math.abs(marginDecline.marginChangePoints!).toFixed(1)} points versus 1–13 August.${hasLowOrders ? " Review the linked low-margin orders." : ""}`, tone: "attention", personId: marginDecline.personId });
      summary += ` ${marginDecline.name} has the largest margin decline (${Math.abs(marginDecline.marginChangePoints!).toFixed(1)} points).`;
    }
  } else {
    if (deltas.salesChangePercent !== null && deltas.salesChangePercent !== 0) highlights.push({
      title: deltas.salesChangePercent > 0 ? "Sales progress" : "Sales pace",
      body: salesSentence(current, previous, deltas.salesChangePercent),
      tone: deltas.salesChangePercent > 0 ? "positive" : "attention",
    });
    if (deltas.marginChangePoints !== null && Math.abs(deltas.marginChangePoints) >= 0.05) {
      const description = `Weighted margin is ${deltas.marginChangePoints > 0 ? "up" : "down"} ${Math.abs(deltas.marginChangePoints).toFixed(1)} points versus 1–13 August.`;
      highlights.push({ title: deltas.marginChangePoints < 0 ? "Margin to review" : "Margin progress", body: description, tone: deltas.marginChangePoints < 0 ? "attention" : "positive" });
      summary += ` ${description}`;
    }
  }

  if (coverage !== null && coverage < 100) highlights.push({
    title: "KPI coverage",
    body: `${summarizeKpi(currentOrders).withKpi} of ${current.orders} orders contain KPI items (${coverage.toFixed(1)}%). ${current.kpi} qualifying items sold in total.`,
    tone: "neutral",
  });
  if (current.unknownMarginCount > 0 || (previous?.unknownMarginCount ?? 0) > 0) highlights.push({
    title: "Costing coverage",
    body: previous
      ? `${current.unknownMarginCount} current and ${previous.unknownMarginCount} previous-period ${current.unknownMarginCount + previous.unknownMarginCount === 1 ? "order has" : "orders have"} no margin. Weighted margins use costed sales only.`
      : `${current.unknownMarginCount} current ${current.unknownMarginCount === 1 ? "order has" : "orders have"} no margin. Last month's costing history is unavailable. Weighted margins use costed sales only.`,
    tone: "neutral",
  });

  const lowOrders = currentOrders.filter((order) => current.sales > 0 && order.sales > 0 && order.tier === "low" && order.margin !== null).map((order) => {
    const withoutMargin = summarize(currentOrders.filter((other) => other.id !== order.id)).margin;
    return {
      order,
      personName: input.people.find((person) => person.id === order.staffId)!.name,
      sharePercent: order.sales / current.sales * 100,
      withoutMargin,
      delta: withoutMargin !== null && current.margin !== null ? withoutMargin - current.margin : null,
    };
  }).sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity) || b.order.sales - a.order.sales);

  return {
    title: headline(current, deltas, input.team),
    subject: input.subject,
    periodLabel: "1–13 September 2026 · All venues",
    comparisonLabel: "vs 1–13 August 2026",
    summary,
    current,
    previous,
    ...deltas,
    target,
    targetPercent: target !== null && target > 0 ? current.sales / target * 100 : null,
    coverage,
    highlights,
    lowOrders,
    ...(members ? { members } : {}),
  };
}

/** Always a complete monthly view; background fair, search and last-week filters do not apply. */
export function personQuickInsight(personId: string): QuickInsightReport {
  const person = people.find((entry) => entry.id === personId);
  return buildQuickInsight({
    subject: person?.name ?? "Member unavailable",
    people: person ? [person] : [],
    currentOrders: selectOrders({ personId, period: "month" }),
    previousOrders: person ? quickInsightBaselineOrders.filter((order) => order.staffId === personId) : null,
  });
}

/** Team includes direct downlines only, excluding the signed-in lead and venue-ranking peers. */
export function teamQuickInsight(): QuickInsightReport {
  return buildQuickInsight({
    subject: "Your team",
    people: people.filter((person) => !person.self),
    currentOrders: selectOrders({ period: "month" }),
    previousOrders: quickInsightBaselineOrders,
    team: true,
  });
}
