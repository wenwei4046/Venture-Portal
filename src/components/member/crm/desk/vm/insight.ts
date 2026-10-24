/**
 * Insight (CRM Desktop rev 1, B1–B6): the orange hero (appt rate, leads, show-up, reply within 24 h — every figure
 * opens its customers), Team performance with won / lost rates (a team opens its people, a person their leads), Leads
 * by status with a total, and the Ads table (Meta's figures "—" until Meta is connected). Numbers are the phone's
 * (panel/vm/common.ts numbersOf) over the chosen period.
 */
import { withoutHiddenAds } from "@/lib/member/crm-data";
import type { CrmCustomer } from "@/lib/member/crm-data";
import { ALL, crmFigures, fmt } from "./adsperf";
import { columnSizer } from "./columns";
import { inRange, numbersOf, pct, periodRange } from "../../panel/vm/common";
import { isCold, urgencyOf } from "../../sales/vm/common";
import type { DeskCtx } from "./ctx";
import { teamLead } from "./names";
import { chatRows, initials, teamNameOf } from "./data";
import { DIRECTOR_C, DIRECTOR_TEAM, ST, ST_META, teamColours } from "./tokens";
import { STATUS } from "../../shared/palette";
import { CHANNEL_COLOUR, CHANNEL_TINT } from "../../shared/palette";
import { rangeLine } from "./frame4a";
import { adsReportParam } from "@/lib/member/crm-ads-report";

export const MON = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** The period Insight shows, as the phone's panel works it out, and its name ("October", "This week"). */
export function insightRange(ctx: DeskCtx) {
  const per = ctx.ui.insPer, r = periodRange(per === "custom" ? "custom" : per, ctx.ui.insRange, ctx.now);
  const name = per === "month" ? MON[ctx.now.getMonth()] : per === "week" ? "This week" : per === "day" ? "Today" : "This period";
  return { r, name };
}

/** Replied within 24 h: the customer's first message answered by us (not an auto-reply) within 24 hours (dev changes B2 / D1). */
export function replied24(c: CrmCustomer): boolean {
  const firstIn = c.messages.find(m => m.from === "lead");
  if (!firstIn) return false;
  const t0 = new Date(firstIn.at).getTime();
  const reply = c.messages.find(m => m.from === "me" && !m.auto && new Date(m.at).getTime() > t0);
  return !!reply && new Date(reply.at).getTime() - t0 <= 24 * 3600_000;
}

/** The period before: a whole month the month before, otherwise the same number of days just before (v2's deltas). */
export function prevRange(r: { a: number; b: number }): { a: number; b: number } {
  const a = new Date(r.a), b = new Date(r.b);
  const wholeMonth = a.getDate() === 1 && new Date(b.getFullYear(), b.getMonth(), b.getDate() + 1).getDate() === 1 && a.getMonth() === b.getMonth();
  if (wholeMonth) return { a: new Date(a.getFullYear(), a.getMonth() - 1, 1).getTime(), b: new Date(a.getFullYear(), a.getMonth(), 0).getTime() };
  const days = Math.round((r.b - r.a) / 86_400_000) + 1;
  return { a: new Date(a.getFullYear(), a.getMonth(), a.getDate() - days).getTime(), b: new Date(a.getFullYear(), a.getMonth(), a.getDate() - 1).getTime() };
}
/** Avg. reply (minutes): each customer message → our next reply (auto-replies don't count), replies made in the range — the phone Insight's rule. */
export function avgReply(customers: CrmCustomer[], r: { a: number; b: number }): number | null {
  const gaps: number[] = [];
  for (const c of customers) {
    let wait: number | null = null;
    for (const m of c.messages) {
      const t = new Date(m.at).getTime();
      if (m.from === "lead" && wait == null) wait = t;
      if (m.from === "me" && !m.auto && wait != null) { if (inRange(m.at, r)) gaps.push((t - wait) / 60_000); wait = null; }
    }
  }
  return gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null;
}
/** Won in the range: customers marked won then (the journey's won event), and what they bought. */
export function wonIn(ctx: Pick<DeskCtx, "data">, r: { a: number; b: number }) {
  const ev = ctx.data.events.filter(e => e.kind === "won" && inRange(e.at, r));
  const ids = [...new Set(ev.map(e => e.customerId))];
  const amount = ids.reduce((s, id) => { const e = ev.filter(x => x.customerId === id).sort((a, b) => b.at.localeCompare(a.at))[0];
    const n = Number(e?.data.amount ?? ctx.data.customers.find(c => c.id === id)?.wonAmount ?? 0); return s + (Number.isFinite(n) ? n : 0); }, 0);
  return { n: ids.length, amount: Math.round(amount), ids };
}

