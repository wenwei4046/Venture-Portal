/**
 * Reports' page (2026-10-23; vm/reports.ts holds the arithmetic). v4 D6a (docs/design_handoff_crm_redesign_v4, notes/25):
 * the title and three tabs on one row — Overview · Ads performance · Appointments & show-ups (Lead sources & status is
 * gone: its counts are Overview's optional columns) — then one filter row: the brand (the CRM's own, as the Inbox's), the
 * period (Today · This week · This month · Custom, Last month and All time among Custom's presets) with its dates in grey,
 * the ad, and Group by Ad · Salesperson. Overview's ads start folded; an ad opens to its people (top 6, "+N more"); a
 * person opens a 420 px side panel of their leads in plain sentences, needs-a-reply first; a customer opens their log (the
 * D4b timeline). Columns adds Spend, Per lead, Won rate, each status and Channel, remembered per user on the server.
 */
import type { DeskCtx } from "./ctx";
import { INSIGHT_SOURCES } from "./insight";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { DEFAULT_CRM_SETTINGS } from "@/lib/member/crm-data";
import { initials, chatRows } from "./data";
import { STATUS_LABEL } from "../../sales/vm/common";
import { fmt } from "../../shared/team-activity";
import { auditWhen, type AuditLine } from "../../shared/audit-timeline";
import { customerLog } from "../../shared/customer-audit";
import { alertsUnreadN } from "./inbox";
import { rangeLine } from "./frame4a";
import { isoOf } from "./adsperf";
import {
  overviewReport, appointmentsReport, pctLabel, periodRange, RP_PERIODS, waitLabel, replyState, needsReply, waitWords, readReportCols, reportColumns,
  RP_PICKS, colValue, sortByCol, type ApptVisit, type Part, type OverviewFigs, type OverviewPerson, type RpColKey, type ReplyKind,
} from "./reports";

export type RpCat = "overview" | "ads" | "lba" | "sales" | "appt" | "src";
// Overview first and where Reports opens (the owner, 2026-11-09). v4 D6a: three tabs; Lead sources & status merged into
// Overview's Columns, Salespeople and Leads by ad into Overview's Group by (2026-11-09).
export const RP_CATS: [RpCat, string][] = [["overview", "Overview"], ["ads", "Ads performance"], ["appt", "Appointments & show-ups"]];

/** The plain sentence a customer's row says in the side panel, and its colour. */
export function replySentence(k: ReplyKind, since: number, visitAt: string | null, now: Date, status: string): { text: string; tone: "oxblood" | "muted" | "green" } {
  const ago = waitWords(now.getTime() - since);
  if (k === "never") return { text: `Never replied · ${ago}`, tone: "oxblood" };
  if (k === "ours") return { text: `Needs our reply · ${ago}`, tone: "oxblood" };
  if (k === "theirs") return { text: `Customer hasn't replied · ${ago}`, tone: "muted" };
  if (k === "visit" && visitAt) {
    const d = new Date(visitAt);
    return { text: `Visit booked · ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).replace(",", "")}`, tone: "green" };
  }
  return { text: status, tone: status === "Won" ? "green" : "muted" };
}

