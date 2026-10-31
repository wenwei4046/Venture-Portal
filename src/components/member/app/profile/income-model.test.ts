import { describe, expect, it } from "vitest";
import type { IncomeBill, IncomeMonth, MemberIncome } from "@/lib/member/income";
import { memberPay, salaryFromSchedule } from "@/lib/member/income-pay";
import { incomeVM } from "./income-model";

const bill = (over: Partial<IncomeBill> = {}): IncomeBill => ({
  orderId: "o1", no: "SO-1", status: "eligible", upsale: false, commissionable: 10000, orderTotal: 10500, personal: 500,
  kpi: 0, kpiQty: 0, pay: 500, marginPct: 0.41, sharePct: null, brand: "AKEMI", ...over,
});
const month = (over: Partial<IncomeMonth> = {}): IncomeMonth => ({
  period: "2026-09", state: "live", asOf: "2026-10-05T02:00:00Z", closedAt: null, payrollStatus: null, paidOn: null,
  rankLabel: "Rank F", rate: 0.05, basic: 0, personal: 7974.2, kpi: 0, kpiQty: 0, incentive: 0, override: 0, group: 0,
  director: 0, commission: 7974.2, countedSales: 159484, bandKey: null, brands: [], bills: [bill(), bill({ orderId: "o2", no: "SO-2", status: "deposit_pending", personal: 0, pay: 0 })],
  overrides: [], payLines: [], switches: { kpi: false, incentive: false, override: true, group: false }, notice: null,
  pay: null, ...over,
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
    const vm = incomeVM(data(month({ period: "2026-08", state: "manual", basic: null, commission: 2000, personal: 2000,
      bills: [bill({ pay: 500 })] })), false);
    expect(vm.heroLabel).toBe("Claim form month · portal's working");
    expect(vm.heroNote).toContain("August was paid from the claim form");
    expect(vm.rows.map(r => [r.label, r.amt])).toEqual([
      ["Fixed salary", "—"], ["Personal sales commission", "RM 2,000.00"],
    ]);
    expect(vm.amount).toBe("RM 2,000.00");
  });

  it("hides every amount when the member asked to", () => {
    const vm = incomeVM(data(month()), true);
    expect(vm.amount).toBe("RM ••••••");
    expect(vm.rows.every(r => r.amt.startsWith("RM ••••"))).toBe(true);
  });

  // 2026-10-30: a brand given away and never sold that month — its cost known, no margin, and no cost pending.
  describe("the margin incentive and a brand given away", () => {
    const on = { kpi: false, incentive: true, override: true, group: false };
    const sub = (m: IncomeMonth) => incomeVM(data(m), false).rows.find(r => r.label === "Margin incentive")?.sub;
    it("names it as what stops the tier, never as a bill without cost", () => {
      const m = month({ switches: on, brands: [{ code: "ZANOTTI", marginPct: 0.4 }, { code: "AKEMI", marginPct: null, noSales: true }] });
      expect(sub(m)).toBe("No tier · Akemi has no sales");
      expect(incomeVM(data({ ...m, bills: [bill()] }), false).held).toBeNull();
    });
    it("still holds the incentive for a brand waiting on a cost", () => {
      const m = month({ switches: on, bills: [bill()], brands: [{ code: "ZANOTTI", marginPct: 0.4 }, { code: "AKEMI", marginPct: null }] });
      expect(sub(m)).toBe("Held · Akemi has a bill without cost");
      expect(incomeVM(data(m), false).held?.strong).toBe("Akemi has a bill without cost.");
    });
  });
});

