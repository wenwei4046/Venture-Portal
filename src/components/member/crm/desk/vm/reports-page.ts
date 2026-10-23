/**
 * Reports' page (2026-10-23; vm/reports.ts holds the arithmetic): the category in the head's tabs — Ads performance and
 * Leads by ad as their own pages draw them, Salespeople, Appointments & show-ups and Lead sources & status — a period
 * for the last three, and Export CSV of the category on screen.
 */
import type { DeskCtx } from "./ctx";
import { chatRows, teamNameOf } from "./data";
import { CHANNEL } from "../../sales/vm/common";
import { appointmentsReport, pctLabel, periodRange, RP_PERIODS, salespeopleReport, sourcesReport, waitLabel, type ApptVisit, type Part, type SalesRow } from "./reports";

export type RpCat = "ads" | "lba" | "sales" | "appt" | "src";
export const RP_CATS: [RpCat, string][] = [["ads", "Ads performance"], ["lba", "Leads by ad"], ["sales", "Salespeople"], ["appt", "Appointments & show-ups"], ["src", "Lead sources & status"]];

const SALES_COLS: [keyof SalesRow, string, "n" | "pct" | "wait"][] = [["leads", "Leads", "n"], ["replyRate", "Replied", "pct"], ["firstReplyMin", "First reply", "wait"], ["appt", "Appts", "n"],
  ["apptRate", "Appt rate", "pct"], ["showed", "Showed up", "n"], ["showRate", "Show-up", "pct"], ["won", "Won", "n"], ["winRate", "Win rate", "pct"], ["lost", "Lost", "n"]];

export function reportsVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now, nameOf } = ctx;
  const cat: RpCat = ui.rpCat ?? "ads", per = ui.rpPer ?? "month", range = periodRange(per, now);
  const card = (title: string, rows: Part[]) => ({ title, total: rows.reduce((n, r) => n + r.n, 0), rows: rows.map(r => ({ ...r, pct: pctLabel(r.share), w: Math.round(r.share * 100) })) });

  // Salespeople: sortable by any figure (▼ first), the team's name under each person.
  const sr = salespeopleReport(data.customers, data.visits, range, nameOf, id => teamNameOf(ctx, id));
  const so = ui.rpSort;
  const val = (r: SalesRow, k: keyof SalesRow) => (k === "name" ? r.name : (r[k] as number | null) ?? -1);
  const rows = so ? [...sr.rows].sort((a, b) => { const x = val(a, so.k as keyof SalesRow), y = val(b, so.k as keyof SalesRow);
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y); return so.dir === "asc" ? c : -c; }) : sr.rows;
  const cell = (r: SalesRow, k: keyof SalesRow, f: "n" | "pct" | "wait") => (f === "pct" ? pctLabel(r[k] as number | null) : f === "wait" ? waitLabel(r[k] as number | null) : String(r[k]));
  const sales = {
    cols: SALES_COLS.map(([k, label]) => ({ k, label, arrow: so?.k === k ? (so.dir === "asc" ? "↑" : "↓") : "",
      sort: () => set(u => ({ ...u, rpSort: !u.rpSort || u.rpSort.k !== k ? { k, dir: "desc" } : u.rpSort.dir === "desc" ? { k, dir: "asc" } : null })) })),
    rows: rows.map(r => ({ id: r.id, name: r.name, team: r.team, cells: SALES_COLS.map(([k, , f]) => cell(r, k, f)), none: !r.id })),
    total: { name: sr.total.name, cells: SALES_COLS.map(([k, , f]) => cell(sr.total, k, f)) },
  };

  // Appointments: every visit of the period by its own day, cancelled ones too.
  const visits: ApptVisit[] = data.visits.filter(v => { const t = new Date(v.start).getTime(); return t >= range[0] && t <= range[1]; }).map(v => {
    const at = new Date(v.start), c = data.customers.find(x => x.id === v.customerId);
    const outcome = v.state === "cancelled" ? "Cancelled" : v.state === "no_show" ? "No show"
      : v.state === "attended" ? (v.outcome === "won" ? "Won" : v.outcome === "lost" ? "Lost" : v.outcome === "follow_up" ? "Follow up" : "Showed up")
        : at <= now ? "To mark" : "Upcoming";
    return { at, outcome, room: data.rooms.find(r => r.id === v.showroomId)?.name ?? "Showroom", rep: c?.assignedTo ? nameOf(c.assignedTo) : "No one yet" };
  });
  const ar = appointmentsReport(visits), af = ar.figures;
  const appt = {
    tiles: [["Booked", String(af.booked)], ["Upcoming", String(af.upcoming)], ["Showed up", String(af.showed)], ["No show", String(af.noShow)], ["To mark", String(af.toMark)], ["Cancelled", String(af.cancelled)], ["Show-up rate", pctLabel(af.showRate)]]
      .map(([k, v]) => ({ k, v })),
    cards: [card("By outcome", ar.byOutcome), card("By showroom", ar.byRoom), card("By salesperson", ar.byRep), card("By weekday", ar.byDow), card("By time", ar.byTime)],
  };

  // Lead sources & status: the inbox's own status names (a wait is Attention, a shut window Cold leads).
  const st = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const srcR = sourcesReport(data.customers, range, c => st.get(c.id) ?? "New", c => CHANNEL[c.channel].name), sf = srcR.figures;
  const src = {
    tiles: [["Leads", String(sf.leads)], ["From ads", `${sf.fromAds} · ${pctLabel(sf.leads ? sf.fromAds / sf.leads : null)}`], ["Won", `${sf.won} · ${pctLabel(sf.leads ? sf.won / sf.leads : null)}`], ["Lost", `${sf.lost} · ${pctLabel(sf.leads ? sf.lost / sf.leads : null)}`]]
      .map(([k, v]) => ({ k, v })),
    cards: [card("By status", srcR.byStatus), card("By channel", srcR.byChannel), card("By ad", srcR.byAd), card("Why they were lost", srcR.lostWhy), card("By property type", srcR.byType)],
  };

  const csv = () => {
    const perL = RP_PERIODS.find(p => p[0] === per)![1];
    const table: string[][] = cat === "sales" ? [["Salesperson", "Team", ...SALES_COLS.map(c => c[1])], ...sales.rows.map(r => [r.name, r.team, ...r.cells]), [sales.total.name, "", ...sales.total.cells]]
      : (cat === "appt" ? appt : src).cards.flatMap(c => [[c.title, "Count", "Share"], ...c.rows.map(r => [r.label, String(r.n), r.pct]), []]);
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([table.map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `${RP_CATS.find(c => c[0] === cat)![1]} ${perL}.csv`.replace(/[^\w &.-]+/g, "");
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  return {
    kReports: ui.tab === "reports",
    reports: {
      cat, cats: RP_CATS.map(([k, label]) => ({ label, on: k === cat, pick: () => patch({ rpCat: k }) })),
      periods: RP_PERIODS.map(([k, label]) => ({ label, on: k === per, pick: () => patch({ rpPer: k }) })),
      sales, appt, src, csv, canCsv: cat === "sales" || cat === "appt" || cat === "src",
      openAds: () => patch({ tab: "adsperf" }),
    },
  };
}