export function insightVM(ctx0: DeskCtx) {
  // An ad hidden from Ads Performance leaves Insight's figures too (2026-10-24).
  const ctx = { ...ctx0, data: withoutHiddenAds(ctx0.data) };
  const { data, now, patch, teams } = ctx;
  const { r, name } = insightRange(ctx);
  const inR = (iso: string) => { const t = new Date(iso); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); return d >= r.a && d <= r.b; };
  const leads = data.customers.filter(c => inR(c.createdAt));
  const n = numbersOf(data.customers, data.visits, r, now);
  const rep24 = leads.filter(replied24).length;
  const openList = (k: string) => () => patch({ pane: "overlay", kind: "clist", clist: k, infoId: null });
  const hero = { label: `Appt rate · ${name}`, value: pct(n.booked, n.leads), sub: `${n.booked} booked of ${n.leads} leads`, open: openList("Booked") };
  // v2's hero: five cells — Leads · Show-up · Reply 24 h · Avg. reply · Won — each with its change against the period
  // before (README › Insight): a whole month against the month before, a week the week before, a day the day before, a
  // custom range the same number of days before it.
  const pr = prevRange(r), pn = numbersOf(data.customers, data.visits, pr, now);
  const prevLeads = data.customers.filter(c => inRange(c.createdAt, pr));
  const vsName = ctx.ui.insPer === "month" ? `vs ${MON[new Date(pr.a).getMonth()].slice(0, 3)}` : ctx.ui.insPer === "week" ? "vs last week" : ctx.ui.insPer === "day" ? "vs yesterday" : "vs before";
  const rate = (a: number, b: number) => (b ? (a / b) * 100 : null);
  const arrow = (d: number) => (d >= 0 ? "↑" : "↓");
  const ptDelta = (a: number | null, b: number | null) => (a == null || b == null ? `— ${vsName}` : `${arrow(a - b)} ${Math.abs(Math.round(a - b))}% ${vsName}`);
  const cntDelta = (a: number, b: number, relative: boolean) => (relative && b ? `${arrow(a - b)} ${Math.abs(Math.round(((a - b) / b) * 100))}% ${vsName}` : !b && !a ? `— ${vsName}` : `${arrow(a - b)} ${Math.abs(a - b)} ${vsName}`);
  const avgNow = avgReply(data.customers, r), avgPrev = avgReply(data.customers, pr);
  const mins = (m: number | null) => (m == null ? "—" : m < 60 ? `${m} m` : `${Math.floor(m / 60)} h ${m % 60} m`);
  const avgDelta = avgNow == null || avgPrev == null ? `— ${vsName}` : avgNow <= avgPrev ? `↓ ${mins(avgPrev - avgNow)} faster` : `↑ ${mins(avgNow - avgPrev)} slower`;
  const wonNow = wonIn(ctx, r), wonPrev = wonIn(ctx, pr);
  const perWord = ctx.ui.insPer === "month" ? "this month" : ctx.ui.insPer === "week" ? "this week" : ctx.ui.insPer === "day" ? "today" : "in this period";
  const heroStats = ([
    ["Leads", String(n.leads), name, "Leads", cntDelta(n.leads, prevLeads.length, true)],
    ["Show-up", pct(n.came, n.due), "Of visits due", "Show-up", ptDelta(rate(n.came, n.due), rate(pn.came, pn.due))],
    ["Reply 24 h", pct(rep24, n.leads), "First reply within 24 h", "Reply 24 h", ptDelta(rate(rep24, n.leads), rate(prevLeads.filter(replied24).length, prevLeads.length))],
    ["Avg. reply", mins(avgNow), "Customer message → first reply", "Leads", avgDelta],
    ["Won", String(wonNow.n), `RM ${wonNow.amount.toLocaleString("en-MY")} ${perWord}`, "Won", cntDelta(wonNow.n, wonPrev.n, false)],
  ] as const).map(([label, value, sub, lk, delta], i) => ({ label, value, sub, delta, open: openList(lk), bl: i ? "1px solid rgba(255,255,255,.28)" : "0", pl: i ? 18 : 0 }));

  // Team performance: the Director's own customers, then each team (dev changes B3: won and lost rates added).
  const rowOf = (ids: string[]) => {
    const cs = data.customers.filter(c => c.assignedTo && ids.includes(c.assignedTo));
    const m = numbersOf(cs, data.visits, r, now), mine = cs.filter(c => inR(c.createdAt));
    const won = mine.filter(c => c.status === "won").length, lost = mine.filter(c => c.status === "lost").length;
    return { leads: String(m.leads), appt: pct(m.booked, m.leads), show: pct(m.came, m.due), won: pct(won, m.leads), lost: pct(lost, m.leads) };
  };
  const dirRows = ctx.directors.length ? [{ name: DIRECTOR_TEAM, lead: ctx.directors.map(d => d.name).join(", "), ...rowOf(ctx.directors.map(d => d.id)), dot: DIRECTOR_C[0],
    open: () => patch({ pane: "overlay", kind: "team", team: DIRECTOR_TEAM, person: null }) }] : [];
  // 4a's hero (frame 01): six figures, each with its change against the period before, worse ones in oxblood.
  const pts = (a: number | null, b: number | null) => (a == null || b == null ? { d: "—", good: true } : { d: `${a - b >= 0 ? "+" : "−"}${Math.abs(Math.round((a - b) * 10) / 10)} pts`, good: a >= b });
  const rel = (a: number, b: number) => (!b ? { d: a ? "+" + a : "—", good: true } : { d: `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%`, good: a >= b });
  const wonRate = (w: number, l: number) => (l ? Math.round((w / l) * 1000) / 10 : null);
  const avgV = avgNow == null ? ["—", ""] : avgNow < 60 ? [String(avgNow), "min"] : [String(Math.round((avgNow / 60) * 10) / 10), "h"];
  const metrics4 = [
    { label: "Appt rate", value: pct(n.booked, n.leads), unit: "", ...pts(rate(n.booked, n.leads), rate(pn.booked, pn.leads)), open: hero.open },
    { label: "Leads", value: String(n.leads), unit: "", ...rel(n.leads, prevLeads.length), open: openList("Leads") },
    { label: "Show-up", value: pct(n.came, n.due), unit: "", ...pts(rate(n.came, n.due), rate(pn.came, pn.due)), open: openList("Show-up") },
    { label: "Reply 24 h", value: pct(rep24, n.leads), unit: "", ...pts(rate(rep24, n.leads), rate(prevLeads.filter(replied24).length, prevLeads.length)), open: openList("Reply 24 h") },
    { label: "Avg. reply", value: avgV[0], unit: avgV[1], ...(avgNow == null || avgPrev == null ? { d: "—", good: true } : { d: `${avgNow <= avgPrev ? "−" : "+"}${Math.abs(avgNow - avgPrev)} min`, good: avgNow <= avgPrev }), open: openList("Leads") },
    { label: "Won", value: wonRate(wonNow.n, n.leads) == null ? "—" : `${wonRate(wonNow.n, n.leads)}%`, unit: "", ...pts(wonRate(wonNow.n, n.leads), wonRate(wonPrev.n, prevLeads.length)), open: openList("Won") },
  ].map((m, i) => ({ ...m, first: i === 0, deltaColor: m.good ? "var(--crm-ink-soft)" : "var(--crm-oxblood)" }));
  const teamsOut = [...dirRows, ...teams.map((t, k) => ({ name: t.name, lead: teamLead(t), ...rowOf(t.people.map(p => p.id)), dot: teamColours(k)[0],
    open: () => patch({ pane: "overlay", kind: "team", team: t.id, person: null }) }))];

  // Leads by status (B4): the chats' own states, with a share and a bar against the biggest.
  const rows = chatRows(ctx).filter(x => inR(x.c.createdAt));
  const cnt = (f: (k: string) => boolean) => rows.filter(x => f(x.key)).length;
  const LS: [string, number, string, string][] = [
    ["New", cnt(k => k === "New"), STATUS.New.dot, "st:New"], ["Attention", cnt(k => k === "Overdue" || k === "Urgent" || k === "Reply soon"), STATUS.Attention.dot, "st:Overdue"],
    ["Appointment", cnt(k => k === "Appointment"), STATUS.Appointment.dot, "st:Appointment"], ["Follow up", cnt(k => k === "Follow up"), STATUS["Follow up"].dot, "st:Follow up"],
    ["Cold leads", cnt(k => k === "Cold"), STATUS["Cold leads"].dot, "st:Cold"],
  ];
  // 4a's Leads by status (frame 01): all seven of the ramp, in its order — Won and Lost joined (the chats' own states).
  const L7: [string, number, string][] = [["New", cnt(k => k === "New"), "st:New"], ["Attention", cnt(k => k === "Overdue" || k === "Urgent" || k === "Reply soon"), "st:Overdue"],
    ["Follow up", cnt(k => k === "Follow up"), "st:Follow up"], ["Appointment", cnt(k => k === "Appointment"), "st:Appointment"], ["Won", cnt(k => k === "Won"), "st:Won"],
    ["Lost", cnt(k => k === "Lost"), "st:Lost"], ["Cold leads", cnt(k => k === "Cold"), "st:Cold"]];
  const tot7 = L7.reduce((a, x) => a + x[1], 0);
  const status4 = L7.map(([label, c, list]) => ({ label, n: c, color: STATUS[label as keyof typeof STATUS].dot, text: label === "Attention" ? "var(--crm-oxblood)" : "var(--crm-ink)",
    pct: tot7 ? `${Math.round((c / tot7) * 100)}%` : "—", open: openList(list) }));
  const max = Math.max(...LS.map(x => x[1]), 1), tot = LS.reduce((a, x) => a + x[1], 0) || 1;
  const leadStatus = LS.map(([label, c, color, list]) => ({ label, n: c, color, share: `${Math.round((c / tot) * 100)}%`, pct: Math.round((c / max) * 100), open: openList(list) }));

  // The Ads table: CRM's own figures per ad; Meta's (spend, reach, clicks) wait for the Meta connection.
  const ads = [...new Set(data.customers.map(c => c.ad))];
  const adPerf = ads.map(ad => {
    const cs = data.customers.filter(c => c.ad === ad), m = numbersOf(cs, data.visits, r, now);
    const ch = cs.some(c => c.channel === "whatsapp") ? "WhatsApp" : "Messenger";
    const st = ST_META.Running;
    return { name: ad, channel: ch, chFg: ch === "WhatsApp" ? CHANNEL_COLOUR.whatsapp : CHANNEL_COLOUR.messenger, status: "—", stDot: "var(--crm-faint-2)", stInk: st[4], spend: "—", reach: "—", clicks: "—", ctr: "—",
      leads: String(m.leads), cpl: "—", cplColor: "var(--crm-ink)", appt: String(m.booked), _n: m.leads };
  }).filter(a => a._n > 0).sort((a, b) => b._n - a._n);
  // Sorted and sized as Ads Performance's table (the owner, 2026-10-13): a header sorts ▼ ▲ off; its edge drags the width.
  const IH: [string, string][] = [["name", "Ad"], ["spend", "Spend (RM)"], ["reach", "Reach"], ["clicks", "Clicks"], ["ctr", "CTR"], ["leads", "Leads"], ["cpl", "Cost / lead (RM)"], ["appt", "Appt"]];
  const srt = ctx.ui.insSort, IW = ctx.ui.insW, sz = columnSizer(ctx.set, "insW");
  const num = (v: string) => (v === "—" ? -Infinity : Number(v.replace(/[^\d.-]/g, "")));
  if (srt) adPerf.sort((x, y) => { const p = x[srt.k as keyof typeof x], q = y[srt.k as keyof typeof y];
    const d = srt.k === "name" ? String(p).localeCompare(String(q)) : num(String(p)) - num(String(q)); return srt.dir === "asc" ? d : -d; });
  const insHead = IH.map(([k, label], i) => { const on = srt?.k === k;
    return { label, align: (i ? "center" : "left") as "center" | "left", justify: i ? "center" : "flex-start", fg: on ? "var(--crm-ink)" : "var(--crm-muted)",
      arrow: on ? (srt?.dir === "asc" ? "▲" : "▼") : "↕", ac: on ? "var(--crm-rust)" : "var(--crm-faint-2)",
      sort: () => ctx.set(u => { const c = u.insSort, first = k === "name" ? "asc" : "desc", second = first === "asc" ? "desc" : "asc";
        return { ...u, insSort: !c || c.k !== k ? { k, dir: first } : c.dir === first ? { k, dir: second } : null }; }),
      resize: sz.resize(k, i ? 64 : 140), unsize: sz.reset(k) }; });
  const insAdCols = [IW.name ? `${IW.name}px` : "minmax(220px, 1.6fr)", ...IH.slice(1).map(([k]) => (IW[k] ? `${IW[k]}px` : "minmax(72px, 1fr)"))].join(" ");
  const insAdMinW = Math.max(820, 40 + (IW.name ?? 220) + IH.slice(1).reduce((n, [k]) => n + (IW[k] ?? 72) + 12, 0));
  const lt = adPerf.reduce((a, x) => a + x._n, 0), at = adPerf.reduce((a, x) => a + Number(x.appt), 0);
  return {
    kInsight: ctx.ui.tab === "insight" && ctx.ui.insTab !== "ads",
    insTabs: ([["team", "Team performance"], ["ads", "Ads performance"]] as const).map(([k, label]) => ({ label, on: (ctx.ui.insTab ?? "team") === k, pick: () => ctx.patch({ insTab: k }) })),
    hero, heroStats, teams: teamsOut, leadStatus,
    // 4a (frame 01): the hero's six figures, the teams with their people (opened in place), all seven statuses.
    metrics4, status4, statusTotal: tot7,
    teams4: (() => {
      const apptN = (s: string) => parseFloat(s) || 0;
      const all = [...dirRows.map(t => ({ ...t, key: DIRECTOR_TEAM, people: ctx.directors })), ...teams.map((t, k) => ({ ...teamsOut[dirRows.length + k], key: t.id, people: t.people }))];
      const max = Math.max(...all.map(t => apptN(t.appt)), 1);
      return all.flatMap(t => {
        const open = ctx.ui.insTeam === t.key;
        const head = { name: t.name, sub: t.lead, leads: t.leads, appt: t.appt, apptW: `${Math.round((apptN(t.appt) / max) * 100)}%`, show: t.show, won: t.won, lost: t.lost,
          dot: t.dot, person: false, open, pick: () => patch({ insTeam: open ? null : t.key }) };
        const people = open ? t.people.map(p => { const f = rowOf([p.id]);
          return { name: p.name, sub: "", ...f, apptW: `${Math.round((apptN(f.appt) / max) * 100)}%`, dot: "transparent", person: true, open: false,
            pick: () => patch({ pane: "overlay", kind: "team", team: t.key, person: p.id }) }; }) : [];
        return [head, ...people];
      });
    })(),
    // 4a's head (2026-10-18): "1–31 Oct vs 1–30 Sep", and Export PDF — the period's figures and Team performance in the
    // Ads Performance report's house style (the owner's OK: "PDF 照你建议做").
    insightSub: `${rangeLine(r)} vs ${rangeLine(pr)}`,
    insightPdf: () => {
      const title = `CRM Insight · ${rangeLine(r)} vs ${rangeLine(pr)} · Appt rate ${hero.value} · ${heroStats.map(s => `${s.label} ${s.value}`).join(" · ")}`;
      const head = ["Team", "Leads", "Appt rate", "Show-up", "Won", "Lost"];
      const body = teamsOut.map(t => [t.name, t.leads, t.appt, t.show, t.won, t.lost]);
      const a = document.createElement("a"); a.href = `/member/crm-ads-report?d=${adsReportParam({ title, head, rows: body })}`; a.download = `CRM Insight ${rangeLine(r)}.pdf`; a.click();
    },
    insHead, insAdCols, insAdMinW,
    adPerf, adTot: { n: adPerf.length, spend: "—", reach: "—", clicks: "—", ctr: "—", leads: String(lt), cpl: "—", appt: String(at) },
    ...adCardsVM(ctx, r, name),
    goAdsPerf: () => patch({ tab: "adsperf", pane: "closed", toast: "" }),
  };
}

