"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/nav.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { NavVM } from "./vm/nav";

/** The bottom bar. */
export default function PanelNav({ v }: { v: NavVM }) {
  return (<>
            
    <nav style={{ flex: "none", display: "flex", alignItems: "flex-end", height: "62px", padding: "0 4px", background: "#fff", borderTop: "1px solid #EBDDD2" }}>
      {(v.nav).map((t, t_i) => (<Fragment key={t_i}>
        <span onClick={t.go} style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "6px 0 8px", fontSize: "11px", fontWeight: t.w, color: t.color, cursor: "pointer" }}>
          <span style={{ position: "relative", display: "grid", placeItems: "center", width: "56px", height: "30px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon}>
              </path>
            </svg>
            {!!(t.badge) && (<>
              <b style={{ position: "absolute", top: "0", right: "8px", minWidth: "16px", height: "16px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "#BD4A19", color: "#fff", fontSize: "10px", fontWeight: "700", lineHeight: "16px", textAlign: "center", boxShadow: "0 0 0 2px #fff" }}>{t.badge}</b>
            </>)}
          </span>
          <span>{t.label}</span>
        </span>
      </Fragment>))}
    </nav>
  </>);
}
