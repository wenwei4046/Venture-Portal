import type { QuotePricing } from "./calculator";
import type { KpiItem } from "@/lib/commission/kpi";
export type MemberPage =
  | "today"
  | "insight"
  | "arena"
  | "income"
  | "quote"
  | "team"
  | "requests"
  | "memos"
  | "crm"
  | "account";
export type RequestKind = "claim" | "replacement" | "waiting";
/** An explicit read-only Principal context; never replaces the signed-in profile. */
export interface MemberReadContext {
  staffId: string;
  subDepartmentId: string;
}
/**
 * One cell of a sofa module's cost grid — the ERP's `seat_height_prices`
 * shape: a cost per (seat height, fabric tier). Tiers are the ERP's names
 * PRICE_1 / PRICE_2 / PRICE_3; the member UI shows them as Tier 1 / 2 / 3.
 */
export interface CostCell {
  height: string;
  tier: string;
  cost: number;
}
/** A grid cell without its cost: the choices a member may pick from. */
export interface CostOption {
  height: string;
  tier: string;
}
export interface MemberProduct {
  id: string;
  code: string;
  name: string;
  /**
   * Brand code (AKEMI / DUNLOP / ERGOTEX / ZANOTTI). `null` marks a RIDER:
   * bed frames and accessories carry no brand of their own, join any cart and
   * follow the mattress or sofa's margin rules (user 2026-09-12).
   */
  brand: string | null;
  category: string;
  size: string;
  color: string;
  available: boolean;
  /** Eligibility for Free gifts; this item can also be purchased normally. */
  gift: boolean;
  /** Optional Principal-managed photo. Costs never travel with a live catalogue. */
  imageUrl?: string | null;
  cost?: number | null;
  /** Sofa modules: the seat height × fabric tier choices. Never carries a cost. */
  options?: CostOption[];
  /**
   * The ERP model the SKU belongs to — the key of its option dropdowns in
   * `MemberData.catalogueModels` (leg heights, specials, a bed frame's divan /
   * total / gap heights).
   */
  modelId?: string | null;
  /** Server-only: the priced grid behind `options`. Never enters an RPC response. */
  costGrid?: CostCell[] | null;
  /** The ERP's category (SOFA / BEDFRAME / MATTRESS / …) — which build a line takes. Not money. */
  kind?: string | null;
  /** A sofa module's base model (`8030`) and module (`1A(LHF)`), what combos match on. Not money. */
  baseModel?: string | null;
  moduleCode?: string | null;
  version: string;
}
/** The option lists a model may be quoted with — what Product List › Modular ticked. */
export interface MemberModelOptions {
  leg_heights?: string[];
  specials?: string[];
  divan_heights?: string[];
  total_heights?: string[];
  gaps?: string[];
}
export interface MemberCatalogueModel {
  id: string;
  kind: "SOFA" | "BEDFRAME";
  options: MemberModelOptions;
}
export interface MemberBand {
  brand: string;
  key: string;
  kind: "incentive" | "penalty" | "reference";
  threshold: number;
  multiplier: number | null;
  amount: number;
}
export interface MemberPerson {
  id: string;
  name: string;
  title: string;
  rank: string;
  parentId: string | null;
  self?: boolean;
}
export interface MemberMembership {
  id: string;
  schemeId: string;
  name: string;
  code: string;
  title: string;
  rank: string;
  rate: number;
  calculator: boolean;
  effective: string;
  capacity: number | null;
  occupied: number;
  people: MemberPerson[];
}
export interface MemberKpi {
  label: string;
  current: number;
  target: number | null;
  unit: string;
}
export interface MemberOrder {
  schemeId?: string;
  id: string;
  number: string;
  brand: string;
  revenue: number;
  /** Goods revenue used by margin; excludes non-goods KPI amounts. */
  marginRevenue?: number;
  margin: number | null;
  date: string;
  manual?: boolean;
}
export interface MemberIncome {
  schemeId: string;
  period: string;
  status: string;
  personal: number;
  override: number;
  kpi: number;
  openBill: number;
  incentive: number;
  group: number;
  total: number;
  sales: number;
  groupSales: number;
  deferred: number;
  rank: string;
  rate: number;
  kpis: MemberKpi[];
  brands: {
    brand: string;
    margin: number | null;
    revenue: number;
    tier: string | null;
  }[];
}
export interface MemberRequest {
  id: string;
  kind: RequestKind;
  title: string;
  status: string;
  createdAt: string;
  detail: Record<string, unknown>;
  note?: string;
  claimId?: string | null;
}
export interface MemberMemo {
  id: string;
  title: string;
  body: string;
  sender: string;
  publishedAt: string;
  effectiveAt: string;
  version: number;
  requiresAck: boolean;
  readAt: string | null;
  acknowledgedAt: string | null;
  departments: string[];
}
export interface MemberData {
  /** Authenticated Principal overview; never an impersonated staff account. */
  principalView?: boolean;
  demo: boolean;
  configured: boolean;
  message?: string;
  refreshedAt: string;
  profile: {
    id: string;
    userId: string;
    name: string;
    email: string;
    salary: number | null;
  };
  memberships: MemberMembership[];
  products: MemberProduct[];
  /** The option dropdowns of every sofa and bed frame model in `products`. */
  catalogueModels?: MemberCatalogueModel[];
  /**
   * Preview only: the demo's fictional option and combo prices, so the
   * preview's calculator prices a build the way the live one does. A live
   * snapshot never carries it — live prices stay on the server.
   */
  demoPricing?: QuotePricing;
  bands: MemberBand[];
  departments?: {
    id: string;
    name: string;
    capacity: number | null;
    occupied: number;
  }[];
  incomes: MemberIncome[];
  orders: MemberOrder[];
  requests: MemberRequest[];
  memos: MemberMemo[];
}
export interface QuoteLine {
  productId: string;
  quantity: number;
  /** The role selected for this line, independently of the product's eligibility. */
  gift: boolean;
}
/** The bed frame build for every bed frame in the cart — the ERP's bed frame options. */
export interface BedframeBuild {
  divan?: string;
  leg?: string;
  total?: string;
  gap?: string;
  specials?: string[];
}
/**
 * The build for every sofa module in the cart — one seat height, one fabric
 * tier, one leg height and one set of specials — and one for every bed frame.
 * Only what the cart's models were ticked for on Product List › Modular.
 */
