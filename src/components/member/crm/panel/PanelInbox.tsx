"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/inbox.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { InboxVM } from "./vm/inbox";

/** Inbox: the status board — Needs a reply · Follow up · Appointment · Won · Lost — by team and member. */
export default function PanelInbox({ v }: { v: InboxVM }) {
  return (<>
            
    {!!(v.onInbox) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflow: "hidden", scrollbarWidth: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>
            <span style={{ fontSize: "13px", color: "#806B60" }}>{v.inbSummary}</span>
          </div>
          <span onClick={v.openPc} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #3F2B22", background: "#3F2B22", color: "#fff", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8">
              </path>
            </svg>Contacts</span>
        </div>
        {!!(v.inbHasChips) && (<>
          <div style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
            {(v.inbChips).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot, marginRight: "-2px" }}>
                </span>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
            </Fragment>))}
          </div>
        </>)}
        {!!(v.inbHasWho) && (<>
          <div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>
            {(v.inbWhoChips).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", height: "30px", padding: "0 12px", borderRadius: "15px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
            </Fragment>))}
          </div>
        </>)}
        <div data-drag-scroll="1" style={{ flex: "1 1 0", minHeight: "0", display: "flex", alignItems: "stretch", gap: "10px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px 4px", scrollSnapType: "x mandatory", scrollPadding: "0 20px", userSelect: "none" }}>
          {(v.inbCols).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ flex: "0 0 264px", height: "100%", scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: "8px", padding: "10px", boxSizing: "border-box", borderRadius: "18px", background: g.bg, overflowY: "auto", scrollbarWidth: "none" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px" }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: g.c }}>
                </span>
                <strong style={{ flex: "1", fontSize: "14px", fontWeight: "700", color: "#3F2B22" }}>{g.title}</strong>
                <small style={{ minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#fff", color: g.c, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{g.n}</small>
              </span>
              {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                <div onClick={r.open} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.06)", cursor: "pointer" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", background: r.ownBg, display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{r.ini}</span>
                    <strong style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                    <small style={{ flex: "none", fontSize: "11px", color: "#A8968B" }}>{r.at}</small>
                  </span>
                  <span style={{ fontSize: "13px", lineHeight: "1.35", color: "#806B60", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{r.preview}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", height: "22px", padding: "0 8px", borderRadius: "11px", background: r.ownBg, fontSize: "11px", fontWeight: "700" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.wc }}>
                      </span>{r.who}</span>
                    {!!(r.needs) && (<>
                      <span style={{ flex: "none", height: "22px", padding: "0 8px", borderRadius: "11px", background: r.stBg, color: r.uc, display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{r.state}</span>
                    </>)}
                  </span>
                </div>
              </Fragment>))}
              {!!(g.empty) && (<>
                <span style={{ padding: "18px 0", textAlign: "center", fontSize: "13px", color: "#A8968B" }}>Nothing here</span>
              </>)}
            </div>
          </Fragment>))}
        </div>
      </main>
    </>)}
  </>);
}
