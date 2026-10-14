/**
 * Ads Performance (CRM Desktop rev 1, F1–F4), CRM · Manage, desktop only: one row per ad, a column per chosen metric
 * (Customise metrics: groups, search, order by drag, Save), sort by a header (▼ ▲ off), a date range with presets or
 * typed dates and a compare range, Download report (Excel / CSV / PDF, what is on screen). The "From this CRM" metrics
 * are the CRM's own; Meta's (spend, impressions, clicks …) show "—" until Meta is connected (PROPOSALS.md C).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import { adsReportParam } from "@/lib/member/crm-ads-report";
import type { DeskCtx } from "./ctx";
import { INS_CARDS, MON } from "./insight";
import { columnSizer } from "./columns";
import { ST_META } from "./tokens";

type Fmt = "rm" | "rm2" | "n" | "pct" | "x" | "t";
export const METRICS: [string, string, [string, string, string, Fmt][]][] = [
  ["Popular", "Meta Ads", [["spend", "Amount spent", "Total charged in the period", "rm"], ["impr", "Impressions", "Times the ad was on screen", "n"], ["reach", "Reach", "People who saw the ad at least once", "n"], ["results", "Results", "Messaging conversations started", "n"], ["cpr", "Cost per result", "Amount spent ÷ results", "rm2"], ["delivery", "Delivery", "Running, paused or in review", "t"]]],
  ["Delivery", "Meta Ads", [["freq", "Frequency", "Impressions ÷ reach", "x"], ["cpm", "CPM", "Cost per 1,000 impressions", "rm2"], ["cpp", "Cost per 1,000 reached", "Amount spent ÷ reach × 1,000", "rm2"]]],
  ["Messaging", "Meta Ads", [["msgconv", "Messaging conversations started", "Chats opened from the ad", "n"], ["cpmsg", "Cost per conversation started", "Amount spent ÷ conversations started", "rm2"], ["newmsg", "New messaging contacts", "People who messaged the page for the first time", "n"], ["msgreply", "Conversations replied", "Chats where the page replied", "n"], ["blocks", "Messaging blocks", "People who blocked the page after the ad", "n"]]],
  ["Clicks", "Meta Ads", [["clicks", "Link clicks", "Clicks on the ad link", "n"], ["cpc", "Cost per link click", "Amount spent ÷ link clicks", "rm2"], ["ctr", "CTR (link)", "Link clicks ÷ impressions", "pct"], ["allclk", "Clicks (all)", "Every click on the ad, incl. profile and likes", "n"], ["ctrall", "CTR (all)", "Clicks (all) ÷ impressions", "pct"], ["cpcall", "CPC (all)", "Amount spent ÷ clicks (all)", "rm2"], ["outclk", "Outbound clicks", "Clicks that left Facebook or Instagram", "n"]]],
  ["Engagement", "Meta Ads", [["eng", "Post engagement", "Reactions, comments, shares, saves and clicks", "n"], ["reacts", "Post reactions", "Likes and other reactions", "n"], ["comments", "Post comments", "Comments on the ad", "n"], ["shares", "Post shares", "Times the ad was shared", "n"], ["saves", "Post saves", "Times the ad was saved", "n"], ["follows", "Page follows", "New followers from the ad", "n"], ["cpe", "Cost per engagement", "Amount spent ÷ post engagement", "rm2"]]],
  ["Video", "Meta Ads", [["v3", "3-second video plays", "Plays of at least 3 seconds", "n"], ["thru", "ThruPlays", "Played to the end or at least 15 seconds", "n"], ["cpthru", "Cost per ThruPlay", "Amount spent ÷ ThruPlays", "rm2"], ["v25", "Video plays at 25%", "Watched a quarter of the video", "n"], ["v50", "Video plays at 50%", "Watched half of the video", "n"], ["v75", "Video plays at 75%", "Watched three quarters of the video", "n"], ["v100", "Video plays at 100%", "Watched the whole video", "n"], ["hook", "Hook rate", "3-second plays ÷ impressions", "pct"]]],
  ["From this CRM", "Revenue app", [["leads", "Leads", "Chats that came in from the ad", "n"], ["cpl", "Cost per lead", "Amount spent ÷ leads", "rm2"], ["appt", "Appointments", "Leads who booked a visit", "n"], ["showup", "Showed up", "Visits marked as showed up", "n"], ["won", "Won", "Leads marked won", "n"], ["apptrate", "Appointment rate", "Appointments ÷ leads", "pct"], ["cpappt", "Cost per appointment", "Amount spent ÷ appointments", "rm2"], ["showrate", "Show-up rate", "Showed up ÷ appointments", "pct"], ["winrate", "Win rate", "Won ÷ leads", "pct"], ["cpwon", "Cost per won", "Amount spent ÷ won", "rm2"]]],
];
export const ALL = METRICS.flatMap(g => g[2]);
export const DEF = ["spend", "impr", "reach", "results", "cpr", "leads", "appt"];
const COSTY = /^(cpr|cpm|cpc|cpl|spend|cpp|cpmsg|cpcall|cpe|cpthru|cpappt|cpwon|blocks)$/;
const DAY = 86_400_000;
const isoOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const tOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const dfmt = (iso: string) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${parseInt(d, 10)} ${MON[parseInt(m, 10) - 1].slice(0, 3)}`; };
const shown = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

/** The CRM's own figures for one ad over a range (Meta's are null until connected). */
export function crmFigures(cs: CrmCustomer[], ctx: DeskCtx, a: number, b: number): Record<string, number | null> {
  const inR = (iso: string) => { const t = new Date(iso).getTime(); return t >= a && t < b + DAY; };
  const leads = cs.filter(c => inR(c.createdAt)), ids = new Set(leads.map(c => c.id));
  const vs = ctx.data.visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled");
  const appt = new Set(vs.map(v => v.customerId)).size, showup = vs.filter(v => v.state === "attended").length, won = leads.filter(c => c.status === "won").length;
  return { leads: leads.length, appt, showup, won, apptrate: leads.length ? (appt / leads.length) * 100 : null, showrate: appt ? (showup / appt) * 100 : null, winrate: leads.length ? (won / leads.length) * 100 : null };
}
export const fmt = (v: number | null | undefined, t: Fmt) => (v == null ? "—" : t === "rm" ? Math.round(v).toLocaleString("en-MY") : t === "rm2" ? v.toFixed(2) : t === "pct" ? `${v.toFixed(2)}%` : t === "x" ? v.toFixed(2) : Math.round(v).toLocaleString("en-MY"));