/** The customers a figure opens (B1 / B6 / E2): its list, sorted by the chosen order, each to Customer info. */
export function clistVM(ctx: DeskCtx) {
  const { ui, patch, set, data, now } = ctx;
  const key = ui.clist || "Leads";
  const { r, name } = insightRange(ctx);
  const inR = (iso: string) => { const t = new Date(iso); const d = new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime(); return d >= r.a && d <= r.b; };
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const all = chatRows(ctx);
  const stLabel: Record<string, string> = { "st:New": "New", "st:Overdue": "Attention", "st:Appointment": "Appointment", "st:Follow up": "Follow up", "st:Cold": "Cold leads" };
  type Row = { id: string; name: string; ini: string; sub: string; status: string; ord: number; rep: string };
  let rows: Row[];
  if (key.startsWith("st:")) {
    const want = key.slice(3), match = (k: string) => want === "Overdue" ? ["Overdue", "Urgent", "Reply soon"].includes(k) : k === want;
    rows = all.filter(x => inR(x.c.createdAt) && match(x.key)).map((x, i) => ({ id: x.id, name: x.name, ini: x.ini, sub: `${x.ad} · ${x.owner}`, status: x.status, ord: i, rep: x.owner }));
  } else if (key === "Leads" || key === "Booked" || key === "Reply 24 h") {
    const booked = new Set(data.visits.filter(v => v.state !== "cancelled").map(v => v.customerId));
    rows = all.filter(x => inR(x.c.createdAt) && (key !== "Booked" || booked.has(x.id)) && (key !== "Reply 24 h" || replied24(x.c)))
      .map((x, i) => ({ id: x.id, name: x.name, ini: x.ini, sub: `${x.ad} · ${x.owner}`, status: x.status, ord: i, rep: x.owner }));
  } else if (key === "Won") {
    // v2's Won cell: the customers marked won in the period.
    const ids = new Set(wonIn(ctx, r).ids);
    rows = all.filter(x => ids.has(x.id)).map((x, i) => ({ id: x.id, name: x.name, ini: x.ini, sub: `${x.ad} · ${x.owner}`, status: x.status, ord: i, rep: x.owner }));
  } else {
    // Visits: Upcoming, Showed up, Show-up (those due, with their state); v2's No show (past, not showed up) and Not
    // reminded (tomorrow's, no reminder sent — the visit's reminded_at).
    const vs = data.visits.filter(v => v.state !== "cancelled" && inR(v.start));
    const tomorrow = today + 86_400_000;
    const pick = key === "Upcoming" ? vs.filter(v => new Date(v.start).getTime() >= today) : key === "Showed up" ? vs.filter(v => v.state === "attended")
      : key === "No show" ? vs.filter(v => new Date(v.start).getTime() < today && v.state !== "attended")
        : key === "Not reminded" ? data.visits.filter(v => v.state === "booked" && !v.remindedAt && new Date(new Date(v.start).toDateString()).getTime() === tomorrow)
          : vs.filter(v => new Date(v.start) <= now);
    rows = pick.sort((a, b) => b.start.localeCompare(a.start)).map((v, j) => {
      const c = data.customers.find(x => x.id === v.customerId), at = new Date(v.start), rep = c?.assignedTo ? ctx.nameOf(c.assignedTo) : "";
      const st = v.state === "attended" ? "Showed up" : v.state === "no_show" ? "No show" : key === "Show-up" ? "No show yet" : at <= now ? "To mark" : "Booked";
      return { id: v.customerId, name: c?.name ?? "Customer", ini: initials(c?.name ?? "?"), ord: j, rep,
        sub: `${at.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })} · ${rep} · ${data.rooms.find(x => x.id === v.showroomId)?.name ?? ""}`,
        status: st };
    });
  }
  const O = ["Overdue", "Urgent", "Reply soon", "New", "Follow up", "Appointment", "Showed up", "No show yet", "Cold", "Won", "Lost"];
  const si = (s: string) => { const i = O.findIndex(o => s.startsWith(o)); return i < 0 ? 99 : i; };
  const k = ui.clSort || "Last chat";
  const lastOf = (id: string) => all.find(x => x.id === id)?.last ?? 0;
  const sorted = rows.slice().sort(
    k === "Oldest chat" ? (a, b) => lastOf(a.id) - lastOf(b.id)
      : k === "Status" ? (a, b) => si(a.status) - si(b.status) || a.ord - b.ord
        : k === "Salesperson" ? (a, b) => (a.rep || "~").localeCompare(b.rep || "~") || a.ord - b.ord
          : k === "Name A–Z" ? (a, b) => a.name.localeCompare(b.name)
            : (a, b) => lastOf(b.id) - lastOf(a.id));
  const isList = key.startsWith("st:") || key === "Leads" || key === "Booked" || key === "Reply 24 h" || key === "Won";
  return {
    clistN: isList ? `${rows.length} ${rows.length === 1 ? "customer" : "customers"}` : `${rows.length} ${rows.length === 1 ? "visit" : "visits"}`,
    clistEmpty: ui.kind === "clist" && !rows.length,
    clSortLabel: k, clSortOpen: ui.clSortOpen, clSortToggle: () => set(u => ({ ...u, clSortOpen: !u.clSortOpen })),
    clSorts: ["Last chat", "Oldest chat", "Status", "Salesperson", "Name A–Z"].map(s => ({ label: s, bg: s === k ? "var(--crm-tint-attention)" : "transparent", fg: s === k ? "var(--crm-rust)" : "var(--crm-ink)", w: s === k ? 700 : 500, pick: () => patch({ clSort: s, clSortOpen: false }) })),
    clistRows: sorted.map(x => { const c = ST[x.status.split(" · ")[0]] ?? ST["Follow up"];
      return { name: x.name, ini: x.ini, sub: x.sub, status: x.status, stBg: c[0], stFg: c[1],
        open: () => key.startsWith("st:") ? patch({ kind: "chat", chat: x.id, fromList: true }) : patch({ kind: "info", infoId: x.id }) }; }),
    clistHead: { title: stLabel[key] ?? key, sub: stLabel[key] ? "Leads by status · tap to open the chat" : `${name} · tap a customer for their info` },
    backStatusLabel: `${stLabel[key] ?? ""} · all chats`, backToStatus: () => patch({ kind: "clist", fromList: false }),
    chatFromList: ui.kind === "chat" && ui.pane === "overlay" && ui.fromList && key.startsWith("st:"),
    infoBack: !!ui.infoId && ui.kind === "info" && !ui.visit, infoBackLabel: `${key} · all customers`, backToList: () => patch({ kind: "clist", infoId: null }),
    teamNameOf: (id: string | null) => teamNameOf(ctx, id),
    isCold: (c: CrmCustomer) => isCold(c, now), urgency: (c: CrmCustomer) => urgencyOf(c, now),
  };
}

