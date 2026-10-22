"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/profile.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { ProfileVM } from "./vm/profile";

/** Profile: card, View my team, workspace, Notifications (Unread | Read), Quick replies, Auto-reply. */
export default function SalesProfile({ v }: { v: ProfileVM }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {!!(v.profMain) && (<>
        <div data-prof-glow="1" style={{ margin: "-14px -20px 0", padding: "56px 20px 0", background: "radial-gradient(130% 100% at 50% 0%, var(--crm-peach) 0%, var(--crm-peach-soft) 48%, var(--crm-page) 100%) top / 100% 150px no-repeat" }}>
        <div style={{ borderRadius: "22px", background: "#fff", boxShadow: "0 6px 24px rgba(42,22,12,.10)", padding: "18px 18px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontFamily: "var(--font-display-rv)", fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "650" }}>{v.meIniX}</span>
            <div style={{ flex: "1", minWidth: "0" }}>
              <h1 style={{ margin: "0", fontFamily: "var(--font-display-rv)", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.meNameX}</h1>
              <p style={{ margin: "2px 0 0", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>HOUZS Venture · CRM</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Title</span>
              <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.meTitleX}</strong>
            </div>
            <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", borderLeft: "1px solid var(--crm-rule)" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Rank</span>
              <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.meRankX}</strong>
            </div>
          </div>
        </div>
        </div>
        {!!(v.hasTeam) && (<>
          <div onClick={v.openTeam} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "18px", background: "var(--crm-ink)", color: "#fff", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: "rgba(255,255,255,.12)", color: "var(--crm-peach)", display: "grid", placeItems: "center" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>View my team</strong>
              <span style={{ fontSize: "calc(12.5px * var(--rv-type, 1))", color: "var(--crm-tint-attention)" }}>{v.teamSub}</span>
            </span>
            <svg style={{ flex: "none", color: "var(--crm-tint-attention)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7">
              </path>
            </svg>
          </div>
        </>)}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "8px" }}>
          <h2 style={{ margin: "0 0 6px", fontFamily: "var(--font-display-rv)", fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "650", letterSpacing: "-.02em" }}>Your workspace</h2>
          <div onClick={v.openNotif} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>Notifications</strong>
            </span>
            {!!(v.hasNotifBadge) && (<>
              <span style={{ flex: "none", marginRight: "-4px", padding: "1px 7px", borderRadius: "9px", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(10.9px * var(--rv-type, 1))", fontWeight: "700" }}>{v.notifBadge}</span>
            </>)}
            <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7">
              </path>
            </svg>
          </div>
          <div style={{ height: "1px", background: "var(--crm-field)" }}>
          </div>
          <div onClick={v.openAuto} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>Auto-reply</strong>
            </span>
            <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7">
              </path>
            </svg>
          </div>
          <div style={{ height: "1px", background: "var(--crm-field)" }}>
          </div>
          <div onClick={v.openQuick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>Quick replies</strong>
            </span>
            <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 5 7 7-7 7">
              </path>
            </svg>
          </div>
        </div>
      </>)}
      {!!(v.teamOpen) && (<>
        <div onClick={v.closeTeam} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <h2 style={{ margin: "6px 0 2px", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>View my team</h2>
            <small style={{ marginBottom: "6px", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>See their CRM · read-only</small>
            {(v.teamList).map((p, p_i) => (<Fragment key={p_i}>
              <div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: "1px solid var(--crm-field)", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700" }}>{p.ini}</span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{p.name}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.title}</small>
                </span>
                <span style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>View</span>
              </div>
            </Fragment>))}
          </div>
        </div>
      </>)}
      {!!(v.profNotif) && (<>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
          <h1 style={{ margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Notifications</h1>
          {!!(v.canMarkAll) && (<>
            <span onClick={v.markAll} style={{ flex: "none", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={H.hov6}>Mark all as read</span>
          </>)}
        </div>
        <div style={{ display: "flex", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>{(v.nTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "17px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: t.on ? "500" : "400", background: t.on ? "var(--crm-rust)" : "transparent", color: t.on ? "#fff" : "var(--crm-muted)", cursor: "pointer" }}>{t.label}<span style={{ fontVariantNumeric: "tabular-nums", color: t.on ? "var(--crm-rust-meta)" : "var(--crm-faint)" }}>{t.cnt}</span></span>))}</div>
        {!!(v.nEmpty) && (<>
          <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "var(--crm-muted)", textAlign: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10">
              </path>
            </svg>
            <span style={{ fontSize: "calc(14px * var(--rv-type, 1))" }}>{v.nEmptyText}</span>
          </div>
        </>)}
        {!!(v.hasInv) && (<>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "0.12em", color: "var(--crm-faint)" }}>INVITATIONS</span>
            {(v.notifInv).map((n, n_i) => (<Fragment key={n_i}>
              <section style={{ padding: "14px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ position: "relative", flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: n.bg, color: n.c, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{n.ini}<span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "20px", height: "20px", borderRadius: "50%", background: n.c, color: "#fff", border: "2px solid #fff", display: "grid", placeItems: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={n.icon}>
                        </path>
                      </svg>
                    </span></span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", lineHeight: "1.3" }}>{n.text}</strong>
                    <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{n.lead} · {n.at}</span>
                  </span>
                </div>
                {!!(n.pending) && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <span onClick={n.decline} style={{ height: "42px", boxSizing: "border-box", borderRadius: "21px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Decline</span>
                    <span onClick={n.accept} style={{ height: "42px", borderRadius: "21px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Accept</span>
                  </div>
                </>)}
                {!!(n.done) && (<>
                  <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: "10px", background: n.doneBg, color: n.doneFg, fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700" }}>{n.doneLabel}</span>
                </>)}
              </section>
            </Fragment>))}
          </div>
        </>)}
        {!!(v.hasUpd) && (<>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "0.12em", color: "var(--crm-faint)" }}>UPDATES</span>
            <div style={{ margin: "0 -20px" }}>
              {(v.notifUpd).map((u, u_i) => (<Fragment key={u_i}>
                <div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 20px", background: u.unread ? "var(--crm-hover)" : "transparent", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d={u.icon}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "calc(15.76px * var(--rv-type, 1))", fontWeight: u.unread ? "600" : "400", lineHeight: "1.3", color: "var(--crm-ink)" }}>{u.text}</span>
                    <span style={{ fontSize: "calc(13.59px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{u.meta}</span>
                    {!!(u.sum) && (<span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-ink)", lineHeight: "1.35", marginTop: "2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{u.sum}</span>)}
                  </span>
                  {!!(u.unread) && (<>
                    <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-orange)" }}>
                    </span>
                  </>)}
                </div>
              </Fragment>))}
            </div>
          </div>
        </>)}
      </>)}
      {!!(v.profQuick) && (<>
        <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Quick replies</h1>
        {(v.qrRows).map((q, q_i) => (<Fragment key={q_i}>
          <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Shortcut</span>
              <input value={q.title} onChange={q.setTitle} placeholder="e.g. Price" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", background: "var(--crm-page)", fontWeight: "650" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Message</span>
              <textarea rows={3} value={q.text} onChange={q.setText} placeholder="Message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-ink)", resize: "none", background: "var(--crm-page)" }}>
              </textarea>
            </label>
            <span onClick={q.remove} style={{ alignSelf: "flex-start", padding: "6px 2px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove</span>
          </section>
        </Fragment>))}
        <span onClick={v.qrRowAdd} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px dashed var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14">
            </path>
          </svg>Add quick reply</span>
      </>)}
      {!!(v.profAuto) && (<>
        <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Auto-reply</h1>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>Welcome reply</strong>
            <span onClick={v.arW.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: v.arW.Bg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
              <span style={{ position: "absolute", top: "3px", left: v.arW.X, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
              </span>
            </span>
          </div>
          <textarea rows={3} value={v.arW.text} onChange={v.arW.type} placeholder="Message for a customer's first message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-ink)", resize: "none", background: "var(--crm-page)", opacity: v.arW.op }}>
          </textarea>
          {!!(v.arW.img) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid var(--crm-rule)", background: "#fff" }}>
              <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `var(--crm-field) ${v.arW.imgBg} center / cover no-repeat` }}>
              </span>
              <span style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.arW.imgName}</span>
              <span onClick={v.arW.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove</span>
            </div>
          </>)}
          {!!(v.arW.noImg) && (<>
            <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                </path>
              </svg>Add image<input type="file" accept="image/*" onChange={v.arW.pickImg} style={{ display: "none" }} /></label>
          </>)}
        </section>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>Outside opening hours</strong>
            <span onClick={v.arA.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: v.arA.Bg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
              <span style={{ position: "absolute", top: "3px", left: v.arA.X, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
              </span>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid var(--crm-rule)", borderRadius: "14px", opacity: v.arA.op }}>
            <div onClick={v.arA.openFrom} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Opens</span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.arA.fromLbl}</strong>
                <svg style={{ color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                  </path>
                </svg>
              </span>
            </div>
            <div style={{ borderLeft: "1px solid var(--crm-rule)" }}>
              <div onClick={v.arA.openTo} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Closes</span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                  <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.arA.toLbl}</strong>
                  <svg style={{ color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                    </path>
                  </svg>
                </span>
              </div>
            </div>
          </div>
          <textarea rows={3} value={v.arA.text} onChange={v.arA.type} placeholder="Message sent outside these hours" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-ink)", resize: "none", background: "var(--crm-page)", opacity: v.arA.op }}>
          </textarea>
          {!!(v.arA.img) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid var(--crm-rule)", background: "#fff" }}>
              <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `var(--crm-field) ${v.arA.imgBg} center / cover no-repeat` }}>
              </span>
              <span style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.arA.imgName}</span>
              <span onClick={v.arA.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove</span>
            </div>
          </>)}
          {!!(v.arA.noImg) && (<>
            <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                </path>
              </svg>Add image<input type="file" accept="image/*" onChange={v.arA.pickImg} style={{ display: "none" }} /></label>
          </>)}
        </section>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>Keyword replies</strong>
          </div>
          {(v.arKws).map((k, k_i) => (<Fragment key={k_i}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", borderRadius: "16px", background: "var(--crm-page)", border: "1px solid var(--crm-rule)", opacity: k.op }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>When the message contains</span>
                <input value={k.words} onChange={k.typeW} placeholder="e.g. price, how much" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", background: "#fff" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Reply with</span>
                <textarea rows={3} value={k.text} onChange={k.typeT} placeholder="Message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-ink)", resize: "none", background: "#fff" }}>
                </textarea>
              </label>
              {!!(k.img) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid var(--crm-rule)", background: "#fff" }}>
                  <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `var(--crm-field) ${k.imgBg} center / cover no-repeat` }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.imgName}</span>
                  <span onClick={k.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove</span>
                </div>
              </>)}
              {!!(k.noImg) && (<>
                <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                    </path>
                  </svg>Add image<input type="file" accept="image/*" onChange={k.pickImg} style={{ display: "none" }} /></label>
              </>)}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid var(--crm-rule)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}><span onClick={k.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: k.onBg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
                    <span style={{ position: "absolute", top: "3px", left: k.onX, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
                    </span>
                  </span>{k.state}</span>
                <span onClick={k.remove} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", background: "#fff", border: "1px solid var(--crm-rule)", cursor: "pointer" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>Remove</span>
              </div>
            </div>
          </Fragment>))}
          <span onClick={v.arAdd} style={{ height: "46px", boxSizing: "border-box", borderRadius: "23px", border: "1px dashed var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14">
              </path>
            </svg>Add keyword reply</span>
        </section>
        {!!(v.tpOpen) && (<>
          <div onClick={v.tpClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.tpTitle}</h2>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpHours).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpMins).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpAps).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
              </div>
              <span onClick={v.tpDone} style={{ height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Done · {v.tpPreview}</span>
            </div>
          </div>
        </>)}
      </>)}
    </main>
  </>);
}
