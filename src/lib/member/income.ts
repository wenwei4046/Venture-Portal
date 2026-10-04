import type { CommissionOrderRow, OverrideOrderRow, WorkbenchPerson } from "@/lib/commission/workbench";
import type { CloseSummary } from "@/lib/commission/closes";
import type { StatementDto } from "@/lib/commission/run-payload";
import type { MemberIncome as SnapshotIncome } from "./types";

/**
 * My income (2026-10-05, user: 跟着 up to date … close 的时候就是 fix): the
 * member's month exactly as Comm Cal works it out — live until HR closes them,
 * then the close's own figures — and the months payroll already paid.
 *
 * Built on the server from the engine's own rows; what crosses to the browser
 * is the member's own money and bills only. Never a cost: a bill carries its
 * layer-2 margin percentage and nothing it was worked out from.
 */

export type IncomeState =
  /** Still moving: the engine's figure as of now. */
  | "live"
  /** HR closed them for the month: the close's figure, fixed. */
  | "closed"
  /**
   * A month before the portal paid commission: paid from the claim form,
   * outside the portal. The figures are the portal's own working of it, as
   * Comm Cal's month page shows them (user 2026-10-05: 显示 VP 自己算的).
   */
  | "manual"
  /** Nothing to work out (no import yet, not a member then). */
  | "none";

export type IncomeBillStatus = "eligible" | "deposit_pending" | "already_released" | "excluded";

export interface IncomeBill {
  /** `sales_orders.id` — a shared bill's every part carries the bill's own id. */
  orderId: string;
  no: string;
  status: IncomeBillStatus;
  upsale: boolean;
  /** What on the member's part of the bill earns. */
  commissionable: number;
  orderTotal: number;
  personal: number;
  kpi: number;
  kpiQty: number;
  openBill: number;
  /** personal + KPI + Open Bill: what the bill pays the member this month. */
  pay: number;
  marginPct: number | null;
  /** The member's part of a shared bill (0.5); null when it is theirs alone. */
  sharePct: number | null;
  brand: string | null;
}

export interface IncomeOverride {
  orderId: string;
  no: string;
  seller: string;
  brand: string | null;
  orderTotal: number | null;
  basis: number;
  rate: number;
  amount: number;
}

export interface IncomePayLine {
  kind: string;
  description: string;
  amount: number;
}

export interface IncomeMonth {
  period: string;
  state: IncomeState;
  /** When the figure was worked out (live) or closed. */
  asOf: string;
  closedAt: string | null;
  /** The month's payroll row, once there is one. */
  payrollStatus: string | null;
  paidOn: string | null;
  rankLabel: string | null;
  rate: number;
  /** The fixed salary this month — the payroll row's, else the member's contract. */
  basic: number | null;
  personal: number;
  kpi: number;
  kpiQty: number;
  openBill: number;
  incentive: number;
  override: number;
  group: number;
  director: number;
  commission: number;
  /** Commissionable sales the deposit cleared this month. */
  countedSales: number;
  /** The incentive tier every brand cleared (a band key), and the brands' layer-2 margins. */
  bandKey: string | null;
  brands: { code: string; marginPct: number | null }[];
  bills: IncomeBill[];
  overrides: IncomeOverride[];
  payLines: IncomePayLine[];
  switches: { kpi: boolean; openBill: boolean; incentive: boolean; override: boolean; group: boolean };
  notice: string | null;
}

export interface IncomePast {
  period: string;
  status: string;
  basic: number;
  commission: number;
  gross: number;
  paidOn: string | null;
}

export interface MemberIncome {
  month: IncomeMonth;
  past: IncomePast[];
  /** The first month the portal pays commission in this sub-department. */
  cutover: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: readonly number[]) => round2(xs.reduce((a, b) => a + b, 0));

function bill(row: CommissionOrderRow): IncomeBill {
  const kpi = round2(row.kpiBase + row.kpiBonus);
  const part = row.share?.parts.find(p => p.staffId === row.staffId);
  return {
    orderId: row.originalOrderId,
    no: row.orderNo,
    status: row.status,
    upsale: row.upsale,
    commissionable: row.commissionableValue,
    orderTotal: row.orderTotal,
    personal: row.productCommission,
    kpi,
    kpiQty: row.kpiQty,
    openBill: row.openBillBonus,
    pay: round2(row.productCommission + kpi + row.openBillBonus),
    marginPct: row.marginPct,
    sharePct: row.share && part ? part.pct : null,
    brand: row.brands[0] ?? null,
  };
}

function override(row: OverrideOrderRow): IncomeOverride {
  return {
    orderId: row.originalOrderId, no: row.orderNo, seller: row.downlineName, brand: row.brands[0] ?? null,
    orderTotal: row.orderTotal, basis: row.overrideBasis, rate: row.overrideRate, amount: row.overrideAmount,
  };
}

/** The month as the engine sees it now — Comm Cal's live row for this person. */
export function liveIncome(person: WorkbenchPerson | null, extra: Pick<IncomeMonth, "period" | "asOf" | "basic" | "payLines" | "switches" | "payrollStatus" | "paidOn">): IncomeMonth {
  const st = person?.statement ?? null;
  const rows = (person?.personalRows ?? []).filter(r => r.status !== "excluded");
  return {
    ...extra,
    state: "live",
    closedAt: null,
    rankLabel: person?.rankLabel ?? null,
    rate: person?.productRate ?? 0,
    personal: st?.productCommission ?? 0,
    kpi: st?.kpiCommission ?? 0,
    kpiQty: st?.kpiQty ?? 0,
    openBill: st?.openBillBonus ?? 0,
    incentive: st?.marginIncentive ?? 0,
    override: person?.overrideTotal ?? 0,
    group: person?.monthlyGroupIncentive ?? 0,
    director: person?.monthlyDirectorPay ?? 0,
    commission: person?.totalCommission ?? 0,
    countedSales: st?.productRevenue ?? 0,
    bandKey: st?.marginBandKey ?? null,
    brands: (st?.marginByBrand ?? []).flatMap(b => (b.brandCode ? [{ code: b.brandCode, marginPct: b.marginPct }] : [])),
    bills: rows.map(bill),
    overrides: (person?.overridingRows ?? []).map(override),
    notice: null,
  };
}

