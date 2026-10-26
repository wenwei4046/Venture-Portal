"use client";
/**
 * Showrooms › Appointment types, drawn (vm/appt-types.ts): one card a type — its name, On, Online or At a place — and its
 * questions as rows (name, kind, required, choices, move, remove), like the Customer form's editor. Save is the head's.
 */
import type { CSSProperties } from "react";
import { APPT_FIELD_KINDS, type ApptFieldKind } from "@/lib/member/crm-data";
import { Ic } from "../shared/icons4a";
import type { apptTypesVM } from "./vm/appt-types";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN = { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;
const INPUT: CSSProperties = { height: "34px", padding: "0 10px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "8px", background: "#fff", outline: "none", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", minWidth: 0 };
const ICONBTN = (off: boolean): CSSProperties => ({ ...BTN, width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", color: off ? "var(--crm-line)" : "var(--crm-muted)", cursor: off ? "default" : "pointer" });

function Switch({ on, flip, off }: { on: boolean; flip: () => void; off: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={off} onClick={flip} style={{ ...BTN, flex: "none", position: "relative", width: "38px", height: "22px", borderRadius: "11px", background: on ? "var(--crm-rust)" : "var(--crm-line)", opacity: off ? 0.6 : 1 }}>
      <span style={{ position: "absolute", top: "3px", left: on ? "19px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 160ms" }} />
    </button>
  );
}

export function DeskApptTypes({ v }: { v: ReturnType<typeof apptTypesVM> }) {
  const off = !v.canEdit;
  return (
    <div style={{ maxWidth: "860px", display: "flex", flexDirection: "column", gap: "16px", padding: "4px 0 40px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Appointment types</span>
          <span style={{ font: "400 13px/1.5 Inter, sans-serif", color: "var(--crm-muted)" }}>
            Offered beside Showroom in every Book visit, on the phone and here. Date and time are always asked. An online type sends its first Link to the customer; a type at a place sends its Place. Every other answer stays with your team.
          </span>
        </div>
        {v.dirty && <button type="button" onClick={v.reset} style={{ ...BTN, flex: "none", height: "32px", padding: "0 14px", borderRadius: "7px", border: "1px solid var(--crm-line)", font: "500 13px Inter, sans-serif" }}>Cancel</button>}
      </div>
      {v.problem && v.dirty && <div style={{ padding: "10px 12px", borderRadius: "8px", background: "var(--crm-tint-attention)", font: "500 12.5px Inter, sans-serif", color: "var(--crm-oxblood)" }}>{v.problem}</div>}

      {v.types.map((t, i) => (
        <div key={t.id} style={{ border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff", opacity: t.on ? 1 : 0.7 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderBottom: "1px solid var(--crm-rule)" }}>
            <input value={t.label} readOnly={off} onChange={e => t.setLabel(e.target.value)} placeholder="Type name, e.g. Site visit" aria-label="Type name" style={{ ...INPUT, flex: 1, height: "36px", font: `500 15px ${TIGHT}` }} />
            <span style={{ display: "flex", gap: "2px", padding: "2px", borderRadius: "8px", background: "var(--crm-field)" }}>
              {([["online", "Online"], ["place", "At a place"]] as const).map(([b, l]) => (
                <button key={b} type="button" disabled={off} onClick={() => t.setBase(b)} style={{ ...BTN, height: "30px", padding: "0 12px", borderRadius: "6px", font: "500 12.5px Inter, sans-serif",
                  background: t.base === b ? "#fff" : "transparent", boxShadow: t.base === b ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: t.base === b ? "var(--crm-ink)" : "var(--crm-muted)" }}>{l}</button>
              ))}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", font: "500 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>{t.on ? "On" : "Off"}<Switch on={t.on} flip={t.toggle} off={off} /></span>
            <button type="button" title="Move up" disabled={off || !t.up} onClick={t.up} style={ICONBTN(off || !t.up)}><span style={{ display: "flex", transform: "rotate(180deg)" }}><Ic name="chevron-down" size={14} /></span></button>
            <button type="button" title="Move down" disabled={off || !t.down} onClick={t.down} style={ICONBTN(off || !t.down)}><Ic name="chevron-down" size={14} /></button>
            <button type="button" title="Delete type" disabled={off} onClick={t.remove} style={ICONBTN(off)}><Ic name="trash-2" size={14} /></button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 210px 86px 84px", gap: "8px", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>
              <span>Question</span><span>Kind</span><span>Required</span><span />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 210px 86px 84px", gap: "8px", alignItems: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>
              <span>Date and time</span><span>Always asked</span><span>Yes</span><span />
            </div>
            {t.fields.map(f => (
              <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 210px 86px 84px", gap: "8px", alignItems: "center" }}>
                  <input value={f.label} readOnly={off} onChange={e => f.setLabel(e.target.value)} placeholder="Question" aria-label="Question" style={INPUT} />
                  <select value={f.kind} disabled={off} onChange={e => f.setKind(e.target.value as ApptFieldKind)} aria-label="Kind" style={INPUT}>
                    {APPT_FIELD_KINDS.map(k => <option key={k.k} value={k.k}>{k.label}</option>)}
                  </select>
                  <label style={{ display: "flex", alignItems: "center", gap: "6px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
                    <input type="checkbox" checked={!!f.required || f.kind === "place"} disabled={off || f.kind === "place"} onChange={f.toggleRequired} />{f.kind === "place" ? "Always" : "Yes"}
                  </label>
                  <span style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" title="Move up" disabled={off || !f.up} onClick={f.up} style={ICONBTN(off || !f.up)}><span style={{ display: "flex", transform: "rotate(180deg)" }}><Ic name="chevron-down" size={13} /></span></button>
                    <button type="button" title="Move down" disabled={off || !f.down} onClick={f.down} style={ICONBTN(off || !f.down)}><Ic name="chevron-down" size={13} /></button>
                    <button type="button" title="Remove question" disabled={off} onClick={f.remove} style={ICONBTN(off)}><Ic name="x" size={13} /></button>
                  </span>
                </div>
                {f.kind === "choice" && <input value={f.optionsText} readOnly={off} onChange={e => f.setOptions(e.target.value)} placeholder="Choices, separated by commas — e.g. Studio, 2 rooms, 3 rooms" aria-label="Choices" style={{ ...INPUT, marginRight: "186px" }} />}
              </div>
            ))}
            {!off && <button type="button" onClick={t.addField} style={{ ...BTN, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "30px", font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}><Ic name="plus" size={13} />Add question</button>}
          </div>
        </div>
      ))}
      {!off && <button type="button" onClick={v.addType} style={{ ...BTN, height: "44px", border: "1px dashed var(--crm-line)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", font: "500 13.5px Inter, sans-serif", color: "var(--crm-rust)" }}><Ic name="plus" size={14} />Add appointment type</button>}
      {off && <span style={{ font: "400 12.5px Inter, sans-serif", color: "var(--crm-faint)" }}>Only CRM · Manage changes the appointment types.</span>}
    </div>
  );
}