export function adsPerfVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now } = ctx;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthA = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  // Customise metrics picks for Ads Performance's columns, or (ui.mFor "cards") Insight's ad cards — the same pane.
  const forCards = ui.mFor === "cards";
  const baseOf = (u: typeof ui) => (u.mFor === "cards" ? u.insCards ?? INS_CARDS : u.apSel ?? DEF);
  const sel = ui.apSel ?? DEF, dsel = ui.mDraft ?? baseOf(ui), q = ui.mq.toLowerCase();
  // Drag a header's right edge to size its column (the owner, 2026-10-13); double-click the edge to give it back.
  const W = ui.apW;
  const sz = columnSizer(set, "apW"), resizer = (k: string, min: number) => sz.resize(k, min === 220 ? 140 : 64), unsize = (k: string) => sz.reset(k)();
  const cols = sel.map(k => ALL.find(m => m[0] === k)).filter((x): x is NonNullable<typeof x> => !!x);
  const dcols = dsel.map(k => ALL.find(m => m[0] === k)).filter((x): x is NonNullable<typeof x> => !!x);
  // The range: five presets, or the date picker's (custom); the compare range is the period before, last month, last year, or picked.
  const R: [string, number, number, string][] = [["This month", monthA, T, "Previous period"], ["Last 7 days", T - 7 * DAY, T - DAY, ""], ["Last 30 days", T - 30 * DAY, T - DAY, ""],
    ["Last month", new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), monthA - DAY, ""], ["Today", T, T, ""]];
  const custom = ui.apRange === "custom";
  const [ra, rb] = custom ? [tOf(ui.apF), tOf(ui.apT)] : [R[ui.apRange as number][1], R[ui.apRange as number][2]];
  const len = Math.round((rb - ra) / DAY) + 1;
  const cmp = ui.apCmp, cmode = ui.apCmpMode ?? 0;
  const [ca, cb] = cmode === "range" || cmode === "custom" ? [tOf(ui.apCF), tOf(ui.apCT)]
    : cmode === 1 ? [new Date(new Date(ra).getFullYear(), new Date(ra).getMonth() - 1, new Date(ra).getDate()).getTime(), new Date(new Date(rb).getFullYear(), new Date(rb).getMonth() - 1, new Date(rb).getDate()).getTime()]
      : cmode === 2 ? [new Date(new Date(ra).getFullYear() - 1, new Date(ra).getMonth(), new Date(ra).getDate()).getTime(), new Date(new Date(rb).getFullYear() - 1, new Date(rb).getMonth(), new Date(rb).getDate()).getTime()]
        : [ra - len * DAY, ra - DAY];
  const rangeTxt = (a: number, b: number) => (a === b ? dfmt(isoOf(a)) : `${dfmt(isoOf(a))} – ${dfmt(isoOf(b))}`);
  const status = (_adId: string): string | null => null; // Meta's delivery (PROPOSALS.md C).
  const ads = [...new Set(data.customers.map(c => c.adId ?? `ch:${c.channel}`))].map(id => { const cs = data.customers.filter(c => (c.adId ?? `ch:${c.channel}`) === id);
    return { id, name: cs[0]?.ad ?? id, ch: cs.some(c => c.channel === "whatsapp") ? "WhatsApp" : "Messenger", cs }; });
  const apStF = ui.apStF;
  const AD = ads.filter(a => apStF === "all" || status(a.id) === apStF);
  const val = (cs: CrmCustomer[], k: string, a: number, b: number): number | null => crmFigures(cs, ctx, a, b)[k] ?? null;
  const cell = (cs: CrmCustomer[], m: (typeof ALL)[number], isTotal: boolean, adId: string) => {
    if (m[0] === "delivery") return { v: isTotal ? "" : status(adId) ?? "—", cv: "", d: "", dc: "", db: "" };
    const v = val(cs, m[0], ra, rb);
    if (!cmp) return { v: fmt(v, m[3]), cv: "", d: "", dc: "", db: "" };
    const pv = val(cs, m[0], ca, cb); let dd = "—", dc = "#806B60", db = "#F5EBE3";
    if (v != null && pv) { const p = ((v - pv) / pv) * 100, good = p > 0 !== COSTY.test(m[0]); dd = Math.abs(p) < 0.5 ? "0%" : `${p > 0 ? "▲ " : "▼ "}${Math.abs(p).toFixed(0)}%`;
      if (Math.abs(p) >= 0.5) { dc = good ? "#387557" : "#A3371A"; db = good ? "#E4F1EA" : "#FBE9E4"; } }
    else if (v && !pv) { dd = "New"; dc = "#387557"; db = "#E4F1EA"; }
    return { v: fmt(v, m[3]), cv: fmt(pv, m[3]), d: dd, dc, db };
  };
  const srt = ui.apSort;
  const sv = (a: (typeof ads)[number], k: string): number | string => (k === "name" ? a.name : k === "delivery" ? status(a.id) ?? "" : val(a.cs, k, ra, rb) ?? -Infinity);
  const ADs = srt ? AD.slice().sort((a, b) => { const x = sv(a, srt.k), y = sv(b, srt.k); const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y); return srt.dir === "asc" ? c : -c; }) : AD;
  const allCs = AD.flatMap(a => a.cs);
  const rows = ADs.map(a => { const st = status(a.id); return { name: a.name, meta: `${a.ch} · ${st ?? "Not synced"}`, dot: st ? ST_META[st][1] : "#C9B8AC", bg: "#fff", w: 600, cells: cols.map(m => cell(a.cs, m, false, a.id)) }; });
  rows.push({ name: `Total · ${AD.length} ads`, meta: rangeTxt(ra, rb), dot: "transparent", bg: "#FBF6F2", w: 700, cells: cols.map(m => (m[0] === "delivery" ? { v: "", cv: "", d: "", dc: "", db: "" } : cell(allCs, m, true, ""))) });
  const CM: [string, string][] = [["Previous period", rangeTxt(ra - len * DAY, ra - DAY)], ["Same period last month", MON[(new Date(ra).getMonth() + 11) % 12].slice(0, 3)], ["Same period last year", `${MON[new Date(ra).getMonth()].slice(0, 3)} ${new Date(ra).getFullYear() - 1}`]];
  if (cmode === "custom") CM.push(["Custom", rangeTxt(ca, cb)]);
  // The date picker (F2): presets, a two-month calendar, typed DD/MM/YYYY dates (- or . too), Compare in blue.
  const d = ui.dp;
  const upd = (x: Partial<NonNullable<DeskCtxDp>>) => set(u => (u.dp ? { ...u, dp: { ...u.dp, ...x } } : u));
  const PR: [string, number, number][] = [["Today", T, T], ["Yesterday", T - DAY, T - DAY], ["This week (Mon – today)", T - ((now.getDay() + 6) % 7) * DAY, T], ["Last 7 days", T - 7 * DAY, T - DAY],
    ["Last week (Mon – Sun)", T - ((now.getDay() + 6) % 7) * DAY - 7 * DAY, T - ((now.getDay() + 6) % 7) * DAY - DAY], ["Last 14 days", T - 14 * DAY, T - DAY], ["This month", monthA, T],
    ["Last 30 days", T - 30 * DAY, T - DAY], ["Last month", new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), monthA - DAY], ["All time", new Date(now.getFullYear(), 0, 1).getTime(), T]];
  const parse = (v: string) => { const m = String(v).trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if (!m) return null; const dt = new Date(+m[3], +m[2] - 1, +m[1]);
    return dt.getMonth() !== +m[2] - 1 || dt.getDate() !== +m[1] ? null : isoOf(dt.getTime()); };
  const dpVM = (() => {
    const mo = d?.month ?? now.getMonth(), yr = d?.year ?? now.getFullYear(), first = new Date(yr, mo, 1), lead = (first.getDay() + 6) % 7, days = new Date(yr, mo + 1, 0).getDate();
    const f = d?.from ?? "", t = d?.to ?? "", cf = d?.cf ?? "", ct = d?.ct ?? "", tg = d?.target ?? "main", fKey = tg === "cmp" ? "cf" : "from", tKey = tg === "cmp" ? "ct" : "to";
    const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, k) => { const dt = new Date(yr, mo, 1 - lead + k), io = isoOf(dt.getTime()), off = dt.getMonth() !== mo, future = dt.getTime() > T;
      const inM = !off && !!f && !!t && io >= f && io <= t, edgeM = !off && (io === f || io === t), inC = !!d?.cmp && !off && !!cf && !!ct && io >= cf && io <= ct && !inM, edgeC = !!d?.cmp && !off && !edgeM && (io === cf || io === ct);
      const [rf, rt] = inM || edgeM ? [f, t] : [cf, ct];
      return { num: dt.getDate(), off: off || future, band: inM && f !== t ? "#FFF1E6" : inC && cf !== ct ? "#E4EDF8" : "transparent", br: io === rf && rf !== rt ? "19px 0 0 19px" : io === rt && rf !== rt ? "0 19px 19px 0" : "0",
        dotBg: edgeM ? "#BD4A19" : edgeC ? "#2F6FB5" : "transparent", fg: edgeM || edgeC ? "#fff" : off || future ? "#D3C4B8" : "#3F2B22", w: edgeM || edgeC || io === isoOf(T) ? 700 : 500,
        ring: io === isoOf(T) && !edgeM && !edgeC ? "1.5px solid #BD4A19" : "0",
        pick: () => { if (off || future || !d) return; const F = d[fKey]; if (!d.step) upd({ [fKey]: io, [tKey]: io, step: 1, ...(tg === "main" ? { preset: "Custom" } : {}) }); else upd({ [fKey]: io < F ? io : F, [tKey]: io < F ? F : io, step: 0 }); } }; });
    const raw = d?.txt ?? {}, src: Record<string, string> = { from: f, to: t, cf, ct };
    const field = (k: "from" | "to" | "cf" | "ct") => { const isCmp = k === "cf" || k === "ct", bad = raw[k] != null && raw[k] !== "" && !parse(raw[k]);
      return { v: raw[k] ?? (src[k] ? shown(src[k]) : ""), err: bad ? "#A3371A" : "transparent",
        onIn: (e: { target: { value: string } }) => { const v = e.target.value; set(u => (u.dp ? { ...u, dp: { ...u.dp, txt: { ...u.dp.txt, [k]: v } } } : u)); },
        onFocus: () => upd({ target: isCmp ? "cmp" : "main", step: k === "to" || k === "ct" ? 1 : 0 }),
        onBlur: (e: { target: { value: string } }) => { const p = parse(e.target.value); set(u => { if (!u.dp) return u; const tx = { ...u.dp.txt }; if (p) { delete tx[k]; return { ...u, dp: { ...u.dp, [k]: p, txt: tx, preset: "Custom", month: +p.slice(5, 7) - 1, year: +p.slice(0, 4) } }; } if (!e.target.value) delete tx[k]; return { ...u, dp: { ...u.dp, txt: tx } }; }); },
        onKey: (e: { key: string; currentTarget: { blur(): void } }) => { if (e.key === "Enter") e.currentTarget.blur(); } }; };
    const F1 = field("from"), F2 = field("to"), F3 = field("cf"), F4 = field("ct");
    const o = { fromV: F1.v, fromErr: F1.err, fromIn: F1.onIn, fromFocus: F1.onFocus, fromBlur: F1.onBlur, fromKey: F1.onKey,
      toV: F2.v, toErr: F2.err, toIn: F2.onIn, toFocus: F2.onFocus, toBlur: F2.onBlur, toKey: F2.onKey,
      cfV: F3.v, cfErr: F3.err, cfIn: F3.onIn, cfFocus: F3.onFocus, cfBlur: F3.onBlur, cfKey: F3.onKey,
      ctV: F4.v, ctErr: F4.err, ctIn: F4.onIn, ctFocus: F4.onFocus, ctBlur: F4.onBlur, ctKey: F4.onKey };
    return { open: !!d?.open, days: d?.days ?? 30, cmp: !!d?.cmp, cmpTrack: d?.cmp ? "#BD4A19" : "#E2CFC1", cmpKnob: d?.cmp ? 19 : 3, cmpHint: "Compared with the period just before",
      monthLabel: `${MON[mo]} ${yr}`, from: f ? shown(f) : "", to: t ? shown(t) : "", cf: cf ? shown(cf) : "", ct: ct ? shown(ct) : "",
      fromBd: tg === "main" && d?.step !== 1 ? "#BD4A19" : tg === "main" ? "#E2CFC1" : "#EBDDD2", toBd: tg === "main" && d?.step === 1 ? "#BD4A19" : "#EBDDD2",
      cfBd: tg === "cmp" && d?.step !== 1 ? "#2F6FB5" : "#EBDDD2", ctBd: tg === "cmp" && d?.step === 1 ? "#2F6FB5" : "#EBDDD2",
      pickMain: () => upd({ target: "main", step: 0 }), pickCmp: () => upd({ target: "cmp", step: 0 }), ...o,
      tgtHint: tg === "cmp" ? "Picking the compare range (blue) · tap a date on the calendar" : "Picking the main range (orange) · tap Compare start to pick the blue one",
      presets: PR.map(([label, a, b]) => { const on = d?.preset === label; return { label, bg: on ? "#FFF1E6" : "transparent", fg: on ? "#BD4A19" : "#3F2B22", w: on ? 700 : 550,
        pick: () => { if (tg === "cmp") { upd({ cf: isoOf(a), ct: isoOf(b), step: 0 }); return; } const L = Math.round((b - a) / DAY) + 1; upd({ preset: label, from: isoOf(a), to: isoOf(b), cf: isoOf(a - L * DAY), ct: isoOf(a - DAY), step: 0 }); } }; }),
      cells };
  })();
  return {
    kAdsPerf: ui.tab === "adsperf",
    apStOpen: ui.apStOpen, apStToggle: () => set(u => ({ ...u, apStOpen: !u.apStOpen })), apStCur: { label: ST_META[apStF][0], dot: ST_META[apStF][1], n: AD.length },
    apStOpts: (["all", "Running", "Paused", "Pending"] as const).map(k => { const on = apStF === k, n = k === "all" ? ads.length : ads.filter(a => status(a.id) === k).length;
      return { label: ST_META[k][0], dot: ST_META[k][1], n, bg: on ? ST_META[k][3] : "transparent", fg: on ? ST_META[k][4] : "#3F2B22", w: on ? 700 : 550, pick: () => patch({ apStF: k, apStOpen: false }) }; }),
    apHead: cols.map(m => { const on = srt?.k === m[0]; return { resize: resizer(m[0], 104), unsize: () => unsize(m[0]), label: m[1] + (m[3] === "rm" || m[3] === "rm2" ? " (RM)" : ""), arrow: on ? (srt?.dir === "asc" ? "▲" : "▼") : "↕", ac: on ? "#BD4A19" : "#C9B8AC", fg: on ? "#3F2B22" : "#806B60",
      sort: () => set(u => { const c = u.apSort; return { ...u, apSort: !c || c.k !== m[0] ? { k: m[0], dir: "desc" } : c.dir === "desc" ? { k: m[0], dir: "asc" } : null }; }) }; }),
    apNameArrow: srt?.k === "name" ? (srt.dir === "asc" ? "▲" : "▼") : "↕", apNameAc: srt?.k === "name" ? "#BD4A19" : "#C9B8AC",
    apSortName: () => set(u => { const c = u.apSort; return { ...u, apSort: !c || c.k !== "name" ? { k: "name", dir: "asc" } : c.dir === "asc" ? { k: "name", dir: "desc" } : null }; }),
    apNameResize: resizer("name", 220), apNameUnsize: () => unsize("name"),
    // A dragged column keeps its width; the others share what is left, as the design's.
    apRows: rows, apNSel: cols.length,
    apCols: [W.name ? `${W.name}px` : "minmax(220px, 1.6fr)", ...(cols.length ? cols : [null]).map(m => (m && W[m[0]] ? `${W[m[0]]}px` : "minmax(104px, 1fr)"))].join(" "),
    apMinW: 40 + (W.name ?? 220) + cols.reduce((n, m) => n + (W[m[0]] ?? 104) + 12, 0),
    apRangeLabel: `${custom ? ui.apPreset || "Custom" : R[ui.apRange as number][0]} · ${rangeTxt(ra, rb)}`, apCmpOn: cmp, apMainShort: rangeTxt(ra, rb), apCmpShort: rangeTxt(ca, cb),
    apCmpLabel: cmp ? `vs ${(CM[cmode === "custom" ? 3 : typeof cmode === "number" ? cmode : 0] ?? CM[0])[1]}` : "Compare",
    apDlOpen: ui.apDlOpen, apToggleDl: () => set(u => ({ ...u, apDlOpen: !u.apDlOpen })),
    apDl: ([["XLS", "Excel (.xlsx)", "#E4F1EA", "#387557", "xlsx"], ["CSV", "CSV", "#F5EBE3", "#806B60", "csv"], ["PDF", "PDF report", "#FBE9E4", "#A3371A", "pdf"]] as const).map(([tag, label, bg, fg, kind]) => ({ tag, label, bg, fg, hint: "", v: kind,
      pick: () => { patch({ apDlOpen: false }); void download(kind, ["Ad", ...cols.map(m => m[1] + (m[3] === "rm" || m[3] === "rm2" ? " (RM)" : ""))], rows.map(r => [r.name, ...r.cells.map(c => c.v)]), `Ads Performance ${rangeTxt(ra, rb)}`); } })),
    dpOpen: () => set(u => ({ ...u, dp: { open: true, from: custom ? u.apF : isoOf(ra), to: custom ? u.apT : isoOf(rb), cf: isoOf(ca), ct: isoOf(cb), preset: custom ? u.apPreset || "Custom" : R[u.apRange as number][0], cmp: u.apCmp, days: 30, step: 0, target: "main", month: new Date(ra).getMonth(), year: new Date(ra).getFullYear(), txt: {} } })),
    dpCancel: () => upd({ open: false }), dpToggleCmp: () => upd({ cmp: !d?.cmp, target: !d?.cmp ? "cmp" : "main", step: 0 }),
    dpPrev: () => upd({ month: ((d?.month ?? now.getMonth()) + 11) % 12, year: (d?.month ?? now.getMonth()) === 0 ? (d?.year ?? now.getFullYear()) - 1 : d?.year ?? now.getFullYear() }),
    dpNext: () => upd({ month: ((d?.month ?? now.getMonth()) + 1) % 12, year: (d?.month ?? now.getMonth()) === 11 ? (d?.year ?? now.getFullYear()) + 1 : d?.year ?? now.getFullYear() }),
    dpSetDays: (e: { target: { value: string } }) => { const n = Math.max(1, parseInt(e.target.value, 10) || 1); upd({ days: n, preset: `Last ${n} days`, from: isoOf(T - (n - 1) * DAY), to: isoOf(T) }); },
    dpApply: () => set(u => (u.dp ? { ...u, apRange: "custom", apF: u.dp.from, apT: u.dp.to, apCF: u.dp.cf, apCT: u.dp.ct, apPreset: u.dp.preset, apCmp: u.dp.cmp, apCmpMode: "range", dp: { ...u.dp, open: false } } : u)),
    dp: dpVM,
    openMetrics: () => patch({ pane: "docked", kind: "metrics", mFor: "ads", mDraft: null, mDrag: null }),
    saveMetrics: () => set(u => ({ ...u, ...(u.mFor === "cards" ? { insCards: (u.mDraft ?? baseOf(u)).length ? u.mDraft ?? baseOf(u) : INS_CARDS } : { apSel: u.mDraft ?? baseOf(u) }), mDraft: null, mDrag: null, pane: "closed" })),
    mDirty: !!ui.mDraft && JSON.stringify(ui.mDraft) !== JSON.stringify(baseOf(ui)),
    mq: ui.mq, setMq: (e: { target: { value: string } }) => patch({ mq: e.target.value }), resetMetrics: () => patch({ mDraft: [...(forCards ? INS_CARDS : DEF)] }),
    mFoldAllLabel: METRICS.every(g => ui.mFold[g[0]]) ? "Expand all" : "Collapse all",
    mFoldAll: () => set(u => { const all = METRICS.every(g => u.mFold[g[0]]); return { ...u, mFold: { ...u.mFold, ...Object.fromEntries(METRICS.map(g => [g[0], !all])) } }; }),
    mGroups: METRICS.map(([label, src, items]) => ({ label, src, open: !!q || !ui.mFold[label], rot: !!q || !ui.mFold[label] ? 0 : -90, nSel: `${items.filter(m => dsel.includes(m[0])).length} of ${items.length}`,
      fold: () => set(u => ({ ...u, mFold: { ...u.mFold, [label]: !u.mFold[label] } })),
      items: items.filter(m => !q || m[1].toLowerCase().includes(q)).map(m => { const on = dsel.includes(m[0]);
        return { label: m[1], hint: m[2], on, bg: on ? "#BD4A19" : "#fff", bd: on ? "#BD4A19" : "#CDBCAE",
          toggle: () => set(u => { const c = u.mDraft ?? baseOf(u); return { ...u, mDraft: c.includes(m[0]) ? c.filter(x => x !== m[0]) : [...c, m[0]] }; }) }; }) })).filter(g => g.items.length),
    mOrder: dcols.map((m, i) => { const mvTo = (j: number) => set(u => { const c = [...(u.mDraft ?? baseOf(u))].filter(k => ALL.some(x => x[0] === k)); const [x] = c.splice(i, 1); c.splice(j, 0, x); return { ...u, mDraft: c, mDrag: null }; });
      const dragging = ui.mDrag === i;
      return { n: i + 1, label: m[1], first: i === 0, last: i === dcols.length - 1, upC: i === 0 ? "#D8C9BE" : "#6B574C", dnC: i === dcols.length - 1 ? "#D8C9BE" : "#6B574C", bg: "#fff",
        sh: dragging ? "0 6px 18px rgba(63,43,34,.22)" : "none", bd: dragging ? "transparent" : "#F1E7DF", z: dragging ? 2 : 1,
        up: () => { if (i > 0) mvTo(i - 1); }, down: () => { if (i < dcols.length - 1) mvTo(i + 1); },
        rm: () => set(u => ({ ...u, mDraft: (u.mDraft ?? baseOf(u)).filter(k => k !== m[0]) })),
        dStart: (e: { dataTransfer: DataTransfer }) => { e.dataTransfer.effectAllowed = "move"; patch({ mDrag: i }); },
        // Drag to reorder with the pointer (the owner, 2026-10-13: "無法拖動" — the browser's drag events outran the
        // screen and swapped rows back): the row follows the pointer over the rows' middles, from where it now is.
        pDown: (e: { button: number; clientY: number; target: EventTarget | null; currentTarget: HTMLElement; preventDefault(): void }) => {
          if (e.button !== 0 || (e.target as HTMLElement | null)?.closest("button")) return;
          e.preventDefault();
          const list = e.currentTarget.parentElement?.parentElement;
          let from = i;
          patch({ mDrag: i });
          const move = (ev: PointerEvent) => {
            const rows = list ? [...list.querySelectorAll<HTMLElement>("[data-morder]")] : [];
            let to = rows.findIndex(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
            if (to < 0) to = rows.length - 1;
            if (to === from || to < 0) return;
            const f0 = from; from = to;
            set(u => { const c = [...(u.mDraft ?? baseOf(u))].filter(k => ALL.some(x => x[0] === k)); const [x] = c.splice(f0, 1); c.splice(to, 0, x); return { ...u, mDraft: c, mDrag: to }; });
          };
          const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); document.body.style.cursor = ""; patch({ mDrag: null }); };
          window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); document.body.style.cursor = "grabbing";
        },
        dOver: (e: { preventDefault(): void }) => { e.preventDefault(); const f = ui.mDrag; if (f == null || f === i) return; set(u => { const c = [...(u.mDraft ?? baseOf(u))].filter(k => ALL.some(x => x[0] === k)); const [x] = c.splice(f, 1); c.splice(i, 0, x); return { ...u, mDraft: c, mDrag: i }; }); },
        dDrop: (e: { preventDefault(): void }) => { e.preventDefault(); patch({ mDrag: null }); }, dEnd: () => patch({ mDrag: null }) }; }),
    mOrdOpen: !ui.mFold.__order, mOrdRot: ui.mFold.__order ? -90 : 0, mOrdFold: () => set(u => ({ ...u, mFold: { ...u.mFold, __order: !u.mFold.__order } })),
    syncedNote: "Not connected to Meta Ads yet",
  };
}
type DeskCtxDp = DeskCtx["ui"]["dp"];

/** Download report (F1): what is on screen — Excel through `xlsx` and CSV as text in the browser; the PDF from the server
 * (/member/crm-ads-report, the portal's PDF house style — its library is not the browser's to load). */
async function download(kind: "xlsx" | "csv" | "pdf", head: string[], rows: string[][], title: string) {
  const name = title.replace(/[^\w –-]+/g, "").trim();
  const save = (blob: Blob, ext: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${name}.${ext}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  if (kind === "csv") { const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s); save(new Blob([[head, ...rows].map(r => r.map(esc).join(",")).join("\n")], { type: "text/csv" }), "csv"); return; }
  if (kind === "xlsx") { const XLSX = await import("xlsx"); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), "Ads Performance");
    save(new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "xlsx"); return; }
  const a = document.createElement("a"); a.href = `/member/crm-ads-report?d=${adsReportParam({ title, head, rows })}`; a.download = `${name}.pdf`; a.click();
}
