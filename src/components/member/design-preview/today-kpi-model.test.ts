import { describe, expect, it } from "vitest";
import type { MemberKpi } from "@/lib/member/types";
import { todayKpiSummary } from "./today-kpi-model";

const goal = (label: string, current: number, target: number | null = null, unit = "units"): MemberKpi => ({ label, current, target, unit });

describe("Today preview's shared KPI threshold", () => {
  it("combines both item quantities toward one inclusive threshold", () => {
    expect(todayKpiSummary([goal("Pillow", 5), goal("Protector", 5)])).toEqual({
      items: [{ label: "Pillow", quantity: 5 }, { label: "Protector", quantity: 5 }],
      total: 10, threshold: 10, hit: true,
    });
    expect(todayKpiSummary([goal("Pillow", 5), goal("Protector", 4)])).toMatchObject({ total: 9, hit: false });
    expect(todayKpiSummary([goal("Pillow", 10), goal("Protector", 0)])).toMatchObject({ total: 10, hit: true });
    expect(todayKpiSummary([goal("Pillow", 0), goal("Protector", 10)])).toMatchObject({ total: 10, hit: true });
  });

  it("ignores item targets and unrelated goals instead of inheriting the visible row order", () => {
    const selected = [goal("Personal sales", 72000, 100000, "RM"), goal("Bed frame", 6, 10), goal("Protector", 9, 12), goal("Pillow", 18, 24)];
    const result = todayKpiSummary(selected);
    expect(result).toEqual({
      items: [{ label: "Pillow", quantity: 18 }, { label: "Protector", quantity: 9 }],
      total: 27, threshold: 10, hit: true,
    });
    expect(todayKpiSummary(selected.map((entry) => ({ ...entry, target: 999 })))).toEqual(result);
    expect(todayKpiSummary([...selected].reverse())).toEqual(result);
  });

  it("keeps missing counts pending rather than inventing a zero or an achieved threshold", () => {
    expect(todayKpiSummary([])).toEqual({
      items: [{ label: "Pillow", quantity: null }, { label: "Protector", quantity: null }],
      total: null, threshold: 10, hit: null,
    });
    expect(todayKpiSummary([goal("Pillow", 18)])).toEqual({
      items: [{ label: "Pillow", quantity: 18 }, { label: "Protector", quantity: null }],
      total: null, threshold: 10, hit: null,
    });
    expect(todayKpiSummary([goal("Pillow", 0), goal("Protector", 0)])).toMatchObject({ total: 0, hit: false });
  });

  it("rejects invalid, currency-valued, or duplicated quantities without double counting", () => {
    for (const current of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(todayKpiSummary([goal("Pillow", current), goal("Protector", 9)])).toMatchObject({
        items: [{ label: "Pillow", quantity: null }, { label: "Protector", quantity: 9 }], total: null, hit: null,
      });
    }
    expect(todayKpiSummary([goal("Pillow", 18, null, "RM"), goal("Protector", 9)])).toMatchObject({ total: null, hit: null });
    expect(todayKpiSummary([goal("Pillow", 18), goal("Pillow", 18), goal("Protector", 9)])).toMatchObject({ total: null, hit: null });
  });
});
