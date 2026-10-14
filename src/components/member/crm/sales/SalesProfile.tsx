"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/profile.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { ProfileVM } from "./vm/profile";
import type { ShellExtras } from "./vm/header";

/** Profile: card, View my team, workspace, Notifications (Unread | Read), Quick replies, Auto-reply. */
export default function SalesProfile({ v }: { v: ProfileVM & ShellExtras }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      {!!(v.profMain) && (<>
        <div style={{ position: "relative", borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", boxShadow: "0 6px 20px rgba(63,43,34,.06)", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!!(v.tb) && (<>
          {!!(v.tm.on) && (<>
            <span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ position: "absolute", top: "14px", right: "110px", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={v.tm.icon}>
                </path>
              </svg>
            </span>
          </>)}
          <span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ position: "absolute", top: "14px", right: "62px", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#BD4A19", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9">
              </path>
            </svg>
          </span>
          <span onClick={v.tb.open} title="Notifications" style={{ position: "absolute", top: "14px", right: "14px", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
              </path>
            </svg>
            {!!(v.tb.has) && (<>
              <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.tb.n}</span>
            </>)}
          </span>
        </>)}
          <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingRight: v.tm.on ? "144px" : "96px" }}>
            <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "650" }}>{v.meIniX}</span>
            <div style={{ minWidth: "0" }}>
              <h1 style={{ margin: "0", fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.meNameX}</h1>
              <p style={{ margin: "2px 0 0", fontSize: "14px", color: "#806B60" }}>HOUZS Venture · CRM</p>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff" }}>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ fontSize: "13px", color: "#806B60" }}>Title</span>
              <strong style={{ fontSize: "16px", fontWeight: "700", lineHeight: "1.25" }}>{v.meTitleX}</strong>
            </div>
            <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px", borderLeft: "1px solid #EBDDD2" }}>
              <span style={{ fontSize: "13px", color: "#806B60" }}>Rank</span>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>{v.meRankX}</strong>
            </div>
          </div>
        </div>
        {!!(v.hasTeam) && (<>
          <div onClick={v.openTeam} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>View my team</strong>
              <span style={{ fontSize: "14px", color: "#D9C7BA" }}>{v.teamSub}</span>
            </span>
            <svg style={{ flex: "none", color: "#D9C7BA" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
        </>)}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>
          <div onClick={v.openNotif} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E4EDF8", color: "#2F6FB5", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>Notifications</strong>
            </span>
            {!!(v.hasNotifBadge) && (<>
              <span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{v.notifBadge}</span>
            </>)}
            <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
          <div style={{ height: "1px", background: "#EBDDD2", marginLeft: "66px" }}>
          </div>
          <div onClick={v.openAuto} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E6F0EA", color: "#387557", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>Auto-reply</strong>
            </span>
            <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
          <div style={{ height: "1px", background: "#EBDDD2", marginLeft: "66px" }}>
          </div>
          <div onClick={v.openQuick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>Quick replies</strong>
            </span>
            <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
        </div>
      </>)}
      {!!(v.teamOpen) && (<>
        <div onClick={v.closeTeam} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stopTeam} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <h2 style={{ margin: "6px 0 2px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>View my team</h2>
            <small style={{ marginBottom: "6px", fontSize: "13px", color: "#806B60" }}>See their CRM · read-only</small>
            {(v.teamList).map((p, p_i) => (<Fragment key={p_i}>
              <div onClick={p.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "58px", borderTop: "1px solid #F5EEE9", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#F5EBE3", color: "#4E2F20", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "700" }}>{p.ini}</span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{p.name}</strong>
                  <small style={{ fontSize: "12px", color: "#806B60" }}>{p.title}</small>
                </span>
                <span style={{ fontSize: "14px", fontWeight: "650", color: "#BD4A19" }}>View</span>
              </div>
            </Fragment>))}
          </div>
        </div>
      </>)}
      {!!(v.profNotif) && (<>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px" }}>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Notifications</h1>
          {!!(v.canMarkAll) && (<>
            <span onClick={v.markAll} style={{ flex: "none", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={H.hov6}>Mark all as read</span>
          </>)}
        </div>
        <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
          {(v.nTabs).map((t, t_i) => (<Fragment key={t_i}>
            <span onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", fontWeight: t.weight, background: t.bg, color: t.fg, boxShadow: t.shadow, cursor: "pointer" }}>{t.label}{!!(t.n) && (<>
                <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{t.n}</span>
              </>)}</span>
          </Fragment>))}
        </div>
        {!!(v.nEmpty) && (<>
          <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "#806B60", textAlign: "center" }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10">
              </path>
            </svg>
            <span style={{ fontSize: "14px" }}>{v.nEmptyText}</span>
          </div>
        </>)}
        {!!(v.hasInv) && (<>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".05em", color: "#806B60" }}>INVITATIONS</span>
            {(v.notifInv).map((n, n_i) => (<Fragment key={n_i}>
              <section style={{ padding: "14px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ position: "relative", flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: n.bg, color: n.c, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "700" }}>{n.ini}<span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "20px", height: "20px", borderRadius: "50%", background: n.c, color: "#fff", border: "2px solid #fff", display: "grid", placeItems: "center" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={n.icon}>
                        </path>
                      </svg>
                    </span></span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", lineHeight: "1.3" }}>{n.text}</strong>
                    <span style={{ fontSize: "13px", color: "#806B60" }}>{n.lead} · {n.at}</span>
                  </span>
                </div>
                {!!(n.pending) && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                    <span onClick={n.decline} style={{ height: "42px", boxSizing: "border-box", borderRadius: "21px", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>Decline</span>
                    <span onClick={n.accept} style={{ height: "42px", borderRadius: "21px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}>Accept</span>
                  </div>
                </>)}
                {!!(n.done) && (<>
                  <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: "10px", background: n.doneBg, color: n.doneFg, fontSize: "12px", fontWeight: "700" }}>{n.doneLabel}</span>
                </>)}
              </section>
            </Fragment>))}
          </div>
        </>)}
        {!!(v.hasUpd) && (<>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".05em", color: "#806B60" }}>UPDATES</span>
            <div style={{ padding: "0 14px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2" }}>
              {(v.notifUpd).map((u, u_i) => (<Fragment key={u_i}>
                <div onClick={u.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: u.rule, cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "50%", background: u.bg, color: u.c, display: "grid", placeItems: "center" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d={u.icon}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: "14px", fontWeight: u.weight, lineHeight: "1.3", color: u.fg }}>{u.text}</span>
                    <span style={{ fontSize: "12px", color: "#806B60" }}>{u.meta}</span>
                    {!!(u.sum) && (<span style={{ fontSize: "13px", color: "#3F2B22", lineHeight: "1.35", marginTop: "2px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{u.sum}</span>)}
                  </span>
                  {!!(u.unread) && (<>
                    <span style={{ flex: "none", width: "9px", height: "9px", borderRadius: "50%", background: "#BD4A19" }}>
                    </span>
                  </>)}
                </div>
              </Fragment>))}
            </div>
          </div>
        </>)}
      </>)}
      {!!(v.profQuick) && (<>
        <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Quick replies</h1>
        {(v.qrRows).map((q, q_i) => (<Fragment key={q_i}>
          <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Shortcut</span>
              <input value={q.title} onChange={q.setTitle} placeholder="e.g. Price" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", color: "#3F2B22", background: "#FBF7F3", fontWeight: "650" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Message</span>
              <textarea rows={3} value={q.text} onChange={q.setText} placeholder="Message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#FBF7F3" }}>
              </textarea>
            </label>
            <span onClick={q.remove} style={{ alignSelf: "flex-start", padding: "6px 2px", fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
          </section>
        </Fragment>))}
        <span onClick={v.qrRowAdd} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px dashed #D9C7BA", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "15px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14">
            </path>
          </svg>Add quick reply</span>
      </>)}
      {!!(v.profAuto) && (<>
        <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Auto-reply</h1>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "650" }}>Welcome reply</strong>
            <span onClick={v.arW.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: v.arW.Bg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
              <span style={{ position: "absolute", top: "3px", left: v.arW.X, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
              </span>
            </span>
          </div>
          <textarea rows={3} value={v.arW.text} onChange={v.arW.type} placeholder="Message for a customer's first message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#FBF7F3", opacity: v.arW.op }}>
          </textarea>
          {!!(v.arW.img) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid #EBDDD2", background: "#fff" }}>
              <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `#F5EBE3 ${v.arW.imgBg} center / cover no-repeat` }}>
              </span>
              <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.arW.imgName}</span>
              <span onClick={v.arW.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
            </div>
          </>)}
          {!!(v.arW.noImg) && (<>
            <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed #D9C7BA", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "14px", fontWeight: "600", color: "#BD4A19", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                </path>
              </svg>Add image<input type="file" accept="image/*" onChange={v.arW.pickImg} style={{ display: "none" }} /></label>
          </>)}
        </section>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "650" }}>Outside opening hours</strong>
            <span onClick={v.arA.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: v.arA.Bg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
              <span style={{ position: "absolute", top: "3px", left: v.arA.X, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
              </span>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "14px", opacity: v.arA.op }}>
            <div onClick={v.arA.openFrom} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
              <span style={{ fontSize: "13px", color: "#806B60" }}>Opens</span>
              <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                <strong style={{ fontSize: "18px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.arA.fromLbl}</strong>
                <svg style={{ color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                  </path>
                </svg>
              </span>
            </div>
            <div style={{ borderLeft: "1px solid #EBDDD2" }}>
              <div onClick={v.arA.openTo} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                <span style={{ fontSize: "13px", color: "#806B60" }}>Closes</span>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                  <strong style={{ fontSize: "18px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.arA.toLbl}</strong>
                  <svg style={{ color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                    </path>
                  </svg>
                </span>
              </div>
            </div>
          </div>
          <textarea rows={3} value={v.arA.text} onChange={v.arA.type} placeholder="Message sent outside these hours" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#FBF7F3", opacity: v.arA.op }}>
          </textarea>
          {!!(v.arA.img) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid #EBDDD2", background: "#fff" }}>
              <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `#F5EBE3 ${v.arA.imgBg} center / cover no-repeat` }}>
              </span>
              <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.arA.imgName}</span>
              <span onClick={v.arA.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
            </div>
          </>)}
          {!!(v.arA.noImg) && (<>
            <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed #D9C7BA", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "14px", fontWeight: "600", color: "#BD4A19", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                </path>
              </svg>Add image<input type="file" accept="image/*" onChange={v.arA.pickImg} style={{ display: "none" }} /></label>
          </>)}
        </section>
        <section style={{ padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "650" }}>Keyword replies</strong>
          </div>
          {(v.arKws).map((k, k_i) => (<Fragment key={k_i}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", borderRadius: "16px", background: "#FBF7F3", border: "1px solid #EBDDD2", opacity: k.op }}>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>When the message contains</span>
                <input value={k.words} onChange={k.typeW} placeholder="e.g. price, how much" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", fontWeight: "600", color: "#3F2B22", background: "#fff" }} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Reply with</span>
                <textarea rows={3} value={k.text} onChange={k.typeT} placeholder="Message" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#fff" }}>
                </textarea>
              </label>
              {!!(k.img) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px", borderRadius: "14px", border: "1px solid #EBDDD2", background: "#fff" }}>
                  <span style={{ flex: "none", width: "56px", height: "56px", borderRadius: "10px", background: `#F5EBE3 ${k.imgBg} center / cover no-repeat` }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.imgName}</span>
                  <span onClick={k.rmImg} style={{ flex: "none", padding: "6px 10px", fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
                </div>
              </>)}
              {!!(k.noImg) && (<>
                <label style={{ height: "44px", boxSizing: "border-box", borderRadius: "22px", border: "1px dashed #D9C7BA", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "14px", fontWeight: "600", color: "#BD4A19", cursor: "pointer", background: "#fff" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 5h16v14H4V5Zm0 10 4-4 4 4 3-3 5 5M15 9h.01">
                    </path>
                  </svg>Add image<input type="file" accept="image/*" onChange={k.pickImg} style={{ display: "none" }} /></label>
              </>)}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "12px", borderTop: "1px solid #EBDDD2" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "14px", fontWeight: "600", color: "#3F2B22" }}><span onClick={k.toggle} style={{ flex: "none", width: "46px", height: "28px", borderRadius: "14px", background: k.onBg, position: "relative", cursor: "pointer", transition: "background 150ms" }}>
                    <span style={{ position: "absolute", top: "3px", left: k.onX, width: "22px", height: "22px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)", transition: "left 150ms" }}>
                    </span>
                  </span>{k.state}</span>
                <span onClick={k.remove} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "14px", fontWeight: "600", color: "#A3371A", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>Remove</span>
              </div>
            </div>
          </Fragment>))}
          <span onClick={v.arAdd} style={{ height: "46px", boxSizing: "border-box", borderRadius: "23px", border: "1px dashed #D9C7BA", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "15px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M12 5v14M5 12h14">
              </path>
            </svg>Add keyword reply</span>
        </section>
        {!!(v.tpOpen) && (<>
          <div onClick={v.tpClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.tpTitle}</h2>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpHours).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpMins).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "6px", maxHeight: "232px", overflowY: "auto", scrollbarWidth: "none" }}>
                  {(v.tpAps).map((o, o_i) => (<Fragment key={o_i}>
                    <span onClick={o.pick} style={{ flex: "none", height: "44px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.weight, background: o.bg, color: o.fg, cursor: "pointer", fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                  </Fragment>))}
                </div>
              </div>
              <span onClick={v.tpDone} style={{ height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Done · {v.tpPreview}</span>
            </div>
          </div>
        </>)}
      </>)}
    </main>
  </>);
}
