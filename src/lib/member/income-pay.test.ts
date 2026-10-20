import { describe, expect, it } from "vitest";
import { memberPay, salaryFromRow, salaryFromSchedule, taxModeOf, type PayrollRowFacts } from "./income-pay";

// CHEA HUAN's September 2026 payroll row on production, as HR keeps it: basic
// RM 7,000 out of RM 16,850.90 commission, the PCB HR typed (RM 930), SKBBK,
// and the month's pay lines (RM 7.60 added, RM 15.00 taken off). Payroll paid
// gross 15,902.45, net 14,101.15 = net basic 5,258.35 + balance 8,842.80.
const september: PayrollRowFacts = {
  basic_salary: "7000.00", statutory_allowance: "0.00", non_statutory_allowance: "0.00", ot_amount: "0.00",
  deduction_amount: "0.00", skbbk_amount: "44.65", prorata_days_worked: 30, prorata_days_in_month: 30,
  epf_er: "840.00", epf_ee: "770.00", socso_er: "104.15", socso_ee: "29.75", eis_er: "11.90", eis_ee: "11.90",
  pcb: "930.00", commission_adjustment_amount: "0.00",
};
const lines = [{ kind: "incentive", amount: 7.6 }, { kind: "deduction", amount: 15 }];

describe("the member's pay is HR's payroll (2026-10-20)", () => {
  it("pays the fixed salary OUT OF the commission: September comes out exactly as payroll paid it", () => {
    const pay = memberPay({ commission: 16850.9, elsewhere: 0, payLines: lines, salary: salaryFromRow(september), taxMode: "pcb", withholdingRate: 0.02 });
    expect(pay).toMatchObject({
      commission: 16850.9, fixed: 7000, employer: 956.05, employee: 811.65, pcb: 930, skbbk: 44.65,
      netBasic: 5258.35, balance: 8842.8, net: 14101.15,
    });
    // Never the fixed salary on top: 7,000 + 16,850.90 would be RM 23,850.90.
    expect(pay.netBasic + pay.balance).toBeCloseTo(pay.net, 2);
  });

  it("takes every figure HR typed over the schedule — a PCB of RM 200 instead of 930 lifts the net basic by 730", () => {
    const pay = memberPay({ commission: 16850.9, elsewhere: 0, payLines: lines, salary: salaryFromRow({ ...september, pcb: "200.00" }), taxMode: "pcb", withholdingRate: 0.02 });
    expect(pay.pcb).toBe(200);
    expect(pay.netBasic).toBe(5988.35);
    expect(pay.balance).toBe(8842.8);
    expect(pay.net).toBe(14831.15);
    const epf = memberPay({ commission: 16850.9, elsewhere: 0, payLines: [], salary: salaryFromRow({ ...september, epf_er: "700.00" }), taxMode: "pcb", withholdingRate: 0.02 });
    expect(epf.employer).toBe(816.05);
  });

  // CHEA HUAN's October on the day of the screenshot: RM 9,746 so far, no payroll row yet — the schedules
  // on the record's RM 7,000 (KA1, no children: PCB RM 333.85 on 7,000 − 770; HR's RM 930 was September's row).
  it("before October's payroll row: the record's basic and the schedules' figures — RM 9,746 leaves RM 1,789.95 after the basic and the employer's share", () => {
    const salary = salaryFromSchedule(7000, { daysWorked: 31, daysInMonth: 31 },
      { epfEr: 840, epfEe: 770, socsoEr: 104.15, socsoEe: 29.75, eisEr: 11.9, eisEe: 11.9, pcb: 333.85 });
    const pay = memberPay({ commission: 9746, elsewhere: 0, payLines: [], salary, taxMode: "pcb", withholdingRate: null });
    expect(pay.balance).toBe(1789.95);
    expect(pay.netBasic).toBe(5854.5);
    expect(pay.net).toBe(7644.45);
  });

  it("says so when the commission does not cover the fixed salary yet — never a floored zero", () => {
    const pay = memberPay({ commission: 2000, elsewhere: 0, payLines: [], salary: salaryFromRow(september), taxMode: "pcb", withholdingRate: 0.02 });
    // 2,000 − 7,000 − 956.05 employer − 44.65 SKBBK.
    expect(pay.balance).toBe(-6000.7);
    expect(pay.net).toBe(-742.35);
  });

  it("carves the basic out once, from every department's commission and HR's adjustment", () => {
    const pay = memberPay({ commission: 9746, elsewhere: 1200, payLines: [],
      salary: salaryFromRow({ ...september, skbbk_amount: 0, commission_adjustment_amount: "-50.00" }), taxMode: "pcb", withholdingRate: 0.02 });
    expect(pay).toMatchObject({ commission: 10896, elsewhere: 1200, adjustment: -50 });
    // 10,896 − 7,000 − 956.05.
    expect(pay.balance).toBe(2939.95);
  });

  it("commission only: no basic, no contribution — withholding takes its rate of the gross", () => {
    const salary = salaryFromSchedule(0, { daysWorked: 31, daysInMonth: 31 }, { epfEr: 0, epfEe: 0, socsoEr: 0, socsoEe: 0, eisEr: 0, eisEe: 0, pcb: 0 });
    const pay = memberPay({ commission: 7974.2, elsewhere: 0, payLines: [], salary, taxMode: "withholding", withholdingRate: null });
    expect(pay).toMatchObject({ fixed: 0, netBasic: 0, employer: 0, employee: 0, withholding: 159.48, net: 7814.72, balance: 7814.72 });
  });

  it("reads the tax mode the way the payroll trigger does", () => {
    expect(taxModeOf("withholding")).toBe("withholding");
    expect(taxModeOf("none")).toBe("none");
    expect(taxModeOf("pcb")).toBe("pcb");
    expect(taxModeOf(null)).toBe("pcb");
  });
});