export interface QuoteBuild {
  height?: string;
  tier?: string;
  leg?: string;
  specials?: string[];
  bedframe?: BedframeBuild;
}
export interface QuoteInput {
  schemeId: string;
  lines: QuoteLine[];
  price: string;
  delivery: string;
  build?: QuoteBuild;
}
/** Department rules the engine applies on top of the catalogue's costs. */
export interface QuoteRules {
  /**
   * Revenue Team cost = unit cost ÷ divisor (user 2026-09-12: "cost / 0.7 =
   * revenue fair department team cost"). The margin bands judge THAT cost, in
   * the calculator and in the commission run alike. 1 = the cost as keyed.
   */
  costDivisor: number;
  /**
   * SKUs judged at their own ratio instead (Product List › Costing Setting,
   * 2026-09-27), by product code. Absent = every SKU at `costDivisor`.
   */
  costRatios?: { productCode: string; ratio: number }[];
  /**
   * The department's KPI items while its KPI pay is on (Product List ›
   * Add-on / KPI Items, 2026-09-27): a cart carrying one has that amount off
   * its price for the margin — the run pays it flat as KPI. Absent = none.
   */
  kpiItems?: KpiItem[];
}
export interface QuoteResult {
  valid: boolean;
  error?: string;
  price: number;
  delivery: number;
  margin: number | null;
  label: string;
  tone: "good" | "warning" | "danger" | "neutral";
  multiplier: number;
  nextPrice: number | null;
  nextThreshold: number | null;
  boundary: string | null;
  /**
   * What the cart's KPI items take off its price, RM — paid flat as KPI,
   * outside this margin (2026-09-27). 0 when it carries none.
   */
  kpiAmount?: number;
  kpiItems?: { label: string; qty: number; amount: number }[];
  /** KPI items the price does not cover, RM — not paid; the whole price is the sale. */
  kpiNotPaid?: number;
  version: string;
  inputKey: string;
  customerText?: string;
  suggestions: {
    productId: string;
    name: string;
    margin: number;
    label: string;
  }[];
}

