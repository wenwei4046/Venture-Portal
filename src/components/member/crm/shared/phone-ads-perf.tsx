"use client";
/**
 * Ads performance on the phone (the owner, 2026-10-24: "這個畫面沒有重點 … 參考電腦端做個簡易版的，要有可選時間線，成效圖，
 * 對比，各個廣告數據成效 … 可加減 matric"): a simple version of the desktop's — a period (Today · 7 days · This month · Last
 * month), "vs the period before", up to four metrics picked from the desktop's list (+ / ×), each as a tile with its change,
 * a day-by-day chart of them, and every ad with those figures. The CRM's own figures always; Meta's (spend, cost per lead …)
 * read from Ads Manager on the server, as the desktop's (fetchAdInsights / fetchAdDaily, CRM · Manage).
 */
import { inSource, SOURCE_PICKS, type SourcePick } from "@/lib/member/crm-source";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { fetchAdDaily, fetchAdInsights } from "@/app/(member)/member/crm-actions";
import { ALL, METRICS, metaFigures } from "../desk/vm/adsperf";
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
const COLORS = ["var(--crm-rust)", "var(--crm-messenger)", "var(--crm-today)", "var(--crm-amber)"];
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

export function Phone4aAdsPerf({ p, head }: { p: { customers: CrmCustomer[]; visits: CrmVisit[]; adNames: Record<string, { name: string; hidden?: boolean }>; now: Date; live: boolean; manage: boolean;
  range: Range; cmp: Range | null; chips: { label: string; on: boolean; pick: () => void }[]; custom: boolean; openDates: () => void; openCompare: () => void; clearCompare: () => void }; head?: ReactNode }) {
  const cmp = !!p.cmp, [keys, setKeys] = useState(DEF), [pick, setPick] = useState(false), [openAd, setOpenAd] = useState<string | null>(null), [src, setSrc] = useState<SourcePick>("all");
  // The source picked (the owner, 2026-10-27): The Conts / DC, each by WhatsApp · Messenger — the ads, tiles and chart follow it.
  const customers = useMemo(() => p.customers.filter(c => inSource(c, src)), [p.customers, src]);
  // Insight's period and comparison (the panel's sheet: Period · Compare to); with no comparison picked, the period before.
  const r = p.range, rb = p.cmp ?? before(r);
  // Every ad a lead came from in the two periods, or one Ads Manager lists (adNames), most leads first.
  const ads = useMemo(() => {
    const ids = new Set<string>(); customers.forEach(c => { if (c.adId) ids.add(c.adId); });
    return [...ids].map(id => { const cs = customers.filter(c => c.adId === id); return { id, name: p.adNames[id]?.name ?? cs[0]?.ad ?? id, cs, hidden: !!p.adNames[id]?.hidden,
      // The ad itself: the link Meta sent with its leads, else Ads Manager (the owner, 2026-10-24: "加個按鈕可以導入去看那隻廣告").
      url: [...cs].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).find(c => c.adUrl?.startsWith("https://"))?.adUrl ?? `https://adsmanager.facebook.com/adsmanager/manage/ads?selected_ad_ids=${id}` }; });
  }, [customers, p.adNames]);
  // An ad hidden earlier (crm_hide_ad) stays out of the list and the totals.
  const hidIds = new Set(ads.filter(a => a.hidden).map(a => a.id));
  const ids = ads.filter(a => !a.hidden).map(a => a.id), si = isoOf(r.a), ui = isoOf(r.b), sb = isoOf(rb.a), ub = isoOf(rb.b);
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
    void fetchAdInsights(ids, si, ui).then(x => { if (on && x.ok) { setFigA(x.figs); keptSet(kA, x.figs); } });
    void fetchAdDaily(ids, si, ui).then(x => { if (on && x.ok) { setDaily(x.days); keptSet(kD, x.days); } });
    if (cmp) void fetchAdInsights(ids, sb, ub).then(x => { if (on && x.ok) { setFigB(x.figs); keptSet(kB, x.figs); } });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMeta, idKey, si, ui, sb, ub, cmp]);

  const figsOf = (cs: CrmCustomer[], rr: Range, metaIds: string[], fig: Record<string, MetaFig | null>) => { const c = crmFigs(cs, p.visits, rr); return { ...c, ...metaFigures(metaIds.map(i => fig[i]), c) }; };
  const all = customers.filter(c => c.adId && !hidIds.has(c.adId));
  const tot = figsOf(all, r, ids, figA), totB = figsOf(all, rb, ids, figB);
  const days = daysOf(r.a, r.b), series = dailySeries(keys, days, all, p.visits, ids.map(i => daily[i]));
  const rows = ads.filter(a => !a.hidden).map(a => ({ ...a, f: figsOf(a.cs, r, [a.id], figA), fb: cmp ? figsOf(a.cs, rb, [a.id], figB) : null })).filter(a => (a.f.leads ?? 0) > 0 || figA[a.id]).sort((x, y) => (y.f.leads ?? 0) - (x.f.leads ?? 0));
  // The change on the comparison picked — the tiles and every ad's figures (the owner, 2026-10-24: "进行对比后，下方数据并没有显示增多或减少").
  const change = (k: string, a: number | null | undefined, b: number | null | undefined) => {
    if (!cmp || a == null || b == null) return null;
    if (b === 0) return a === 0 ? { t: "±0", good: true } : { t: "New", good: !LOWER_IS_BETTER.test(k) };
    const d = ((a - b) / Math.abs(b)) * 100, good = LOWER_IS_BETTER.test(k) ? d <= 0 : d >= 0;
    return { t: `${d > 0 ? "+" : d < 0 ? "−" : "±"}${Math.abs(Math.round(d))}%`, good };
  };
  const delta = (k: string) => change(k, tot[k], totB[k]);
  const chip = (on: boolean): CSSProperties => ({ ...BTN, flex: "none", height: "30px", padding: "0 12px", borderRadius: "15px", fontSize: fs(12.5), fontWeight: 500, background: on ? "var(--crm-rust)" : "var(--crm-field)", color: on ? "#fff" : "var(--crm-ink)" });
  const card: CSSProperties = { borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)" };

  return (
    <main style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
      {head}
      {/* The period, and "vs the period before" */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          {p.chips.map(c => <button key={c.label} type="button" onClick={c.pick} style={chip(c.on)}>{c.label}</button>)}
          <span style={{ marginLeft: "auto" }} />
          {/* One button: its sheet has Period and Compare to (the owner, 2026-10-24, of a second compare button: "刪掉右邊的"). */}
          <button type="button" aria-label="Pick dates" title="Pick dates" aria-pressed={p.custom} onClick={p.openDates} style={{ ...BTN, flex: "none", width: "30px", height: "30px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", background: p.custom ? "var(--crm-ink)" : "#fff", color: p.custom ? "#fff" : "var(--crm-ink)" }}><Ic name="calendar" size={14} /></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", overflowX: "auto", scrollbarWidth: "none" }}>
          {SOURCE_PICKS.map(s => <button key={s.v} type="button" onClick={() => setSrc(s.v)} style={{ ...chip(src === s.v), height: "28px", fontSize: fs(12) }}>{s.label}</button>)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: fs(12), color: "var(--crm-muted)" }}>
          <span>{short(r.a)}{r.a !== r.b ? ` – ${short(r.b)}` : ""}</span>
          {cmp && <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "6px" }}>vs {short(rb.a)}{rb.a !== rb.b ? ` – ${short(rb.b)}` : ""}
            <button type="button" aria-label="Stop comparing" onClick={p.clearCompare} style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={12} /></button></span>}
        </div>
      </div>

      {/* The metrics: a tile each, × to take one off, + to add (up to four) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
        {keys.map((k, i) => { const d = delta(k), def = defOf(k); return (
          <div key={k} style={{ ...card, position: "relative", padding: "10px 12px", display: "flex", flexDirection: "column", gap: "2px", boxShadow: `inset 3px 0 0 ${COLORS[i]}` }}>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: fs(11.5), color: "var(--crm-muted)", paddingRight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{def?.[1] ?? k}</span>
            <span style={{ fontFamily: TIGHT, fontSize: fs(20), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{show(k, tot[k])}</span>
            <span style={{ minHeight: "14px", fontSize: fs(11), fontWeight: 500, color: d ? (d.good ? "var(--crm-today)" : "var(--crm-oxblood)") : "var(--crm-faint)" }}>{d ? `${d.t} vs before` : cmp ? "—" : ""}</span>
            {keys.length > 1 && <button type="button" aria-label={`Remove ${def?.[1] ?? k}`} onClick={() => setKeys(keys.filter(x => x !== k))} style={{ ...BTN, position: "absolute", top: "8px", right: "8px", display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={12} /></button>}
          </div>); })}
        {keys.length < MAX && <button type="button" onClick={() => setPick(true)} style={{ ...BTN, ...card, borderStyle: "dashed", minHeight: "74px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)" }}><Ic name="plus" size={14} />Metric</button>}
      </div>

      {/* Day by day: one line a metric, each against its own highest day */}
      <div style={{ ...card, padding: "12px 12px 8px" }}>
        <Chart days={days} lines={keys.map((k, i) => ({ k, c: COLORS[i], v: series[k] ?? [] }))} />
      </div>

      {/* Every ad with those figures */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <span style={{ fontFamily: TIGHT, fontSize: fs(15), fontWeight: 500 }}>By ad <span style={{ fontFamily: "Inter, sans-serif", fontSize: fs(12), fontWeight: 400, color: "var(--crm-faint)" }}>{rows.length}</span></span>
        {!rows.length && <span style={{ padding: "12px 0", fontSize: fs(13), color: "var(--crm-faint)" }}>No leads from an ad in this period.</span>}
        {rows.map(a => { const on = openAd === a.id; return (
          <div key={a.id} role="button" tabIndex={0} onClick={() => setOpenAd(on ? null : a.id)} style={{ ...BTN, ...card, padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", textAlign: "left" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: fs(13.5), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: on ? "normal" : "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              {/* View ad, a small icon right of the name (the owner, 2026-10-24: "只需要view ad（做成小小的圖標即可）做廣告名字右邊"). */}
              <a href={a.url} target="_blank" rel="noopener noreferrer" title="View ad" aria-label="View ad" onClick={e => e.stopPropagation()} style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }}><Ic name="arrow-up-right" size={12} /></a>
              <span style={{ display: "flex", color: "var(--crm-faint-2)", transform: on ? "rotate(180deg)" : "none", transition: "transform 160ms" }}><Ic name="chevron-down" size={13} /></span>
            </span>
            <span style={{ display: "grid", gridTemplateColumns: `repeat(${keys.length}, minmax(0,1fr))`, gap: "6px" }}>
              {keys.map((k, i) => <span key={k} style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                <span style={{ fontSize: fs(10.5), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: COLORS[i], marginRight: "4px" }} />{label(k)}</span>
                <span style={{ fontSize: fs(13), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{show(k, a.f[k])}</span>
                {cmp && (() => { const c = change(k, a.f[k], a.fb?.[k]); return <span style={{ fontSize: fs(10.5), fontWeight: 500, whiteSpace: "nowrap", color: c ? (c.good ? "var(--crm-today)" : "var(--crm-oxblood)") : "var(--crm-faint)" }}>{c ? c.t : "—"}</span>; })()}
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
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="120" preserveAspectRatio="none" role="img" aria-label="Day by day">
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--crm-rule-soft)" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        {lines.map(l => <path key={l.k} d={path(l.v)} fill="none" stroke={l.c} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: fs(10.5), color: "var(--crm-faint)" }}>
        <span>{days[0] ? dayLabel(days[0]) : ""}</span>{empty && <span>No activity yet</span>}<span>{days.length > 1 ? dayLabel(days[days.length - 1]) : ""}</span>
      </div>
    </div>
  );
}
