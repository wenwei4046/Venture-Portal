"use client";

/**
 * Inbox's Customer info and this chat's Audit log (CRM redesign v4, frame D5a of docs/design_handoff_crm_redesign_v4/CRM
 * Optimized Desktop.dc.html; notes/24 §4, §4b, §5), and Customer info's own Audit log elsewhere.
 * - Customer info, calmer: the head (Inter Tight 16, » folds it to its strip), then Labels · Contact · Lead · Visit, each a
 *   sentence-case 12.5px head that folds (its chevron), inside one key / value row each (the key 92px faint, the value 13px
 *   500, wrapping); Labels as 24px chips and a plain rust "+ Add" (the Label sheet, notes/15); short dates.
 * - The Audit log stays its own right-hand panel, folded by default to a 44px rail ("Audit log · 12"); opened, the D4b
 *   timeline (shared/audit-timeline.tsx — newest at the bottom, no heading inside).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { InfoValue } from "../shared/AdLink";
import { Ic } from "../shared/icons4a";
import { AuditTimeline, type AuditLine } from "../shared/audit-timeline";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box" };

export interface InboxSideBits {
  ibHas: boolean; ibNone: boolean; ibInfoShut: boolean; ibInfoFold: () => void; ibInfoRail: { open: () => void }; ibInfoW: number;
  dragInfo: (e: never) => void; resetInfo: () => void;
  ibInfo: { groups: { label: string; rows: { k: string; v: string; href: string | null; c: string; go?: (() => void) | null }[] }[] };
  ibCpOpen: boolean; ibCpToggle: () => void; ibCpW?: number; dragCp?: (e: never) => void; resetCp?: () => void;
  ibCp: { audit4: AuditLine[] };
  ibBook: () => void; editInfo: () => void;
  ibLabels?: { items: { key: string; name: string; color: string; on: boolean }[] };
  /** notes/15: Customer info's "+ Add" opens the Label sheet. */
  openLabels?: () => void;
  /** Folded sections (their labels) and the fold. */
  infoFold?: string[]; toggleInfoFold?: (label: string) => void;
}

/** A section's head in sentence case ("CONTACT" → "Contact"); a name the Principal gave in mixed case stays as written. */
export const sentenceCase = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

