/**
 * Ads Performance (CRM Desktop rev 1, F1–F4), CRM · Manage, desktop only: one row per ad, a column per chosen metric
 * (Customise metrics: groups, search, order by drag, Save), sort by a header (▼ ▲ off), a date range with presets or
 * typed dates and a compare range, Download report (Excel / CSV / PDF, what is on screen). The "From this CRM" metrics
 * are the CRM's own; Meta's (spend, impressions, clicks …) show "—" until Meta is connected (PROPOSALS.md C).
 */
import type { CrmCustomer } from "@/lib/member/crm-data";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { adsReportParam } from "@/lib/member/crm-ads-report";
import { adStatusOf } from "@/lib/member/crm-ad-running";
import type { DeskCtx } from "./ctx";
import { INS_CARDS, MON } from "./insight";
import { columnSizer } from "./columns";
import { CHART_DEF, CHART_MAX, chartFmt, chartFmtOf, dailySeries, dayLabel, daysOf, SERIES, SERIES_TINT } from "./adschart";
import { ST_META } from "./tokens";
import { adPageInSource, BRAND_LABEL, brandOf, inSource, SOURCE_PICKS, sourceLabel, sourceOf, type SourcePick } from "@/lib/member/crm-source";

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
/** The chart's metrics are the table's (2026-10-23, the owner: "他的资料跟下方的 + 是一样的"), less Delivery. */
const CHART_METRICS = ALL.filter(m => m[3] !== "t").map(m => [m[0], m[1], chartFmtOf(m[3])] as const);
// 4a's columns (frame 05): Leads, Appts, Appt rate, Show-up, Won, Won rate, Spend, Per lead — the rest from +. Spend and Per
// lead say RM in their heads (2026-10-23, the owner: "spend（加RM） & per lead （加RM）").
export const DEF = ["leads", "appt", "apptrate", "showrate", "won", "winrate", "spend", "cpl"];
/** 4a's short headers (frame 05) for the columns it draws; others keep their names. */
const SHORT: Record<string, string> = { leads: "Leads", appt: "Appts", apptrate: "Appt rate", showrate: "Show-up", won: "Won", winrate: "Won rate", spend: "Spend (RM)", cpl: "Per lead (RM)" };
const COSTY = /^(cpr|cpm|cpc|cpl|spend|cpp|cpmsg|cpcall|cpe|cpthru|cpappt|cpwon|blocks)$/;
const DAY = 86_400_000;
export const isoOf = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const tOf = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const dfmt = (iso: string) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return `${parseInt(d, 10)} ${MON[parseInt(m, 10) - 1].slice(0, 3)}`; };
const shown = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

/** The CRM's own figures for one ad over a range (Meta's are null until connected). */
export function crmFigures(cs: CrmCustomer[], ctx: DeskCtx, a: number, b: number): Record<string, number | null> {
  const inR = (iso: string) => { const t = new Date(iso).getTime(); return t >= a && t < b + DAY; };
  const leads = cs.filter(c => inR(c.createdAt)), ids = new Set(leads.map(c => c.id));
  const vs = ctx.data.visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled");
  const appt = new Set(vs.map(v => v.customerId)).size, showup = new Set(vs.filter(v => v.state === "attended").map(v => v.customerId)).size, won = leads.filter(c => c.status === "won").length;
  return { leads: leads.length, appt, showup, won, apptrate: leads.length ? (appt / leads.length) * 100 : null, showrate: appt ? (showup / appt) * 100 : null, winrate: leads.length ? (won / leads.length) * 100 : null };
}
/**
 * Meta's figures for a set of ads over a range, summed (null when none of them could be read), and every metric built
 * from them with the CRM's own (2026-10-22, the owner: "做花费和每个名单成本"): cost per lead / appointment / won.
 */
