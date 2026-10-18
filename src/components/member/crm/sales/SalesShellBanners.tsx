"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/shell.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { ShellVM } from "./vm/shell";

/** The Revenue Director's Control panel | My CRM toggle, the Viewing-someone banner and the Switch sheet. */
export default function SalesShellBanners({ v }: { v: ShellVM }) {
  return (<>
    {!!(v.rdX) && (<>
      <div style={{ flex: "none", display: "flex", padding: "0 20px 6px" }}>
        <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "var(--crm-rule-soft)" }}>
          <span onClick={v.toPanelX} style={{ height: "30px", padding: "0 12px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>Control panel</span>
          <span style={{ height: "30px", padding: "0 12px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", background: "#fff", color: "var(--crm-ink)", boxShadow: "0 1px 3px rgba(42,22,12,.14)" }}>My CRM</span>
        </div>
      </div>
    </>)}
    {!!(v.asOnX) && (<>
      <div style={{ flex: "none", margin: "4px 16px 6px", display: "flex", alignItems: "center", gap: "10px", padding: "8px 8px 8px 12px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff" }}>
        <svg style={{ flex: "none", color: "var(--crm-peach)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
          </path>
        </svg>
        <span style={{ flex: "1", minWidth: "0", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Viewing {v.asNameX}'s CRM</span>
        {!!(v.canSwitchX) && (<>
          <span onClick={v.openSwX} style={{ flex: "none", height: "30px", padding: "0 12px", borderRadius: "15px", background: "var(--crm-peach)", color: "var(--crm-ink)", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
              </path>
            </svg>Switch</span>
        </>)}
        <span onClick={v.exitAsX} style={{ flex: "none", height: "30px", padding: "0 12px", borderRadius: "15px", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Exit</span>
      </div>
    </>)}
    {!!(v.swOpenX) && (<>
      <div onClick={v.closeSwX} style={{ position: "absolute", inset: "0", zIndex: "20", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <h2 style={{ margin: "6px 0 8px", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Switch to</h2>
          {(v.swList).map((p, p_i) => (<Fragment key={p_i}>
            {!!p.hasHead && (<span style={{ padding: "8px 0 4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{p.head}</span>)}
            <div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: p.rule, cursor: "pointer" }}>
              <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700" }}>{p.ini}</span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{p.name}</strong>
                <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.title}</small>
              </span>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: p.fg }}>{p.act}</span>
            </div>
          </Fragment>))}
        </div>
      </div>
    </>)}
  </>);
}
