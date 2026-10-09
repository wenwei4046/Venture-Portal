"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/profile.ts. To change the look, change the design and regenerate.
import type { ProfileVM } from "./vm/profile";

/** Profile: the card, View as a team member, and the workspace. */
export default function PanelProfile({ v }: { v: ProfileVM }) {
  return (<>
            
    {!!(v.onProfile) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "650" }}>{v.meIni}</span>
            <div style={{ minWidth: "0" }}>
              <h1 style={{ margin: "0", fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.meName}</h1>
              <p style={{ margin: "2px 0 0", fontSize: "14px", color: "#806B60" }}>HOUZS Venture · CRM</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff" }}>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "13px", color: "#806B60" }}>Title</span>
              <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.meTitle}</strong>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px", borderLeft: "1px solid #EBDDD2" }}>
              <span style={{ fontSize: "13px", color: "#806B60" }}>Access</span>
              <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.meAccess}</strong>
            </div>
          </div>
        </div>
        {!!(v.isFull) && (<>
          <div onClick={v.openViewAs} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>View as a team member</strong>
              <span style={{ fontSize: "14px", color: "#D9C7BA" }}>Pick anyone in the CRM</span>
            </span>
            <svg style={{ flex: "none", color: "#D9C7BA" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
        </>)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>
          <div onClick={v.openNotifs} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: "1px solid #EBDDD2", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E4EDF8", color: "#2F6FB5", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>Notifications</strong>
            </span>
            {!!(v.notifUnread) && (<>
              <span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{v.notifUnread}</span>
            </>)}
            <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
          {!!(v.isFull) && (<>
            <div onClick={v.openRooms} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer", borderBottom: "1px solid #EBDDD2" }}>
              <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF3D6", color: "#A46312", display: "grid", placeItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z">
                  </path>
                </svg>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "17px", fontWeight: "700" }}>Showrooms</strong>
              </span>
              <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </div>
            <div onClick={v.openAdsPerf} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
              <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E4F1E8", color: "#387557", display: "grid", placeItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12">
                  </path>
                </svg>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "17px", fontWeight: "700" }}>Ads Performance</strong>
              </span>
              <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </div>
          </>)}
        </div>
      </main>
    </>)}
  </>);
}