/** Customer info's folded strip: the cream rail with its name running down (unchanged since v2). */
function InfoStrip({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title="Open Customer info" style={{ ...BTN, width: "45px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", padding: "20px 0 0",
      borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-cream-nav)" }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="user-round" size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>Customer info</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
}

/** D5a's Audit log rail: 44px on sand, the history icon in a 30px box, "Audit log · N" running down. */
function AuditRail({ n, onOpen }: { n: number; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title="Open the Audit log" data-audit-rail="" style={{ ...BTN, width: "45px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", padding: "20px 0 0",
      borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-hover)" }}>
      <span style={{ width: "30px", height: "30px", borderRadius: "8px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--crm-muted)" }}><Ic name="history" size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>Audit log · {n}</span>
    </button>
  );
}

function Section({ label, folded, toggle, pad, children }: { label: string; folded: boolean; toggle?: () => void; pad: string; children: ReactNode }) {
  return (
    <div style={{ padding: folded ? "4px 0" : pad, borderBottom: "1px solid var(--crm-rule-soft)" }}>
      <button type="button" onClick={toggle} aria-expanded={!folded} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", height: "38px", padding: "0 20px", font: "600 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>
        {label}
        <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint-2)", transform: folded ? "rotate(-90deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-down" size={12} /></span>
      </button>
      {!folded && children}
    </div>
  );
}

/** Frame D5a · Customer info and this chat's Audit log, each folding to a 44px strip. */
export function DeskInboxSide4a({ v, value }: { v: InboxSideBits; value: (v: string, href: string | null) => ReactNode }) {
  const fold = new Set(v.infoFold ?? []);
  const lab = v.ibLabels;
  const on = lab ? lab.items.filter(l => l.on) : [];
  return (<>
    {v.ibInfoShut ? <InfoStrip onOpen={v.ibInfoRail.open} /> : (
      <aside data-customer-info="" style={{ position: "relative", width: `${v.ibInfoW}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-rule)", background: "#fff" }}>
        <div onPointerDown={v.dragInfo as never} onDoubleClick={v.resetInfo} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: 0, bottom: 0, width: "9px", zIndex: 6, cursor: "col-resize", touchAction: "none" }} />
        <button type="button" onClick={v.ibInfoFold} title="Fold Customer info" style={{ ...BTN, height: "65px", flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px",
          borderBottom: "1px solid var(--crm-rule)", color: "var(--crm-ink)" }}>
          <span style={{ font: `500 16px ${TIGHT}` }}>Customer info</span>
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {v.ibNone && <span style={{ padding: "40px 20px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a chat to see the customer</span>}
          {v.ibHas && (<>
            {lab && (
              <Section label="Labels" folded={fold.has("Labels")} toggle={() => v.toggleInfoFold?.("Labels")} pad="4px 0 10px">
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", padding: "0 20px" }}>
                  {on.map(l => (
                    <span key={l.key} style={{ height: "24px", padding: "0 9px", borderRadius: "12px", display: "flex", alignItems: "center", gap: "5px", font: "500 12px Inter, sans-serif", background: "var(--crm-field)", color: "var(--crm-ink)" }}>
                      <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: l.color }} />{l.name}
                    </span>
                  ))}
                  <button type="button" onClick={v.openLabels} style={{ ...BTN, height: "24px", padding: "0 8px", display: "flex", alignItems: "center", gap: "3px", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>
                    <Ic name="plus" size={11} />Add
                  </button>
                </div>
              </Section>
            )}
            {v.ibInfo.groups.map(g => {
              const label = sentenceCase(g.label);
              return (
                <Section key={g.label} label={label} folded={fold.has(label)} toggle={() => v.toggleInfoFold?.(label)} pad="4px 0 8px">
                  <div style={{ padding: "0 20px" }}>
                    {g.rows.map(r => (
                      <div key={r.k} style={{ display: "grid", gridTemplateColumns: "92px minmax(0,1fr)", columnGap: "10px", padding: "6px 0", font: "400 13px/1.45 Inter, sans-serif" }}>
                        <span style={{ color: "var(--crm-faint)", overflowWrap: "anywhere" }}>{r.k}</span>
                        <span style={{ fontWeight: 500, color: r.c, overflowWrap: "anywhere", minWidth: 0 }}>{r.go ? <InfoValue v={r.v} go={r.go} /> : value(r.v, r.href)}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              );
            })}
            <div style={{ padding: "14px 20px 18px", display: "flex", gap: "16px" }}>
              <button type="button" onClick={v.editInfo} style={{ ...BTN, font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>Edit customer info</button>
              <button type="button" onClick={v.ibBook} style={{ ...BTN, font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>Book a visit</button>
            </div>
          </>)}
        </div>
      </aside>
    )}
    {!v.ibCpOpen ? <AuditRail n={v.ibHas ? v.ibCp.audit4.length : 0} onOpen={v.ibCpToggle} /> : (
      <aside data-audit-panel="" style={{ position: "relative", width: `${v.ibCpW ?? 320}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-rule)", background: "#fff" }}>
        {v.dragCp && <span onPointerDown={v.dragCp as never} onDoubleClick={v.resetCp} title="Drag to resize" style={{ position: "absolute", top: 0, bottom: 0, left: "-5px", width: "10px", zIndex: 2, cursor: "col-resize", touchAction: "none" }} />}
        <button type="button" onClick={v.ibCpToggle} title="Fold the Audit log" style={{ ...BTN, height: "65px", flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "0 20px", borderBottom: "1px solid var(--crm-rule)", color: "var(--crm-ink)" }}>
          <span style={{ font: `500 16px ${TIGHT}` }}>Audit log</span>
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 20px 0" }}>
          {v.ibNone && <span style={{ display: "block", padding: "24px 0", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a chat to see its history</span>}
          {v.ibHas && <AuditTimeline lines={v.ibCp.audit4} empty="Nothing recorded yet" />}
        </div>
      </aside>
    )}
  </>);
}

/** Customer info's own Audit log (the owner, 2026-11-09: "能不能看到 audit log?"), folded until opened — the D4b timeline. */
export function DeskInfoAudit4a({ items, open: openAt }: { open?: boolean; items?: AuditLine[] }) {
  const [open, setOpen] = useState(!!openAt);
  useEffect(() => { if (openAt) setOpen(true); }, [openAt]);
  if (!items) return null; // the prototype harness draws none
  return (
    <div style={{ border: "1px solid var(--crm-rule)", borderRadius: "16px", overflow: "hidden", flex: "none" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} style={{ ...BTN, width: "100%", height: "46px", display: "flex", alignItems: "center", gap: "8px", padding: "0 14px", background: "#fff", color: "var(--crm-ink)" }}>
        <span style={{ font: "600 14px Inter, sans-serif" }}>Audit log</span>
        <span style={{ font: "400 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>{items.length}</span>
        <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)", transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-right" size={15} /></span>
      </button>
      {open && (
        <div style={{ padding: "16px 14px 0", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}>
          <AuditTimeline lines={items} empty="Nothing recorded yet" />
        </div>
      )}
    </div>
  );
}
