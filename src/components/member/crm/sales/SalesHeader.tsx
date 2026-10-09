"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/header.ts. To change the look, change the design and regenerate.
import type { HeaderVM } from "./vm/header";

/** Top bar: back to the Revenue app, and the bell. */
export default function SalesHeader({ v }: { v: HeaderVM }) {
  return (<>
            
    <header style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "4px 20px 0", background: "#fff" }}>
      <span onClick={v.crmBack} title="Back to Revenue app" style={{ visibility: v.backVis, display: "flex", alignItems: "center", gap: "4px", height: "44px", color: "#BD4A19", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m15 6-6 6 6 6">
          </path>
        </svg>{v.backLabel}</span>
      <span onClick={v.openNotifTop} title="Notifications" style={{ position: "relative", marginLeft: "auto", width: "44px", height: "44px", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
          </path>
        </svg>
        {!!(v.hasNotifBadge) && (<>
          <span style={{ position: "absolute", top: "5px", right: "4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.notifBadge}</span>
        </>)}
      </span>
    </header>
  </>);
}
