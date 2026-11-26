"use client";
/**
 * Ads performance on the phone (the owner, 2026-10-24: "這個畫面沒有重點 … 參考電腦端做個簡易版的，要有可選時間線，成效圖，
 * 對比，各個廣告數據成效 … 可加減 matric"): a simple version of the desktop's — a period (Today · 7 days · This month · Last
 * month), "vs the period before", up to four metrics picked from the desktop's list (+ / ×), each as a tile with its change,
 * a day-by-day chart of them, and every ad with those figures. The CRM's own figures always; Meta's (spend, cost per lead …)
 * read from Ads Manager on the server, as the desktop's (fetchAdInsights / fetchAdDaily, CRM · Manage).
 */
import { adPageInSource, inSource, SOURCE_PICKS, type SourcePick } from "@/lib/member/crm-source";
import { sourcePickInView } from "@/lib/member/crm-view";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { fetchAdDaily } from "@/app/(member)/member/crm-actions";
import { readAdFigures } from "./ad-figures-read";
import { ALL, METRICS, adBrandOf, feeMonths, metaFigures, monthFee, noAdRepeats } from "../desk/vm/adsperf";
import { ST_META } from "../desk/vm/tokens";
import { adStatusOf } from "@/lib/member/crm-ad-running";
import type { CrmData } from "@/lib/member/crm-data";
import { chartFmt, chartFmtOf, dailySeries, dayLabel, daysOf, isoOf, scaled } from "../desk/vm/adschart";
import { PHONE_TYPE, typePx } from "./type";
import { Ic } from "./icons4a";

