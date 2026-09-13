/**
 * Deterministic September 2026 design-preview fixtures, not payroll rules.
 * Commission amounts/statuses are sample ledger facts; never derived from tiers.
 */
export type InsightPeriod = "month" | "last-week";
export type InsightTier = "tier2" | "tier1" | "standard" | "low" | "unknown";
export type InsightCategory = "Bedroom" | "Living" | "Dining";
export type InsightCommissionStatus = "estimated" | "pending" | "settled" | "paid";

export interface InsightPerson {
  id: string;
  name: string;
  role: string;
  /** September monthly sales target (RM), including when viewing one fair. */
  target: number;
  /** September monthly KPI unit target. */
  kpiTarget: number;
  self?: boolean;
}

export interface InsightFair {
  /** Identifies the venue, organizer AND dated occurrence, not just the venue. */
  id: string;
  venue: string;
  organizer: string;
  start: string;
  end: string;
  label: string;
}

export interface InsightOrder {
  id: string;
  number: string;
  staffId: string;
  fairId: string;
  date: string;
  category: InsightCategory;
  sales: number;
  /** Percentage; null means unavailable, never zero. */
  margin: number | null;
  kpi: number;
  tier: InsightTier;
  commission: number | null;
  commissionStatus: InsightCommissionStatus;
  commissionNote?: string;
  brand: string;
  items: Array<{ name: string; qty: number; kpi: boolean }>;
}

export const periodLabels: Record<InsightPeriod, string> = {
  month: "September 2026",
  "last-week": "Last week · 31 Aug–6 Sep",
};

export const tierLabels: Record<InsightTier, string> = {
  tier2: "Tier 2",
  tier1: "Tier 1",
  standard: "Standard",
  low: "Low margin",
  unknown: "Unknown",
};

/** Preview grouping only; live tiers depend on the brand's commission configuration. */
export const tierDescription = "Demo tiers: Tier 2 ≥43%, Tier 1 ≥36%, Standard ≥33%, Low margin <33%. Live tiers vary by brand.";

/** The signed-in member and their direct downlines. */
export const people: InsightPerson[] = [
  { id: "jia", name: "Jia En", role: "Team lead", target: 80000, kpiTarget: 30, self: true },
  { id: "marcus", name: "Marcus Lee", role: "Sales advisor", target: 75000, kpiTarget: 24 },
  { id: "aisyah", name: "Aisyah Ahmad", role: "Sales advisor", target: 65000, kpiTarget: 24 },
  { id: "wei", name: "Wei Jun", role: "Sales advisor", target: 60000, kpiTarget: 20 },
];

// These sellers participate in a venue ranking, but are not Jia En's downlines.
const venuePeers: InsightPerson[] = [
  { id: "daniel", name: "Daniel Wong", role: "Venue participant", target: 90000, kpiTarget: 30 },
  { id: "sophia", name: "Sophia Tan", role: "Venue participant", target: 80000, kpiTarget: 25 },
];

export const fairs: InsightFair[] = [
  { id: "mv-mle-sep04", venue: "Mid Valley", organizer: "MLE Modern Home Living", start: "2026-09-04", end: "2026-09-06", label: "4–6 Sep" },
  { id: "mv-bighome-sep11", venue: "Mid Valley", organizer: "Big Home", start: "2026-09-11", end: "2026-09-13", label: "11–13 Sep" },
  { id: "ioi-mle-sep11", venue: "IOI City Mall", organizer: "MLE Modern Home Living", start: "2026-09-11", end: "2026-09-13", label: "11–13 Sep" },
];

type OrderSeed = Omit<InsightOrder, "id" | "number" | "items"> & { serial: number; product: string };

function makeOrder({ serial, product, ...data }: OrderSeed): InsightOrder {
  return {
    ...data,
    id: `order-${serial}`,
    number: `SO-2609-${String(serial).padStart(3, "0")}`,
    items: [
      { name: product, qty: 1, kpi: false },
      ...(data.kpi ? [{ name: "KPI care bundle", qty: data.kpi, kpi: true }] : []),
    ],
  };
}