export function metaFigures(figs: (MetaFig | null | undefined)[], crm: Record<string, number | null>): Record<string, number | null> {
  const got = figs.filter((f): f is MetaFig => !!f);
  if (!got.length) return {};
  const s = got.reduce((a, f) => ({ spend: a.spend + f.spend, impr: a.impr + f.impr, reach: a.reach + f.reach, clicks: a.clicks + f.clicks, allClicks: a.allClicks + f.allClicks, msgconv: a.msgconv + f.msgconv }),
    { spend: 0, impr: 0, reach: 0, clicks: 0, allClicks: 0, msgconv: 0 });
  const per = (n: number | null | undefined) => (n ? s.spend / n : null);
  return { spend: s.spend, impr: s.impr, reach: s.reach, results: s.msgconv, msgconv: s.msgconv, cpr: per(s.msgconv), cpmsg: per(s.msgconv),
    freq: s.reach ? s.impr / s.reach : null, cpm: s.impr ? (s.spend / s.impr) * 1000 : null, cpp: s.reach ? (s.spend / s.reach) * 1000 : null,
    clicks: s.clicks, cpc: per(s.clicks), ctr: s.impr ? (s.clicks / s.impr) * 100 : null, allclk: s.allClicks, ctrall: s.impr ? (s.allClicks / s.impr) * 100 : null, cpcall: per(s.allClicks),
    cpl: per(crm.leads), cpappt: per(crm.appt), cpwon: per(crm.won) };
}
export const fmt = (v: number | null | undefined, t: Fmt) => (v == null ? "—" : t === "rm" ? Math.round(v).toLocaleString("en-MY") : t === "rm2" ? v.toFixed(2) : t === "pct" ? `${v.toFixed(2)}%` : t === "x" ? v.toFixed(2) : Math.round(v).toLocaleString("en-MY"));

