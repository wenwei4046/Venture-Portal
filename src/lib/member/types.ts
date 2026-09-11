export type MemberPage =
  | "today"
  | "income"
  | "quote"
  | "team"
  | "requests"
  | "memos"
  | "account";
export type RequestKind = "claim" | "replacement" | "waiting";
export interface MemberProduct {
  id: string;
  code: string;
  name: string;
  brand: string;
  category: string;
  size: string;
  color: string;
  available: boolean;
  /** Eligibility for Free gifts; this item can also be purchased normally. */
  gift: boolean;
  /** Optional Principal-managed photo. Costs never travel with a live catalogue. */
  imageUrl?: string | null;
  cost?: number | null;
  version: string;
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
export interface QuoteInput {
  schemeId: string;
  lines: QuoteLine[];
  price: string;
  delivery: string;
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