/** The cards the design draws: Spend, Reach, Clicks, Cost / lead. */
export const INS_CARDS = ["spend", "reach", "clicks", "cpl"];
const CARD_LABEL: Record<string, string> = { clicks: "Clicks", cpl: "Cost / lead" };

/**
 * Insight's Ads Performance cards (the owner, 2026-10-13: "+" to add metrics, as Ads Performance's): the metrics picked
 * from Ads Performance's own list, over Insight's period — the CRM's own figures counted, Meta's "—" until Meta is
 * connected. The picker ticks and unticks; at least one card stays.
 */
export function adCardsVM(ctx: DeskCtx, r: { a: number; b: number }, name: string) {
  const { ui, patch, data } = ctx;
  const sel = ui.insCards ?? INS_CARDS;
  const figs = crmFigures(data.customers.filter(c => !!c.adId), ctx, r.a, r.b);
  return {
    adTotals: sel.map(k => ALL.find(m => m[0] === k)).filter((m): m is NonNullable<typeof m> => !!m).map(([k, label, , t], i) => ({
      label: i === 0 && k === "spend" ? `Spend · ${name}` : CARD_LABEL[k] ?? label, value: fmt(figs[k] ?? null, t) })),
    // The same Customise metrics pane as Ads Performance's: tick, drag into order, Apply (the owner, 2026-10-13).
    insCardsToggle: () => patch({ pane: "docked", kind: "metrics", mFor: "cards", mDraft: null, mDrag: null }),
    insCardsN: sel.length,
  };
}