const orderSeeds: OrderSeed[] = [
  { serial: 1, staffId: "jia", fairId: "mv-mle-sep04", date: "2026-09-04", category: "Bedroom", sales: 12000, margin: 42, kpi: 3, tier: "tier1", commission: 480, commissionStatus: "paid", brand: "Akemi", product: "Signature bedroom set" },
  { serial: 2, staffId: "jia", fairId: "mv-mle-sep04", date: "2026-09-05", category: "Living", sales: 8000, margin: 34, kpi: 0, tier: "standard", commission: 240, commissionStatus: "settled", brand: "Zanotti", product: "Modular sofa" },
  { serial: 3, staffId: "jia", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Dining", sales: 6000, margin: 38, kpi: 2, tier: "tier1", commission: 180, commissionStatus: "settled", brand: "Zanotti", product: "Oak dining set" },
  { serial: 4, staffId: "jia", fairId: "mv-bighome-sep11", date: "2026-09-11", category: "Bedroom", sales: 14000, margin: 44, kpi: 6, tier: "tier2", commission: 560, commissionStatus: "estimated", brand: "Akemi", product: "King bedroom collection" },
  { serial: 5, staffId: "jia", fairId: "mv-bighome-sep11", date: "2026-09-12", category: "Living", sales: 7000, margin: 22, kpi: 1, tier: "low", commission: 105, commissionStatus: "pending", commissionNote: "Discount approval pending. Commission is provisional.", brand: "Zanotti", product: "Clearance lounge set" },
  { serial: 6, staffId: "jia", fairId: "mv-bighome-sep11", date: "2026-09-13", category: "Dining", sales: 3200, margin: null, kpi: 0, tier: "unknown", commission: null, commissionStatus: "pending", commissionNote: "Waiting for order costing. Margin, tier and commission are not available yet.", brand: "Zanotti", product: "Compact dining table" },

  { serial: 12, staffId: "marcus", fairId: "mv-mle-sep04", date: "2026-09-04", category: "Bedroom", sales: 6000, margin: 42, kpi: 3, tier: "tier1", commission: 240, commissionStatus: "paid", brand: "Akemi", product: "Queen mattress package" },
  { serial: 13, staffId: "marcus", fairId: "mv-mle-sep04", date: "2026-09-05", category: "Dining", sales: 10000, margin: 38, kpi: 4, tier: "tier1", commission: 300, commissionStatus: "settled", brand: "Zanotti", product: "Extendable dining collection" },
  { serial: 14, staffId: "marcus", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Living", sales: 24000, margin: 18, kpi: 2, tier: "low", commission: 360, commissionStatus: "pending", commissionNote: "Low-tier order. Finance is reviewing the approved bundle discount before settlement.", brand: "Zanotti", product: "Whole-home living bundle" },
  { serial: 15, staffId: "marcus", fairId: "mv-bighome-sep11", date: "2026-09-11", category: "Living", sales: 12000, margin: 32, kpi: 4, tier: "low", commission: 360, commissionStatus: "estimated", brand: "Zanotti", product: "Recliner sofa collection" },
  { serial: 16, staffId: "marcus", fairId: "mv-bighome-sep11", date: "2026-09-12", category: "Bedroom", sales: 9000, margin: 41, kpi: 5, tier: "tier1", commission: 360, commissionStatus: "estimated", brand: "Akemi", product: "Storage bed package" },

  { serial: 21, staffId: "aisyah", fairId: "mv-mle-sep04", date: "2026-09-04", category: "Bedroom", sales: 15000, margin: 43, kpi: 7, tier: "tier2", commission: 600, commissionStatus: "paid", brand: "Akemi", product: "Premium sleep collection" },
  { serial: 22, staffId: "aisyah", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Dining", sales: 9000, margin: 36, kpi: 4, tier: "tier1", commission: 270, commissionStatus: "settled", brand: "Zanotti", product: "Six-seat dining collection" },
  { serial: 23, staffId: "aisyah", fairId: "ioi-mle-sep11", date: "2026-09-11", category: "Living", sales: 17000, margin: 40, kpi: 6, tier: "tier1", commission: 680, commissionStatus: "estimated", brand: "Zanotti", product: "Corner sofa collection" },
  { serial: 24, staffId: "aisyah", fairId: "ioi-mle-sep11", date: "2026-09-12", category: "Bedroom", sales: 11000, margin: 39, kpi: 5, tier: "tier1", commission: 330, commissionStatus: "estimated", brand: "Akemi", product: "Family mattress bundle" },

  { serial: 31, staffId: "wei", fairId: "mv-mle-sep04", date: "2026-09-05", category: "Living", sales: 10000, margin: 31, kpi: 3, tier: "low", commission: 300, commissionStatus: "paid", brand: "Zanotti", product: "Two-seat lounge package" },
  { serial: 32, staffId: "wei", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Bedroom", sales: 8000, margin: 41, kpi: 4, tier: "tier1", commission: 320, commissionStatus: "settled", brand: "Akemi", product: "Queen bedroom collection" },
  { serial: 33, staffId: "wei", fairId: "ioi-mle-sep11", date: "2026-09-11", category: "Dining", sales: 6000, margin: 34, kpi: 2, tier: "standard", commission: 180, commissionStatus: "estimated", brand: "Zanotti", product: "Round dining package" },
  { serial: 34, staffId: "wei", fairId: "ioi-mle-sep11", date: "2026-09-13", category: "Living", sales: 8000, margin: null, kpi: 2, tier: "unknown", commission: null, commissionStatus: "pending", commissionNote: "Costing is pending; this order is excluded from the weighted margin.", brand: "Zanotti", product: "Custom sofa order" },

  { serial: 41, staffId: "daniel", fairId: "mv-mle-sep04", date: "2026-09-04", category: "Living", sales: 28000, margin: 38, kpi: 8, tier: "tier1", commission: 840, commissionStatus: "paid", brand: "Zanotti", product: "Premium living collection" },
  { serial: 42, staffId: "daniel", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Bedroom", sales: 20000, margin: 42, kpi: 7, tier: "tier1", commission: 800, commissionStatus: "settled", brand: "Akemi", product: "Complete bedroom collection" },
  { serial: 43, staffId: "sophia", fairId: "mv-mle-sep04", date: "2026-09-05", category: "Bedroom", sales: 22000, margin: 41, kpi: 8, tier: "tier1", commission: 880, commissionStatus: "paid", brand: "Akemi", product: "Luxury sleep collection" },
  { serial: 44, staffId: "sophia", fairId: "mv-mle-sep04", date: "2026-09-06", category: "Dining", sales: 18000, margin: 35, kpi: 6, tier: "standard", commission: 540, commissionStatus: "settled", brand: "Zanotti", product: "Marble dining collection" },
  { serial: 45, staffId: "daniel", fairId: "mv-bighome-sep11", date: "2026-09-12", category: "Living", sales: 30000, margin: 39, kpi: 8, tier: "tier1", commission: 900, commissionStatus: "estimated", brand: "Zanotti", product: "Whole-home lounge collection" },
  { serial: 46, staffId: "sophia", fairId: "ioi-mle-sep11", date: "2026-09-12", category: "Bedroom", sales: 35000, margin: 43, kpi: 11, tier: "tier2", commission: 1400, commissionStatus: "estimated", brand: "Akemi", product: "Complete sleep collection" },
];

export const orders: InsightOrder[] = orderSeeds.map(makeOrder);

export function getPerson(id: string): InsightPerson | undefined {
  return [...people, ...venuePeers].find((person) => person.id === id);
}

export function getFair(id: string): InsightFair | undefined {
  return fairs.find((fair) => fair.id === id);
}

export interface InsightOrderFilter {
  personId?: string;
  period?: InsightPeriod;
  fairId?: string;
  category?: string;
  tier?: InsightTier | "all";
  /** Exact count of qualifying KPI items in one order; zero is a valid filter. */
  kpiQuantity?: number;
  /** Include only orders containing at least one qualifying KPI item. */
  kpiOnly?: boolean;
  query?: string;
}

export function selectOrders({ personId, period = "month", fairId, category, tier, kpiQuantity, kpiOnly, query }: InsightOrderFilter = {}): InsightOrder[] {
  const search = query?.trim().toLowerCase();
  return orders.filter((order) => {
    const inPeriod = period === "last-week"
      ? order.date >= "2026-08-31" && order.date <= "2026-09-06"
      : order.date >= "2026-09-01" && order.date <= "2026-09-30";
    if (!inPeriod || (personId && order.staffId !== personId) || (fairId && fairId !== "all" && order.fairId !== fairId)) return false;
    if (category && category.toLowerCase() !== "all" && order.category !== category) return false;
    if (tier && tier !== "all" && order.tier !== tier) return false;
    if (kpiQuantity !== undefined && order.kpi !== kpiQuantity) return false;
    if (kpiOnly && order.kpi <= 0) return false;
    if (!search) return true;
    const fair = getFair(order.fairId);
    return [order.number, order.category, order.brand, getPerson(order.staffId)?.name, fair?.venue, fair?.organizer, ...order.items.map((item) => item.name)]
      .some((value) => value?.toLowerCase().includes(search));
  }).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number));
}

/** KPI qualification means an order contains at least one qualifying item. */
export function summarizeKpi(selectedOrders: readonly InsightOrder[]) {
  const orderCount = selectedOrders.length;
  const items = selectedOrders.reduce((total, order) => total + order.kpi, 0);
  const withKpi = selectedOrders.filter((order) => order.kpi > 0).length;
  const sales = selectedOrders.reduce((total, order) => total + order.sales, 0);
  return {
    orderCount,
    items,
    withKpi,
    withoutKpi: orderCount - withKpi,
    /** Percentage of all selected orders with one or more KPI items. */
    coverage: orderCount > 0 ? withKpi / orderCount * 100 : null,
    /** Includes orders with no KPI items in the denominator. */
    averagePerOrder: orderCount > 0 ? items / orderCount : null,
    averagePerKpiOrder: withKpi > 0 ? items / withKpi : null,
    averageSalesPerOrder: orderCount > 0 ? sales / orderCount : null,
  };
}

export function summarize(selectedOrders: readonly InsightOrder[]) {
  let sales = 0;
  let knownSales = 0;
  let profit = 0;
  let kpi = 0;
  let commission = 0;
  let unknownMarginCount = 0;
  let lowSales = 0;
  for (const order of selectedOrders) {
    sales += order.sales;
    kpi += order.kpi;
    commission += order.commission ?? 0;
    if (order.tier === "low") lowSales += order.sales;
    if (order.margin === null) unknownMarginCount += 1;
    else {
      knownSales += order.sales;
      profit += order.sales * order.margin / 100;
    }
  }
  return {
    sales,
    margin: knownSales > 0 ? profit / knownSales * 100 : null,
    /** Profit from costed orders only, matching the margin denominator. */
    profit,
    kpi,
    orderCount: selectedOrders.length,
    /** Sum of available sample commission facts; null entries are not paid zero. */
    commission,
    unknownMarginCount,
    lowSalesShare: sales > 0 ? lowSales / sales * 100 : 0,
  };
}

export function venueRanking(fairId: string, period: InsightPeriod = "month") {
  const fairOrders = selectOrders({ fairId, period });
  const sellers = [...new Set(fairOrders.map((order) => order.staffId))];
  const rows = sellers.map((personId) => {
    const totals = summarize(fairOrders.filter((order) => order.staffId === personId));
    return { personId, name: getPerson(personId)?.name ?? personId, sales: totals.sales, margin: totals.margin, kpi: totals.kpi, unknownMarginCount: totals.unknownMarginCount, rank: 0 };
  }).sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name));
  // Competition ranking: tied second places are followed by fourth place.
  let rank = 0;
  return rows.map((row, index) => {
    if (index === 0 || row.sales !== rows[index - 1].sales) rank = index + 1;
    return { ...row, rank };
  });
}

/** The observed single order with the greatest downward weighted-margin impact. */
export function marginImpact(selectedOrders: readonly InsightOrder[]): { order: InsightOrder; withoutMargin: number; delta: number } | null {
  const baseline = summarize(selectedOrders).margin;
  if (baseline === null) return null;
  let result: { order: InsightOrder; withoutMargin: number; delta: number } | null = null;
  selectedOrders.forEach((order, index) => {
    if (order.margin === null || order.margin >= baseline) return;
    const withoutMargin = summarize(selectedOrders.filter((_, otherIndex) => index !== otherIndex)).margin;
    if (withoutMargin === null) return;
    const delta = withoutMargin - baseline;
    if (delta > 0 && (!result || delta > result.delta)) result = { order, withoutMargin, delta };
  });
  return result;
}
