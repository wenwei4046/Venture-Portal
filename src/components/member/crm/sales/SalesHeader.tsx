"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/header.ts. To change the look, change the design and regenerate.
import type { HeaderVM } from "./vm/header";

/** Top bar of Profile's sub-pages: ‹ Profile. */
export default function SalesHeader({ v }: { v: HeaderVM }) {
  return (<>
    {!!(v.showTopBar) && (<>
              
      <header style={{ flex: "0 0 auto", display: "flex", alignItems: "center", padding: "4px 20px 0", background: "#fff" }}>
        <span onClick={v.crmBack} title="Back to Revenue app" style={{ visibility: v.backVis, display: "flex", alignItems: "center", gap: "4px", height: "44px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>{v.backLabel}</span>
      </header>
    </>)}
  </>);
}