/** What the override lines of a close name — the bill and who sold it — read back by the server. */
export interface OverrideFacts {
  no: string;
  seller: string;
  brand: string | null;
  orderTotal: number | null;
}

/**
 * The month as HR closed it: the close's statement, line for line. A close
 * keeps `save_commission_run`'s statement and the table's row, so the bills
 * and the override come back exactly as they were paid.
 */
export function closedIncome(close: {
  closedAt: string;
  summary: CloseSummary;
  statement: StatementDto | null;
  deferred: readonly { orderId: string }[];
}, facts: ReadonlyMap<string, OverrideFacts>, extra: Pick<IncomeMonth, "period" | "basic" | "payLines" | "switches" | "payrollStatus" | "paidOn">): IncomeMonth {
  const st = close.statement;
  const lines = st?.lines ?? [];
  const byOrder = new Map<string, { personal: number; kpi: number; kpiQty: number; openBill: number; basis: number }>();
  for (const l of lines) {
    if (!l.source_order_id || l.component === "override") continue;
    const o = byOrder.get(l.source_order_id) ?? { personal: 0, kpi: 0, kpiQty: 0, openBill: 0, basis: 0 };
    if (l.component === "product_revenue") { o.personal = round2(o.personal + l.amount); o.basis = round2(o.basis + l.basis_amount); }
    else if (l.component === "kpi_item" || l.component === "kpi_threshold") { o.kpi = round2(o.kpi + l.amount); o.kpiQty += l.qty ?? 0; }
    else if (l.component === "open_bill") o.openBill = round2(o.openBill + l.amount);
    byOrder.set(l.source_order_id, o);
  }
  const deferred = new Set(close.deferred.map(d => d.orderId));
  const bills: IncomeBill[] = close.summary.bills.filter(b => b.status !== "excluded").map(b => {
    const o = byOrder.get(b.id);
    return {
      orderId: b.id, no: b.no, status: deferred.has(b.id) ? "deposit_pending" : b.status, upsale: false,
      commissionable: o?.basis ?? 0, orderTotal: 0, personal: o?.personal ?? 0, kpi: o?.kpi ?? 0, kpiQty: o?.kpiQty ?? 0,
      openBill: o?.openBill ?? 0, pay: round2((o?.personal ?? 0) + (o?.kpi ?? 0) + (o?.openBill ?? 0)), marginPct: null, sharePct: null, brand: null,
    };
  });
  const overrides: IncomeOverride[] = lines.filter(l => l.component === "override").map(l => {
    const f = l.source_order_id ? facts.get(l.source_order_id) : undefined;
    return {
      orderId: l.source_order_id ?? "", no: f?.no ?? "—", seller: f?.seller ?? (l.source_staff_id ? facts.get(`staff:${l.source_staff_id}`)?.seller ?? "Your team" : "Your team"),
      brand: f?.brand ?? null, orderTotal: f?.orderTotal ?? null, basis: l.basis_amount, rate: l.rate ?? 0, amount: l.amount,
    };
  });
  const s = close.summary;
  return {
    ...extra,
    state: "closed",
    asOf: close.closedAt,
    closedAt: close.closedAt,
    rankLabel: s.rankLabel,
    rate: s.productRate,
    personal: st?.product_commission ?? s.personal,
    kpi: st?.kpi_commission ?? 0,
    kpiQty: st?.kpi_qty ?? 0,
    openBill: st?.open_bill_bonus ?? 0,
    incentive: st?.margin_incentive ?? 0,
    override: s.overriding,
    group: s.groupIncentive,
    director: s.directorPay,
    commission: s.total,
    countedSales: st?.product_revenue ?? s.commissionable,
    bandKey: st?.margin_band_key ?? null,
    brands: (st?.brand_margins ?? []).map(b => ({ code: b.brand_code, marginPct: b.margin_pct })),
    bills,
    overrides,
    notice: null,
  };
}

/**
 * One member's month in the shape Today's hero reads (the snapshot's), for a
 * Principal viewing them: their own figure from the engine — the Principal's
 * snapshot only carries the department's, which is nobody's income.
 */
export function snapshotIncome(m: IncomeMonth, schemeId: string): SnapshotIncome {
  return {
    schemeId, period: m.period,
    status: m.state === "closed" || m.payrollStatus === "paid" ? "locked" : m.state === "manual" ? "applied" : "computed",
    personal: m.personal, override: m.override, kpi: m.kpi, openBill: m.openBill, incentive: m.incentive, group: m.group,
    total: m.commission, sales: m.countedSales, groupSales: 0,
    deferred: sum(m.bills.filter(b => b.status === "deposit_pending").map(b => b.commissionable)),
    rank: m.rankLabel ?? "", rate: m.rate, kpis: [], brands: [],
  };
}

/** The member's pay lines (Special claim / Allowance / Incentive add; Deduction takes off). */
export function payLinesTotal(lines: readonly IncomePayLine[]): number {
  return sum(lines.map(l => (l.kind === "deduction" ? -Math.abs(l.amount) : l.amount)));
}
