"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/bell.ts. To change the look, change the design and regenerate.
import H from "../crm.module.css";
import type { BellVM } from "./vm/bell";

/** The bell at the top right (Notifications), with its unread count. */
export default function PanelBell({ v }: { v: BellVM }) {
  return (<>
            
    {!!(v.showBell) && (<>
      <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "8px", padding: "0 14px" }}>
        <span onClick={v.openNotifs} title="Notifications" style={{ position: "relative", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
            </path>
          </svg>
          {!!(v.notifUnread) && (<>
            <span style={{ position: "absolute", top: "4px", right: "3px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", border: "2px solid #FBF7F3", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.notifUnread}</span>
          </>)}
        </span>
      </div>
    </>)}
  </>);
}
