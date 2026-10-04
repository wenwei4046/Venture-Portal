import { describe, expect, it } from "vitest";
import type { WorkbenchPerson } from "@/lib/commission/workbench";
import type { CloseSummary } from "@/lib/commission/closes";
import type { StatementDto } from "@/lib/commission/run-payload";
import { closedIncome, liveIncome, payLinesTotal, snapshotIncome, type OverrideFacts } from "./income";

const extra = {
  period: "2026-09", asOf: "2026-10-05T02:00:00Z", basic: 0, payLines: [], payrollStatus: null, paidOn: null,
  switches: { kpi: false, openBill: false, incentive: false, override: true, group: false },
};
const orderRow = (over: Record<string, unknown>) => ({
  originalOrderId: "o1", orderNo: "SO-1", staffId: "me", status: "eligible", upsale: false, commissionableValue: 10000, orderTotal: 10500,
  productCommission: 500, kpiBase: 0, kpiBonus: 0, kpiQty: 0, openBillBonus: 0, marginPct: 0.41, share: null, brands: ["AKEMI"], ...over,
});

describe("liveIncome — Comm Cal's live row for the member", () => {
  const person = {
    rankLabel: "Rank F", productRate: 0.05, overrideTotal: 120, monthlyGroupIncentive: 0, monthlyDirectorPay: 0, totalCommission: 920,
    statement: {
      productCommission: 800, kpiCommission: 0, kpiQty: 0, openBillBonus: 0, marginIncentive: 0, productRevenue: 16000, marginBandKey: null,
      marginByBrand: [{ brandCode: "AKEMI", marginPct: 0.41 }, { brandCode: null, marginPct: null }],
    },
    personalRows: [
      orderRow({}),
      orderRow({ originalOrderId: "o2", orderNo: "SO-2", status: "deposit_pending", productCommission: 0 }),
      orderRow({ originalOrderId: "o3", orderNo: "SO-3", status: "excluded" }),
      orderRow({ originalOrderId: "o4", orderNo: "SO-4", productCommission: 300, openBillBonus: 20, kpiBase: 5, kpiBonus: 5, kpiQty: 1,
        share: { parts: [{ staffId: "me", pct: 0.5 }, { staffId: "x", pct: 0.5 }] } }),
    ],
    overridingRows: [{ originalOrderId: "o9", orderNo: "SO-9", downlineName: "ANTHONY", brands: [], orderTotal: 6000, overrideBasis: 6000, overrideRate: 0.02, overrideAmount: 120 }],
  } as unknown as WorkbenchPerson;

  it("carries the engine's totals and every bill but the ones taken out", () => {
    const m = liveIncome(person, extra);
    expect(m).toMatchObject({ state: "live", closedAt: null, rankLabel: "Rank F", rate: 0.05, personal: 800, override: 120, commission: 920, countedSales: 16000 });
    expect(m.bills.map(b => [b.no, b.status])).toEqual([["SO-1", "eligible"], ["SO-2", "deposit_pending"], ["SO-4", "eligible"]]);
    expect(m.brands).toEqual([{ code: "AKEMI", marginPct: 0.41 }]);
  });

  it("pays a bill its commission, KPI and Open Bill, and names the member's part of a shared one", () => {
    const shared = liveIncome(person, extra).bills.find(b => b.no === "SO-4")!;
    expect(shared).toMatchObject({ personal: 300, kpi: 10, kpiQty: 1, openBill: 20, pay: 330, sharePct: 0.5, brand: "AKEMI" });
    expect(liveIncome(person, extra).bills[0].sharePct).toBeNull();
  });

  it("reads the override bill by bill", () => {
    expect(liveIncome(person, extra).overrides).toEqual([{ orderId: "o9", no: "SO-9", seller: "ANTHONY", brand: null, orderTotal: 6000, basis: 6000, rate: 0.02, amount: 120 }]);
  });

  it("is all zero for somebody the engine has no row for", () => {
    const m = liveIncome(null, extra);
    expect(m).toMatchObject({ state: "live", rate: 0, personal: 0, override: 0, commission: 0, bills: [], overrides: [], brands: [] });
  });
});

