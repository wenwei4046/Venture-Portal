/**
 * Reports' page (2026-10-23; vm/reports.ts holds the arithmetic): the category in the head's tabs — Ads performance and
 * Leads by ad as their own pages draw them, Salespeople, Appointments & show-ups and Lead sources & status — a period
 * for the last three, and Export CSV of the category on screen.
 */
import type { DeskCtx } from "./ctx";
import { adStatusOf } from "@/lib/member/crm-ad-running";
import { lbaStatus } from "./leads-by-ad";
import { panelLeads } from "./lead-panel";
import { initials } from "./data";
import { DIRECTOR_C, DIRECTOR_SPLIT_KEY, DIRECTOR_TEAM, teamColours } from "./tokens";
import { chatRows, teamNameOf } from "./data";
import { CHANNEL } from "../../sales/vm/common";
import { overviewReport, appointmentsReport, pctLabel, periodRange, RP_PERIODS, salespeopleReport, sourcesReport, waitLabel, type ApptVisit, type Part, type SalesRow } from "./reports";

export type RpCat = "overview" | "ads" | "lba" | "sales" | "appt" | "src";
// Overview first and where Reports opens (the owner, 2026-11-09: "在 reports 中能不能整合一个总报告").
// The owner, 2026-11-09 ("salesperson & leads by ad & overview 是不是可以结合" → "One report, two views"): Overview is the one
// report for leads, salespeople and ads — Salespeople and Leads by ad left Reports' tabs (Leads by ad stays in Assignment).
export const RP_CATS: [RpCat, string][] = [["overview", "Overview"], ["ads", "Ads performance"], ["appt", "Appointments & show-ups"], ["src", "Lead sources & status"]];

const SALES_COLS: [keyof SalesRow, string, "n" | "pct" | "wait"][] = [["leads", "Leads", "n"], ["replyRate", "Replied", "pct"], ["firstReplyMin", "First reply", "wait"], ["appt", "Appts", "n"],
  ["apptRate", "Appt rate", "pct"], ["showed", "Showed up", "n"], ["showRate", "Show-up", "pct"], ["won", "Won", "n"], ["winRate", "Win rate", "pct"], ["lost", "Lost", "n"]];

