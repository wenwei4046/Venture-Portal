"use client";
/**
 * Workspace (2026-10-27; the owner: "我每个星期都会跟老板个rd汇报本周的广告表现 … workspace 可以放在左边report的下方（独立）
 * … 你建议都做"): one's own reports — Weekly and Monthly to start, more added — each its period, source, metrics and
 * sections: the totals against the period before, each ad's figures, each ad's picture, who the leads went to, the
 * properties asked about and what customers asked most (keywords, no AI). Print / PDF and Excel. Kept per browser.
 * The arithmetic is vm/workspace-report.ts; Meta's figures and pictures are read on the server (CRM · Manage).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";
import type { MetaFig } from "@/lib/member/crm-ad-names-meta";
import { adPageInSource, BRAND_LABEL, brandOf, SOURCE_PICKS, sourceLabel, sourceOf, type SourcePick } from "@/lib/member/crm-source";
import { fetchAdInsights, fetchAdThumbs } from "@/app/(member)/member/crm-actions";
import { ALL, METRICS, metaFigures, moveHeld } from "./vm/adsperf";
import { chartFmt, chartFmtOf, isoOf } from "./vm/adschart";
import {
  changeOf, crmFigures, leadsByRep, loadReports, periodRanges, PERIODS, propertyRanking, questionTopics, REPORT_METRICS,
  repsOfAd, reportLeads, saveReports, SECTIONS, type Range, type ReportSection, type WorkspaceReport,
} from "./vm/workspace-report";

export interface WorkspaceIn {
  customers: CrmCustomer[];
  visits: CrmVisit[];
  adNames: Record<string, { name: string; added?: boolean; pageId?: string | null; hidden?: boolean }>;
  nameOf: (id: string | null | undefined) => string;
  now: Date;
  live: boolean;
}

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const CARD: CSSProperties = { background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "12px", padding: "16px 18px", boxSizing: "border-box" };
const DATE: CSSProperties = { height: "30px", borderRadius: "8px", border: "1px solid var(--crm-line)", padding: "0 8px", font: "500 12.5px Inter, sans-serif", background: "#fff", color: "var(--crm-ink)" };
const META = new Set(["spend", "cpl", "cpappt", "cpwon", "msgconv", "cpmsg", "impr", "reach", "clicks", "ctr", "cpc", "cpm"]);
const defOf = (k: string) => ALL.find(m => m[0] === k);
const labelOf = (k: string) => defOf(k)?.[1] ?? k;
const show = (k: string, v: number | null | undefined) => { const f = chartFmtOf(defOf(k)?.[3] ?? "n"); return f === "pct" && v != null ? `${v.toFixed(1)}%` : chartFmt(v, f); };
const short = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" }).replace("Sept", "Sep");
const rangeText = (r: Range) => `${short(r.a)} – ${short(r.b)} ${new Date(r.b).getFullYear()}`;

/** One ad of a report: its leads in the period and the one before, and its brand. */
interface AdRow { id: string; name: string; brand: string; cur: CrmCustomer[]; prev: CrmCustomer[] }

