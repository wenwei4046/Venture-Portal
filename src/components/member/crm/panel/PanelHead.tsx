"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/head.ts. To change the look, change the design and regenerate.
import type { HeadVM } from "./vm/head";

/** The back link a sub-page shows. */
export default function PanelHead({ v }: { v: HeadVM }) {
  return (<>
            
    {!!(v.showHead) && (<>
      <header style={{ flex: "none", display: "flex", alignItems: "center", padding: "4px 20px 0" }}>
        <span onClick={v.back} style={{ display: "flex", alignItems: "center", gap: "4px", height: "44px", color: "#BD4A19", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>{v.backLabel}</span>
      </header>
    </>)}
  </>);
}