/** Frame px, as the rest of 4a (shared/phone4a.tsx › fs). */
const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN = { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;
const DAY = 86_400_000;
const MAX = 4;
/** Four colours that tell apart at a glance (the owner, 2026-10-24: "顏色有點像" — the desktop's series sat too close here). */
const COLORS = ["var(--crm-rust)", "var(--crm-messenger)", "var(--crm-v4-green)", "var(--crm-amber)"]; // v4 8c's four
/** What the phone offers: the CRM's own figures and Meta's that the server reads (the rest of the desktop's list stays there). */
const OFFER = ["leads", "appt", "apptrate", "showup", "showrate", "won", "winrate", "spend", "dbudget", "cpl", "cpappt", "msgconv", "cpmsg", "impr", "reach", "clicks", "ctr", "cpc", "cpm"];
const DEF = ["leads", "apptrate", "spend", "cpl"];
const META = new Set(["spend", "dbudget", "cpl", "cpappt", "cpwon", "msgconv", "cpmsg", "impr", "reach", "clicks", "ctr", "cpc", "cpm", "results", "cpr", "freq", "cpp", "allclk", "ctrall", "cpcall"]);
const defOf = (k: string) => ALL.find(m => m[0] === k);
const LOWER_IS_BETTER = /^(cpl|cpappt|cpwon|cpmsg|cpc|cpm|cpr|cpp|cpcall|spend)$/;

type Range = { a: number; b: number };
const day0 = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const before = (r: Range): Range => { const n = Math.round((r.b - r.a) / DAY) + 1; return { a: r.a - n * DAY, b: r.a - DAY }; };
const short = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace("Sept", "Sep");

/** The CRM's own figures for some customers over a range (as the desktop's crmFigures). */
function crmFigs(cs: CrmCustomer[], visits: CrmVisit[], r: Range): Record<string, number | null> {
  const inR = (iso: string) => { const t = new Date(iso).getTime(); return t >= r.a && t < r.b + DAY; };
  const leads = cs.filter(c => inR(c.createdAt)), ids = new Set(leads.map(c => c.id));
  const vs = visits.filter(v => ids.has(v.customerId) && v.state !== "cancelled");
  const appt = new Set(vs.map(v => v.customerId)).size, showup = vs.filter(v => v.state === "attended").length, won = leads.filter(c => c.status === "won").length;
  return { leads: leads.length, appt, showup, won, apptrate: leads.length ? (appt / leads.length) * 100 : null, showrate: appt ? (showup / appt) * 100 : null, winrate: leads.length ? (won / leads.length) * 100 : null };
}
/** Rates as whole percents on the phone; money and counts as the desktop writes them. */
const show = (k: string, v: number | null | undefined) => { const f = chartFmtOf(defOf(k)?.[3] ?? "n"); return f === "pct" && v != null ? `${Math.round(v)}%` : chartFmt(v, f); };
/** Short names where a long one would be cut (an ad's figures, four across). */
const SHORT: Record<string, string> = { apptrate: "Appt rate", showrate: "Show-up rate", winrate: "Won rate", appt: "Appts", showup: "Showed up", spend: "Spend", cpl: "Per lead", cpappt: "Per appt", msgconv: "Chats started", cpmsg: "Per chat", impr: "Impressions", clicks: "Link clicks", ctr: "CTR", cpc: "CPC", cpm: "CPM" };
const label = (k: string) => SHORT[k] ?? defOf(k)?.[1] ?? k;

/** Meta's last answers on this phone, by ads and dates: shown at once, read again behind them. */
const KEPT = "crm-ads-meta-v1";
function keptGet<T>(k: string): T | undefined { try { return (JSON.parse(localStorage.getItem(KEPT) || "{}") as Record<string, T>)[k]; } catch { return undefined; } }
function keptSet(k: string, v: unknown) { try { const all = JSON.parse(localStorage.getItem(KEPT) || "{}") as Record<string, unknown>; all[k] = v; const ks = Object.keys(all); for (const x of ks.slice(0, Math.max(0, ks.length - 24))) delete all[x]; localStorage.setItem(KEPT, JSON.stringify(all)); } catch { /* storage full or off */ } }

/** The desktop's status filter (Ads Performance › All ads · Running · Paused — adStatusOf, as Assignment's). */
/** The brand row's three, as the Overview's. */
const BRAND_ROW: [SourcePick, string][] = [["all", "All"], ["conts", "The Conts"], ["dc", "Dream Crafter"]];
/** How often a range still running is read again while the screen is open (2026-11-25: "所有的数据都要 up to date"). */
const REFRESH_MS = 10 * 60_000;
export const AD_STATUSES =["all", "Running", "Paused"] as const; // no Pending (the owner, 2026-11-08: "广告不会有pending")
export type AdStatusPick = (typeof AD_STATUSES)[number];

export function Phone4aAdsPerf({ p, head }: { p: { customers: CrmCustomer[]; visits: CrmVisit[]; adNames: NonNullable<CrmData["adNames"]>; now: Date; live: boolean; manage: boolean;
  /** The Revenue app's view (2026-11-23): only its own brand's sources are offered. */
  view?: CrmData["view"];
  range: Range; cmp: Range | null; chips: { label: string; on: boolean; pick: () => void }[]; custom: boolean; openDates: () => void; openCompare: () => void; clearCompare: () => void }; head?: ReactNode }) {
  const cmp = !!p.cmp, [keys, setKeys] = useState(DEF), [pick, setPick] = useState(false), [openAd, setOpenAd] = useState<string | null>(null), [src, setSrc] = useState<SourcePick>("all");
  // The source picked (the owner, 2026-10-27): The Conts / DC, each by WhatsApp · Messenger — the ads, tiles and chart follow it.
  const customers = useMemo(() => p.customers.filter(c => inSource(c, src)), [p.customers, src]);
  // Meta's figures are read on every open and again every 10 minutes while the page stays open (2026-11-25, the owner: "所有的
  // 数据都要 up to date"); the server keeps a running range's answer as long.
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), REFRESH_MS); return () => clearInterval(t); }, []);
  // Insight's period and comparison (the panel's sheet: Period · Compare to); with no comparison picked, the period before.
  const r = p.range, rb = p.cmp ?? before(r);
  // Every ad a lead came from in the two periods, or one Ads Manager lists (adNames), most leads first.
  // As the desktop's (2026-11-26, the owner: "确保手机版，电脑版都同步" — the phone read 178 leads where the desktop and the
  // Overview read 190): the leads that came from no ad are rows of their own ("No ad · WhatsApp" / "· Messenger", key
  // `ch:<channel>`), each person once (noAdRepeats), and an ad added before its first lead whose Page is the source's is listed.
  const repeats = useMemo(() => noAdRepeats(p.customers), [p.customers]);
  const ads = useMemo(() => {
    const keyOf = (c: CrmCustomer) => c.adId ?? `ch:${c.channel}`;
    const ids = new Set<string>(); customers.forEach(c => { if (!repeats.has(c.id)) ids.add(keyOf(c)); });
    for (const [id, n] of Object.entries(p.adNames)) if (n.added && !n.hidden && adPageInSource(n.pageId, src)) ids.add(id);
    return [...ids].map(id => { const cs = customers.filter(c => keyOf(c) === id && !repeats.has(c.id));
      const name = id.startsWith("ch:") ? `No ad · ${id === "ch:whatsapp" ? "WhatsApp" : "Messenger"}` : p.adNames[id]?.name ?? cs[0]?.ad ?? id;
      return { id, name, cs, hidden: !!p.adNames[id]?.hidden,
      // The ad itself: the link Meta sent with its leads, else Ads Manager (the owner, 2026-10-24: "加個按鈕可以導入去看那隻廣告").
      url: id.startsWith("ch:") ? "" : `/member/crm-ad/${encodeURIComponent(id)}` }; });
  }, [customers, p.adNames, repeats, src]);
  // Each ad's status, as the desktop's filter works it out: Ads Manager's word, else its last lead (the owner, 2026-11-08:
  // "没得选状态？" — the phone had no status filter). An ad of another status leaves the list, the tiles and the chart.
  const [menu, setMenu] = useState<"per" | "src" | "st" | null>(null);
  useEffect(() => {
    if (!menu) return;
    const on = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-ads-filters]")) setMenu(null); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [menu]);
  const [stF, setStF] = useState<AdStatusPick>("Running"); // Running first (the owner, 2026-11-09: "ads performance 默认开 running")
  const statusOf = (a: (typeof ads)[number]) => adStatusOf(p.adNames[a.id], a.cs.map(c => c.createdAt).sort().at(-1) ?? null, p.now);
  const stCount = (k: AdStatusPick) => ads.filter(a => !a.hidden && (k === "all" || statusOf(a) === k)).length;
  // An ad hidden earlier (crm_hide_ad) stays out of the list and the totals; so does one of another status.
  const hidIds = new Set(ads.filter(a => a.hidden || (stF !== "all" && statusOf(a) !== stF)).map(a => a.id));
  // Meta is asked for real ads only (a "No ad" row has no spend).
  const ids = ads.filter(a => !hidIds.has(a.id) && /^[0-9]{5,32}$/.test(a.id)).map(a => a.id), si = isoOf(r.a), ui = isoOf(r.b), sb = isoOf(rb.a), ub = isoOf(rb.b);
  // Meta's figures, read on the server (CRM · Manage); none on the demo.
  // Drawn from the phone's last answer from the first frame — after the app was closed too — then read again (the owner, 2026-10-24).
  const idKey = [...ids].sort().join(","), kA = `f|${si}|${ui}`, kD = `d|${si}|${ui}`, kB = `f|${sb}|${ub}`; // by dates only: the answers are by ad, so a new ad keeps the rest on screen
  const [figA, setFigA] = useState<Record<string, MetaFig | null>>(() => keptGet(kA) ?? {}), [figB, setFigB] = useState<Record<string, MetaFig | null>>(() => keptGet(kB) ?? {}), [daily, setDaily] = useState<Record<string, Record<string, MetaFig> | null>>(() => keptGet(kD) ?? {});
  const wantMeta = p.live && p.manage && keys.some(k => META.has(k)) && ids.length > 0;
  useEffect(() => {
    if (!wantMeta) return;
    let on = true;
    const a0 = keptGet<Record<string, MetaFig | null>>(kA), d0 = keptGet<Record<string, Record<string, MetaFig> | null>>(kD), b0 = keptGet<Record<string, MetaFig | null>>(kB);
    if (a0) setFigA(a0); if (d0) setDaily(d0); if (b0) setFigB(b0);
    // The period and the one compared, in one GET (ad-figures-read.ts: never queued behind the 5 s re-read; kept on the server).
    void readAdFigures([{ key: "a", since: si, until: ui, ids }, ...(cmp ? [{ key: "b", since: sb, until: ub, ids }] : [])], got => {
      if (!on) return;
      if (got.a) { setFigA(got.a); keptSet(kA, got.a); }
      if (got.b) { setFigB(got.b); keptSet(kB, got.b); }
    });
    void fetchAdDaily(ids, si, ui).then(x => { if (on && x.ok) { setDaily(x.days); keptSet(kD, x.days); } });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMeta, idKey, si, ui, sb, ub, cmp, tick]);

  const T = new Date(p.now.getFullYear(), p.now.getMonth(), p.now.getDate()).getTime();
  const feeIds = ads.map(a => a.id).filter(id => /^[0-9]{5,32}$/.test(id)), feeKey = [...feeIds].sort().join(",");
  const monthsOf = (rr: Range) => feeMonths(rr.a, rr.b, T);
  const brandOfFee = adBrandOf(p.customers, id => p.adNames[id]?.pageId);
  const [feeFig, setFeeFig] = useState<Record<string, Record<string, MetaFig | null>>>(() => keptGet("fee") ?? {});
  const feeWant = [...monthsOf(r), ...monthsOf(rb)].map(([x, y]) => `${isoOf(x)}|${isoOf(y)}`).filter((k, n, l) => l.indexOf(k) === n), feeWantKey = feeWant.join(",");
  useEffect(() => {
    if (!p.live || !p.manage || !feeIds.length || !keys.includes("cpl")) return;
    let on = true;
    // Every month the fee is read on, in one GET (it was a Server Action a month, one after another — Per lead waited on all).
    void readAdFigures(feeWant.map(k => { const [x, y] = k.split("|"); return { key: k, since: x, until: y, ids: feeIds }; }), got => {
      if (on) setFeeFig(f => { const n = { ...f, ...got }; keptSet("fee", n); return n; });
    });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.live, p.manage, feeKey, feeWantKey, keys.includes("cpl"), tick]);
  // The fee on a range's months as a share of their spend; null until each month is read (the desktop's feeRate).
  const rateOf = (rr: Range): number | null => {
    // RM 2,500 a month for each brand that spent (monthFee — "每个品牌各2500", 2026-11-25).
    const ms = monthsOf(rr).map(([x, y]) => { const got = feeFig[`${isoOf(x)}|${isoOf(y)}`]; return monthFee(feeIds, brandOfFee, ids => (!got || ids.some(id => !(id in got)) ? null : ids.reduce((s, id) => s + (got[id]?.spend ?? 0), 0))); });
    if (!ms.length || ms.some(m => m == null)) return null;
    const spent = ms.reduce((n: number, m) => n + (m?.spent ?? 0), 0), fee = ms.reduce((n: number, m) => n + (m?.fee ?? 0), 0);
    return spent > 0 ? fee / spent : 0;
  };
  // Each person once, as the Overview and the desktop (noAdRepeats above, 2026-11-25 — the owner: "之前有些事重复到wa & messager 的有减去了嘛？"): a "no ad" chat that is already an ad's lead is not a lead again.
  const totalLeads = (rr: Range) => customers.filter(c => { const t = day0(new Date(c.createdAt).getTime()); return !repeats.has(c.id) && !(c.adId && p.adNames[c.adId]?.hidden) && t >= rr.a && t <= rr.b; }).length;
  const perLeadOf = (rr: Range, fig: Record<string, MetaFig | null>): number | null => {
    const spend = metaFigures(ids.map(i => fig[i]), {}).spend, rate = rateOf(rr), n = totalLeads(rr);
    return spend == null || rate == null || !n ? null : (spend * (1 + rate)) / n;
  };
  const figsOf = (cs: CrmCustomer[], rr: Range, metaIds: string[], fig: Record<string, MetaFig | null>) => { const c = crmFigs(cs, p.visits, rr); return { ...c, ...metaFigures(metaIds.map(i => fig[i]), c) }; };
  // Every lead of the rows shown — the "No ad" rows' too, as the desktop's strip (each person once).
  const all = ads.filter(a => !hidIds.has(a.id)).flatMap(a => a.cs);
  // An ad's own Per lead carries its share of the month's fee, as the desktop's rows and the Overview's (it was spend ÷ leads).
  const rowCpl = (cs: CrmCustomer[], rr: Range, id: string, fig: Record<string, MetaFig | null>): number | null => {
    const spend = metaFigures([fig[id]], {}).spend, rate = rateOf(rr), n = crmFigs(cs, p.visits, rr).leads;
    return spend == null || rate == null || !n ? null : (spend * (1 + rate)) / n;
  };
  // Per lead, as the desktop's (the owner, 2026-11-17: "ads performance 的 per lead 也一起改"): (ads spend + the marketing
  // fee's share) ÷ every lead of the period in the source picked — the fee is the calendar months' on all the source's ads.
  const tot: Record<string, number | null> = { ...figsOf(all, r, ids, figA), cpl: perLeadOf(r, figA) }, totB: Record<string, number | null> = { ...figsOf(all, rb, ids, figB), cpl: perLeadOf(rb, figB) };
  const days = daysOf(r.a, r.b), series = dailySeries(keys, days, all, p.visits, ids.map(i => daily[i]));
  const rows = ads.filter(a => !hidIds.has(a.id)).map(a => ({ ...a, f: { ...figsOf(a.cs, r, [a.id], figA), cpl: rowCpl(a.cs, r, a.id, figA) } as Record<string, number | null>, fb: cmp ? ({ ...figsOf(a.cs, rb, [a.id], figB), cpl: rowCpl(a.cs, rb, a.id, figB) } as Record<string, number | null>) : null })).filter(a => (a.f.leads ?? 0) > 0 || figA[a.id]).sort((x, y) => (y.f.leads ?? 0) - (x.f.leads ?? 0));
  // The change on the comparison picked — the tiles and every ad's figures (the owner, 2026-10-24: "进行对比后，下方数据并没有显示增多或减少").
  const change = (k: string, a: number | null | undefined, b: number | null | undefined) => {
    if (!cmp || a == null || b == null) return null;
    if (b === 0) return a === 0 ? { t: "±0", good: true } : { t: "New", good: !LOWER_IS_BETTER.test(k) };
    const d = ((a - b) / Math.abs(b)) * 100, good = LOWER_IS_BETTER.test(k) ? d <= 0 : d >= 0;
    return { t: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(Math.round(d))}%`, good };
  };
  const delta = (k: string) => change(k, tot[k], totB[k]);
  const card: CSSProperties = { borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-nav-line)" };
  // v4 8c: the three dropdowns.
  const pill: CSSProperties = { ...BTN, flex: "0 1 auto", minWidth: 0, height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "18px", display: "flex", alignItems: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, background: "var(--crm-field)", color: "var(--crm-ink)", whiteSpace: "nowrap" };
  const opt = (on: boolean): CSSProperties => ({ ...BTN, flex: "none", minHeight: "40px", padding: "8px 10px", boxSizing: "border-box", borderRadius: "8px", display: "flex", alignItems: "center", gap: "8px", fontSize: fs(13), fontWeight: on ? 600 : 400, background: on ? "var(--crm-field)" : "transparent", color: "var(--crm-ink)", textAlign: "left" });
  const perWord = p.custom ? `${short(r.a)}${r.a !== r.b ? ` – ${short(r.b)}` : ""}` : p.chips.find(c => c.on)?.label ?? "Period";
  // The brand, as the Overview's row (2026-11-25, the owner: "ads performance 要可以选品牌"): All · The Conts · Dream Crafter
  // over the dropdowns; the source dropdown then offers that brand's channels. Not drawn while the Revenue app's view holds
  // the CRM to one brand (sourcePickInView offers none but its own).
  const brand: SourcePick = src === "all" ? "all" : (src.split(":")[0] as SourcePick);
  const brands = BRAND_ROW.filter(([k]) => k === "all" || (sourcePickInView(p, k) && (!p.view || p.view.brands.length > 1)));
  const srcOpts = SOURCE_PICKS.filter(o => sourcePickInView(p, o.v) && (brand === "all" || o.v === brand || o.v.startsWith(`${brand}:`)))
    .map(o => (o.v === brand && brand !== "all" ? { ...o, label: "All sources" } : o));
  const srcWord = src === brand && brand !== "all" ? "All sources" : SOURCE_PICKS.find(o => o.v === src)?.label ?? "All sources";

  return (
    <main style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {head}
      {brands.length > 1 && (
        <div role="group" aria-label="Brand" data-ads-brand="" style={{ flex: "none", display: "flex", padding: "3px", borderRadius: "18px", background: "var(--crm-field)" }}>
          {brands.map(([k, label]) => <button key={k} type="button" onClick={() => { setMenu(null); setSrc(k); }} aria-pressed={brand === k} style={{ ...BTN, flex: 1, height: "30px", borderRadius: "15px", fontSize: fs(12), fontWeight: brand === k ? 600 : 500,
            background: brand === k ? "#fff" : "transparent", boxShadow: brand === k ? "0 1px 2px #2A160C1F" : "none", color: brand === k ? "var(--crm-ink)" : "var(--crm-muted)" }}>{label}</button>)}
        </div>
      )}
      {/* v4 8c: the period, the source and the status — one row of three dropdowns (the chip rows and the date line go). */}
      <div data-ads-filters="" style={{ flex: "none", position: "relative", zIndex: 6, display: "flex", alignItems: "center", gap: "6px" }}>
        <button type="button" aria-label={`Period: ${perWord}`} aria-expanded={menu === "per"} onClick={() => setMenu(m => (m === "per" ? null : "per"))} style={pill}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{perWord}</span><Ic name="chevron-down" size={13} /></button>
        <button type="button" aria-label={`Source: ${srcWord}`} aria-expanded={menu === "src"} onClick={() => setMenu(m => (m === "src" ? null : "src"))} style={pill}><span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{srcWord}</span><Ic name="chevron-down" size={13} /></button>
        <button type="button" aria-label={`Status: ${ST_META[stF][0]}`} aria-expanded={menu === "st"} onClick={() => setMenu(m => (m === "st" ? null : "st"))} style={pill}>
          {stF !== "all" && <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: stF === "Running" ? "var(--crm-v4-green)" : ST_META[stF][1] }} />}
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{ST_META[stF][0]} {stCount(stF)}</span><Ic name="chevron-down" size={13} /></button>
        {menu && (
          <div role="listbox" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 7, padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto" }}>
            {menu === "per" && [...p.chips.map(c => ({ k: c.label, label: c.label, on: c.on && !p.custom, go: c.pick })), { k: "Custom", label: "Custom…", on: p.custom, go: p.openDates }].map(o => <button key={o.k} type="button" role="option" aria-selected={o.on} onClick={() => { setMenu(null); o.go(); }} style={opt(o.on)}>{o.label}</button>)}
            {menu === "src" && srcOpts.map(o => <button key={o.v} type="button" role="option" aria-selected={src === o.v} onClick={() => { setMenu(null); setSrc(o.v); }} style={opt(src === o.v)}>{o.label}</button>)}
            {menu === "st" && AD_STATUSES.map(k => <button key={k} type="button" role="option" aria-selected={stF === k} onClick={() => { setMenu(null); setStF(k); }} style={opt(stF === k)}>{k !== "all" && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: k === "Running" ? "var(--crm-v4-green)" : ST_META[k][1] }} />}{ST_META[k][0]}<span style={{ marginLeft: "auto", color: "var(--crm-faint)" }}>{stCount(k)}</span></button>)}
          </div>
        )}
      </div>
      {cmp && <div style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "-6px", fontSize: fs(12), color: "var(--crm-muted)" }}>vs {short(rb.a)}{rb.a !== rb.b ? ` – ${short(rb.b)}` : ""}
        <button type="button" aria-label="Stop comparing" onClick={p.clearCompare} style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={12} /></button></div>}

      {/* The metrics: a tile each, × to take one off, + to add (up to four) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {keys.map((k, i) => { const d = delta(k), def = defOf(k); return (
          <div key={k} style={{ ...card, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "2px", boxShadow: `inset 3px 0 0 ${COLORS[i]}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: fs(12), color: "var(--crm-muted)", paddingRight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label(k)}</span>
            {/* v4 8c: the change beside its figure; "vs before" said once, not on every tile. */}
            <span style={{ display: "flex", alignItems: "baseline", gap: "8px", minWidth: 0, whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: TIGHT, fontSize: fs(20), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{show(k, tot[k])}</span>
              {d && <span data-delta="" style={{ fontSize: fs(11), fontWeight: 500, color: d.good ? "var(--crm-v4-green)" : "var(--crm-oxblood)" }}>{d.t}</span>}
            </span>
            {keys.length > 1 && <button type="button" aria-label={`Remove ${def?.[1] ?? k}`} onClick={() => setKeys(keys.filter(x => x !== k))} style={{ ...BTN, position: "absolute", top: "8px", right: "8px", display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={12} /></button>}
          </div>); })}
        {keys.length < MAX && <button type="button" onClick={() => setPick(true)} style={{ ...BTN, ...card, borderStyle: "dashed", minHeight: "74px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)" }}><Ic name="plus" size={14} />Metric</button>}
      </div>

      {/* Day by day: one line a metric, each against its own highest day */}
      <div style={{ ...card, padding: "12px" }}>
        <Chart days={days} lines={keys.map((k, i) => ({ k, c: COLORS[i], v: series[k] ?? [] }))} />
      </div>

      {/* Every ad with those figures */}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <span style={{ display: "flex", alignItems: "baseline", gap: "6px", fontFamily: TIGHT, fontSize: fs(15), fontWeight: 500, marginBottom: "8px" }}>By ad <span style={{ fontFamily: "Inter, sans-serif", fontSize: fs(12), fontWeight: 400, color: "var(--crm-faint)" }}>{rows.length}</span></span>
        {!rows.length && <span style={{ padding: "12px 0", fontSize: fs(13), color: "var(--crm-faint)" }}>No leads from an ad in this period.</span>}
        {rows.map(a => { const on = openAd === a.id; return (
          <div key={a.id} data-ad-row="" role="button" tabIndex={0} onClick={() => setOpenAd(on ? null : a.id)} style={{ ...BTN, padding: "10px 0", borderBottom: "1px solid var(--crm-rule-soft)", display: "flex", flexDirection: "column", gap: "6px", textAlign: "left" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: on ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              {/* View ad, a small icon right of the name (the owner, 2026-10-24: "只需要view ad（做成小小的圖標即可）做廣告名字右邊"). */}
              <a href={a.url} target="_blank" rel="noopener noreferrer" title="View ad" aria-label="View ad" onClick={e => e.stopPropagation()} style={{ flex: "none", width: "26px", height: "26px", margin: "-5px -6px -5px 0", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}><Ic name="arrow-up-right" size={13} /></a>
            </span>
            <span style={{ display: "grid", gridTemplateColumns: `repeat(${keys.length}, minmax(0,1fr))`, gap: "6px" }}>
              {/* v4 8c: the metric names go — each figure's dot is its tile's colour above. */}
              {keys.map((k, i) => <span key={k} title={label(k)} style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: fs(13), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden" }}><span style={{ flex: "none", width: "6px", height: "6px", borderRadius: "50%", background: COLORS[i] }} />{show(k, a.f[k])}</span>
                {cmp && (() => { const c = change(k, a.f[k], a.fb?.[k]); return <span style={{ fontSize: fs(10.5), fontWeight: 500, whiteSpace: "nowrap", color: c ? (c.good ? "var(--crm-v4-green)" : "var(--crm-oxblood)") : "var(--crm-faint)" }}>{c ? c.t : "—"}</span>; })()}
              </span>)}
            </span>
            {on && <span style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", paddingTop: "8px", borderTop: "1px solid var(--crm-rule-soft)", fontSize: fs(12), color: "var(--crm-muted)" }}>
              {["leads", "appt", "showup", "won", "spend", "cpl"].filter(k => !keys.includes(k)).map(k => <span key={k} style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}><span>{label(k)}</span><b style={{ fontWeight: 500, color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{show(k, a.f[k])}</b></span>)}
            </span>}
          </div>); })}
      </div>
      {!p.live && <span style={{ fontSize: fs(11), color: "var(--crm-faint)" }}>Spend and costs come from Ads Manager on the live CRM.</span>}

      {/* The metric picker */}
      {pick && <div onClick={() => setPick(false)} style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(42,22,12,.38)" }}>
        <div role="dialog" aria-label="Add a metric" onClick={e => e.stopPropagation()} style={{ maxHeight: "70%", display: "flex", flexDirection: "column", borderRadius: "24px 24px 0 0", background: "#fff" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", margin: "8px 0 4px", borderRadius: "2px", background: "var(--crm-line)" }} />
          <div style={{ display: "flex", alignItems: "center", padding: "6px 20px 10px" }}>
            <span style={{ flex: 1, fontFamily: TIGHT, fontSize: fs(16), fontWeight: 500 }}>Add a metric</span>
            <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{keys.length} of {MAX}</span>
          </div>
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", padding: "0 20px calc(16px + var(--safe-bottom, 0px))" }}>
            {METRICS.map(([g, , ms]) => { const list = ms.filter(m => OFFER.includes(m[0])); return list.length ? (
              <div key={g} style={{ display: "flex", flexDirection: "column", padding: "6px 0" }}>
                <span style={{ fontSize: fs(11), fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--crm-faint)", padding: "4px 0" }}>{g}</span>
                {list.map(m => { const on = keys.includes(m[0]); return (
                  <button key={m[0]} type="button" disabled={!on && keys.length >= MAX} onClick={() => { setKeys(on ? keys.filter(x => x !== m[0]) : [...keys, m[0]]); if (!on && keys.length + 1 >= MAX) setPick(false); }}
                    style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", padding: "9px 0", borderTop: "1px solid var(--crm-rule-soft)", textAlign: "left", opacity: !on && keys.length >= MAX ? 0.4 : 1 }}>
                    <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}><span style={{ fontSize: fs(13.5), color: "var(--crm-ink)" }}>{m[1]}</span><span style={{ fontSize: fs(11), color: "var(--crm-faint)" }}>{m[2]}</span></span>
                    <span style={{ flex: "none", width: "20px", height: "20px", borderRadius: "6px", display: "grid", placeItems: "center", border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, background: on ? "var(--crm-rust)" : "#fff", color: "#fff" }}>{on && <Ic name="check" size={12} />}</span>
                  </button>); })}
              </div>) : null; })}
          </div>
        </div>
      </div>}
    </main>
  );
}

/** A small line chart: each metric against its own highest day, the first and last day under it. */
function Chart({ days, lines }: { days: string[]; lines: { k: string; c: string; v: (number | null)[] }[] }) {
  const W = 320, H = 120, n = Math.max(1, days.length - 1);
  const path = (v: (number | null)[]) => { const s = scaled(v); let d = ""; s.forEach((y, i) => { if (y == null) return; d += `${d ? "L" : "M"}${((i / n) * W).toFixed(1)},${(H - 6 - y * (H - 12)).toFixed(1)}`; }); return d; };
  const empty = lines.every(l => l.v.every(x => x == null || x === 0));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="96" preserveAspectRatio="none" role="img" aria-label="Day by day">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--crm-rule-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {lines.map(l => <path key={l.k} d={path(l.v)} fill="none" stroke={l.c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs(11), color: "var(--crm-faint)" }}>
        <span>{days[0] ? dayLabel(days[0]) : ""}</span>{empty && <span>No activity yet</span>}<span>{days.length > 1 ? dayLabel(days[days.length - 1]) : ""}</span>
      </div>
    </div>
  );
}