export function reportsVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now, nameOf } = ctx;
  const cat: RpCat = ui.rpCat && RP_CATS.some(c => c[0] === ui.rpCat) ? ui.rpCat : "overview", per = ui.rpPer ?? "month", range: [number, number] = per === "custom" && ui.rpRange ? [ui.rpRange.a, ui.rpRange.b] : periodRange(per, now);
  // v2 (frame 12b, note 05): each mini card has its stacked bar and a colour a row — the status ramp, the channels' own,
  // else the CRM series in order.
  const SERIES = ["var(--crm-ink)", "var(--crm-orange)", "var(--crm-brown)", "var(--crm-amber)", "var(--crm-series-5)", "var(--crm-series-7)", "var(--crm-track-2)"];
  const NAMED: Record<string, string> = { New: "var(--crm-ink)", Attention: "var(--crm-orange)", "Follow up": "var(--crm-brown)", Appointment: "var(--crm-amber)", Won: "var(--crm-series-5)", Lost: "var(--crm-series-7)", "Cold leads": "var(--crm-track-2)",
    WhatsApp: "var(--crm-whatsapp)", Messenger: "var(--crm-messenger)", "Not filled yet": "var(--crm-track-2)", "Not given": "var(--crm-track-2)" };
  const card = (title: string, rows: Part[], palette: string[] = SERIES) => ({ title, total: rows.reduce((n, r) => n + r.n, 0),
    rows: rows.map((r, i) => ({ ...r, pct: pctLabel(r.share), w: Math.round(r.share * 100), color: NAMED[r.label] ?? palette[i % palette.length] })) });

  // Salespeople: sortable by any figure (▼ first), the team's name under each person.
  const sr = salespeopleReport(data.customers, data.visits, range, nameOf, id => teamNameOf(ctx, id));
  const so = ui.rpSort;
  const val = (r: SalesRow, k: keyof SalesRow) => (k === "name" ? r.name : (r[k] as number | null) ?? -1);
  const rows = so ? [...sr.rows].sort((a, b) => { const x = val(a, so.k as keyof SalesRow), y = val(b, so.k as keyof SalesRow);
    const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y); return so.dir === "asc" ? c : -c; }) : sr.rows;
  const cell = (r: SalesRow, k: keyof SalesRow, f: "n" | "pct" | "wait") => (f === "pct" ? pctLabel(r[k] as number | null) : f === "wait" ? waitLabel(r[k] as number | null) : String(r[k]));
  // v2 (frame 12c): the team filter (All teams, the Director, each team — a dot each), a search, each person's avatar and
  // team dot, count · rate pairs, First reply over 4 h in red; a person opens the panel of their leads (12c·2).
  const teamOfId = (id: string) => ctx.directors.some(d => d.id === id) ? { id: DIRECTOR_SPLIT_KEY, name: DIRECTOR_TEAM, color: DIRECTOR_C[0] }
    : (() => { const k = ctx.teams.findIndex(t => t.id === id || t.people.some(p => p.id === id)); return k < 0 ? null : { id: ctx.teams[k].id, name: ctx.teams[k].name, color: teamColours(k)[0] }; })();
  const rpTeam = ui.rpTeam ?? "all", rpQ = (ui.rpQ ?? "").trim().toLowerCase();
  const fRows = rows.filter(r => (rpTeam === "all" || (r.id && teamOfId(r.id)?.id === rpTeam)) && (!rpQ || r.name.toLowerCase().includes(rpQ)));
  const pickR = ui.rpPick ? sr.rows.find(r => r.id === ui.rpPick) : undefined;
  const leadIds = (id: string) => data.customers.filter(c => c.assignedTo === id && (() => { const t = new Date(c.createdAt).getTime(); return t >= range[0] && t <= range[1]; })()).map(c => c.id);
  const perWord = RP_PERIODS.find(p => p[0] === per)?.[1] ?? "";
  const sales2 = {
    teams: [{ id: "all", label: "All teams", dot: null as string | null }, ...(ctx.directors.length ? [{ id: DIRECTOR_SPLIT_KEY, label: "Director", dot: DIRECTOR_C[0] as string | null }] : []),
      ...ctx.teams.map((t, k) => ({ id: t.id, label: t.name.replace(/^Team /, ""), dot: teamColours(k)[0] as string | null }))].map(t => ({ ...t, on: rpTeam === t.id, pick: () => patch({ rpTeam: t.id }) })),
    q: ui.rpQ ?? "", setQ: (e: { target: { value: string } }) => patch({ rpQ: e.target.value }),
    count: `${fRows.filter(r => r.id).length} people · ${fRows.reduce((n, r) => n + r.leads, 0)} leads`,
    people: fRows.map(r => { const tm = r.id ? teamOfId(r.id) : null;
      return { id: r.id, name: r.name, ini: r.id ? initials(r.name) : "–", team: tm?.name ?? r.team, dot: tm?.color ?? "var(--crm-faint-2)", none: !r.id, on: !!r.id && ui.rpPick === r.id,
        leads: r.leads, replied: pctLabel(r.replyRate), first: waitLabel(r.firstReplyMin), late: (r.firstReplyMin ?? 0) > 240,
        appt: [r.appt, pctLabel(r.apptRate)] as [number, string], show: [r.showed, pctLabel(r.showRate)] as [number, string], won: [r.won, pctLabel(r.winRate)] as [number, string], lost: r.lost,
        pick: () => { if (r.id) patch({ rpPick: ui.rpPick === r.id ? null : r.id, rpLead: null }); } }; }),
    total: { leads: sr.total.leads, replied: pctLabel(sr.total.replyRate), first: waitLabel(sr.total.firstReplyMin), appt: [sr.total.appt, pctLabel(sr.total.apptRate)] as [number, string],
      show: [sr.total.showed, pctLabel(sr.total.showRate)] as [number, string], won: [sr.total.won, pctLabel(sr.total.winRate)] as [number, string], lost: sr.total.lost },
    sort: (k: keyof SalesRow) => ({ on: so?.k === k, dir: so?.dir ?? "desc", pick: () => set(u => ({ ...u, rpSort: !u.rpSort || u.rpSort.k !== k ? { k, dir: "desc" } : u.rpSort.dir === "desc" ? { k, dir: "asc" } : null })) }),
    panel: pickR && pickR.id ? (() => { const tm = teamOfId(pickR.id), ids = leadIds(pickR.id);
      return { name: pickR.name, ini: initials(pickR.name), team: tm?.name ?? pickR.team, teamDot: tm?.color ?? "var(--crm-faint-2)", n: ids.length, line: `· ${perWord} · all ads`,
        shut: !!ui.rpPickShut, fold: () => patch({ rpPickShut: true }), unfold: () => patch({ rpPickShut: false }), close: () => patch({ rpPick: null, rpLead: null }),
        rail: `${pickR.name} · ${ids.length} lead${ids.length === 1 ? "" : "s"}`, leads: panelLeads(ctx, ids, ui.rpLead, id => patch({ rpLead: id })) }; })() : null,
  };
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
    return { at, outcome, room: data.rooms.find(r => r.id === v.showroomId)?.name ?? "Showroom", rep: c?.assignedTo ? nameOf(c.assignedTo) : "No one yet", who: v.customerId };
  });
  const ar = appointmentsReport(visits), af = ar.figures;
  const appt = {
    tiles: [["Booked", String(af.booked)], ["Upcoming", String(af.upcoming)], ["Showed up", String(af.showed)], ["No show", String(af.noShow)], ["To mark", String(af.toMark)], ["Cancelled", String(af.cancelled)], ["Show-up rate", pctLabel(af.showRate)]]
      .map(([k, v]) => ({ k, v, pct: "" })),
    cards: [card("By outcome", ar.byOutcome), card("By showroom", ar.byRoom), card("By salesperson", ar.byRep), card("By weekday", ar.byDow), card("By time", ar.byTime)],
  };

  // Lead sources & status: the inbox's own status names (a wait is Attention, a shut window Cold leads).
  const st = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const srcR = sourcesReport(data.customers, range, c => st.get(c.id) ?? "New", c => CHANNEL[c.channel].name), sf = srcR.figures;
  const src = {
    tiles: [["Leads", String(sf.leads), ""], ["From ads", String(sf.fromAds), pctLabel(sf.leads ? sf.fromAds / sf.leads : null)], ["Won", String(sf.won), pctLabel(sf.leads ? sf.won / sf.leads : null)], ["Lost", String(sf.lost), pctLabel(sf.leads ? sf.lost / sf.leads : null)]]
      .map(([k, v, pct]) => ({ k, v, pct })),
    // v2 (12b): By ad is a full-width table (channel, status, leads, share); the mini cards are status, channel, property type, why lost.
    cards: [card("By status", srcR.byStatus), card("By source", srcR.bySource), card("By property type", srcR.byType, ["var(--crm-brown)", "var(--crm-series-5)", "var(--crm-series-7)", "var(--crm-amber)"]),
      card("Why they were lost", srcR.lostWhy, ["var(--crm-oxblood)", "var(--crm-rust)", "var(--crm-series-5)", "var(--crm-series-7)"])],
    ads: (() => {
      const inR = data.customers.filter(c => { const t = new Date(c.createdAt).getTime(); return c.adId && t >= range[0] && t <= range[1]; });
      const by = new Map<string, typeof inR>(); inR.forEach(c => by.set(c.adId!, [...(by.get(c.adId!) ?? []), c]));
      const rows = [...by].map(([id, cs]) => ({ id, name: cs[0].ad || data.adNames?.[id]?.name || `Ad ${id}`, n: cs.length, wa: cs.some(c => c.channel === "whatsapp"),
        status: lbaStatus(data.adNames?.[id], adStatusOf(data.adNames?.[id], data.customers.filter(c => c.adId === id).map(c => c.createdAt).sort().at(-1) ?? null, now), now) }))
        .sort((a, b) => b.n - a.n);
      const max = Math.max(1, ...rows.map(r => r.n)), tot = inR.length;
      const PILL: Record<string, [string, string]> = { Running: ["var(--crm-tint-new)", "var(--crm-ink)"], Paused: ["var(--crm-tint-appt)", "var(--crm-text-appt)"], Ended: ["var(--crm-tint-lost)", "var(--crm-muted)"], Pending: ["var(--crm-field)", "var(--crm-muted)"] };
      return { count: `${rows.length} ad${rows.length === 1 ? "" : "s"} · ${tot} leads`, rows: rows.map(r => ({ ...r, channel: r.wa ? "WhatsApp" : "Messenger", pct: pctLabel(tot ? r.n / tot : null), w: Math.round((r.n / max) * 100), stBg: PILL[r.status][0], stFg: PILL[r.status][1] })) };
    })(),
  };

  // Overview: each ad → who has its leads (leads, average reply) → each customer (status, average reply, ad, Open chat).
  const stOf = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const adNm = (c: { adId?: string | null; ad: string }) => (c.adId && data.adNames?.[c.adId]?.name) || c.ad || `Ad ${c.adId}`;
  const allAds = overviewReport(data.customers, range, adNm, nameOf, c => stOf.get(c.id) ?? "New", data.visits).byAd;
  const rpAd = ui.rpAd && allAds.some(a => a.key === ui.rpAd) ? ui.rpAd : "all";
  const ov = overviewReport(data.customers, range, adNm, nameOf, c => stOf.get(c.id) ?? "New", data.visits, rpAd);
  const by = ui.rpOvBy ?? "ad";
  const openChat = (id: string) => () => patch({ tab: "inbox", pane: "docked", kind: "chat", chat: id, ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null });
  const figs = (x: { n: number; avgMin: number | null; appt: number; show: number; won: number; lost: number }) => ({ cells: [String(x.n), waitLabel(x.avgMin), String(x.appt), String(x.show), String(x.won), String(x.lost)], late: (x.avgMin ?? 0) > 240 });
  const person = (p: (typeof ov.byRep)[number]) => ({ key: p.id, name: p.name, ...figs(p), customers: p.customers.map(x => ({ ...x, avg: waitLabel(x.avgMin), open: openChat(x.id) })) });
  const leadsN = ov.byRep.reduce((n, p) => n + p.n, 0);
  const overview = {
    by, bys: ([["ad", "By ad"], ["rep", "By salesperson"]] as const).map(([k, label]) => ({ label, on: by === k, pick: () => patch({ rpOvBy: k }) })),
    count: by === "ad" ? `${ov.byAd.length} ad${ov.byAd.length === 1 ? "" : "s"} · ${leadsN} leads` : `${ov.byRep.filter(p => p.id).length} people · ${leadsN} leads`,
    adOpts: [{ value: "all", label: `All ads · ${allAds.reduce((n, a) => n + a.n, 0)}` }, ...allAds.map(a => ({ value: a.key, label: `${a.name} · ${a.n}` }))],
    adVal: rpAd, setAd: (e: { target: { value: string } }) => patch({ rpAd: e.target.value }),
    groups: by === "ad" ? ov.byAd.map(a => ({ key: a.key, name: a.name, ...figs(a), people: a.people.map(person) }))
      : [{ key: "rep", name: "", ...figs({ n: 0, avgMin: null, appt: 0, show: 0, won: 0, lost: 0 }), people: ov.byRep.map(person) }],
  };

  const csv = () => {
    const perL = RP_PERIODS.find(p => p[0] === per)![1];
    const table: string[][] = cat === "overview" ? [["Ad", "Salesperson", "Customer", "Status", "Average reply"],
      ...ov.byRep.flatMap(p => p.customers.map(x => [x.ad, p.name, x.name, x.status, waitLabel(x.avgMin)]))]
      : cat === "sales" ? [["Salesperson", "Team", ...SALES_COLS.map(c => c[1])], ...sales.rows.map(r => [r.name, r.team, ...r.cells]), [sales.total.name, "", ...sales.total.cells]]
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
      periods: RP_PERIODS.map(([k, label]) => ({ label, on: k === per, pick: () => patch(k === "custom" ? { rpPer: k, rpDates: true } : { rpPer: k, rpDates: false }) })),
      picker: ui.rpDates ? { value: ui.rpRange ?? { a: range[0], b: range[1] }, apply: (r: { a: number; b: number }) => patch({ rpPer: "custom", rpRange: r, rpDates: false }), cancel: () => patch({ rpDates: false }) } : null,
      sales, sales2, appt, src, overview, csv, canCsv: cat === "overview" || cat === "sales" || cat === "appt" || cat === "src",
      openAds: () => patch({ tab: "adsperf" }),
    },
  };
}
