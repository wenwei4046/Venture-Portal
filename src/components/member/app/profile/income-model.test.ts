import { describe, expect, it } from "vitest";
import type { IncomeBill, IncomeMonth, MemberIncome } from "@/lib/member/income";
import { incomeVM } from "./income-model";

const bill = (over: Partial<IncomeBill> = {}): IncomeBill => ({
  orderId: "o1", no: "SO-1", status: "eligible", upsale: false, commissionable: 10000, orderTotal: 10500, personal: 500,
  kpi: 0, kpiQty: 0, openBill: 0, pay: 500, marginPct: 0.41, sharePct: null, brand: "AKEMI", ...over,
});
const month = (over: Partial<IncomeMonth> = {}): IncomeMonth => ({
  period: "2026-09", state: "live", asOf: "2026-10-05T02:00:00Z", closedAt: null, payrollStatus: null, paidOn: null,
  rankLabel: "Rank F", rate: 0.05, basic: 0, personal: 7974.2, kpi: 0, kpiQty: 0, openBill: 0, incentive: 0, override: 0, group: 0,
  director: 0, commission: 7974.2, countedSales: 159484, bandKey: null, brands: [], bills: [bill(), bill({ orderId: "o2", no: "SO-2", status: "deposit_pending", personal: 0, pay: 0 })],
  overrides: [], payLines: [], switches: { kpi: false, openBill: false, incentive: false, override: true, group: false }, notice: null, ...over,
});
const data = (m: IncomeMonth): MemberIncome => ({ month: m, past: [], cutover: "2026-09" });

describe("incomeVM", () => {
  it("is the engine's month: commission only, the bills held for a deposit named", () => {
    const vm = incomeVM(data(month()), false);
    expect(vm).toMatchObject({ heroLabel: "Estimated income · not settled", amount: "RM 7,974.20", total: "RM 7,974.20" });
    expect(vm.rows.map(r => [r.label, r.sub, r.amt])).toEqual([
      ["Fixed salary", "Commission only", "RM 0.00"],
      ["Personal sales commission", "RM 159,484 counted sales · 1 order held", "RM 7,974.20"],
    ]);
    expect(vm.held?.strong).toBe("1 order is waiting for a deposit.");
  });

  it("shows the override row for somebody with a team, even at RM 0", () => {
    expect(incomeVM(data(month()), false, true).rows.map(r => r.label)).toContain("Team override");
  });

  it("works out a month paid from the claim form the portal's way, and says so", () => {
    const vm = incomeVM(data(month({ period: "2026-08", state: "manual", basic: null, openBill: 120, commission: 2120, personal: 2000,
      bills: [bill({ openBill: 120, pay: 620 })] })), false);
    expect(vm.heroLabel).toBe("Claim form month · portal's working");
    expect(vm.heroNote).toContain("August was paid from the claim form");
    expect(vm.rows.map(r => [r.label, r.amt])).toEqual([
      ["Fixed salary", "—"], ["Personal sales commission", "RM 2,000.00"], ["Open Bill bonus", "RM 120.00"],
    ]);
    expect(vm.amount).toBe("RM 2,120.00");
  });

  it("hides every amount when the member asked to", () => {
    const vm = incomeVM(data(month()), true);
    expect(vm.amount).toBe("RM ••••••");
    expect(vm.rows.every(r => r.amt.startsWith("RM ••••"))).toBe(true);
  });
});
