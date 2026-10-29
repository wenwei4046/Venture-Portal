"use client";
/**
 * Showrooms › Key log (2026-10-29): who took a unit's key and brought it back, when, with the photos — read from the phone's
 * Calendar (vm/key-log.ts). A photo opens in the viewer.
 */
import type { CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import type { KeyLogVM } from "./vm/key-log";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", margin: 0, padding: 0, boxSizing: "border-box" };
const TH: CSSProperties = { textAlign: "left", padding: "9px 12px", font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)", background: "var(--crm-cream-nav)", borderBottom: "1px solid var(--crm-nav-line)", borderTop: "1px solid var(--crm-ink)", whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "10px 12px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", borderBottom: "1px solid var(--crm-rule-soft)", verticalAlign: "top" };
const PILL: Record<string, [string, string]> = { out: ["var(--crm-tint-attention)", "var(--crm-oxblood)"], back: ["var(--crm-tint-follow)", "var(--crm-brown)"], none: ["var(--crm-field)", "var(--crm-muted)"] };

function Step({ s, photo }: { s: { time: string; by: string; path: string } | null; photo: (path: string) => () => void }) {
  if (!s) return <span style={{ color: "var(--crm-faint-2)" }}>—</span>;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{s.time}</span>
      <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>by {s.by}</span>
      <button type="button" onClick={photo(s.path)} style={{ ...BTN, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "5px", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}><Ic name="camera" size={13} />Photo</button>
    </span>
  );
}

export function DeskKeyLog({ v }: { v: KeyLogVM }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "16px", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <div role="group" aria-label="Key" style={{ height: "32px", padding: "3px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", display: "flex", gap: "2px", font: "500 12px Inter, sans-serif" }}>
          {v.states.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={{ ...BTN, padding: "0 10px", borderRadius: "6px", whiteSpace: "nowrap", background: o.on ? "#fff" : "transparent", boxShadow: o.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: o.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{o.label} <span style={{ color: "var(--crm-faint)" }}>{o.n}</span></button>)}
        </div>
        <select value={v.room} onChange={v.setRoom} aria-label="Showroom" style={{ height: "32px", borderRadius: "7px", border: "1px solid var(--crm-line)", padding: "0 8px", font: "500 12.5px Inter, sans-serif", background: "#fff", color: "var(--crm-ink)" }}>
          {v.rooms.map(r => <option key={r.v} value={r.v}>{r.label}</option>)}
        </select>
        {v.out > 0 && <span style={{ font: "500 12.5px Inter, sans-serif", color: "var(--crm-oxblood)" }}>{v.out} key{v.out === 1 ? "" : "s"} still out</span>}
        <button type="button" onClick={() => void v.excel()} disabled={!v.rows.length} style={{ ...BTN, marginLeft: "auto", height: "32px", padding: "0 12px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "6px", border: "1px solid var(--crm-line)", background: "#fff", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)", opacity: v.rows.length ? 1 : 0.5 }} className="crm4a-outline"><Ic name="download" size={13} />Export</button>
      </div>
      {!v.total ? (
        <div style={{ padding: "48px 20px", textAlign: "center", font: "400 13px/1.6 Inter, sans-serif", color: "var(--crm-muted)", borderTop: "1px solid var(--crm-ink)" }}>
          No key handed over yet. Switch on <b>Key handover</b> for a showroom in Showrooms; its visits then show here as sales take the photos in the app.
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Visit", "Showroom", "Customer", "Salesperson", "Key", "Collected", "Returned"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {v.rows.map(r => (
                <tr key={r.id}>
                  <td style={{ ...TD, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.when}</td>
                  <td style={TD}>{r.room}</td>
                  <td style={{ ...TD, fontWeight: 500 }}>{r.customer}</td>
                  <td style={TD}>{r.owner}</td>
                  <td style={TD}><span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 9px", borderRadius: "11px", font: "500 11.5px Inter, sans-serif", whiteSpace: "nowrap", background: PILL[r.state][0], color: PILL[r.state][1] }}>{r.stateLabel}</span></td>
                  <td style={TD}><Step s={r.out} photo={v.photo} /></td>
                  <td style={TD}><Step s={r.back} photo={v.photo} /></td>
                </tr>
              ))}
              {!v.rows.length && <tr><td colSpan={7} style={{ ...TD, textAlign: "center", color: "var(--crm-faint)" }}>Nothing matches these filters.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
