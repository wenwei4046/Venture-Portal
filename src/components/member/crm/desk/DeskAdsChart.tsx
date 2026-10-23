"use client";
/**
 * Ads Performance's chart (2026-10-23, the owner, with Google Ads' overview beside it: "加一个数据图 … 他可以增加更多的数据在
 * 图片中，下方的个别数据及图片做成可展开收缩"): a row of metric tiles — the range's total in the tile's colour, its metric
 * picked from the tile's menu, × to take it off, + to add one (six at most), a tap to hide or show its line — and one line a
 * tile, day by day, each against its own highest day (one plotting area, no second axis; the figures are in the tiles and
 * the hover's crosshair). The whole card folds to its head. Data: vm/adsperf.ts › apChartV, vm/adschart.ts.
 */
import { useState, type CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import { chartFmt, scaled, type ChartFmt } from "./vm/adschart";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box", padding: 0 };

export interface AdsChartBits {
  shut: boolean; fold: () => void; reading: boolean; range: string;
  days: { iso: string; label: string }[];
  tiles: ({ key: string; label: string; total: string; color: string; on: boolean; toggle: () => void; options: { v: string; label: string }[]; change: (e: { target: { value: string } }) => void; remove: (() => void) | null } | null)[];
  canAdd: boolean; add: () => void;
  lines: { key: string; color: string; fmt: ChartFmt; label: string; values: (number | null)[] }[];
}

/** A card's head that folds what is under it: the title, a line beside it, the chevron. */
export function FoldHead({ title, sub, shut, fold }: { title: string; sub?: string; shut: boolean; fold: () => void }) {
  return (
    <button type="button" onClick={fold} aria-expanded={!shut} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", width: "100%", minHeight: "40px", padding: "8px 2px" }}>
      <span style={{ display: "flex", color: "var(--crm-ink-soft)", transform: shut ? "rotate(-90deg)" : "none", transition: "transform .16s" }}><Ic name="chevron-down" size={15} /></span>
      <span style={{ font: "600 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{title}</span>
      {sub && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{sub}</span>}
    </button>
  );
}

const W = 1000, H = 220, PAD_T = 12, PAD_B = 26;

export function DeskAdsChart({ v }: { v: AdsChartBits }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = v.days.length;
  const x = (i: number) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
  const y = (s: number) => PAD_T + (1 - s) * (H - PAD_T - PAD_B);
  // About six day labels under the plot, the first and the last always.
  const every = Math.max(1, Math.ceil(n / 6));
  const ticks = v.days.map((d, i) => ({ ...d, i })).filter(d => d.i % every === 0 || d.i === n - 1);
  const lines = v.lines.map(l => { const s = scaled(l.values); return { ...l, s, d: pathOf(s, x, y) }; });
  return (
    <div style={{ border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff", padding: "6px 16px 14px", marginBottom: "16px" }}>
      <FoldHead title="Performance chart" sub={`${v.range}${v.reading ? " · reading Meta's figures…" : ""}`} shut={v.shut} fold={v.fold} />
      {!v.shut && (
        <>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", margin: "6px 0 14px" }}>
            {v.tiles.map(t => t && (
              <div key={t.key} style={{ position: "relative", flex: "1 1 150px", maxWidth: "220px", minWidth: "140px", borderRadius: "10px", overflow: "hidden",
                background: t.on ? t.color : "var(--crm-field)", color: t.on ? "#fff" : "var(--crm-ink)", boxShadow: t.on ? "none" : "inset 0 0 0 1px var(--crm-rule)" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "4px", background: t.color }} />
                <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "8px 8px 0 12px" }}>
                  <select value={t.key} onChange={t.change} aria-label="Metric" style={{ appearance: "none", border: 0, background: "transparent", color: "inherit", font: "600 12px Inter, sans-serif", cursor: "pointer", padding: 0, minWidth: 0, flex: 1, textOverflow: "ellipsis" }}>
                    {t.options.map(o => <option key={o.v} value={o.v} style={{ color: "var(--crm-ink)" }}>{o.label}</option>)}
                  </select>
                  <span style={{ display: "flex", pointerEvents: "none", opacity: 0.85 }}><Ic name="chevron-down" size={12} /></span>
                  {t.remove && <button type="button" onClick={t.remove} title="Take this metric off" style={{ ...BTN, display: "flex", opacity: 0.85 }}><Ic name="x" size={12} /></button>}
                </div>
                <button type="button" onClick={t.toggle} title={t.on ? "Hide its line" : "Show its line"} aria-pressed={t.on}
                  style={{ ...BTN, display: "block", width: "100%", padding: "2px 12px 10px", font: "600 20px Inter, sans-serif", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.total}</button>
              </div>
            ))}
            {v.canAdd && (
              <button type="button" onClick={v.add} title="Choose the metrics (the table's Customise metrics list)" style={{ ...BTN, flex: "0 0 auto", width: "44px", borderRadius: "10px", border: "1px dashed var(--crm-rust)", color: "var(--crm-rust)", display: "grid", placeItems: "center", minHeight: "62px" }}>
                <Ic name="plus" size={16} />
              </button>
            )}
          </div>
          <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block", width: "100%", height: `${H}px`, overflow: "visible" }}
              onMouseMove={e => { const r = e.currentTarget.getBoundingClientRect(); const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}>
              {[0, 0.25, 0.5, 0.75, 1].map(g => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="var(--crm-rule-soft)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
              {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={H - PAD_B} stroke="var(--crm-faint-2)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
              {lines.map(l => <path key={l.key} d={l.d} fill="none" stroke={l.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />)}
            </svg>
            {/* Dots are HTML so they stay round on the stretched plot: the hovered day, or the only day. */}
            {lines.flatMap(l => l.s.map((s, i) => (s != null && (i === hover || n === 1) ? (
              <span key={`${l.key}-${i}`} style={{ position: "absolute", left: `${(x(i) / W) * 100}%`, top: `${y(s)}px`, width: "8px", height: "8px", margin: "-4px 0 0 -4px", borderRadius: "50%", background: l.color, boxShadow: "0 0 0 2px #fff", pointerEvents: "none" }} />
            ) : null)))}
            <div style={{ position: "relative", height: "18px", marginTop: `-${PAD_B - 6}px` }}>
              {ticks.map(t => <span key={t.iso} style={{ position: "absolute", left: `${(x(t.i) / W) * 100}%`, transform: t.i === 0 ? "none" : t.i === n - 1 ? "translateX(-100%)" : "translateX(-50%)", font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{t.label}</span>)}
            </div>
            {hover != null && lines.length > 0 && (
              <div style={{ position: "absolute", top: 0, left: `${(x(hover) / W) * 100}%`, transform: x(hover) > W * 0.6 ? "translateX(calc(-100% - 12px))" : "translateX(12px)", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "10px",
                boxShadow: "0 6px 18px rgba(42,22,12,.14)", padding: "8px 10px", pointerEvents: "none", minWidth: "170px", zIndex: 2 }}>
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
          {!lines.length && <div style={{ textAlign: "center", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", marginTop: "-120px", marginBottom: "100px" }}>Tap a tile to show its line</div>}
          <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", marginTop: "6px" }}>Each line is drawn against its own highest day · hover for the day&apos;s figures</div>
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
