import type { MemberKpiSummary } from "./kpi-summary";
import type { DepartmentInsight, MemberInsightRange } from "./order-book";
import type { MemberInsight, MemberInsightBlock, MemberScore } from "./types";

/**
 * The Principal's own app, viewing nobody (2026-10-25 — a salesperson's note the user passed on: "要看销售额的话，就是把
 * 全部的加起来 … 要不然一直这样漏单的话，其实很容易让人以为是出 bug"): the whole sub-department's Insight read
 * (`member_principal_department_insight`) in the shapes Today and Insight already read — a block with every bill in
 * `team` and everybody in `downline`, a quarter's or a year's range, the KPI summary. One read answers all three.
 */

/** Nobody's own figures: the Principal sells nothing. */
const NOBODY: MemberScore & { name: string } = {
  staffId: "", name: "", sales: 0, held: 0, orders: 0, kpiQty: 0, marginRevenue: 0, marginCost: 0, blindOrders: 0, lastOrder: null,
};

export function departmentBlock(d: DepartmentInsight): MemberInsightBlock {
  return {
    membershipId: d.membershipId, schemeId: d.schemeId, department: d.department, title: "", rank: "", rankSort: 0,
    whole: true, team: d.team, me: NOBODY, target: null, boards: [], downline: d.people, orders: [],
  };
}

export function departmentInsight(d: DepartmentInsight): MemberInsight {
  return { period: d.from, asOf: d.asOf, live: d.live, blocks: [departmentBlock(d)] };
}

export function departmentRange(d: DepartmentInsight): MemberInsightRange {
  return { from: d.from, through: d.through, asOf: d.asOf, me: NOBODY, downline: d.people };
}

/**
 * Whether KPI counts, and every KPI item sold — the items themselves are on the bills (`kpiQty` on each line). The
 * threshold is a person's, so nothing is "hit" for a sub-department.
 */
export function departmentKpi(d: DepartmentInsight): MemberKpiSummary {
  return {
    schemeId: d.schemeId, period: d.from, asOf: d.asOf, enabled: d.kpi.enabled, items: [],
    total: d.kpi.enabled ? d.team.kpiQty : 0, threshold: d.kpi.enabled ? d.kpi.threshold : null, hit: null,
  };
}
