"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/profile.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { Phone4aAutoReply, Phone4aProfile } from "../shared/phone4a";
import type { ProfileVM } from "./vm/profile";

/** Profile: card, View my team, workspace, Notifications (Unread | Read), Quick replies, Auto-reply. */
export default function SalesProfile({ v }: { v: ProfileVM }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {!!(v.profMain) && (<Phone4aProfile p={v.pf12} />)}
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
      {!!(v.profAuto) && (<Phone4aAutoReply a={v.ar12} />)}
    </main>
  </>);
}
