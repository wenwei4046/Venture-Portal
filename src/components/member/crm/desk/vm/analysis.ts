/**
 * The Calendar's analysis card (the owner, 2026-10-15: "加跟 contact 一樣的 chart 圖（只是可以分析客戶，也可以分析業務的
 * 預約等）"): the visits on screen — the Calendar's own range, team, showroom and people filters — grouped by the
 * salesperson, team, showroom, outcome, weekday, time, or the customer's platform, property type or ad; a pie with each
 * group's share beside its rows, folded until opened, as Contacts' chart.
 */
import type { DeskCtx } from "./ctx";
import type { VisitRow } from "./data";
import { pieSlices } from "./people";
import { CHANNEL } from "../../sales/vm/common";

const COLS = ["#BD4A19", "#2F6FB5", "#8E4B6E", "#387557", "#A46312", "#6B574C", "#C9785A", "#5B7FA6", "#9C6B3E", "#7A4FB0"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "—");

export const CAL_BYS = ["rep", "team", "room", "status", "dow", "time", "plat", "type", "ad"] as const;
export type CalBy = (typeof CAL_BYS)[number];
const LABEL: Record<CalBy, string> = { rep: "Salesperson", team: "Team", room: "Showroom", status: "Outcome", dow: "Weekday", time: "Time", plat: "Platform", type: "Property type", ad: "Ad" };

export function calendarAnalysisVM(ctx: DeskCtx, vs: VisitRow[]) {
  const { ui, patch, data } = ctx;
  const by: CalBy = (CAL_BYS as readonly string[]).includes(ui.calAnBy) ? (ui.calAnBy as CalBy) : "rep";
  const cust = (v: VisitRow) => data.customers.find(c => c.id === v.customerId);
  const keyOf = (v: VisitRow): string => {
    switch (by) {
      case "rep": return v.rep === "—" ? "No one yet" : v.rep;
      case "team": return v.team ?? "No team";
      case "room": return v.room;
      case "status": return v.status;
      case "dow": return DOW[(v.at.getDay() + 6) % 7];
      case "time": return v.at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
      case "plat": { const c = cust(v); return c ? CHANNEL[c.channel].name : "—"; }
      case "type": return cust(v)?.details.type || "Not filled yet";
      case "ad": return cust(v)?.ad || "No ad";
    }
  };
  const counts = new Map<string, number>();
  for (const v of vs) counts.set(keyOf(v), (counts.get(keyOf(v)) ?? 0) + 1);
  const order = by === "dow" ? (a: [string, number], b: [string, number]) => DOW.indexOf(a[0]) - DOW.indexOf(b[0])
    : by === "time" ? (a: [string, number], b: [string, number]) => vs.find(v => keyOf(v) === a[0])!.at.getHours() * 60 + vs.find(v => keyOf(v) === a[0])!.at.getMinutes()
      - (vs.find(v => keyOf(v) === b[0])!.at.getHours() * 60 + vs.find(v => keyOf(v) === b[0])!.at.getMinutes())
    : (a: [string, number], b: [string, number]) => b[1] - a[1] || a[0].localeCompare(b[0]);
  const groups = [...counts].sort(order);
  const tot = vs.length, mx = Math.max(1, ...groups.map(g => g[1]));
  const rows = groups.map(([label, n], i) => ({ label, n, pct: pct(n, tot), w: Math.round((n / mx) * 100), color: label === "Not filled yet" ? "#D9C9BD" : COLS[i % COLS.length] }));
  const top = [...rows].filter(r => r.label !== "Not filled yet").sort((a, b) => b.n - a.n)[0];
  return {
    open: ui.calAn, toggle: () => patch({ calAn: !ui.calAn }), chev: ui.calAn ? "rotate(180deg)" : "none", btn: ui.calAn ? "Hide chart" : "Show chart",
    title: `Visits by ${LABEL[by].toLowerCase()}`,
    sum: top ? `${tot} visits · most: ${top.label} ${top.n} (${top.pct})` : "No visits in this range",
    bys: CAL_BYS.map(k => ({ label: LABEL[k], on: k === by, pick: () => patch({ calAnBy: k }) })),
    stack: rows.map(r => ({ color: r.color, n: r.n })),
    rows, pie: pieSlices(rows.map(r => ({ label: r.label, n: r.n, color: r.color })), tot), empty: !tot,
  };
}
