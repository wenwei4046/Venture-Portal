"use client";

/**
 * The desktop chat's head, right side (CRM redesign v4, frame D5a of docs/design_handoff_crm_redesign_v4/CRM Optimized
 * Desktop.dc.html; notes/24 §3 and §7): the wait as plain text — a 12px clock and "Waiting 6 h", 600 13px oxblood, no pill
 * — then ⋮ (34px, sand, no ring) and its menu: the phone's items, a divider, Block NAME in oxblood (desk/vm/chat-menu.ts).
 * ⋮ › Label (notes/15) opens the Label sheet as a dialog (shared/label-sheet-view.tsx).
 */
import { Fragment } from "react";
import type { DeskMenuItem } from "./vm/chat-menu";
import type { ChatLabelSheet } from "../shared/label-sheet";
import { LabelSheetView } from "../shared/label-sheet-view";

const BTN = { border: 0, padding: 0, margin: 0, background: "transparent", font: "inherit", textAlign: "left" as const, cursor: "pointer" };

export function DeskChatWait4a({ ph }: { ph: { status: string; statusColor: string; clock?: boolean } }) {
  if (!ph.status) return null;
  return (
    <span data-chat-wait="" style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "5px", font: "600 13px Inter, sans-serif", color: ph.statusColor, whiteSpace: "nowrap" }}>
      {ph.clock && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flex: "none" }}>
          <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
        </svg>
      )}
      {ph.status}
    </span>
  );
}

export function DeskChatMenu4a({ v }: { v: { menuOpen: boolean; toggleMenu: () => void; closeMenu: () => void; chatMenuItems: DeskMenuItem[]; labelSheet?: ChatLabelSheet | null } }) {
  return (
    <span style={{ position: "relative", flex: "0 0 auto", display: "flex" }}>
      <button type="button" onClick={v.toggleMenu} title="More" aria-expanded={v.menuOpen}
        style={{ ...BTN, width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", background: v.menuOpen ? "var(--crm-line)" : "var(--crm-field)", color: "var(--crm-ink)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {v.menuOpen && (<>
        <div onClick={v.closeMenu} style={{ position: "fixed", inset: "-2000px", zIndex: 7, background: "transparent" }} />
        <div role="menu" style={{ position: "absolute", top: "58px", right: 0, zIndex: 8, width: "264px", padding: "6px", boxSizing: "border-box", borderRadius: "18px", background: "#fff",
          border: "1px solid var(--crm-rule-soft)", boxShadow: "0 16px 36px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "2px", animation: "fadeIn 140ms ease-out" }}>
          {v.chatMenuItems.map(o => (
            <Fragment key={o.label}>
              {o.sep && <span style={{ height: "1px", margin: "4px 10px", background: "var(--crm-menu-divider)" }} />}
              <button type="button" role="menuitem" onClick={o.run} className="crm4a-row"
                style={{ ...BTN, display: "flex", alignItems: "center", gap: "12px", padding: "7px 10px", borderRadius: "12px", color: o.danger ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>
                <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "10px", background: o.bg, color: o.fg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={o.d} /></svg>
                </span>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ font: "600 14px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                  {o.sub && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.sub}</span>}
                </span>
              </button>
            </Fragment>
          ))}
        </div>
      </>)}
      <LabelSheetView s={v.labelSheet ?? null} desk />
    </span>
  );
}