describe("closedIncome — the month as HR closed it", () => {
  const line = (over: Record<string, unknown>) => ({ component: "product_revenue", source_order_id: "o1", source_line_id: null, source_staff_id: null, basis_amount: 0, rate: null, qty: null, amount: 0, note: "", ...over });
  const close = {
    closedAt: "2026-10-10T08:00:00Z",
    summary: {
      rankLabel: "Rank F", productRate: 0.05, personal: 800, overriding: 140, groupIncentive: 0, directorPay: 0, total: 990, commissionable: 16000,
      bills: [{ id: "o1", no: "SO-1", status: "eligible", total: 550 }, { id: "o2", no: "SO-2", status: "eligible", total: 0 }, { id: "o3", no: "SO-3", status: "excluded", total: 0 }],
      overrides: [],
    } as unknown as CloseSummary,
    statement: {
      product_commission: 800, kpi_commission: 0, kpi_qty: 0, open_bill_bonus: 50, margin_incentive: 0, product_revenue: 16000, margin_band_key: null,
      brand_margins: [{ brand_code: "AKEMI", margin_pct: 0.41 }],
      lines: [
        line({ basis_amount: 6000, rate: 0.05, amount: 300 }),
        line({ basis_amount: 4000, rate: 0.05, amount: 200 }),
        line({ component: "open_bill", amount: 50 }),
        line({ component: "override", source_order_id: "o9", source_staff_id: "s9", basis_amount: 6000, rate: 0.02, amount: 120 }),
        line({ component: "override", source_order_id: null, source_staff_id: "s8", basis_amount: 1000, rate: 0.02, amount: 20 }),
      ],
    } as unknown as StatementDto,
    deferred: [{ orderId: "o2" }],
  };
  const facts = new Map<string, OverrideFacts>([
    ["o9", { no: "SO-9", seller: "ANTHONY", brand: "AKEMI", orderTotal: 6000 }],
    ["staff:s8", { no: "", seller: "BEN", brand: null, orderTotal: null }],
  ]);
  const m = closedIncome(close, facts, extra);

  it("is the close's figures, fixed at the time of the close", () => {
    expect(m).toMatchObject({ state: "closed", asOf: "2026-10-10T08:00:00Z", closedAt: "2026-10-10T08:00:00Z", rankLabel: "Rank F",
      personal: 800, openBill: 50, override: 140, commission: 990, countedSales: 16000 });
    expect(m.brands).toEqual([{ code: "AKEMI", marginPct: 0.41 }]);
  });

  it("adds a bill's lines together, keeps a deposit-held bill held and leaves out what was not counted", () => {
    expect(m.bills.map(b => [b.no, b.status, b.commissionable, b.personal, b.openBill, b.pay])).toEqual([
      ["SO-1", "eligible", 10000, 500, 50, 550],
      ["SO-2", "deposit_pending", 0, 0, 0, 0],
    ]);
  });

  it("names the override's bill and seller, by the bill or else by the seller", () => {
    expect(m.overrides.map(o => [o.no, o.seller, o.amount])).toEqual([["SO-9", "ANTHONY", 120], ["—", "BEN", 20]]);
  });
});

describe("payLinesTotal", () => {
  it("adds earnings and takes a deduction off, whatever its sign", () => {
    expect(payLinesTotal([
      { kind: "allowance", description: "", amount: 100 },
      { kind: "deduction", description: "", amount: 30 },
      { kind: "deduction", description: "", amount: -20 },
      { kind: "special_claim", description: "", amount: 0.1 },
    ])).toBe(50.1);
  });
});

describe("snapshotIncome — one member's month for Today's hero", () => {
  it("is the member's own engine figure, settled once closed or paid", () => {
    const live = liveIncome({
      rankLabel: "Rank F", productRate: 0.05, overrideTotal: 0, monthlyGroupIncentive: 0, monthlyDirectorPay: 0, totalCommission: 7974.2,
      statement: { productCommission: 7974.2, kpiCommission: 0, kpiQty: 0, openBillBonus: 0, marginIncentive: 0, productRevenue: 159484, marginBandKey: null, marginByBrand: [] },
      personalRows: [orderRow({ originalOrderId: "o2", orderNo: "SO-2", status: "deposit_pending", commissionableValue: 5388, productCommission: 0 })],
      overridingRows: [],
    } as unknown as WorkbenchPerson, extra);
    expect(snapshotIncome(live, "s1")).toMatchObject({ schemeId: "s1", period: "2026-09", status: "computed", total: 7974.2, sales: 159484, deferred: 5388, rank: "Rank F", rate: 0.05 });
    expect(snapshotIncome({ ...live, state: "closed" }, "s1").status).toBe("locked");
    expect(snapshotIncome({ ...live, payrollStatus: "paid" }, "s1").status).toBe("locked");
  });
});