export function adsPerfVM(ctx: DeskCtx) {
  const { ui, set, patch, data, now } = ctx;
  const T = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const monthA = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  // Customise metrics picks for Ads Performance's columns, (ui.mFor "cards") Insight's ad cards, or (ui.mFor "chart") the
  // chart's tiles, six at most — the same pane and list (2026-10-23: the chart's + opens it too).
  const forCards = ui.mFor === "cards", forChart = ui.mFor === "chart";
  const baseOf = (u: typeof ui) => (u.mFor === "cards" ? u.insCards ?? INS_CARDS : u.mFor === "chart" ? (u.apChart ?? CHART_DEF).filter((k): k is string => !!k) : u.apSel ?? DEF);
  const sel = ui.apSel ?? DEF, dsel = ui.mDraft ?? baseOf(ui), q = ui.mq.toLowerCase();
  // Drag a header's right edge to size its column (the owner, 2026-10-13); double-click the edge to give it back.
  const W = ui.apW;
  const sz = columnSizer(set, "apW"), resizer = (k: string, min: number) => sz.resize(k, min === 220 ? 140 : 64), unsize = (k: string) => sz.reset(k)();
  const cols = sel.map(k => ALL.find(m => m[0] === k)).filter((x): x is NonNullable<typeof x> => !!x);
  const dcols = dsel.map(k => ALL.find(m => m[0] === k)).filter((x): x is NonNullable<typeof x> => !!x);
  // The range: five presets, or the date picker's (custom); the compare range is the period before, last month, last year, or picked.
  const R: [string, number, number, string][] = [["This month", monthA, T, "Previous period"], ["Last 7 days", T - 7 * DAY, T - DAY, ""], ["Last 30 days", T - 30 * DAY, T - DAY, ""],
    ["Last month", new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), monthA - DAY, ""], ["Today", T, T, ""],
    // 4a's head tab This week (frame 05).
    ["This week", T - ((now.getDay() + 6) % 7) * DAY, T, ""]];
  const custom = ui.apRange === "custom";
  const [ra, rb] = custom ? [tOf(ui.apF), tOf(ui.apT)] : [R[ui.apRange as number][1], R[ui.apRange as number][2]];
  const len = Math.round((rb - ra) / DAY) + 1;
  const cmp = ui.apCmp, cmode = ui.apCmpMode ?? 0;
  const [ca, cb] = cmode === "range" || cmode === "custom" ? [tOf(ui.apCF), tOf(ui.apCT)]
    : cmode === 1 ? [new Date(new Date(ra).getFullYear(), new Date(ra).getMonth() - 1, new Date(ra).getDate()).getTime(), new Date(new Date(rb).getFullYear(), new Date(rb).getMonth() - 1, new Date(rb).getDate()).getTime()]
      : cmode === 2 ? [new Date(new Date(ra).getFullYear() - 1, new Date(ra).getMonth(), new Date(ra).getDate()).getTime(), new Date(new Date(rb).getFullYear() - 1, new Date(rb).getMonth(), new Date(rb).getDate()).getTime()]
        : [ra - len * DAY, ra - DAY];
  const rangeTxt = (a: number, b: number) => (a === b ? dfmt(isoOf(a)) : `${dfmt(isoOf(a))} – ${dfmt(isoOf(b))}`);
  // Meta's delivery, as Ads Manager last said (crm_ad_names.meta_status, hourly).
  // …else by its last lead, as Assignment's filter (adStatusOf, 2026-10-23).
  const status = (adId: string): string | null => adStatusOf(data.adNames?.[adId], data.customers.filter(c => (c.adId ?? `ch:${c.channel}`) === adId).map(c => c.createdAt).sort().at(-1) ?? null, now);
  // Meta's figures for a range (read by DeskScreens through fetchAdInsights into ui.apMeta, keyed "from|to").
  const rkey = (a: number, b: number) => `${isoOf(a)}|${isoOf(b)}`;
  const metaOf = (ids: string[], a: number, b: number) => ids.map(id => ui.apMeta?.[rkey(a, b)]?.[id]);
  // Every ad, as Ads to teams lists them (the owner, 2026-10-22: "全部的广告也要在这里"): the ones that brought leads, and the
  // ones added before their first lead (adNames' `added`, crm_add_ad) with 0s.
  const added = Object.entries(data.adNames ?? {}).filter(([, n]) => n.added).map(([id]) => id);
  // An ad hidden by a right click on its name (crm_hide_ad, CRM · Manage; the owner, 2026-10-24: "hide ads 的部分只需要在電腦版，
  // 你幫我做右鍵點擊廣告名稱可以選擇hide") is left out — the list and the total — unless *Hidden ads · show* is on.
  const hiddenN = new Set([...data.customers.map(c => c.adId ?? ""), ...added].filter(id => id && data.adNames?.[id]?.hidden)).size;
  // The source picked (the owner, 2026-10-27: DC and The Conts, each WhatsApp · Messenger): an ad's leads from that source, an ad
  // with none yet by its Page; the list, the chart and the total all follow it.
  const src = (ui.apSrc ?? "all") as SourcePick;
  const ads = [...new Set([...data.customers.map(c => c.adId ?? `ch:${c.channel}`), ...added])].filter(id => ui.apShowHidden || !data.adNames?.[id]?.hidden).map(id => { const all = data.customers.filter(c => (c.adId ?? `ch:${c.channel}`) === id), cs = all.filter(c => inSource(c, src));
    const s0 = all[0] ? sourceOf(all[0]) : null, brand = s0?.brandLabel || (brandOf(data.adNames?.[id]?.pageId) ? BRAND_LABEL[brandOf(data.adNames?.[id]?.pageId)!] : "");
    return { id, name: all[0]?.ad ?? data.adNames?.[id]?.name ?? id, ch: !all.length || all.some(c => c.channel === "whatsapp") ? "WhatsApp" : "Messenger", cs, brand, keep: src === "all" || cs.length > 0 || (!all.length && adPageInSource(data.adNames?.[id]?.pageId, src)) }; }).filter(a => a.keep);
  const apStF = ui.apStF;
  const AD = ads.filter(a => apStF === "all" || status(a.id) === apStF);
  const val = (cs: CrmCustomer[], ids: string[], k: string, a: number, b: number): number | null => { const crm = crmFigures(cs, ctx, a, b); return crm[k] ?? metaFigures(metaOf(ids, a, b), crm)[k] ?? null; };
  const cell = (cs: CrmCustomer[], m: (typeof ALL)[number], isTotal: boolean, adId: string, ids: string[]) => {
    if (m[0] === "delivery") return { v: isTotal ? "" : status(adId) ?? "—", cv: "", d: "", dc: "", db: "" };
    const v = val(cs, ids, m[0], ra, rb);
    if (!cmp) return { v: fmt(v, m[3]), cv: "", d: "", dc: "", db: "" };
    const pv = val(cs, ids, m[0], ca, cb); let dd = "—", dc = "var(--crm-muted)", db = "var(--crm-field)";
    if (v != null && pv) { const p = ((v - pv) / pv) * 100, good = p > 0 !== COSTY.test(m[0]); dd = Math.abs(p) < 0.5 ? "0%" : `${p > 0 ? "▲ " : "▼ "}${Math.abs(p).toFixed(0)}%`;
      if (Math.abs(p) >= 0.5) { dc = good ? "var(--crm-brown)" : "var(--crm-oxblood)"; db = good ? "var(--crm-tint-follow)" : "var(--crm-tint-attention)"; } }
    else if (v && !pv) { dd = "New"; dc = "var(--crm-brown)"; db = "var(--crm-tint-follow)"; }
    return { v: fmt(v, m[3]), cv: fmt(pv, m[3]), d: dd, dc, db };
  };
  const srt = ui.apSort;
  const sv = (a: (typeof ads)[number], k: string): number | string => (k === "name" ? a.name : k === "delivery" ? status(a.id) ?? "" : val(a.cs, [a.id], k, ra, rb) ?? -Infinity);
  const ADs = srt ? AD.slice().sort((a, b) => { const x = sv(a, srt.k), y = sv(b, srt.k); const c = typeof x === "string" ? x.localeCompare(String(y)) : x - Number(y); return srt.dir === "asc" ? c : -c; }) : AD;
  const allCs = AD.flatMap(a => a.cs);
  const rows = ADs.map(a => { const st = status(a.id); return { name: a.name, meta: `${a.ch} · ${st ?? "Not synced"}`, dot: st ? ST_META[st][1] : "var(--crm-faint-2)", bg: "#fff", w: 600, cells: cols.map(m => cell(a.cs, m, false, a.id, [a.id])) }; });
  rows.push({ name: `Total · ${AD.length} ads`, meta: rangeTxt(ra, rb), dot: "transparent", bg: "var(--crm-cream-nav)", w: 700, cells: cols.map(m => (m[0] === "delivery" ? { v: "", cv: "", d: "", dc: "", db: "" } : cell(allCs, m, true, "", AD.map(a => a.id)))) });
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
      return { num: dt.getDate(), off: off || future, band: inM && f !== t ? "var(--crm-tint-attention)" : inC && cf !== ct ? "var(--crm-tint-cold)" : "transparent", br: io === rf && rf !== rt ? "19px 0 0 19px" : io === rt && rf !== rt ? "0 19px 19px 0" : "0",
        dotBg: edgeM ? "var(--crm-rust)" : edgeC ? "var(--crm-ink-soft)" : "transparent", fg: edgeM || edgeC ? "#fff" : off || future ? "var(--crm-faint-2)" : "var(--crm-ink)", w: edgeM || edgeC || io === isoOf(T) ? 700 : 500,
        ring: io === isoOf(T) && !edgeM && !edgeC ? "1.5px solid var(--crm-rust)" : "0",
        pick: () => { if (off || future || !d) return; const F = d[fKey]; if (!d.step) upd({ [fKey]: io, [tKey]: io, step: 1, ...(tg === "main" ? { preset: "Custom" } : {}) }); else upd({ [fKey]: io < F ? io : F, [tKey]: io < F ? F : io, step: 0 }); } }; });
    const raw = d?.txt ?? {}, src: Record<string, string> = { from: f, to: t, cf, ct };
    const field = (k: "from" | "to" | "cf" | "ct") => { const isCmp = k === "cf" || k === "ct", bad = raw[k] != null && raw[k] !== "" && !parse(raw[k]);
      return { v: raw[k] ?? (src[k] ? shown(src[k]) : ""), err: bad ? "var(--crm-oxblood)" : "transparent",
        onIn: (e: { target: { value: string } }) => { const v = e.target.value; set(u => (u.dp ? { ...u, dp: { ...u.dp, txt: { ...u.dp.txt, [k]: v } } } : u)); },
        onFocus: () => upd({ target: isCmp ? "cmp" : "main", step: k === "to" || k === "ct" ? 1 : 0 }),
        onBlur: (e: { target: { value: string } }) => { const p = parse(e.target.value); set(u => { if (!u.dp) return u; const tx = { ...u.dp.txt }; if (p) { delete tx[k]; return { ...u, dp: { ...u.dp, [k]: p, txt: tx, preset: "Custom", month: +p.slice(5, 7) - 1, year: +p.slice(0, 4) } }; } if (!e.target.value) delete tx[k]; return { ...u, dp: { ...u.dp, txt: tx } }; }); },
        onKey: (e: { key: string; currentTarget: { blur(): void } }) => { if (e.key === "Enter") e.currentTarget.blur(); } }; };
    const F1 = field("from"), F2 = field("to"), F3 = field("cf"), F4 = field("ct");
    const o = { fromV: F1.v, fromErr: F1.err, fromIn: F1.onIn, fromFocus: F1.onFocus, fromBlur: F1.onBlur, fromKey: F1.onKey,
      toV: F2.v, toErr: F2.err, toIn: F2.onIn, toFocus: F2.onFocus, toBlur: F2.onBlur, toKey: F2.onKey,
      cfV: F3.v, cfErr: F3.err, cfIn: F3.onIn, cfFocus: F3.onFocus, cfBlur: F3.onBlur, cfKey: F3.onKey,
      ctV: F4.v, ctErr: F4.err, ctIn: F4.onIn, ctFocus: F4.onFocus, ctBlur: F4.onBlur, ctKey: F4.onKey };
    return { open: !!d?.open, days: d?.days ?? 30, cmp: !!d?.cmp, cmpTrack: d?.cmp ? "var(--crm-rust)" : "var(--crm-line)", cmpKnob: d?.cmp ? 19 : 3, cmpHint: "Compared with the period just before",
      monthLabel: `${MON[mo]} ${yr}`, from: f ? shown(f) : "", to: t ? shown(t) : "", cf: cf ? shown(cf) : "", ct: ct ? shown(ct) : "",
      fromBd: tg === "main" && d?.step !== 1 ? "var(--crm-rust)" : tg === "main" ? "var(--crm-line)" : "var(--crm-rule)", toBd: tg === "main" && d?.step === 1 ? "var(--crm-rust)" : "var(--crm-rule)",
      cfBd: tg === "cmp" && d?.step !== 1 ? "var(--crm-ink-soft)" : "var(--crm-rule)", ctBd: tg === "cmp" && d?.step === 1 ? "var(--crm-ink-soft)" : "var(--crm-rule)",
      pickMain: () => upd({ target: "main", step: 0 }), pickCmp: () => upd({ target: "cmp", step: 0 }), ...o,
      tgtHint: tg === "cmp" ? "Picking the compare range (blue) · tap a date on the calendar" : "Picking the main range (orange) · tap Compare start to pick the blue one",
      presets: PR.map(([label, a, b]) => { const on = d?.preset === label; return { label, bg: on ? "var(--crm-tint-attention)" : "transparent", fg: on ? "var(--crm-rust)" : "var(--crm-ink)", w: on ? 700 : 550,
        pick: () => { if (tg === "cmp") { upd({ cf: isoOf(a), ct: isoOf(b), step: 0 }); return; } const L = Math.round((b - a) / DAY) + 1; upd({ preset: label, from: isoOf(a), to: isoOf(b), cf: isoOf(a - L * DAY), ct: isoOf(a - DAY), step: 0 }); } }; }),
      cells };
  })();
  // The ranges whose Meta figures the table needs (DeskScreens reads the missing ones; numeric ad ids only).
  const metaIds = AD.map(x => x.id).filter(id => /^[0-9]{5,32}$/.test(id));
  const apNeed = (cmp ? [[ra, rb], [ca, cb]] : [[ra, rb]]).map(([a, b]) => ({ key: rkey(a, b), since: isoOf(a), until: isoOf(b), ids: metaIds.filter(id => !(id in (ui.apMeta?.[rkey(a, b)] ?? {}))) })).filter(n => n.ids.length);

  // The chart over the table (vm/adschart.ts): the range's days, a tile a metric — its total as the table's — and its line.
  const dayKey = rkey(ra, rb), daily = ui.apDaily?.[dayKey] ?? {};
  const apDayNeed = metaIds.filter(id => !(id in daily)).length ? { key: dayKey, since: isoOf(ra), until: isoOf(rb), ids: metaIds.filter(id => !(id in daily)) } : null;
  const slots = ui.apChart ?? CHART_DEF, chosen = slots.filter((k): k is string => !!k);
  const days = daysOf(ra, rb);
  const series = dailySeries(chosen, days, allCs, data.visits, metaIds.map(id => daily[id]));
  const total = (k: string) => val(allCs, AD.map(x => x.id), k, ra, rb);
  const setSlot = (i: number, k: string | null) => set(u => { const s = [...(u.apChart ?? CHART_DEF)]; while (s.length <= i) s.push(null); s[i] = k; return { ...u, apChart: s }; });
  const apChartV = {
    shut: ui.apChartShut, fold: () => set(u => ({ ...u, apChartShut: !u.apChartShut })),
    tableShut: ui.apTableShut, foldTable: () => set(u => ({ ...u, apTableShut: !u.apTableShut })), adsN: AD.length,
    reading: !!apDayNeed && metaIds.length > 0, range: rangeTxt(ra, rb),
    days: days.map(d => ({ iso: d, label: dayLabel(d) })),
    tiles: slots.map((k, i) => {
      if (!k) return null;
      const m = CHART_METRICS.find(x => x[0] === k)!, on = !ui.apChartOff[k];
      return { key: k, label: m[1], total: chartFmt(total(k), m[2]), color: SERIES[i], tint: SERIES_TINT[i], on,
        toggle: () => set(u => ({ ...u, apChartOff: { ...u.apChartOff, [k]: !u.apChartOff[k] } })),
        options: CHART_METRICS.filter(x => x[0] === k || !chosen.includes(x[0])).map(x => ({ v: x[0], label: x[1] })),
        change: (e: { target: { value: string } }) => setSlot(i, e.target.value),
        remove: chosen.length > 1 ? () => setSlot(i, null) : null };
    }),
    canAdd: true,
    // + opens Customise metrics on the chart's tiles — the table's + list (2026-10-23).
    add: () => patch({ pane: "docked", kind: "metrics", mFor: "chart", mDraft: null, mDrag: null }),
    lines: slots.map((k, i) => (k && !ui.apChartOff[k] ? { key: k, color: SERIES[i], fmt: CHART_METRICS.find(x => x[0] === k)![2], label: CHART_METRICS.find(x => x[0] === k)![1], values: series[k] } : null))
      .filter((l): l is NonNullable<typeof l> => !!l),
  };
  // The table a page at a time: 5 / 10 / 20 (v2 frame 05); the total row stays every ad's.
  const per = ui.apPer || 5, pages = Math.max(1, Math.ceil(ADs.length / per)), pg = Math.min(ui.apPg, pages - 1);
  const apPager = { range: ADs.length ? `${pg * per + 1}–${Math.min(ADs.length, pg * per + per)} of ${ADs.length} ads` : "0 ads", per, sizes: [5, 10, 20],
    setPer: (n: number) => patch({ apPer: n, apPg: 0 }), pages, cur: pg, go: (i: number) => patch({ apPg: i }) };
  return {
    apNeed, apDayNeed, apChartV, apPager,
    // Insight › Ads performance (v2 frame 01b) is this page's body under Insight's head.
    kAdsPerf: ui.tab === "adsperf" || (ui.tab === "insight" && ui.insTab === "ads") || (ui.tab === "reports" && ui.rpCat === "ads"),
    // 4a (frame 05): the head's tabs, the table's rows with their channel and Meta's headline, the total under an ink rule.
    ap4: {
      tabs: ([["Today", 4], ["This week", 5], ["This month", 0], ["Custom", "custom"]] as const).map(([label, k]) => ({ label, on: ui.apRange === k,
        custom: k === "custom", pick: () => { if (k !== "custom") patch({ apRange: k }); } })),
      cols: cols.map(m => ({ id: m[0], label: SHORT[m[0]] ?? m[1] + (m[3] === "rm" || m[3] === "rm2" ? " (RM)" : ""), arrow: srt?.k === m[0] ? (srt.dir === "asc" ? "↑" : "↓") : "", num: m[3] !== "t",
        sort: () => set(u => { const c = u.apSort; return { ...u, apSort: !c || c.k !== m[0] ? { k: m[0], dir: "desc" } : c.dir === "desc" ? { k: m[0], dir: "asc" } : null }; }) })),
      rows: ADs.slice(pg * per, pg * per + per).map(a => ({ name: a.name, headline: [a.brand, a.cs.find(c => c.adHeadline)?.adHeadline ?? ""].filter(Boolean).join(" · "), ch: (a.ch === "WhatsApp" ? "whatsapp" : "messenger") as "whatsapp" | "messenger",
        // The ad itself (the newest https link Meta sent with its leads, else Ads Manager), and hiding it from this list.
        url: a.id.startsWith("ch:") ? "" : [...a.cs].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).find(c => c.adUrl?.startsWith("https://"))?.adUrl ?? `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${a.id}`,
        hidden: !!data.adNames?.[a.id]?.hidden,
        hide: data.can.manage && !a.id.startsWith("ch:") ? () => { const on = !data.adNames?.[a.id]?.hidden; void ctx.act.hideAd(a.id, on).then(ok => { if (ok) patch({ toast: on ? `${a.name} hidden from Ads Performance` : `${a.name} shown again` }); }); } : undefined,
        cells: cols.map(m => { const c = cell(a.cs, m, false, a.id, [a.id]), raw = val(a.cs, [a.id], m[0], ra, rb); return { ...c, bar: m[0] === "apptrate" && raw != null ? Math.min(100, Math.round(raw * 2)) : null }; }) })),
      hiddenN, showHidden: !!ui.apShowHidden, toggleHidden: () => patch({ apShowHidden: !ui.apShowHidden }),
      total: { label: `All ${AD.length} ads`, cells: cols.map(m => (m[0] === "delivery" ? { v: "", cv: "", d: "", dc: "", db: "" } : cell(allCs, m, true, "", AD.map(x => x.id)))) },
      cmp,
    },
    apSrcOpen: !!ui.apSrcOpen, apSrcToggle: () => set(u => ({ ...u, apSrcOpen: !u.apSrcOpen, apStOpen: false })), apSrcCur: { label: sourceLabel(src), n: AD.length },
    apSrcOpts: SOURCE_PICKS.map(p => { const on = src === p.v; return { label: p.label, sub: p.sub, bg: on ? "var(--crm-tint-attention)" : "transparent", w: on ? 700 : 550, pad: p.sub ? "22px" : "10px", pick: () => patch({ apSrc: p.v, apSrcOpen: false, apPg: 0 } as Partial<typeof ui>) }; }),
    apStOpen: ui.apStOpen, apStToggle: () => set(u => ({ ...u, apStOpen: !u.apStOpen })), apStCur: { label: ST_META[apStF][0], dot: ST_META[apStF][1], n: AD.length },
    apStOpts: (["all", "Running", "Paused", "Pending"] as const).map(k => { const on = apStF === k, n = k === "all" ? ads.length : ads.filter(a => status(a.id) === k).length;
      return { label: ST_META[k][0], dot: ST_META[k][1], n, bg: on ? ST_META[k][3] : "transparent", fg: on ? ST_META[k][4] : "var(--crm-ink)", w: on ? 700 : 550, pick: () => patch({ apStF: k, apStOpen: false }) }; }),
    apHead: cols.map(m => { const on = srt?.k === m[0]; return { resize: resizer(m[0], 104), unsize: () => unsize(m[0]), label: m[1] + (m[3] === "rm" || m[3] === "rm2" ? " (RM)" : ""), arrow: on ? (srt?.dir === "asc" ? "▲" : "▼") : "↕", ac: on ? "var(--crm-rust)" : "var(--crm-faint-2)", fg: on ? "var(--crm-ink)" : "var(--crm-muted)",
      sort: () => set(u => { const c = u.apSort; return { ...u, apSort: !c || c.k !== m[0] ? { k: m[0], dir: "desc" } : c.dir === "desc" ? { k: m[0], dir: "asc" } : null }; }) }; }),
    apNameArrow: srt?.k === "name" ? (srt.dir === "asc" ? "▲" : "▼") : "↕", apNameAc: srt?.k === "name" ? "var(--crm-rust)" : "var(--crm-faint-2)",
    apSortName: () => set(u => { const c = u.apSort; return { ...u, apSort: !c || c.k !== "name" ? { k: "name", dir: "asc" } : c.dir === "asc" ? { k: "name", dir: "desc" } : null }; }),
    apNameResize: resizer("name", 220), apNameUnsize: () => unsize("name"),
    // A dragged column keeps its width; the others share what is left, as the design's.
    apRows: rows, apNSel: cols.length,
    apCols: [W.name ? `${W.name}px` : "minmax(220px, 1.6fr)", ...(cols.length ? cols : [null]).map(m => (m && W[m[0]] ? `${W[m[0]]}px` : "minmax(104px, 1fr)"))].join(" "),
    apMinW: 40 + (W.name ?? 220) + cols.reduce((n, m) => n + (W[m[0]] ?? 104) + 12, 0),
    apRangeLabel: `${custom ? ui.apPreset || "Custom" : R[ui.apRange as number][0]} · ${rangeTxt(ra, rb)}`, apCmpOn: cmp, apMainShort: rangeTxt(ra, rb), apCmpShort: rangeTxt(ca, cb),
    apCmpLabel: cmp ? `vs ${(CM[cmode === "custom" ? 3 : typeof cmode === "number" ? cmode : 0] ?? CM[0])[1]}` : "Compare",
    apDlOpen: ui.apDlOpen, apToggleDl: () => set(u => ({ ...u, apDlOpen: !u.apDlOpen })),
    apDl: ([["XLS", "Excel (.xlsx)", "var(--crm-tint-follow)", "var(--crm-brown)", "xlsx"], ["CSV", "CSV", "var(--crm-field)", "var(--crm-muted)", "csv"], ["PDF", "PDF report", "var(--crm-tint-attention)", "var(--crm-oxblood)", "pdf"]] as const).map(([tag, label, bg, fg, kind]) => ({ tag, label, bg, fg, hint: "", v: kind,
      pick: () => { patch({ apDlOpen: false }); void download(kind, ["Ad", ...cols.map(m => m[1] + (m[3] === "rm" || m[3] === "rm2" ? " (RM)" : ""))], rows.map(r => [r.name, ...r.cells.map(c => c.v)]), `Ads Performance ${rangeTxt(ra, rb)}`); } })),
    dpOpen: () => set(u => ({ ...u, dp: { open: true, from: custom ? u.apF : isoOf(ra), to: custom ? u.apT : isoOf(rb), cf: isoOf(ca), ct: isoOf(cb), preset: custom ? u.apPreset || "Custom" : R[u.apRange as number][0], cmp: u.apCmp, days: 30, step: 0, target: "main", month: new Date(ra).getMonth(), year: new Date(ra).getFullYear(), txt: {} } })),
    dpCancel: () => upd({ open: false }), dpToggleCmp: () => upd({ cmp: !d?.cmp, target: !d?.cmp ? "cmp" : "main", step: 0 }),
    dpPrev: () => upd({ month: ((d?.month ?? now.getMonth()) + 11) % 12, year: (d?.month ?? now.getMonth()) === 0 ? (d?.year ?? now.getFullYear()) - 1 : d?.year ?? now.getFullYear() }),
    dpNext: () => upd({ month: ((d?.month ?? now.getMonth()) + 1) % 12, year: (d?.month ?? now.getMonth()) === 11 ? (d?.year ?? now.getFullYear()) + 1 : d?.year ?? now.getFullYear() }),
    dpSetDays: (e: { target: { value: string } }) => { const n = Math.max(1, parseInt(e.target.value, 10) || 1); upd({ days: n, preset: `Last ${n} days`, from: isoOf(T - (n - 1) * DAY), to: isoOf(T) }); },
    dpApply: () => set(u => (u.dp ? { ...u, apRange: "custom", apF: u.dp.from, apT: u.dp.to, apCF: u.dp.cf, apCT: u.dp.ct, apPreset: u.dp.preset, apCmp: u.dp.cmp, apCmpMode: "range", dp: { ...u.dp, open: false } } : u)),
    dp: dpVM,
    openMetrics: () => patch({ pane: "docked", kind: "metrics", mFor: "ads", mDraft: null, mDrag: null }),
    saveMetrics: () => set(u => ({ ...u, ...(u.mFor === "cards" ? { insCards: (u.mDraft ?? baseOf(u)).length ? u.mDraft ?? baseOf(u) : INS_CARDS }
      : u.mFor === "chart" ? { apChart: (u.mDraft ?? baseOf(u)).length ? (u.mDraft ?? baseOf(u)).slice(0, CHART_MAX) : CHART_DEF } : { apSel: u.mDraft ?? baseOf(u) }), mDraft: null, mDrag: null, pane: "closed" })),
    mDirty: !!ui.mDraft && JSON.stringify(ui.mDraft) !== JSON.stringify(baseOf(ui)),
    mq: ui.mq, setMq: (e: { target: { value: string } }) => patch({ mq: e.target.value }), resetMetrics: () => patch({ mDraft: [...(forCards ? INS_CARDS : forChart ? CHART_DEF.filter((k): k is string => !!k) : DEF)] }),
    mFoldAllLabel: METRICS.every(g => ui.mFold[g[0]]) ? "Expand all" : "Collapse all",
    mFoldAll: () => set(u => { const all = METRICS.every(g => u.mFold[g[0]]); return { ...u, mFold: { ...u.mFold, ...Object.fromEntries(METRICS.map(g => [g[0], !all])) } }; }),
    mGroups: METRICS.map(([label, src, items]) => ({ label, src, open: !!q || !ui.mFold[label], rot: !!q || !ui.mFold[label] ? 0 : -90, nSel: `${items.filter(m => dsel.includes(m[0])).length} of ${items.filter(m => !(forChart && m[3] === "t")).length}`,
      fold: () => set(u => ({ ...u, mFold: { ...u.mFold, [label]: !u.mFold[label] } })),
      items: items.filter(m => (!q || m[1].toLowerCase().includes(q)) && !(forChart && m[3] === "t")).map(m => { const on = dsel.includes(m[0]);
        return { label: m[1], hint: m[2], on, bg: on ? "var(--crm-rust)" : "#fff", bd: on ? "var(--crm-rust)" : "var(--crm-faint-2)",
          toggle: () => set(u => { const c = u.mDraft ?? baseOf(u); if (!c.includes(m[0]) && u.mFor === "chart" && c.length >= CHART_MAX) return u; return { ...u, mDraft: c.includes(m[0]) ? c.filter(x => x !== m[0]) : [...c, m[0]] }; }) }; }) })).filter(g => g.items.length),
    mOrder: dcols.map((m, i) => { const mvTo = (j: number) => set(u => { const c = [...(u.mDraft ?? baseOf(u))].filter(k => ALL.some(x => x[0] === k)); const [x] = c.splice(i, 1); c.splice(j, 0, x); return { ...u, mDraft: c, mDrag: null }; });
      const dragging = ui.mDrag === i;
      return { n: i + 1, label: m[1], first: i === 0, last: i === dcols.length - 1, upC: i === 0 ? "var(--crm-line)" : "var(--crm-ink-soft)", dnC: i === dcols.length - 1 ? "var(--crm-line)" : "var(--crm-ink-soft)", bg: "#fff",
        sh: dragging ? "0 6px 18px rgba(42,22,12,.22)" : "none", bd: dragging ? "transparent" : "var(--crm-field)", z: dragging ? 2 : 1,
        up: () => { if (i > 0) mvTo(i - 1); }, down: () => { if (i < dcols.length - 1) mvTo(i + 1); },
        rm: () => set(u => ({ ...u, mDraft: (u.mDraft ?? baseOf(u)).filter(k => k !== m[0]) })),
        dStart: (e: { dataTransfer: DataTransfer }) => { e.dataTransfer.effectAllowed = "move"; patch({ mDrag: i }); },
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
