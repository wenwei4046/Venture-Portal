"use client";
/**
 * The metric / column picker — "Customise metrics", the side pane Ads performance's Columns and its figure strip's +
 * open (v4 notes/21: "same picker as today's +"), drawn exactly as the generated pane drew it (desk-4a.cjs swaps it in)
 * and reusable by any table: Reports' Columns (notes/25) hands it its own groups and order.
 *
 * Search · Column order (drag, × to take one off) · groups that fold, each a list of ticks with a hint · Reset · Save.
 */
import { Fragment, type DragEvent } from "react";
import DH from "./desk-hover.module.css";

export interface MetricPickerItem { label: string; hint: string; on: boolean; bg: string; bd: string; toggle: () => void }
export interface MetricPickerGroup { label: string; src: string; open: boolean; rot: number; nSel: string; fold: () => void; items: MetricPickerItem[] }
export interface MetricPickerOrder {
  label: string; z: number; bd: string; bg: string; sh: string; rm: () => void;
  dStart: (e: DragEvent<HTMLDivElement>) => void; dOver: (e: DragEvent<HTMLDivElement>) => void; dDrop: (e: DragEvent<HTMLDivElement>) => void; dEnd: () => void;
}
export interface MetricPickerBits {
  mq: string; setMq: (e: { target: { value: string } }) => void;
  mOrdFold: () => void; mOrdRot: number; mOrdOpen: boolean; mOrder: MetricPickerOrder[];
  mFoldAll: () => void; mFoldAllLabel: string;
  mGroups: MetricPickerGroup[];
  resetMetrics: () => void; saveMetrics: () => void; mDirty: boolean;
  /** Words under the buttons while there are unsaved ticks. */
  mDirtyNote?: string;
}

export function DeskMetricPicker({ v }: { v: MetricPickerBits }) {
  return (<>
    <div style={{ flex: "0 0 auto", padding: "14px 18px", background: "#fff", borderBottom: "1px solid var(--crm-field)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3" /></svg>
        <input type="text" value={v.mq} onChange={v.setMq} placeholder="Search metrics" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", background: "transparent" }} />
      </span>
    </div>
    <div style={{ flex: "1", minHeight: "0", overflow: "auto", background: "#fff", padding: "6px 10px 12px" }}>
      <button type="button" onClick={v.mOrdFold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${v.mOrdRot}deg)`, transition: "transform .15s" }}><path d="m6 9 6 6 6-6" /></svg>
        <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "var(--crm-ink)" }}>Column order</strong>
        <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>Drag to reorder</span>
      </button>
      {v.mOrdOpen && (
        <div style={{ display: "flex", flexDirection: "column", margin: "0 8px 8px", border: "1px solid var(--crm-rule)", borderRadius: "12px", padding: "4px" }}>
          {v.mOrder.map((o, o_i) => (
            <div key={o_i} draggable="true" onDragStart={o.dStart} onDragOver={o.dOver} onDrop={o.dDrop} onDragEnd={o.dEnd} style={{ position: "relative", zIndex: o.z, display: "flex", alignItems: "center", gap: "12px", height: "44px", padding: "0 8px 0 10px", borderBottom: `1px solid ${o.bd}`, background: o.bg, boxShadow: o.sh, borderRadius: "6px", cursor: "grab" }} className={DH.h4}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="2.2" strokeLinecap="round"><path d="M5 9h14M5 15h14" /></svg>
              <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
              <button type="button" onClick={o.rm} title="Remove" style={{ width: "30px", height: "30px", border: "0", borderRadius: "50%", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h3}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="m9 9 6 6M15 9l-6 6" /></svg>
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px 0" }}>
        <button type="button" onClick={v.mFoldAll} style={{ height: "28px", padding: "0 8px", border: "0", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h8}>{v.mFoldAllLabel}</button>
      </div>
      {v.mGroups.map((g, g_i) => (
        <Fragment key={g_i}>
          <button type="button" onClick={g.fold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", borderTop: "1px solid var(--crm-field)", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", transform: `rotate(${g.rot}deg)`, transition: "transform .15s" }}><path d="m6 9 6 6 6-6" /></svg>
            <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "var(--crm-ink)" }}>{g.label}</strong>
            <span style={{ fontSize: "11.5px", fontWeight: "600", color: "var(--crm-muted)" }}>{g.nSel}</span>
            <span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>· {g.src}</span>
          </button>
          {g.open && g.items.map((m, m_i) => (
            <button key={m_i} type="button" onClick={m.toggle} aria-pressed={m.on} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", minHeight: "40px", padding: "4px 8px", border: "0", borderRadius: "9px", background: "transparent", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
              <span style={{ flex: "0 0 20px", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "6px", border: `1.5px solid ${m.bd}`, background: m.bg, display: "grid", placeItems: "center" }}>
                {m.on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10" /></svg>}
              </span>
              <span style={{ flex: "1", display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: "14px", fontWeight: "600" }}>{m.label}</span>
                <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{m.hint}</span>
              </span>
            </button>
          ))}
        </Fragment>
      ))}
    </div>
    <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 18px", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}>
      <button type="button" onClick={v.resetMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Reset</button>
      <button type="button" onClick={v.saveMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
    </div>
    {v.mDirty && <span style={{ flex: "0 0 auto", padding: "0 18px 12px", fontSize: "12.5px", color: "var(--crm-brown)", textAlign: "center", background: "#fff" }}>{v.mDirtyNote ?? "Unsaved changes · the table updates when you save"}</span>}
  </>);
}
