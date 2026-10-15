/**
 * The right-hand rail of Contacts and the Calendar (the owner, 2026-10-15: "做成这个的收起栏" — Inbox's Chat progress
 * rail): 44 px with « while folded, its column when open, folded at first. Contacts' holds the chart (a pie beside its
 * rows, grouped as the page's chart could be) and the customer picked in the table — or, nobody picked, who still lacks
 * property info; picking a row opens it. The Calendar's holds the visits' analysis (vm/analysis.ts). They replace
 * Contacts' side panel and both pages' Show chart cards.
 */
import type { DeskCtx } from "./ctx";
import type { peopleVM } from "./people";
import type { calendarAnalysisVM } from "./analysis";
import type { calendarVM } from "./calendar";

type People = ReturnType<typeof peopleVM>;
type Analysis = ReturnType<typeof calendarAnalysisVM>;
type Cal = Pick<ReturnType<typeof calendarVM>, "calStats" | "calBarBy" | "calTeamBars">;

export interface RailChart {
  title: string; sum: string; empty: boolean;
  bys: { label: string; on: boolean; pick: () => void }[];
  pie: Analysis["pie"];
  rows: { label: string; n: number; pct: string; w: number; color: string; on: boolean; pick?: () => void }[];
}

export function railVM(ctx: DeskCtx, pp: People, calAn: Analysis, cal?: Cal) {
  const { ui, patch } = ctx;
  const page = ui.tab === "people" ? "people" : ui.tab === "calendar" ? "calendar" : null;
  const people = page === "people", open = !!page && ui.rail;
  const chart: RailChart | null = !page ? null : people
    ? { title: pp.ppChartTitle, sum: pp.ppChartSum, empty: !pp.ppPieHas, bys: pp.ppBys.map(o => ({ label: o.label, on: o.on, pick: o.pick })), pie: pp.ppPie,
      rows: pp.ppBars.map(b => ({ label: b.label, n: b.n, pct: b.pct, w: b.w, color: b.color, on: b.on, pick: b.label === "Not filled yet" ? undefined : b.pick })) }
    : { title: calAn.title, sum: calAn.sum, empty: calAn.empty, bys: calAn.bys, pie: calAn.pie, rows: calAn.rows.map(r => ({ ...r, on: false })) };
  return {
    railOn: !!page,
    // The Calendar's dark figures band (Leads … Not reminded, By team / By showroom) lives in the rail too, so the month
    // has the page to itself (the owner, 2026-10-15: "可以把標識處放到右邊（可收開式）").
    calRail: true,
    rail: {
      open, toggle: () => patch({ rail: !ui.rail }),
      title: people ? "Contacts insights" : "Visits insights",
      chart, side: people ? pp.ppSide : null,
      stats: page === "calendar" && cal ? { figures: cal.calStats, by: cal.calBarBy, bars: cal.calTeamBars } : null,
    },
  };
}