// 2026-10-20 — the user, of Today's "Fixed salary RM 7,000.00 + commission RM 9,746.00" (RM 16,746): "the basic
// is deduct from the commission … you can get it from hr code base", and every EPF / SOCSO / PCB HR changed
// counts. CHEA HUAN's October before its payroll row: the schedules on the record's RM 7,000.
describe("incomeVM — the fixed salary is paid out of the commission, as payroll pays it", () => {
  const salary = salaryFromSchedule(7000, { daysWorked: 31, daysInMonth: 31 },
    { epfEr: 840, epfEe: 770, socsoEr: 104.15, socsoEe: 29.75, eisEr: 11.9, eisEe: 11.9, pcb: 333.85 });
  const october = month({
    period: "2026-10", basic: 7000, personal: 9746, commission: 9746, countedSales: 107400, bills: [bill()],
    pay: memberPay({ commission: 9746, elsewhere: 0, payLines: [], salary, taxMode: "pcb", withholdingRate: 0.02 }),
  });

  it("is never the fixed salary on top: the commission less every EPF / SOCSO / EIS and the PCB", () => {
    const vm = incomeVM({ ...data(october), past: [
      { period: "2026-09", status: "submitted", basic: 7000, commission: 16850.9, gross: 15902.45, net: 14101.15, paidOn: null },
    ] }, false);
    expect(vm.rows.map(r => [r.label, r.amt])).toEqual([
      ["Personal sales commission", "RM 9,746.00"],
      ["Employer EPF · SOCSO · EIS", "−RM 956.05"],
      ["Your EPF · SOCSO · EIS", "−RM 811.65"],
      ["PCB", "−RM 333.85"],
    ]);
    expect(vm.rows.slice(1).every(r => r.neg)).toBe(true);
    expect(vm.amount).toBe("RM 7,644.45");
    expect(vm.total).toBe("RM 7,644.45");
    // The two salary payments it reaches the bank as.
    expect(vm.paidAs?.map(r => [r.label, r.sub, r.amt])).toEqual([
      ["Net basic", "Fixed salary RM 7,000.00 less deductions", "RM 5,854.50"],
      ["Balance commission", "What your commission leaves", "RM 1,789.95"],
    ]);
    // A month payroll has paid shows what reached the bank.
    expect(vm.past.map(p => p.amt)).toEqual(["RM 14,101.15"]);
  });

  it("says when the commission does not cover the fixed salary yet", () => {
    const short = month({ ...october, personal: 2000, commission: 2000,
      pay: memberPay({ commission: 2000, elsewhere: 0, payLines: [], salary, taxMode: "pcb", withholdingRate: 0.02 }) });
    const vm = incomeVM(data(short), false);
    expect(vm.amount).toBe("−RM 101.55");
    expect(vm.paidAs?.[1]).toMatchObject({ label: "Balance commission", amt: "−RM 5,956.05", neg: true });
  });

  // CHEA HUAN sits in Fair and IR: payroll pays both in one row and takes the salary out once.
  it("in another sub-department, carves the salary out of the whole month — never twice", () => {
    const ir = month({ ...october, personal: 0, commission: 0, countedSales: 0, bills: [],
      pay: memberPay({ commission: 0, elsewhere: 9746, elsewhereFrom: ["Fair"], payLines: [], salary, taxMode: "pcb", withholdingRate: 0.02 }) });
    const vm = incomeVM(data(ir), false);
    expect(vm.rows.slice(0, 2).map(r => [r.label, r.sub, r.amt])).toEqual([
      ["Personal sales commission", "RM 0 counted sales", "RM 0.00"],
      ["Fair commission", "In the same payroll", "RM 9,746.00"],
    ]);
    expect(vm.total).toBe("RM 7,644.45");
  });

  it("a sub-department with no bills yet still shows where the pay comes from", () => {
    const none = month({ ...october, state: "none", personal: 0, commission: 0, countedSales: 0, bills: [], notice: "No bills have arrived for this month yet.",
      pay: memberPay({ commission: 0, elsewhere: 9746, elsewhereFrom: ["Fair"], payLines: [], salary, taxMode: "pcb", withholdingRate: 0.02 }) });
    const vm = incomeVM(data(none), false);
    expect(vm.notice).toBeNull();
    expect(vm.heroNote).toBe("No bills have arrived for this month yet.");
    expect(vm.rows.map(r => r.label)).toContain("Fair commission");
    expect(vm.total).toBe("RM 7,644.45");
    // Without the pay it says so instead, as before.
    expect(incomeVM(data({ ...none, pay: null }), false).notice).toBe("No bills have arrived for this month yet.");
  });

  it("no fixed salary: nothing to split, nothing taken off", () => {
    const none = salaryFromSchedule(0, { daysWorked: 31, daysInMonth: 31 }, { epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0, pcb: 0 });
    const vm = incomeVM(data(month({ pay: memberPay({ commission: 7974.2, elsewhere: 0, payLines: [], salary: none, taxMode: "pcb", withholdingRate: 0.02 }) })), false);
    expect(vm.rows.map(r => r.label)).toEqual(["Personal sales commission"]);
    expect(vm.paidAs).toBeNull();
    expect(vm.total).toBe("RM 7,974.20");
  });
});
