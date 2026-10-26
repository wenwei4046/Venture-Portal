"use client";
/**
 * Ads Performance's chart (2026-10-23; redesign v2 frame 05 / note 02): "Performance chart" and its range, a row of metric
 * cards — each its place's tint with a 3 px top bar and a dot in the series colour, the metric (its menu: the table's list),
 * ✕, and the range's total in ink — a dashed + (Customise metrics on the chart), and one line a card day by day in the
 * same colour, each against its own highest day (one plotting area, no second axis; the figures are in the cards and the
 * hover). A tap on a card's figure hides or shows its line. The card folds to its head (the owner's ask, 2026-10-23).
 * Data: vm/adsperf.ts › apChartV, vm/adschart.ts.
 */
import { useState, type CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import { chartFmt, scaled, type ChartFmt } from "./vm/adschart";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box", padding: 0 };
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";

export interface AdsChartBits {
  shut: boolean; fold: () => void; reading: boolean; range: string;
  days: { iso: string; label: string }[];
  tiles: ({ key: string; label: string; total: string; color: string; tint: string; on: boolean; toggle: () => void; options: { v: string; label: string }[]; change: (e: { target: { value: string } }) => void; remove: (() => void) | null } | null)[];
  canAdd: boolean; add: () => void;
  lines: { key: string; color: string; fmt: ChartFmt; label: string; values: (number | null)[] }[];
}

/** A section's head that folds what is under it: the title (15 px Inter Tight), a faint line beside it, a small chevron. */
export function FoldHead({ title, sub, shut, fold }: { title: string; sub?: string; shut: boolean; fold: () => void }) {
  return (
    <button type="button" onClick={fold} aria-expanded={!shut} style={{ ...BTN, display: "flex", alignItems: "baseline", gap: "8px", width: "100%" }}>
      <span style={{ font: `500 15px ${TIGHT}`, color: "var(--crm-ink)" }}>{title}</span>
      {sub && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>{sub}</span>}
      <span style={{ marginLeft: "auto", alignSelf: "center", display: "flex", color: "var(--crm-faint)", transform: shut ? "rotate(-90deg)" : "none", transition: "transform .16s" }}><Ic name="chevron-down" size={13} /></span>
    </button>
  );
}

const W = 1000, H = 108, PAD_T = 8, PAD_B = 22;

export function DeskAdsChart({ v }: { v: AdsChartBits }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = v.days.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (s: number) => PAD_T + (1 - s) * (H - PAD_T - PAD_B);
  // About five day labels under the plot, the first and the last always.
  const every = Math.max(1, Math.ceil(n / 5));
  const ticks = v.days.map((d, i) => ({ ...d, i })).filter(d => d.i % every === 0 || d.i === n - 1);
  const lines = v.lines.map(l => { const s = scaled(l.values); return { ...l, s, d: pathOf(s, x, y) }; });
  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "12px", padding: "12px 16px 10px", marginBottom: "12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "var(--crm-page)" }}>
      <FoldHead title="Performance chart" sub={`${v.range}${v.reading ? " · reading Meta's figures…" : ""}`} shut={v.shut} fold={v.fold} />
      {!v.shut && (
        <>
          <div style={{ display: "flex", gap: "8px" }}>
            {v.tiles.map(t => t && (
              <div key={t.key} style={{ position: "relative", flex: "1 1 0px", minWidth: 0, height: "56px", boxSizing: "border-box", padding: "8px 12px", borderRadius: "8px", background: t.tint, borderTop: `3px solid ${t.color}`,
                display: "flex", flexDirection: "column", justifyContent: "space-between", opacity: t.on ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", minWidth: 0 }}>
                  <span style={{ width: "8px", height: "8px", flex: "none", borderRadius: "50%", background: t.color }} />
                  <span style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
                    <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)", flex: "none" }}><Ic name="chevron-down" size={11} /></span>
                    {/* The metric's menu: the label and its chevron are a native select laid over them. */}
                    <select value={t.key} onChange={t.change} aria-label="Metric" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer", width: "100%" }}>
                      {t.options.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
                    </select>
                  </span>
                  {t.remove && <button type="button" onClick={t.remove} title="Take this metric off" style={{ ...BTN, display: "flex", flex: "none", color: "var(--crm-faint)" }}><Ic name="x" size={11} /></button>}
                </div>
                <button type="button" onClick={t.toggle} title={t.on ? "Hide its line" : "Show its line"} aria-pressed={t.on}
                  style={{ ...BTN, display: "block", width: "100%", font: `500 20px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", lineHeight: "normal" }}>{t.total}</button>
              </div>
            ))}
            {v.canAdd && (
              <button type="button" onClick={v.add} title="Choose the metrics (the table's Customise metrics list)" style={{ ...BTN, flex: "0 0 auto", width: "44px", height: "56px", borderRadius: "8px", border: "1px dashed var(--crm-rust)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
                <Ic name="plus" size={14} />
              </button>
            )}
          </div>
          <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: `${H}px`, overflow: "visible" }}
              onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}>
              {[0, 0.5, 1].map(g => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="var(--crm-rule-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="var(--crm-faint-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              {lines.map(l => <path key={l.key} d={l.d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {/* Dots are HTML so they stay round on the stretched plot: the hovered day, or the only day. */}
            {lines.flatMap(l => l.s.map((s, i) => (s != null && (i === hover || n === 1) ? (
              <span key={`${l.key}-${i}`} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, top: `${y(s)}px`, width: "8px", height: "8px", margin: "-4px 0 0 -4px", borderRadius: "50%", background: l.color, boxShadow: "0 0 0 2px #fff", pointerEvents: "none" }} />
            ) : null)))}
            <div style={{ position: "relative", height: "14px", marginTop: `-${PAD_B - 8}px` }}>
              {ticks.map(t => <span key={t.iso} style={{ position: "absolute", left: `${(x(t.i) / W) * 100}%`, transform: t.i === 0 ? "none" : t.i === n - 1 ? "translateX(-100%)" : "translateX(-50%)", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{t.label}</span>)}
            </div>
            {hover != null && lines.length > 0 && (
              <div style={{ position: "absolute", bottom: "100%", marginBottom: "6px", left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "10px",
                boxShadow: "0 14px 36px rgba(42,22,12,.18)", padding: "8px 10px", pointerEvents: "none", minWidth: "170px", zIndex: 3 }}>
                <div style={{ font: "600 12px Inter, sans-serif", color: "var(--crm-ink)", marginBottom: "4px" }}>{v.days[hover]?.label}</div>
                {lines.map(l => (
                  <div key={l.key} style={{ display: "flex", alignItems: "center", gap: "6px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)", lineHeight: "20px" }}>
                    <span style={{ width: "10px", height: "2px", borderRadius: "1px", background: l.color, flex: "none" }} />
                    <span style={{ flex: 1 }}>{l.label}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", fontWeight: 600 }}>{chartFmt(l.values[hover], l.fmt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** A line through the days, broken where a day has no figure. */
function pathOf(s: (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "", pen = false;
  s.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
  if (s.filter(v => v != null).length === 1) { const i = s.findIndex(v => v != null); d += `L${(x(i) + 0.1).toFixed(1)},${y(s[i]!).toFixed(1)}`; }
  return d;
}