export function reportsVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now, nameOf } = ctx;
  const cat: RpCat = ui.rpCat && RP_CATS.some(c => c[0] === ui.rpCat) ? ui.rpCat : "overview";
  const per = ui.rpPer && (RP_PERIODS.some(p => p[0] === ui.rpPer) || ui.rpPer === "last" || ui.rpPer === "all") ? ui.rpPer : "month";
  const range: [number, number] = per === "custom" && ui.rpRange ? [ui.rpRange.a, ui.rpRange.b] : periodRange(per, now);
  // v2 (frame 12b, note 05): each mini card has its stacked bar and a colour a row — the status ramp, else the series.
  const SERIES = ["var(--crm-ink)", "var(--crm-orange)", "var(--crm-brown)", "var(--crm-amber)", "var(--crm-series-5)", "var(--crm-series-7)", "var(--crm-track-2)"];
  const card = (title: string, rows: Part[], palette: string[] = SERIES) => ({ title, total: rows.reduce((n, r) => n + r.n, 0),
    rows: rows.map((r, i) => ({ ...r, pct: pctLabel(r.share), w: Math.round(r.share * 100), color: palette[i % palette.length] })) });

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

  // ── Overview (D6a) ──
  // The status words the Inbox uses (a wait is Attention, a shut window Cold leads).
  const stOf = new Map(chatRows(ctx).map(r => [r.id, ["Overdue", "Urgent", "Reply soon"].includes(r.key) ? "Attention" : r.key === "Cold" ? "Cold leads" : r.key]));
  const statusOf = (c: CrmCustomer) => stOf.get(c.id) ?? "New";
  // The brand is the CRM's own (ui.insSrc, the Inbox's and Insight's — DeskScreens keeps every page to it).
  const brand = ui.insSrc ?? "all";
  const brands = INSIGHT_SOURCES.map(([k, label]) => ({ label: k === "all" ? "All brands" : label, on: brand === k, pick: () => patch({ insSrc: k, rpAd: "all", rpPick: null, rpLead: null }) }));
  const adNm = (c: { adId?: string | null; ad: string }) => (c.adId && data.adNames?.[c.adId]?.name) || c.ad || `Ad ${c.adId}`;
  const allAds = overviewReport(data.customers, range, adNm, nameOf, statusOf, data.visits, "all", now).byAd;
  const rpAd = ui.rpAd && allAds.some(a => a.key === ui.rpAd) ? ui.rpAd : "all";
  const ov = overviewReport(data.customers, range, adNm, nameOf, statusOf, data.visits, rpAd, now);
  const by = ui.rpOvBy ?? "ad";
  const picks = readReportCols(data.uiPrefs?.reportCols);
  const cols = reportColumns(picks);
  const sort = ui.rpSort && cols.some(c => c[0] === ui.rpSort!.k) ? ui.rpSort as { k: RpColKey; dir: "asc" | "desc" } : { k: "leads" as RpColKey, dir: "desc" as const };
  const lateMin = (data.settings ?? DEFAULT_CRM_SETTINGS).replyUrgentH * 60;
  // Spend: Meta's figure for the ad over this period, when Ads performance has read it (ui.apMeta, keyed "from|to").
  const rkey = `${isoOf(Math.max(range[0], 0))}|${isoOf(Math.min(range[1], now.getTime()))}`;
  const spendOf = (key: string): number | null => { const f = ui.apMeta?.[rkey]?.[key]; return f ? f.spend : null; };
  const cell = (f: OverviewFigs, k: RpColKey, spend: number | null) => {
    const v = colValue(f, k, spend);
    const text = v == null ? "—" : k === "avg" ? fmt(v) : k === "spend" ? `RM ${Math.round(v).toLocaleString("en-MY")}` : k === "perLead" ? `RM ${v.toFixed(2)}` : k === "wonRate" ? pctLabel(v) : String(v);
    return { k, text, grey: v == null || v === 0, late: k === "avg" && v != null && v >= lateMin };
  };
  const cellsOf = (f: OverviewFigs, spend: number | null) => cols.map(([k]) => cell(f, k, spend));
  const pickPerson = (ad: string, id: string) => () => patch({ rpPick: ui.rpPick === id && (ui.rpPickAd ?? "all") === ad ? null : id, rpPickAd: ad, rpLead: null });
  const personRow = (p: OverviewPerson, ad: string) => ({ key: p.id || "none", name: p.name, none: !p.id, need: p.need ? `${p.need} need${p.need === 1 ? "s" : ""} a reply` : "",
    on: !!p.id && ui.rpPick === p.id && (ui.rpPickAd ?? "all") === ad, cells: cellsOf(p, null), pick: p.id ? pickPerson(ad, p.id) : null, v: (k: RpColKey) => colValue(p, k, null) });
  const ads = sortByCol(ov.byAd.map(a => ({ ...a, v: (k: RpColKey) => colValue(a, k, spendOf(a.key)) })), sort.k, sort.dir).map(a => ({
    key: a.key, name: a.name, wa: a.channel === "whatsapp", cells: cellsOf(a, spendOf(a.key)),
    people: sortByCol(a.people.map(p => personRow(p, a.key)), sort.k, sort.dir),
  }));
  const people = sortByCol(ov.byRep.map(p => personRow(p, "all")), sort.k, sort.dir);
  const leadsN = ov.byRep.reduce((n, p) => n + p.n, 0);

  // The person picked: their leads (from the ad opened, or every ad when grouped by salesperson) in the side panel.
  const pickAd = ui.rpPickAd ?? "all";
  const src = ui.rpPick ? (pickAd === "all" ? ov.byRep : ov.byAd.find(a => a.key === pickAd)?.people ?? []).find(p => p.id === ui.rpPick) : undefined;
  const close = () => patch({ rpPick: null, rpPickAd: null, rpLead: null });
  const openChat = (id: string) => patch({ tab: "inbox", pane: "docked", kind: "chat", chat: id, ibListW: null, ibInfoW: null, ibCpW: null, ibCp: null });
  const dm = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" });
  const panel = src ? (() => {
    const rows = src.customers.map(x => { const s = replyState(x.c, data.visits, now); return { x, s }; })
      .sort((a, b) => Number(needsReply(b.s.kind)) - Number(needsReply(a.s.kind)) || (needsReply(a.s.kind) ? a.s.since - b.s.since : b.x.c.createdAt.localeCompare(a.x.c.createdAt)));
    const lead = ui.rpLead ? src.customers.find(x => x.id === ui.rpLead) : undefined;
    return {
      name: src.name, sub: pickAd === "all" ? (rpAd === "all" ? "All ads" : ov.byAd[0]?.name ?? "") : ov.byAd.find(a => a.key === pickAd)?.name ?? "",
      facts: [{ k: "Leads", v: String(src.n), hot: false }, { k: "Avg reply", v: fmt(src.avgMin), hot: false }, { k: "Need a reply", v: String(src.need), hot: src.need > 0 }],
      customers: rows.map(({ x, s }) => ({ id: x.id, name: x.name, got: `Got ${dm(x.c.createdAt)}`, ...replySentence(s.kind, s.since, s.visitAt, now, STATUS_LABEL[x.c.status]), status: STATUS_LABEL[x.c.status], open: () => patch({ rpLead: x.id }) })),
      close,
      // A customer opened: their log as D4b draws it — the facts, the timeline (newest at the bottom), Open chat.
      lead: lead ? (() => {
        const c = lead.c, firstOurs = c.messages.find(m => m.from === "me" && !m.auto), firstLead = c.messages.find(m => m.from === "lead");
        const s = replyState(c, data.visits, now);
        const firstReply = firstOurs && firstLead ? fmt((new Date(firstOurs.at).getTime() - new Date(firstLead.at).getTime()) / 60_000) : s.kind === "never" ? `waiting ${fmt((now.getTime() - s.since) / 60_000)}` : "—";
        // ONE log per customer (the owner, 2026-11-10) — the same lines as the chat's Audit log and Team activity's drawer.
        const lines: AuditLine[] = customerLog({ data, customer: c, nameOf, now });
        return { id: c.id, name: c.name, ini: initials(c.name), ad: lead.ad,
          facts: [{ k: "Got", v: `${dm(c.createdAt)}, ${auditWhen(c.createdAt).time}` }, { k: "First reply", v: firstReply }, { k: "Now with", v: c.assignedTo ? nameOf(c.assignedTo) : "Nobody yet" }],
          lines, back: () => patch({ rpLead: null }), openChat: () => openChat(c.id) };
      })() : null,
    };
  })() : null;

  const overview = {
    brands, brandLabel: brands.find(b => b.on)?.label ?? "All brands",
    rangeText: rangeLine({ a: Number.isFinite(range[0]) ? range[0] : now.getTime(), b: Math.min(range[1], now.getTime()) }),
    adOn: rpAd !== "all", adLabel: rpAd === "all" ? "All ads" : allAds.find(a => a.key === rpAd)?.name ?? "All ads",
    adOpts: [{ value: "all", label: "All ads", n: allAds.reduce((n, a) => n + a.n, 0) }, ...allAds.map(a => ({ value: a.key, label: a.name, n: a.n }))],
    adVal: rpAd, setAd: (v: string) => patch({ rpAd: v, rpPick: null, rpLead: null }),
    by, bys: ([["ad", "Ad"], ["rep", "Salesperson"]] as const).map(([k, label]) => ({ label, on: by === k, pick: () => patch({ rpOvBy: k, rpPick: null, rpLead: null }) })),
    title: by === "ad" ? "By ad" : "By salesperson",
    count: by === "ad" ? `${ov.byAd.length} ad${ov.byAd.length === 1 ? "" : "s"} · ${leadsN} lead${leadsN === 1 ? "" : "s"}` : `${ov.byRep.filter(p => p.id).length} people · ${leadsN} lead${leadsN === 1 ? "" : "s"}`,
    heads: cols.map(([k, label, w]) => ({ k, label, w, on: sort.k === k, arrow: sort.k === k ? (sort.dir === "desc" ? " ↓" : " ↑") : "",
      pick: () => set(u => ({ ...u, rpSort: !u.rpSort || u.rpSort.k !== k ? { k, dir: "desc" } : u.rpSort.dir === "desc" ? { k, dir: "asc" } : null })) })),
    ads, people, panel,
    // Columns (notes/25): the picker's choices, ticked or not; each tick saved for this user on the server.
    picker: RP_PICKS.map(([k, label]) => ({ k, label, on: picks.includes(k), group: k.startsWith("st:") ? "Statuses" : k === "channel" ? "Channel" : "Figures",
      toggle: () => ctx.deskAct.saveUiPref("reportCols", picks.includes(k) ? picks.filter(x => x !== k) : RP_PICKS.map(p => p[0]).filter(x => x === k || picks.includes(x))) })),
  };

  const csv = () => {
    const perL = per === "custom" ? overview.rangeText : RP_PERIODS.find(p => p[0] === per)?.[1] ?? "";
    const table: string[][] = cat === "overview" ? [["Ad", "Salesperson", "Customer", "Status", "Average reply"],
      ...ov.byRep.flatMap(p => p.customers.map(x => [x.ad, p.name, x.name, x.status, waitLabel(x.avgMin)]))]
      : appt.cards.flatMap(c => [[c.title, "Count", "Share"], ...c.rows.map(r => [r.label, String(r.n), r.pct]), []]);
    const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([table.map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `${RP_CATS.find(c => c[0] === cat)![1]} ${perL}.csv`.replace(/[^\w &.-]+/g, "");
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const alertsN = alertsUnreadN(ctx);
  return {
    kReports: ui.tab === "reports" || ui.tab === "workspace",
    reports: {
      cat, cats: RP_CATS.map(([k, label]) => ({ label, on: k === cat, pick: () => patch({ rpCat: k, rpPick: null, rpLead: null }) })),
      periods: RP_PERIODS.map(([k, label]) => ({ label, on: k === per || (k === "custom" && (per === "last" || per === "all")), pick: () => patch(k === "custom" ? { rpDates: true } : { rpPer: k, rpDates: false }) })),
      // Custom's calendar: dates can be picked, Last month and All time are its presets (allFrom = the first lead).
      picker: ui.rpDates ? { value: { a: Number.isFinite(range[0]) ? range[0] : now.getTime(), b: Math.min(range[1], now.getTime()) },
        allFrom: data.customers.reduce((m, c) => Math.min(m, new Date(c.createdAt).getTime() || m), now.getTime()),
        apply: (r: { a: number; b: number }) => patch({ rpPer: "custom", rpRange: r, rpDates: false }), cancel: () => patch({ rpDates: false }) } : null,
      appt, overview, csv, canCsv: cat === "overview" || cat === "appt",
      alertsN: alertsN ? String(alertsN) : "", openAlerts: () => patch({ pane: "overlay", kind: "alerts" }),
      openAds: () => patch({ tab: "insight", insTab: "ads", pane: "closed" }),
    },
  };
}