export function DeskWorkspace({ w }: { w: WorkspaceIn }) {
  const [reports, setReports] = useState<WorkspaceReport[]>(() => loadReports());
  const [pick, setPick] = useState(() => reports[0]?.id ?? "weekly");
  const [editing, setEditing] = useState(false);
  const rep = reports.find(r => r.id === pick) ?? reports[0];
  const update = (patch: Partial<WorkspaceReport>) => setReports(list => { const next = list.map(r => (r.id === rep.id ? { ...r, ...patch } : r)); saveReports(next); return next; });
  // A metric dragged to another place (the owner, 2026-10-27: "metrics 可以拉动"): the held one is read from the ref at the
  // moment of each move, never a render's copy — dragover comes faster than the chips redraw (as Ads Performance's moveHeld).
  const held = useRef<number | null>(null), [dragging, setDragging] = useState<string | null>(null);
  const dragTo = (i: number) => {
    const from = held.current;
    if (from == null || from === i) return;
    held.current = i;
    setReports(list => { const next = list.map(r => (r.id !== rep.id ? r : { ...r, metrics: moveHeld(r.metrics, from, i) ?? r.metrics })); saveReports(next); return next; });
  };
  const addReport = () => setReports(list => {
    const id = `r${Date.now().toString(36)}`, next = [...list, { ...rep, id, name: "New report" }];
    saveReports(next); setPick(id); setEditing(true); return next;
  });
  const removeReport = () => setReports(list => { if (list.length < 2) return list; const next = list.filter(r => r.id !== rep.id); saveReports(next); setPick(next[0].id); return next; });

  const { cur, prev } = useMemo(() => periodRanges(rep.period, w.now, { from: rep.from, to: rep.to }), [rep.period, rep.from, rep.to, w.now]);
  const src = rep.src;
  const on = (s: ReportSection) => rep.sections.includes(s);
  const leads = useMemo(() => reportLeads(w.customers, cur, src), [w.customers, cur, src]);
  const leadsPrev = useMemo(() => reportLeads(w.customers, prev, src), [w.customers, prev, src]);

  // Every ad with leads in either period, and the ads added before their first lead (placed by their Page).
  const ads: AdRow[] = useMemo(() => {
    const ids = new Set<string>();
    [...leads, ...leadsPrev].forEach(c => { if (c.adId) ids.add(c.adId); });
    Object.entries(w.adNames).forEach(([id, n]) => { if (n.added && !n.hidden && adPageInSource(n.pageId, src)) ids.add(id); });
    return [...ids].filter(id => !w.adNames[id]?.hidden).map(id => {
      const c = leads.filter(x => x.adId === id), p = leadsPrev.filter(x => x.adId === id), any = c[0] ?? p[0];
      const b = any ? sourceOf(any).brandLabel : (brandOf(w.adNames[id]?.pageId) ? BRAND_LABEL[brandOf(w.adNames[id]?.pageId)!] : "");
      return { id, name: w.adNames[id]?.name ?? any?.ad ?? id, brand: b, cur: c, prev: p };
    }).sort((x, y) => y.cur.length - x.cur.length || x.name.localeCompare(y.name));
  }, [leads, leadsPrev, w.adNames, src]);

  // Meta's figures for the two periods and each ad's picture, read once per report's dates and ads.
  const ids = ads.map(a => a.id).slice(0, 40), idKey = ids.join(",");
  const wantMeta = w.live && ids.length > 0 && rep.metrics.some(k => META.has(k));
  const [figA, setFigA] = useState<Record<string, MetaFig | null>>({}), [figB, setFigB] = useState<Record<string, MetaFig | null>>({});
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [metaNote, setMetaNote] = useState("");
  useEffect(() => {
    if (!wantMeta) return;
    // Another period's figures are never shown as this one's while Meta answers ("—" meanwhile).
    let live = true;
    setFigA({}); setFigB({}); setMetaNote("");
    void fetchAdInsights(ids, isoOf(cur.a), isoOf(cur.b)).then(x => { if (!live) return; if (x.ok) setFigA(x.figs); else setMetaNote(x.error); });
    void fetchAdInsights(ids, isoOf(prev.a), isoOf(prev.b)).then(x => { if (live && x.ok) setFigB(x.figs); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMeta, idKey, cur.a, cur.b, prev.a, prev.b]);
  useEffect(() => {
    if (!w.live || !on("shots") || !ids.length) return;
    let live = true;
    void fetchAdThumbs(ids).then(x => { if (live && x.ok) setThumbs(t => ({ ...t, ...x.thumbs })); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w.live, idKey, rep.sections.join(",")]);

  const figsOf = (cs: CrmCustomer[], r: Range, adIds: string[], fig: Record<string, MetaFig | null>) => {
    const c = crmFigures(cs, w.visits, r); return { ...c, ...metaFigures(adIds.map(i => fig[i]), c) } as Record<string, number | null | undefined>;
  };
  const tot = figsOf(leads, cur, ids, figA), totB = figsOf(leadsPrev, prev, ids, figB);
  const reps = leadsByRep(leads, w.visits, w.nameOf);
  const props = propertyRanking(leads);
  const questions = questionTopics(leads, cur);
  const title = `${rep.name} · ${sourceLabel(src)} · ${rangeText(cur)}`;

  const excel = async () => {
    const XLSX = await import("xlsx"), wb = XLSX.utils.book_new(), add = (name: string, rows: (string | number)[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
    add("Summary", [[title], [], ["Metric", rangeText(cur), rangeText(prev), "Change"], ...rep.metrics.map(k => [labelOf(k), show(k, tot[k]), show(k, totB[k]), changeOf(k, tot[k], totB[k])?.t ?? ""])]);
    if (on("byAd")) add("By ad", [["Ad", "Brand", ...rep.metrics.map(labelOf), "Assigned to"], ...ads.map(a => { const f = figsOf(a.cur, cur, [a.id], figA); return [a.name, a.brand, ...rep.metrics.map(k => show(k, f[k])), repsOfAd(a.cur, w.nameOf)]; })]);
    if (on("reps")) add("Salespeople", [["Salesperson", "Leads", "Appointments", "Showed up"], ...reps.map(r => [r.name, r.leads, r.appt, r.showup])]);
    if (on("props")) add("Properties", [["Property", "Leads"], ...props.rows.map(r => [r.label, r.n]), ...(props.notFilled ? [["Not filled yet", props.notFilled]] : [])]);
    if (on("questions")) add("Questions", [["Topic", "Customers", "Share", "Example"], ...questions.map(q => [q.label, q.n, `${Math.round(q.share * 100)}%`, q.example])]);
    const blob = new Blob([XLSX.write(wb, { type: "array", bookType: "xlsx" })], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/[^\w –-]+/g, "").trim()}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  const chip = (active: boolean): CSSProperties => ({ ...BTN, height: "30px", padding: "0 12px", borderRadius: "15px", fontSize: "12.5px", fontWeight: active ? 650 : 500, background: active ? "var(--crm-ink)" : "var(--crm-field)", color: active ? "#fff" : "var(--crm-ink)", whiteSpace: "nowrap" });
  const th: CSSProperties = { textAlign: "right", padding: "8px 10px", fontSize: "11.5px", fontWeight: 600, color: "var(--crm-muted)", borderBottom: "1px solid var(--crm-rule)", whiteSpace: "nowrap" };
  const td: CSSProperties = { textAlign: "right", padding: "9px 10px", fontSize: "13px", color: "var(--crm-ink)", borderBottom: "1px solid var(--crm-rule-soft, var(--crm-rule))", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  const h2: CSSProperties = { margin: "0 0 12px", fontFamily: TIGHT, fontSize: "17px", fontWeight: 600, color: "var(--crm-ink)" };
  const bar = (share: number) => (
    <span style={{ flex: "1 1 auto", height: "8px", borderRadius: "4px", background: "var(--crm-field)", overflow: "hidden", minWidth: "60px" }}>
      <span style={{ display: "block", width: `${Math.max(2, Math.round(share * 100))}%`, height: "100%", background: "var(--crm-rust)" }} />
    </span>
  );

  return (
    <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", gap: "20px", padding: "8px 0 28px", boxSizing: "border-box", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
      <style>{`@media print { body * { visibility: hidden !important; } [data-ws-print], [data-ws-print] * { visibility: visible !important; } [data-ws-print] { position: absolute !important; left: 0; top: 0; width: 100%; overflow: visible !important; } [data-ws-noprint] { display: none !important; } }`}</style>

      {/* My reports */}
      <aside data-ws-noprint style={{ flex: "0 0 220px", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: "11px", fontWeight: 600, letterSpacing: ".08em", color: "var(--crm-faint)", padding: "4px 8px" }}>MY REPORTS</span>
        {reports.map(r => (
          <button key={r.id} type="button" onClick={() => { setPick(r.id); setEditing(false); }} style={{ ...BTN, padding: "10px 12px", borderRadius: "8px", fontSize: "13.5px", fontWeight: r.id === rep.id ? 650 : 500, background: r.id === rep.id ? "var(--crm-tint-attention)" : "transparent" }}>
            {r.name}<span style={{ display: "block", fontSize: "11.5px", fontWeight: 400, color: "var(--crm-muted)" }}>{r.period === "custom" ? `${r.from ?? ""} – ${r.to ?? ""}` : PERIODS.find(p => p[0] === r.period)?.[1]} · {sourceLabel(r.src)}</span>
          </button>
        ))}
        <button type="button" onClick={addReport} style={{ ...BTN, padding: "10px 12px", borderRadius: "8px", border: "1px dashed var(--crm-line)", fontSize: "13px", fontWeight: 600, color: "var(--crm-rust)" }}>+ New report</button>
      </aside>

      <div style={{ flex: "1 1 auto", minWidth: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px" }}>
        {/* The report's controls */}
        <div data-ws-noprint style={{ ...CARD, display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            {PERIODS.map(([k, l]) => <button key={k} type="button" onClick={() => update(k === "custom" && !rep.from ? { period: k, from: isoOf(cur.a), to: isoOf(cur.b) } : { period: k })} style={chip(rep.period === k)}>{l}</button>)}
            {rep.period === "custom" && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--crm-muted)" }}>
                <input type="date" aria-label="From" value={rep.from ?? ""} max={rep.to || undefined} onChange={e => update({ from: e.target.value })} style={DATE} />
                to
                <input type="date" aria-label="To" value={rep.to ?? ""} min={rep.from || undefined} onChange={e => update({ to: e.target.value })} style={DATE} />
              </span>
            )}
            <span style={{ width: "1px", height: "22px", background: "var(--crm-rule)", margin: "0 4px" }} />
            <select value={src} onChange={e => update({ src: e.target.value as SourcePick })} aria-label="Source" style={{ height: "30px", borderRadius: "8px", border: "1px solid var(--crm-line)", padding: "0 8px", font: "500 12.5px Inter, sans-serif", background: "#fff", color: "var(--crm-ink)" }}>
              {SOURCE_PICKS.map(p => <option key={p.v} value={p.v}>{p.sub ? `  ${p.label}` : p.label}</option>)}
            </select>
            <span style={{ marginLeft: "auto" }} />
            <button type="button" onClick={() => setEditing(e => !e)} style={chip(editing)}>{editing ? "Done" : "Customise"}</button>
            <button type="button" onClick={() => void excel()} style={chip(false)}>Excel</button>
            <button type="button" onClick={() => window.print()} style={{ ...chip(false), background: "var(--crm-rust)", color: "#fff", fontWeight: 650 }}>Print / PDF</button>
          </div>
          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "10px", borderTop: "1px solid var(--crm-rule)" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Name
                <input value={rep.name} onChange={e => update({ name: e.target.value.slice(0, 60) })} style={{ height: "32px", flex: "0 1 320px", borderRadius: "8px", border: "1px solid var(--crm-line)", padding: "0 10px", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Sections</span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {SECTIONS.map(([k, l]) => <button key={k} type="button" aria-pressed={on(k)} onClick={() => update({ sections: on(k) ? rep.sections.filter(x => x !== k) : SECTIONS.map(s => s[0]).filter(s => s === k || rep.sections.includes(s)) })} style={chip(on(k))}>{l}</button>)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Metrics · drag to reorder</span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  {rep.metrics.map((k, i) => (
                    <span key={k} draggable title="Drag to reorder"
                      onDragStart={e => { e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", k); } catch { /* not every browser lets it */ } held.current = i; setDragging(k); }}
                      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; dragTo(i); }}
                      onDrop={e => e.preventDefault()} onDragEnd={() => { held.current = null; setDragging(null); }}
                      style={{ ...chip(true), display: "inline-flex", alignItems: "center", gap: "6px", cursor: "grab", opacity: dragging === k ? 0.45 : 1, userSelect: "none" }}>
                      <svg width="10" height="12" viewBox="0 0 10 12" aria-hidden="true" style={{ opacity: 0.6 }}><g fill="currentColor"><circle cx="2.5" cy="2" r="1.1" /><circle cx="7.5" cy="2" r="1.1" /><circle cx="2.5" cy="6" r="1.1" /><circle cx="7.5" cy="6" r="1.1" /><circle cx="2.5" cy="10" r="1.1" /><circle cx="7.5" cy="10" r="1.1" /></g></svg>
                      {labelOf(k)}
                      <button type="button" aria-label={`Remove ${labelOf(k)}`} onClick={() => update({ metrics: rep.metrics.filter(x => x !== k) })} style={{ ...BTN, opacity: 0.8 }}>×</button>
                    </span>
                  ))}
                  <MetricPicker have={rep.metrics} add={k => update({ metrics: [...rep.metrics, k] })} />
                  {rep.metrics.length > 0 && <button type="button" onClick={() => update({ metrics: [] })} style={{ ...BTN, fontSize: "12px", fontWeight: 600, color: "var(--crm-muted)", padding: "0 6px" }}>Clear all</button>}
                </div>
              </div>
              {reports.length > 1 && <button type="button" onClick={removeReport} style={{ ...BTN, alignSelf: "flex-start", fontSize: "12.5px", fontWeight: 600, color: "var(--crm-oxblood)" }}>Delete this report</button>}
            </div>
          )}
        </div>

        {/* The report itself — what prints */}
        <div data-ws-print style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: TIGHT, fontSize: "24px", fontWeight: 600 }}>{rep.name}</h1>
            <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{sourceLabel(src)} · {rangeText(cur)} · vs {rangeText(prev)}</span>
            {metaNote && <span style={{ display: "block", fontSize: "12px", color: "var(--crm-oxblood)" }}>{metaNote}</span>}
          </div>

          {on("totals") && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "10px" }}>
              {rep.metrics.map(k => { const d = changeOf(k, tot[k], totB[k]); return (
                <div key={k} style={{ ...CARD, padding: "12px 14px" }}>
                  <span style={{ display: "block", fontSize: "12px", color: "var(--crm-muted)" }}>{labelOf(k)}</span>
                  <span style={{ display: "block", fontFamily: TIGHT, fontSize: "22px", fontWeight: 500, fontVariantNumeric: "tabular-nums", margin: "2px 0" }}>{show(k, tot[k])}</span>
                  <span style={{ fontSize: "11.5px", fontWeight: 600, color: d ? (d.good ? "var(--crm-today)" : "var(--crm-oxblood)") : "var(--crm-faint)" }}>{d ? `${d.t} vs before` : "—"}</span>
                  <span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}> · {show(k, totB[k])}</span>
                </div>); })}
            </div>
          )}

          {on("byAd") && (
            <div style={CARD}>
              <h2 style={h2}>Each ad <span style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: 400, color: "var(--crm-faint)" }}>{ads.length}</span></h2>
              {!ads.length ? <span style={{ color: "var(--crm-faint)" }}>No ad brought a lead in this period.</span> : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <thead><tr><th style={{ ...th, textAlign: "left" }}>Ad</th>{rep.metrics.map(k => <th key={k} style={th}>{labelOf(k)}</th>)}<th style={{ ...th, textAlign: "left" }}>Assigned to</th></tr></thead>
                    <tbody>{ads.map(a => { const f = figsOf(a.cur, cur, [a.id], figA), fb = figsOf(a.prev, prev, [a.id], figB); return (
                      <tr key={a.id}>
                        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: "200px" }}>{a.name}{a.brand && <span style={{ display: "block", fontSize: "11.5px", color: "var(--crm-muted)" }}>{a.brand}</span>}</td>
                        {rep.metrics.map(k => { const d = changeOf(k, f[k], fb[k]); return <td key={k} style={td}>{show(k, f[k])}{d && <span style={{ display: "block", fontSize: "10.5px", fontWeight: 600, color: d.good ? "var(--crm-today)" : "var(--crm-oxblood)" }}>{d.t}</span>}</td>; })}
                        <td style={{ ...td, textAlign: "left", whiteSpace: "normal", minWidth: "180px", fontSize: "12px", color: "var(--crm-muted)" }}>{repsOfAd(a.cur, w.nameOf) || "—"}</td>
                      </tr>); })}</tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {on("shots") && ads.length > 0 && (
            <div style={CARD}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                <h2 style={{ ...h2, margin: 0 }}>Each ad&apos;s picture</h2>
                <span style={{ marginLeft: "auto" }} />
                {Object.keys(thumbs).length > 1 && <button type="button" data-ws-noprint onClick={() => void (async () => { for (const [i, a] of ads.entries()) if (thumbs[a.id]) { await savePicture(thumbs[a.id], a.name, i + 1); await new Promise(r => setTimeout(r, 400)); } })()} style={{ ...chip(false), fontWeight: 650 }}>Download all</button>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px" }}>
                {ads.map(a => (
                  <figure key={a.id} style={{ margin: 0, display: "flex", flexDirection: "column", gap: "6px", breakInside: "avoid" }}>
                    {thumbs[a.id]
                      ? <img src={thumbs[a.id]} alt={a.name} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: "8px", background: "var(--crm-field)" }} />
                      : <span style={{ width: "100%", aspectRatio: "1", borderRadius: "8px", background: "var(--crm-field)", display: "grid", placeItems: "center", fontSize: "12px", color: "var(--crm-faint)" }}>{w.live ? "No picture" : "Live CRM only"}</span>}
                    <figcaption style={{ fontSize: "12px", lineHeight: 1.35 }}>{a.name}<span style={{ display: "block", color: "var(--crm-muted)" }}>{a.cur.length} lead{a.cur.length === 1 ? "" : "s"}</span></figcaption>
                    {thumbs[a.id] && <button type="button" data-ws-noprint onClick={() => void savePicture(thumbs[a.id], a.name, ads.indexOf(a) + 1)} style={{ ...BTN, alignSelf: "flex-start", fontSize: "12px", fontWeight: 650, color: "var(--crm-rust)" }}>Download</button>}
                  </figure>
                ))}
              </div>
            </div>
          )}

          {on("reps") && (
            <div style={CARD}>
              <h2 style={h2}>Who the leads went to</h2>
              {!reps.length ? <span style={{ color: "var(--crm-faint)" }}>No leads in this period.</span> : (
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                  <thead><tr><th style={{ ...th, textAlign: "left" }}>Salesperson</th><th style={th}>Leads</th><th style={th}>Appointments</th><th style={th}>Showed up</th></tr></thead>
                  <tbody>{reps.map(r => <tr key={r.name}><td style={{ ...td, textAlign: "left" }}>{r.name}</td><td style={td}>{r.leads}</td><td style={td}>{r.appt}</td><td style={td}>{r.showup}</td></tr>)}</tbody>
                </table>
              )}
            </div>
          )}

          {on("props") && (
            <div style={CARD}>
              <h2 style={h2}>Properties asked about</h2>
              {!props.rows.length && !props.notFilled ? <span style={{ color: "var(--crm-faint)" }}>No leads in this period.</span> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {props.rows.map((r, i) => (
                    <div key={r.label} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <span style={{ flex: "0 0 24px", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span style={{ flex: "0 0 220px", fontWeight: 550 }}>{r.label}</span>
                      {bar(leads.length ? r.n / leads.length : 0)}
                      <span style={{ flex: "0 0 40px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
                    </div>
                  ))}
                  <span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>From the customer&apos;s Location in Customer info, else the property in their ad&apos;s name{props.rows.some(r => r.fromAd) ? ` (${props.rows.reduce((n, r) => n + r.fromAd, 0)} from the ad)` : ""}.{props.notFilled > 0 ? ` ${props.notFilled} lead${props.notFilled === 1 ? "" : "s"} with neither.` : ""}</span>
                </div>
              )}
            </div>
          )}

          {on("questions") && (
            <div style={CARD}>
              <h2 style={h2}>What customers asked most</h2>
              {!questions.length ? <span style={{ color: "var(--crm-faint)" }}>No questions matched in this period.</span> : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {questions.map(q => (
                    <div key={q.label} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <span style={{ flex: "0 0 200px", fontWeight: 550 }}>{q.label}</span>
                        {bar(q.share)}
                        <span style={{ flex: "0 0 110px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{q.n} customer{q.n === 1 ? "" : "s"} · {Math.round(q.share * 100)}%</span>
                      </div>
                      {q.example && <span style={{ fontSize: "12px", color: "var(--crm-muted)", paddingLeft: "212px" }}>&ldquo;{q.example}&rdquo;</span>}
                    </div>
                  ))}
                  <span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>Counted by keywords in the customers&apos; messages, a customer once a topic.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** + Add metric: every metric a report can work out, grouped as Ads Performance's Customise metrics, searchable; one tap adds it. */
function MetricPicker({ have, add }: { have: string[]; add: (k: string) => void }) {
  const [open, setOpen] = useState(false), [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const groups = METRICS.map(([g, , ms]) => [g, ms.filter(m => REPORT_METRICS.includes(m[0]) && !have.includes(m[0])
    && (!needle || `${m[1]} ${m[2]}`.toLowerCase().includes(needle)))] as const).filter(([, ms]) => ms.length);
  return (
    <span style={{ position: "relative", display: "inline-flex" }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen(o => !o)} style={{ ...BTN, height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px dashed var(--crm-rust)", fontSize: "12.5px", fontWeight: 650, color: "var(--crm-rust)", whiteSpace: "nowrap" }}>+ Add metric</button>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 7 }} />
        <div role="dialog" aria-label="Add a metric" style={{ position: "absolute", top: "36px", left: 0, zIndex: 8, width: "340px", maxHeight: "420px", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", padding: "8px", boxSizing: "border-box" }}>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search metrics" aria-label="Search metrics" style={{ height: "32px", borderRadius: "8px", border: "1px solid var(--crm-line)", padding: "0 10px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", marginBottom: "6px" }} />
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto" }}>
            {!groups.length && <div style={{ padding: "10px", fontSize: "12.5px", color: "var(--crm-faint)" }}>{needle ? "No metric matches." : "Every metric is in the report."}</div>}
            {groups.map(([g, ms]) => (
              <div key={g} style={{ display: "flex", flexDirection: "column", padding: "4px 0" }}>
                <span style={{ fontSize: "10.5px", fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-faint)", padding: "4px 8px" }}>{g}</span>
                {ms.map(m => (
                  <button key={m[0]} type="button" onClick={() => add(m[0])} style={{ ...BTN, display: "flex", flexDirection: "column", padding: "7px 8px", borderRadius: "7px" }}>
                    <span style={{ fontSize: "13px", fontWeight: 550, color: "var(--crm-ink)" }}>{m[1]}</span>
                    <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{m[2]}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </>)}
    </span>
  );
}

/**
 * Saves an ad's picture to the computer (2026-10-27, the owner: "我要如何下载放到canva里？"), full size as Meta keeps it,
 * named by its place and the ad ("1 - Astrum Ampang.jpg"); Meta's image hosts let the page read it. If they ever refuse,
 * the picture opens in a new tab to be saved from there.
 */
async function savePicture(url: string, name: string, n: number) {
  const file = `${n} - ${name.replace(/[\/:*?"<>|【】[\]]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)}.jpg`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob()); a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