/**
 * Insight — live performance, read straight from the committed sales orders
 * rather than from the month's statement. Sales and margin only: another
 * member's commission, rate and salary never travel in these shapes.
 */
export interface MemberScore {
  staffId: string;
  /** Deposit-cleared commissionable revenue. What will actually pay. */
  sales: number;
  /** Commissionable revenue the deposit gate is still holding back. */
  held: number;
  orders: number;
  kpiQty: number;
  /** Revenue of the orders that HAVE a usable margin, and their cost. */
  marginRevenue: number;
  marginCost: number;
  /** Cleared orders with neither a line cost nor a keyed-in margin. */
  blindOrders: number;
  lastOrder: string | null;
}
export interface MemberBoardRow extends MemberScore {
  name: string;
  title: string;
  self: boolean;
}
export interface MemberBoard {
  departmentId: string;
  department: string;
  /** The caller's own sub-department. Listed first. */
  own: boolean;
  rows: MemberBoardRow[];
}
export interface MemberDownlineRow extends MemberScore {
  name: string;
  title: string;
  uplineId: string | null;
  /** 1 = a direct report. The caller themselves is never in this list. */
  depth: number;
}
export interface MemberStreakMonth {
  period: string;
  sales: number;
  /** This month, still moving. Earlier months come from applied statements. */
  live: boolean;
  met: boolean;
}
export interface MemberTarget {
  rank: string;
  /** Own sales needed every month of the streak. Null when this rung has no personal gate. */
  personal: number | null;
  months: number | null;
  /** Own + downline sales needed this month. Null when this rung has no group gate. */
  group: number | null;
  streak: MemberStreakMonth[] | null;
}
export interface MemberInsightOrder {
  id: string;
  number: string;
  brand: string;
  revenue: number;
  /** Margin-eligible goods revenue; zero for KPI-only orders. Older snapshots omit this. */
  marginRevenue?: number;
  margin: number | null;
  date: string;
  manual: boolean;
  /** Deposit met. An order that has not cleared pays nothing yet. */
  cleared: boolean;
  kpiQty: number;
  /** Written in an earlier month, paying in this one. */
  carried: boolean;
}
export interface MemberInsightBlock {
  membershipId: string;
  schemeId: string;
  department: string;
  title: string;
  rank: string;
  rankSort: number;
  me: MemberScore & { name: string };
  target: MemberTarget | null;
  boards: MemberBoard[];
  downline: MemberDownlineRow[];
  orders: MemberInsightOrder[];
}
export interface MemberInsight {
  period: string;
  asOf: string;
  /** The period is the current month, so the numbers are still moving. */
  live: boolean;
  blocks: MemberInsightBlock[];
}

/** The mapping map behind My team: everybody, and which department they are in. */
export interface MemberOrgPerson {
  /** Scheme-scoped: one node per MEMBERSHIP, not per person. */
  id: string;
  staffId: string;
  departmentId: string;
  schemeId: string;
  name: string;
  code: string | null;
  title: string;
  parentId: string | null;
  self: boolean;
  /** In a sub-department the caller also belongs to. */
  mine: boolean;
}
export interface MemberOrgDepartment {
  id: string;
  schemeId: string;
  name: string;
  code: string;
  capacity: number | null;
  mine: boolean;
  directors: { id: string; name: string }[];
}
export interface MemberOrgMap {
  asOf: string;
  departments: MemberOrgDepartment[];
  people: MemberOrgPerson[];
}
