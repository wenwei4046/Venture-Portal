"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_desktop_v2/prototypes/CrmFrame v2.dc.html (CRM Desktop rev 1) by
// tools/crm-design/gen-desk.cjs — markup and styles exactly as designed. Behaviour lives in ./vm/app.ts. To change the
// look, change the design (or tools/crm-design/desk-patches.cjs) and regenerate; never edit this file.
import { Fragment } from "react";
import type React from "react";
import DH from "./desk-hover.module.css";
import DX from "./desk-extras.module.css";
import { ChatImg, ChatVideo, MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";
import { InfoValue } from "../shared/AdLink";
import { DeskBook, DeskCardPicker, DeskAlerts, DeskAnalysis, DeskContactSide, DeskCustomerForm, DeskEmoji, DeskFoldRail, DeskHistory, DeskNote, DeskPager, DeskPhoneForm, DeskPie, DeskRail } from "./DeskExtras";
import type { DeskVM } from "./vm/app";

/** The whole desktop CRM: the Revenue app's frame around it (sidebar, top bar), every page, pane, menu and the toast. */
export default function DeskApp({ v }: { v: DeskVM }) {
  return (<>
    <div style={{ width: `${v.W}px`, height: `${v.H}px`, position: "relative", overflow: "hidden", borderRadius: v.frameRadius, background: "#FFFFFF", fontFamily: "Inter, sans-serif", color: "#3F2B22", WebkitFontSmoothing: "antialiased", boxShadow: v.frameShadow }}>
      {!!(v.sbOpen) && (<>
        <aside style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "240px", boxSizing: "border-box", display: "flex", flexDirection: "column", background: "#FBF6F2", borderRight: "1px solid #EBDDD2", zIndex: "6" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "8px", padding: "24px 14px 18px 26px" }}>
            <span style={{ flex: "1", minWidth: "0" }}>
              <span style={{ display: "block", fontSize: "16px", fontWeight: "700", letterSpacing: ".14em", color: "#4E2F20", lineHeight: "1.2" }}>HOUZS VENTURE</span>
              <span style={{ display: "block", fontSize: "12.5px", fontWeight: "600", color: "#BD4A19", marginTop: "3px" }}>CRM</span>
            </span>
            <button type="button" onClick={v.toggleSb} title="Collapse sidebar" style={{ flex: "0 0 auto", width: "32px", height: "32px", border: "0", borderRadius: "8px", background: "transparent", color: "#A08E82", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h1}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M16 15l-3-3 3-3">
                </path>
              </svg>
            </button>
          </div>
          <div style={{ margin: "0 26px", height: "1px", background: "#EBDDD2" }}>
          </div>
          <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "14px 14px 10px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              {!!(v.showScope) && (<>
                <div style={{ display: "flex", margin: "2px 0 8px 0", background: "#F5EBE3", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                  {(v.scopeOpts).map((o, o_i) => (<Fragment key={o_i}>
                    {!!(o.on) && (<>
                      <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "26px", borderRadius: "7px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "12.5px", fontWeight: "650", boxShadow: "rgba(63,43,34,.14) 0 1px 3px", cursor: "pointer" }}>{o.label}</button>
                    </>)}
                    {!!(o.off) && (<>
                      <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "26px", borderRadius: "7px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "12.5px", fontWeight: "550", cursor: "pointer" }} className={DH.h2}>{o.label}</button>
                    </>)}
                  </Fragment>))}
                </div>
              </>)}
              {(v.crmGroups).map((g, g_i) => (<Fragment key={g_i}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: g.pt }}>
                  {!!(g.label) && (<>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", color: "#A08E82", whiteSpace: "nowrap" }}>{g.label}<span style={{ flex: "1", height: "1px", background: "#EBDDD2" }}>
                      </span></span>
                  </>)}
                  {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                    {!!(n.on) && (<>
                      <button type="button" onClick={n.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "42px", padding: "0 12px", border: "0", borderRadius: "10px", background: "#FFF1E6", color: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", cursor: "pointer", textAlign: "left" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={n.d}>
                          </path>
                        </svg>
                        <span style={{ flex: "1" }}>{n.label}</span>
                        {!!(n.count) && (<>
                          <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", lineHeight: "20px", textAlign: "center" }}>{n.count}</span>
                        </>)}
                      </button>
                    </>)}
                    {!!(n.off) && (<>
                      <button type="button" onClick={n.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "42px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", color: "#4E2F20", font: "inherit", fontSize: "15px", fontWeight: "550", cursor: "pointer", textAlign: "left" }} className={DH.h3}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={n.d}>
                          </path>
                        </svg>
                        <span style={{ flex: "1" }}>{n.label}</span>
                        {!!(n.count) && (<>
                          <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", lineHeight: "20px", textAlign: "center" }}>{n.count}</span>
                        </>)}
                      </button>
                    </>)}
                  </Fragment>))}
                </div>
              </Fragment>))}
            </div>
          </div>
          <div style={{ position: "relative", padding: "12px 14px 18px", borderTop: "1px solid #EBDDD2" }}>
            {!!(v.meMenuOpen) && (<>
              <div onClick={v.closeMeMenu} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
              </div>
              <div style={{ position: "absolute", left: "14px", right: "14px", bottom: "calc(100% - 4px)", zIndex: "8", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", boxShadow: "0 10px 30px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                <button type="button" onClick={v.signOutMe} style={{ display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "600", color: "#3F2B22", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h4}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9">
                    </path>
                  </svg>Sign out</button>
              </div>
            </>)}
            <button type="button" onClick={v.returnApp} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "40px", marginBottom: "10px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h5}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11">
                </path>
              </svg>Back to Revenue app</button>
            <button type="button" onClick={v.toggleMeMenu} title="Profile" style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px", borderRadius: "14px", border: `1px solid ${v.meBd}`, background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h6}>
              <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "#4E2F20", color: "#fff", fontSize: "12.5px", fontWeight: "650", display: "grid", placeItems: "center" }}>{v.me.ini}</span>
              <span style={{ flex: "1", minWidth: "0" }}>
                <span style={{ display: "block", fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.me.name}</span>
                <span style={{ display: "block", fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.me.sub}</span>
              </span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m7 15 5 5 5-5M7 9l5-5 5 5">
                </path>
              </svg>
            </button>
          </div>
        </aside>
      </>)}
      {!!(v.sbClosed) && (<>
        <aside style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "72px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", background: "#FBF6F2", borderRight: "1px solid #EBDDD2", zIndex: "6" }}>
          <div style={{ height: "60px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "700", letterSpacing: ".08em", color: "#4E2F20" }}>HV</div>
          <button type="button" onClick={v.toggleSb} title="Expand sidebar" style={{ width: "40px", height: "36px", border: "0", borderRadius: "8px", background: "transparent", color: "#A08E82", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h1}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M14 9l3 3-3 3">
              </path>
            </svg>
          </button>
          <div style={{ flex: "1", minHeight: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingTop: "6px" }}>
            {(v.sections).map((g, g_i) => (<Fragment key={g_i}>
              <span style={{ width: "32px", height: "1px", background: "#EBDDD2", margin: "8px 0" }}>
              </span>
              {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                {!!(n.on) && (<>
                  <button type="button" onClick={n.pick} title={n.label} style={{ position: "relative", width: "44px", height: "40px", border: "0", borderRadius: "10px", background: "#FFF1E6", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={n.d}>
                      </path>
                    </svg>
                    {!!(n.count) && (<>
                      <span style={{ position: "absolute", top: "4px", right: "4px", minWidth: "15px", height: "15px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "#BD4A19", color: "#fff", fontSize: "9.5px", fontWeight: "700", lineHeight: "15px" }}>{n.count}</span>
                    </>)}
                  </button>
                </>)}
                {!!(n.off) && (<>
                  <button type="button" onClick={n.pick} title={n.label} style={{ position: "relative", width: "44px", height: "40px", border: "0", borderRadius: "10px", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h7}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={n.d}>
                      </path>
                    </svg>
                    {!!(n.count) && (<>
                      <span style={{ position: "absolute", top: "4px", right: "4px", minWidth: "15px", height: "15px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "#BD4A19", color: "#fff", fontSize: "9.5px", fontWeight: "700", lineHeight: "15px" }}>{n.count}</span>
                    </>)}
                  </button>
                </>)}
              </Fragment>))}
            </Fragment>))}
          </div>
          <button type="button" onClick={v.returnApp} title="Back to Revenue app" style={{ marginBottom: "10px", width: "44px", height: "40px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h5}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11">
              </path>
            </svg>
          </button>
          <span title={v.me.name} style={{ marginBottom: "18px", width: "36px", height: "36px", borderRadius: "50%", background: "#4E2F20", color: "#fff", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{v.me.ini}</span>
        </aside>
      </>)}
      <header style={{ position: "absolute", left: `${v.sbW}px`, right: "0", top: "0", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "16px", padding: "0 28px", background: "#FBF6F2", borderBottom: "1px solid #EBDDD2" }}>
        <span style={{ flex: "1", minWidth: "0", fontSize: "15px" }}>{v.greetWord}, <span style={{ color: "#BD4A19", fontWeight: "650" }}>{v.me.first}</span>.</span>
        <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px 0 12px", borderRadius: "10px", border: "1px solid #E2CFC1", background: "#fff", color: "#4E2F20", fontSize: "14px", fontWeight: "650", boxSizing: "border-box", cursor: v.subCur }} onClick={v.openSubDept}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
          </span>{v.subLabel}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6">
            </path>
          </svg></span>
        <span style={{ fontFamily: "ui-monospace, Menlo, monospace", fontSize: "12.5px", color: "#806B60", letterSpacing: ".02em", whiteSpace: "nowrap" }}>{v.dateLine}</span>
      </header>
      <div style={{ position: "absolute", left: `${v.sbW}px`, top: "60px", right: "0", bottom: "0", display: "flex", flexDirection: "column", background: "#FFFFFF", fontSize: "14px" }}>
        <div style={{ flex: "0 0 56px", height: "56px", boxSizing: "border-box", display: "flex", alignItems: "stretch", gap: "0", padding: "0 20px 0 24px", background: "#FFFFFF", borderBottom: "1px solid #EBDDD2" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingRight: "16px" }}>
            <span style={{ display: "flex", alignItems: "baseline", gap: "10px", whiteSpace: "nowrap" }}>
              <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em", color: "#3F2B22" }}>{v.pageTitle}</strong>
              {!!(v.pageBadge) && (<>
                <span style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19" }}>{v.pageBadge} new</span>
              </>)}
            </span>
          </div>
          <div style={{ flex: "1" }}>
          </div>
          <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "12px", whiteSpace: "nowrap" }}>
            {!!(v.showPeriodCompact) && (<>
              <span onClick={v.cyclePeriod} style={{ cursor: "pointer",  display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 10px 0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", background: "#fff", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap" }}>{v.periodNow}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg></span>
            </>)}
            {!!(v.showPeriod) && (<>
              <div style={{ display: "inline-flex", background: "#F5EBE3", borderRadius: "11px", padding: "3px", gap: "2px" }}>
                {(v.periodOpts).map((o, o_i) => (<Fragment key={o_i}>
                  {!!(o.on) && (<>
                    <span style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", background: "#fff", color: "#3F2B22", fontSize: "13px", fontWeight: "650", boxShadow: "rgba(63,43,34,.14) 0 1px 3px", whiteSpace: "nowrap" }}>{o.label}</span>
                  </>)}
                  {!!(o.off) && (<>
                    <span onClick={o.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", color: "#806B60", fontSize: "13px", fontWeight: "550", whiteSpace: "nowrap", cursor: "pointer" }}>{o.label}</span>
                  </>)}
                </Fragment>))}
              </div>
              <span style={{ width: "1px", height: "24px", background: "#EBDDD2" }}>
              </span>
            </>)}
            <button type="button" onClick={v.openAlerts} title="CRM alerts: moves, shares, won, lost, overdue 9 h+" style={{ flex: "0 0 auto", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 8px 0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13px", fontWeight: "650", cursor: "pointer" }} className={DH.h8}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                </path>
                <path d="M12 8v4M12 15.5h.01">
                </path>
              </svg>
              {!!(v.alertsLabel) && (<>
                <span>CRM alerts</span>
              </>)}
              {!!(v.alertsHas) && (<span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", display: "inline-grid", placeItems: "center" }}>{v.alertsN}</span>)}
            </button>
          </div>
        </div>
        <div style={{ flex: "1", minHeight: "0", position: "relative", display: "flex" }}>
          {!!(v.sheetMode) && (<>
            <div style={{ flex: "1", minWidth: `${v.listMin}px`, overflow: "auto", background: "#fff", padding: v.pagePad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {!!(v.showKicker) && (<>
                  <button type="button" onClick={v.openSheet} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", padding: "0", border: "0", background: "transparent", font: "inherit", fontSize: "12px", fontWeight: "700", letterSpacing: ".12em", color: "#806B60", cursor: "pointer" }} className={DH.h9}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>{v.opKicker}</button>
                </>)}
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap" }}>
                  <h1 style={{ margin: "0", fontSize: v.h1Size, fontWeight: "700", letterSpacing: "-.02em", color: "#3F2B22" }}>{v.opTitle}</h1>
                  {!!(v.isSrOp) && (<>
                    <span style={{ flex: "1" }}>
                    </span>
                    <button type="button" style={{ flex: "0 0 auto", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px", height: "38px", padding: "0 18px", borderRadius: "19px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>Add showroom</button>
                  </>)}
                  {!!(v.showOpChip) && (<>
                    <button type="button" onClick={v.openSheet} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 12px 0 14px", border: "0", borderRadius: "17px", background: "#FFF0E4", color: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", cursor: "pointer" }} className={DH.h10}>{v.opChip}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                  </>)}
                  {!!(v.isAdsOp) && (<>
                    <span style={{ position: "relative" }}>
                      <button type="button" onClick={v.toggleSt} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 12px 0 14px", border: "0", borderRadius: "17px", background: v.stCur.tint, color: v.stCur.ink, font: "inherit", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: v.stCur.color }}>
                        </span><span>{v.stCur.label}</span> · <span>{v.stCur.n}</span><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></button>
                      {!!(v.stOpen) && (<>
                        <div onClick={v.toggleSt} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                        </div>
                        <div style={{ position: "absolute", top: "42px", left: "0", zIndex: "8", width: "300px", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                          {(v.stOpts).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", padding: "6px 10px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                              <span style={{ flex: "0 0 10px", width: "10px", height: "10px", borderRadius: "50%", background: o.color }}>
                              </span>
                              <span style={{ flex: "1", display: "flex", flexDirection: "column" }}>
                                <span>{o.label}</span>
                                {!!(o.hint) && (<>
                                  <span style={{ fontSize: "11.5px", fontWeight: "500", color: "#806B60", whiteSpace: "nowrap" }}>{o.hint}</span>
                                </>)}
                              </span>
                              <span style={{ minWidth: "22px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", background: o.tint, color: o.ink, fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{o.n}</span>
                            </button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </span>
                  </>)}
                </div>
                <span style={{ fontSize: "15px", color: "#806B60" }}>{v.opSub}</span>
              </div>
              {!!(v.adList) && (<>
                {!!(v.adOverview) && (<>
                  {!!(v.hasAttn) && (<>
                    <div style={{ display: "flex", flexDirection: "column", padding: "4px 16px", border: "1px solid #F3DCC4", borderRadius: "14px", background: "#FFF8F1" }}>
                      {(v.attn).map((x, x_i) => (<Fragment key={x_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: x.bt }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A46312" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 16px" }}>
                            <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01">
                            </path>
                          </svg>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <span style={{ fontSize: "13px", fontWeight: "650", lineHeight: "1.35", textWrap: "pretty" }}>{x.title}</span>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{x.sub}</span>
                          </span>
                          <button type="button" onClick={x.go} style={{ flex: "0 0 auto", height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h11}>{x.btn}</button>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#FBF6F2" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                      <span style={{ flex: "1", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>WHO GOT THE LEADS · THIS MONTH</span>
                      <span style={{ fontSize: "12px", color: "#806B60" }}><b style={{ fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{v.adLeadsTotal}</b> leads</span>
                    </div>
                    <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "#EFE4DA" }}>
                      {(v.adByTeam2).map((t, t_i) => (<Fragment key={t_i}>
                        <span style={{ flex: `${t.leads} 0 0`, background: t.color }}>
                        </span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: "10px" }}>
                      {(v.adByTeam2).map((t, t_i) => (<Fragment key={t_i}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.color }}>
                            </span>{t.name}</span>
                          <span style={{ fontSize: "17px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{t.leads} <span style={{ fontSize: "12px", fontWeight: "500", color: "#806B60" }}>leads</span></span>
                          <span style={{ fontSize: "11.5px", color: "#806B60" }}>{t.share} of all</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  <span style={{ paddingTop: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>ADS · HOW EACH ONE IS SPLIT</span>
                </>)}
                <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.adCards).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 14px", border: "0", borderTop: "1px solid #F1E7DF", marginTop: "-1px", background: c.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                      <span style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                        <strong style={{ flex: "1", minWidth: "0", fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                        <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}><b style={{ fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{c.metricV}</b> {c.metricL}</span>
                      </span>
                      <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 6px", fontSize: "12px", color: "#806B60" }}><span style={{ color: c.chFg, fontWeight: "600" }}>{c.channel}</span><span>·</span><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.stColor }}>
                        </span>{c.status}</span>
                      <span style={{ display: "flex", gap: "2px", height: "6px", borderRadius: "3px", overflow: "hidden", background: "#F1E7DF" }}>
                        {(c.segs2).map((g, g_i) => (<Fragment key={g_i}>
                          <span style={{ flex: `${g.pct} 0 0`, background: g.color, opacity: g.op }}>
                          </span>
                        </Fragment>))}
                      </span>
                      {!!(v.adOverview) && (<>
                        <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 12px", fontSize: "11.5px", color: "#806B60" }}>
                          {(c.segs2).map((g, g_i) => (<Fragment key={g_i}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", whiteSpace: "nowrap" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: g.color }}>
                              </span>{g.label} <b style={{ fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{g.pctS}</b></span>
                          </Fragment>))}
                          <span style={{ color: c.noteC, fontWeight: "600" }}>{c.splitNote}</span>
                        </span>
                      </>)}
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.adGrid) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
                  {(v.adCards).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: `1px solid ${c.bd}`, borderRadius: "18px", background: "#fff", boxShadow: c.ring, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h13}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 10px", borderRadius: "13px", background: c.chBg, color: c.chFg, fontSize: "12.5px", fontWeight: "650" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                            </path>
                          </svg>{c.channel}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "26px", padding: "0 10px", borderRadius: "13px", background: c.stTint, fontSize: "12.5px", fontWeight: "650", color: c.stColor }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: c.stColor }}>
                          </span>{c.status}</span>
                        <span style={{ flex: "1" }}>
                        </span>
                        <span style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                          <b style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{c.leads}</b>
                          <span style={{ fontSize: "13px", color: "#806B60" }}>leads</span>
                        </span>
                      </div>
                      <strong style={{ fontSize: "17px", fontWeight: "650", lineHeight: "1.3" }}>{c.name}</strong>
                      {!!(c.noTag) && (<>
                        <span style={{ height: "22px", marginTop: "-6px" }}>
                        </span>
                      </>)}
                      {!!(c.tag) && (<>
                        <span style={{ alignSelf: "flex-start", marginTop: "-6px", height: "22px", lineHeight: "22px", padding: "0 9px", borderRadius: "11px", background: c.tagBg, color: c.tagFg, fontSize: "11.5px", fontWeight: "700" }}>{c.tag}</span>
                      </>)}
                      <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "#F1E7DF" }}>
                        {(c.segs).map((g, g_i) => (<Fragment key={g_i}>
                          <span style={{ flex: `${g.pct} 0 0`, background: g.color }}>
                          </span>
                        </Fragment>))}
                      </div>
                      {!!(c.set) && (<>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(c.segs).map((g, g_i) => (<Fragment key={g_i}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}><span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                                </span>{g.label}</span>
                              {!!(g.detail) && (<>
                                <span style={{ paddingLeft: "16px", fontSize: "12.5px", lineHeight: "1.45", color: "#806B60", textWrap: "pretty" }}>{g.detail}</span>
                              </>)}
                            </span>
                          </Fragment>))}
                        </div>
                      </>)}
                      {!!(c.unset) && (<>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "#A46312" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01">
                            </path>
                          </svg>Not assigned yet · dealt evenly across teams</span>
                      </>)}
                      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "8px", paddingTop: "12px", borderTop: "1px solid #F1E7DF" }}>
                        <span style={{ flex: "1", fontSize: "13px", color: "#806B60" }}>{c.mode}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19" }}>{c.cta}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg></span>
                      </div>
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.isFtOp) && (<>
                <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.ftCards).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", border: "0", borderTop: "1px solid #F1E7DF", marginTop: "-1px", background: c.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.color }}>
                        </span>
                        <strong style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "650" }}>{c.name}</strong>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12px", fontWeight: "650", color: c.stFg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.stFg }}>
                          </span>{c.state}</span>
                      </span>
                      <span style={{ display: "flex", flexDirection: "column" }}>
                        {(c.people).map((p, p_i) => (<Fragment key={p_i}>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", padding: "5px 0" }}>
                            <span style={{ flex: "1", minWidth: "0", fontSize: "13px", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                            <span style={{ display: "flex", gap: "3px" }}>
                              {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: d.bg, color: d.fg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{d.l}</span>
                              </Fragment>))}
                            </span>
                          </span>
                        </Fragment>))}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: "1", fontSize: "12px", color: "#806B60" }}>{c.mode}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}>{c.cta}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg></span>
                      </span>
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.isSrOp) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "16px", alignItems: "stretch" }}>
                  {(v.srCards).map((r, r_i) => (<Fragment key={r_i}>
                    <div style={{ gridRow: "span 7", display: "grid", gridTemplateRows: "subgrid", rowGap: "0", background: "#fff", border: `1px solid ${r.bd}`, boxShadow: r.ring, borderRadius: "20px", padding: "18px 20px", overflow: "hidden" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingBottom: "14px" }}>
                        {!!(r.photo) && (<>
                          <img src={r.photo} alt="" style={{ width: "calc(100% + 40px)", margin: "-18px -20px 0", height: "150px", objectFit: "cover", display: "block" }} />
                        </>)}
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "12px", background: "#FFF3D6", color: "#A46312", display: "grid", placeItems: "center" }}>
                            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 10.5 12 4l9 6.5V20H3zM9.5 20v-5h5v5">
                              </path>
                            </svg>
                          </span>
                          <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "700", lineHeight: "1.25" }}>{r.dispName}</strong>
                          <button type="button" onClick={r.edit} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }} className={DH.h8}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                              </path>
                            </svg>Edit</button>
                          <button type="button" title="Delete showroom" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#A3371A", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h14}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                              </path>
                            </svg>
                          </button>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "22px 104px minmax(0, 1fr)", gap: "8px", alignItems: "start", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px" }}>
                          <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z">
                          </path>
                        </svg>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Address</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <b style={{ fontSize: "14px", fontWeight: "650", color: r.addrFg, lineHeight: "1.4" }}>{r.addr}</b>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "22px 104px minmax(0, 1fr)", gap: "8px", alignItems: "start", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px" }}>
                          <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                          </path>
                        </svg>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Open days</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <b style={{ fontSize: "14px", fontWeight: "650", color: r.daysTxtFg, lineHeight: "1.4" }}>{r.daysTxt}</b>
                          <span style={{ fontSize: "12.5px", color: "#806B60", lineHeight: "1.4" }}>{r.daysSub}</span>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "22px 104px minmax(0, 1fr)", gap: "8px", alignItems: "start", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px" }}>
                          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2">
                          </path>
                        </svg>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Visit times</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <b style={{ fontSize: "14px", fontWeight: "650", color: r.timesTxtFg, lineHeight: "1.4" }}>{r.timesTxt}</b>
                          <span style={{ fontSize: "12.5px", color: "#806B60", lineHeight: "1.4" }}>{r.timesSub}</span>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "22px 104px minmax(0, 1fr)", gap: "8px", alignItems: "start", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px" }}>
                          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z">
                          </path>
                        </svg>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Booking limit</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <b style={{ fontSize: "14px", fontWeight: "650", color: r.limitTxtFg, lineHeight: "1.4" }}>{r.limitTxt}</b>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "22px 104px minmax(0, 1fr)", gap: "8px", alignItems: "start", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: "2px" }}>
                          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8">
                          </path>
                        </svg>
                        <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Blocked</span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <b style={{ fontSize: "14px", fontWeight: "650", color: r.blockedFg, lineHeight: "1.4" }}>{r.blocked}</b>
                          <span style={{ fontSize: "12.5px", color: "#806B60", lineHeight: "1.4" }}>{r.blockedSub}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", alignSelf: "end", paddingTop: "14px" }}>
                        <a href={r.wUrl} target="_blank" rel="noopener" style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", height: "36px", borderRadius: "18px", border: "1px solid #EBDDD2", background: "#fff", fontSize: "13px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", whiteSpace: "nowrap" }} className={DH.h12}><span style={{ width: "18px", height: "18px", borderRadius: "5px", background: "#33CCFF", color: "#fff", fontSize: "10px", fontWeight: "800", display: "grid", placeItems: "center" }}>W</span>Waze</a>
                        <a href={r.gUrl} target="_blank" rel="noopener" style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", height: "36px", borderRadius: "18px", border: "1px solid #EBDDD2", background: "#fff", fontSize: "13px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", whiteSpace: "nowrap" }} className={DH.h12}><span style={{ width: "18px", height: "18px", borderRadius: "5px", background: "#34A853", color: "#fff", fontSize: "10px", fontWeight: "800", display: "grid", placeItems: "center" }}>G</span>Google Maps</a>
                      </div>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.cfOn) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1180px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <span style={{ flex: "1", minWidth: "260px", display: "flex", flexDirection: "column", gap: "3px" }}>
                      <span style={{ fontSize: "13.5px", color: "#806B60", textWrap: "pretty" }}>What salespeople fill in for each customer. It shows in Customer info and feeds the Contacts page.</span>
                      <b style={{ fontSize: "12.5px", color: "#3F2B22", fontWeight: "650" }}>{v.cfSummary}</b>
                    </span>
                    {!!(v.cfDirty) && (<>
                      <button type="button" onClick={v.cfReset} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Discard</button>
                    </>)}
                    <button type="button" onClick={v.cfSave} disabled={v.cfClean} style={{ height: "36px", padding: "0 20px", borderRadius: "18px", border: "0", background: v.cfSaveBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}>Save form</button>
                  </div>
                  {!!(v.cfFields) && (<>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", alignItems: "flex-start" }}>
                      <div style={{ flex: "1 1 640px", display: "flex", flexDirection: "column", gap: "16px", minWidth: "0" }}>
                        {(v.cfSecs).map((sec, sec_i) => (<Fragment key={sec_i}>
                          <section id={sec.anchor} style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                            <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 20px 12px" }}>
                              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{sec.title}</strong>
                                <span style={{ fontSize: "12.5px", color: "#806B60" }}>{sec.desc}</span>
                              </span>
                              <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{sec.count} fields</span>
                            </div>
                            {!!(sec.hasAuto) && (<>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", margin: "0 20px 12px", padding: "10px 12px", borderRadius: "10px", background: "#FBF6F2" }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A08E82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z">
                                  </path>
                                </svg>
                                <span style={{ fontSize: "12.5px", color: "#806B60", paddingRight: "2px" }}>Filled by the system</span>
                                {(sec.autoList).map((x, x_i) => (<Fragment key={x_i}>
                                  <span style={{ height: "24px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "12px", background: "#fff", border: "1px solid #EBDDD2", fontSize: "12.5px", fontWeight: "600", color: "#3F2B22" }}>{x.label}</span>
                                </Fragment>))}
                              </div>
                            </>)}
                            {!!(sec.hasEdit) && (<>
                              <div style={{ display: "grid", gridTemplateColumns: "48px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", padding: "8px 20px", borderTop: "1px solid #F1E7DF", borderBottom: "1px solid #F1E7DF", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#A08E82" }}>
                                <span>
                                </span>
                                <span>FIELD</span>
                                <span>ANSWER TYPE</span>
                                <span>CHOICES</span>
                                <span>REQUIRED</span>
                                <span>
                                </span>
                              </div>
                              {(sec.fields).map((f, f_i) => (<Fragment key={f_i}>
                                <div style={{ display: "grid", gridTemplateColumns: "48px minmax(120px, 1fr) 140px minmax(120px, 1.3fr) 108px 28px", gap: "12px", alignItems: "center", padding: "8px 20px", borderTop: f.bt }}>
                                  <span style={{ display: "flex", gap: "2px" }}>
                                    <button type="button" onClick={f.up} title="Move up" style={{ width: "24px", height: "28px", padding: "0", border: "0", background: "transparent", color: f.upFg, cursor: "pointer" }}>
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 19V5M6 11l6-6 6 6">
                                        </path>
                                      </svg>
                                    </button>
                                    <button type="button" onClick={f.down} title="Move down" style={{ width: "24px", height: "28px", padding: "0", border: "0", background: "transparent", color: f.dnFg, cursor: "pointer" }}>
                                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 5v14M6 13l6 6 6-6">
                                        </path>
                                      </svg>
                                    </button>
                                  </span>
                                  {!!(f.editable) && (<>
                                    <input type="text" value={f.label} onChange={f.setLabel} style={{ height: "36px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", minWidth: "0", width: "100%" }} />
                                  </>)}
                                  {!!(f.editable) && (<>
                                    <span style={{ position: "relative" }}>
                                      <button type="button" onClick={f.typeToggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 10px 0 12px", boxSizing: "border-box", border: `1px solid ${f.typeBd}`, borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", cursor: "pointer", textAlign: "left" }}>
                                        <span style={{ flex: "1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.type}</span>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="m6 9 6 6 6-6">
                                          </path>
                                        </svg>
                                      </button>
                                      {!!(f.typeOpen) && (<>
                                        <div onClick={f.typeClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                                        </div>
                                        <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "200px", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                                          {(f.types).map((o, o_i) => (<Fragment key={o_i}>
                                            <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", height: "34px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", fontWeight: o.w, color: o.fg, textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                                              <span style={{ flex: "1" }}>{o.t}</span>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={o.chk} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m5 12 5 5 9-10">
                                                </path>
                                              </svg>
                                            </button>
                                          </Fragment>))}
                                        </div>
                                      </>)}
                                    </span>
                                  </>)}
                                  {!!(f.hasOpts) && (<>
                                    <input type="text" value={f.opts} onChange={f.setOpts} placeholder="Separate with commas" style={{ height: "36px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", minWidth: "0", width: "100%" }} />
                                  </>)}
                                  {!!(f.noOpts) && (<>
                                    <span style={{ fontSize: "13px", color: "#A08E82", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.optsRo}</span>
                                  </>)}
                                  <button type="button" onClick={f.toggleReq} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0", border: "0", background: "transparent", font: "inherit", fontSize: "13px", color: f.reqFg, cursor: f.reqCur, whiteSpace: "nowrap" }}>{!!(f.editable) && (<>
                                      <span style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", borderRadius: "11px", background: f.trk }}>
                                        <span style={{ position: "absolute", top: "2px", left: f.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                        </span>
                                      </span>
                                    </>)}{f.reqLabel}</button>
                                  <span style={{ display: "flex", justifyContent: "center" }}>
                                    {!!(f.removable) && (<>
                                      <button type="button" onClick={f.remove} title="Remove field" style={{ width: "28px", height: "28px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#A08E82", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h15}>
                                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                          <path d="M18 6 6 18M6 6l12 12">
                                          </path>
                                        </svg>
                                      </button>
                                    </>)}
                                    {!!(f.core) && (<>
                                      <span title="Every customer needs this" style={{ fontSize: "11.5px", color: "#A08E82" }}>Core</span>
                                    </>)}
                                  </span>
                                </div>
                              </Fragment>))}
                            </>)}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px 16px", borderTop: "1px solid #F1E7DF" }}>
                              <input type="text" value={sec.draft} onChange={sec.setDraft} placeholder="New field, e.g. Move-in date" style={{ height: "36px", boxSizing: "border-box", padding: "0 12px", border: "1px dashed #D9C9BD", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", flex: "0 1 280px", minWidth: "0" }} />
                              <button type="button" onClick={sec.add} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", borderRadius: "10px", border: "0", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 5v14M5 12h14">
                                  </path>
                                </svg>Add field</button>
                            </div>
                          </section>
                        </Fragment>))}
                      </div>
                      <aside style={{ flex: "0 1 400px", position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "12px", minWidth: "300px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>Preview</strong>
                          <div style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                            {(v.cfDevs).map((o, o_i) => (<Fragment key={o_i}>
                              {!!(o.on) && (<>
                                <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 14px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "12.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer" }}>{o.label}</button>
                              </>)}
                              {!!(o.off) && (<>
                                <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 14px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "12.5px", fontWeight: "550", cursor: "pointer" }} className={DH.h2}>{o.label}</button>
                              </>)}
                            </Fragment>))}
                          </div>
                        </div>
                        {!!(v.cfDesk) && (<>
                          <div style={{ alignSelf: "center", width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff", boxShadow: "0 10px 30px rgba(40,25,18,.08)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", borderBottom: "1px solid #EBDDD2" }}>
                              <strong style={{ flex: "1", fontSize: "17px", fontWeight: "650" }}>Edit customer info</strong>
                              <span style={{ fontSize: "12.5px", color: "#806B60" }}>What a salesperson sees</span>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", padding: "4px 20px 20px" }}>
                              {(v.cfSecs).map((sec, sec_i) => (<Fragment key={sec_i}>
                                <span style={{ padding: "18px 0 10px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{sec.label}</span>
                                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: "12px", paddingBottom: "6px", borderBottom: "1px solid #F1E7DF" }}>
                                  {(sec.pvFields).map((f, f_i) => (<Fragment key={f_i}>
                                    <label style={{ gridColumn: f.span, display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                                      <span style={{ fontSize: "12.5px", color: "#806B60" }}>{f.label}{!!(f.star) && (<>
                                          <span style={{ color: "#B3261E" }}> *</span>
                                        </>)}</span>
                                      {!!(f.isAuto) && (<>
                                        <span style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", borderRadius: "10px", background: "#FBF6F2", fontSize: "13px", color: "#A08E82" }}>Filled automatically</span>
                                      </>)}
                                      {!!(f.isText) && (<>
                                        <span style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", fontSize: "13px", color: "#A08E82" }}>{f.ph}</span>
                                      </>)}
                                      {!!(f.isLong) && (<>
                                        <span style={{ height: "76px", display: "block", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px" }}>
                                        </span>
                                      </>)}
                                      {!!(f.isChoice) && (<>
                                        <span title={f.choices} style={{ height: "38px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", fontSize: "13px", color: "#3F2B22" }}>
                                          <span style={{ flex: "1" }}>Choose…</span>
                                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="m6 9 6 6 6-6">
                                            </path>
                                          </svg>
                                        </span>
                                      </>)}
                                      {!!(f.isRange) && (<>
                                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#806B60" }}><span style={{ flex: "1", height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", color: "#A08E82" }}>From</span>to<span style={{ flex: "1", height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", color: "#A08E82" }}>To</span></span>
                                      </>)}
                                    </label>
                                  </Fragment>))}
                                </div>
                              </Fragment>))}
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "14px 20px", borderTop: "1px solid #EBDDD2" }}>
                              <span style={{ height: "40px", padding: "0 20px", display: "grid", placeItems: "center", borderRadius: "20px", border: "1px solid #E2CFC1", fontSize: "14px", fontWeight: "650" }}>Cancel</span>
                              <span style={{ height: "40px", padding: "0 28px", display: "grid", placeItems: "center", borderRadius: "20px", background: "#BD4A19", color: "#fff", fontSize: "14px", fontWeight: "650" }}>Save</span>
                            </div>
                          </div>
                        </>)}
                        {!!(v.cfPhone) && (<>
                          <div style={{ alignSelf: "center", width: `${v.cfPhoneW}px`, height: `${v.cfPhoneH}px`, boxSizing: "border-box", padding: "10px", borderRadius: "42px", background: "#2A1F1A", boxShadow: "0 20px 50px rgba(40,25,18,.25)" }}>
                            <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: "38px", overflow: "hidden", background: "rgba(40,25,18,.45)", display: "flex", flexDirection: "column" }}>
                              <div style={{ flex: "0 0 44px", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 26px", color: "#fff", fontSize: "14px", fontWeight: "650" }}>
                                <span>9:41</span>
                                <span style={{ width: "90px", height: "26px", borderRadius: "13px", background: "#000" }}>
                                </span>
                                <span style={{ fontSize: "12px" }}>5G</span>
                              </div>
                              {!(v.cfRealOn) && (<><div style={{ flex: "1", minHeight: "0", marginTop: "16px", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "22px 22px 0 0" }}>
                                <span style={{ alignSelf: "center", width: "40px", height: "5px", margin: "8px 0 4px", borderRadius: "3px", background: "#E2D6CC" }}>
                                </span>
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 18px 12px", borderBottom: "1px solid #EBDDD2" }}>
                                  <strong style={{ flex: "1", fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Edit customer info</strong>
                                  <span style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22" }}>
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="M18 6 6 18M6 6l12 12">
                                      </path>
                                    </svg>
                                  </span>
                                </div>
                                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "0 18px 16px", display: "flex", flexDirection: "column" }}>
                                  {(v.cfSecs).map((sec, sec_i) => (<Fragment key={sec_i}>
                                    <span style={{ padding: "16px 0 8px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{sec.label}</span>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "6px" }}>
                                      {(sec.pvFields).map((f, f_i) => (<Fragment key={f_i}>
                                        <label style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                                          <span style={{ fontSize: "12.5px", color: "#806B60" }}>{f.label}{!!(f.star) && (<>
                                              <span style={{ color: "#B3261E" }}> *</span>
                                            </>)}</span>
                                          {!!(f.isAuto) && (<>
                                            <span style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", borderRadius: "10px", background: "#FBF6F2", fontSize: "13px", color: "#A08E82" }}>Filled automatically</span>
                                          </>)}
                                          {!!(f.isText) && (<>
                                            <span style={{ height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", fontSize: "13px", color: "#A08E82" }}>{f.ph}</span>
                                          </>)}
                                          {!!(f.isLong) && (<>
                                            <span style={{ height: "76px", display: "block", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px" }}>
                                            </span>
                                          </>)}
                                          {!!(f.isChoice) && (<>
                                            <span title={f.choices} style={{ height: "38px", display: "flex", alignItems: "center", gap: "6px", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", fontSize: "13px", color: "#3F2B22" }}>
                                              <span style={{ flex: "1" }}>Choose…</span>
                                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="m6 9 6 6 6-6">
                                                </path>
                                              </svg>
                                            </span>
                                          </>)}
                                          {!!(f.isRange) && (<>
                                            <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#806B60" }}><span style={{ flex: "1", height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", color: "#A08E82" }}>From</span>to<span style={{ flex: "1", height: "38px", display: "flex", alignItems: "center", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "10px", color: "#A08E82" }}>To</span></span>
                                          </>)}
                                        </label>
                                      </Fragment>))}
                                    </div>
                                  </Fragment>))}
                                </div>
                                <div style={{ display: "flex", gap: "10px", padding: "12px 18px 26px", borderTop: "1px solid #EBDDD2" }}>
                                  <span style={{ flex: "0 0 auto", height: "46px", padding: "0 20px", display: "grid", placeItems: "center", borderRadius: "23px", border: "1px solid #E2CFC1", fontSize: "15px", fontWeight: "650" }}>Cancel</span>
                                  <span style={{ flex: "1", height: "46px", display: "grid", placeItems: "center", borderRadius: "23px", background: "#BD4A19", color: "#fff", fontSize: "15px", fontWeight: "650" }}>Save</span>
                                </div>
                              </div></>)}{!!(v.cfRealOn) && (<DeskPhoneForm v={v.cfReal} scale={v.cfRealScale} />)}
                            </div>
                          </div>
                        </>)}
                      </aside>
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.isFrmOp) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px" }}>
                  {(v.frmCards).map((fc, fc_i) => (<Fragment key={fc_i}>
                    <button type="button" onClick={fc.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", borderRadius: "18px", border: "1px solid #EBDDD2", background: "#fff", font: "inherit", textAlign: "left", color: "#3F2B22", cursor: "pointer", boxShadow: "0 1px 2px rgba(63,43,34,.04)" }} className={DH.h16}>
                      <span style={{ flex: "0 0 44px", height: "44px", borderRadius: "12px", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
                        {!!(fc.isBase) && (<>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z">
                            </path>
                          </svg>
                        </>)}
                        {!!(fc.notBase) && (<>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6">
                            </path>
                          </svg>
                        </>)}
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "16px", fontWeight: "700" }}>{fc.name}</strong>
                        <span style={{ fontSize: "13px", color: "#806B60" }}>{fc.sum}</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </button>
                  </Fragment>))}
                  <button type="button" onClick={v.frmNew} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "82px", padding: "18px 20px", borderRadius: "18px", border: "1.5px dashed #D9C6B8", background: "transparent", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h17}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>New form</button>
                </div>
              </>)}
              {!!(v.isCpOp) && (<>
                <span style={{ fontSize: "14px", color: "#806B60", marginTop: "-10px", maxWidth: "760px" }}>Each chat's steps with time, person and status. Only you and team leaders see this page.</span>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
                    {(v.cpTimes).map((o, o_i) => (<Fragment key={o_i}>
                      <button type="button" onClick={o.pick} style={{ height: "32px", padding: "0 14px", border: "0", borderRadius: "9px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "13.5px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                    </Fragment>))}
                  </div>
                  {!!(v.cpCustom) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="date" value={v.cpFromV} onChange={v.setCpFrom} style={{ height: "34px", boxSizing: "border-box", padding: "0 10px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                      <span style={{ fontSize: "13px", color: "#806B60" }}>to</span>
                      <input type="date" value={v.cpToV} onChange={v.setCpTo} style={{ height: "34px", boxSizing: "border-box", padding: "0 10px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                    </div>
                  </>)}
                  <span style={{ fontSize: "13.5px", fontWeight: "600", color: "#806B60" }}>{v.cpRange}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginLeft: "auto", minWidth: "0", flex: v.cpCtlFlex }}>
                    <button type="button" onClick={v.cpMineToggle} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: `1px solid ${v.cpMineBd}`, background: v.cpMineBg, color: v.cpMineFg, font: "inherit", fontSize: "13.5px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 11l2 2 4-4">
                        </path>
                      </svg>My actions<span style={{ color: v.cpMineNfg, fontWeight: "500" }}>{v.cpMineN}</span></button>
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={v.cpPToggle} style={{ height: "36px", padding: "0 12px 0 14px", borderRadius: "18px", border: `1px solid ${v.cpPBd}`, background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "600", color: "#3F2B22", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={v.cpPDot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z">
                          </path>
                        </svg>{v.cpPLabel}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></button>
                      {!!(v.cpPOpen) && (<>
                        <div style={{ position: "absolute", top: "42px", right: "0", zIndex: "20", width: "260px", maxHeight: "440px", overflow: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", boxShadow: "0 10px 30px rgba(63,43,34,.14)", display: "flex", flexDirection: "column" }}>
                          <span style={{ padding: "8px 10px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>SHOW CHATS OF</span>
                          <button type="button" onClick={v.cpAll.pick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", height: "38px", padding: "0 10px", border: "0", borderRadius: "9px", background: v.cpAll.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: v.cpAll.fg, textAlign: "left", cursor: "pointer" }}>
                            <span>Everyone</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "500", color: "#806B60" }}>{v.cpAll.n}</span>
                          </button>
                          {(v.cpTeams).map((t, t_i) => (<Fragment key={t_i}>
                            <div style={{ display: "flex", flexDirection: "column", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid #F1E7DF" }}>
                              <button type="button" onClick={t.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px", border: "0", borderRadius: "9px", background: t.bg, font: "inherit", textAlign: "left", cursor: "pointer", "--h18-0": t.tint } as React.CSSProperties} className={DH.h18}>
                                <span style={{ flex: "0 0 10px", height: "10px", borderRadius: "3px", background: t.fg }}>
                                </span>
                                <strong style={{ flex: "1", fontSize: "13.5px", fontWeight: "700", color: t.fg }}>{t.label}</strong>
                                <span style={{ fontSize: "12.5px", color: "#806B60" }}>{t.n}</span>
                              </button>
                              {(t.members).map((p, p_i) => (<Fragment key={p_i}>
                                <button type="button" onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px 0 14px", border: "0", borderRadius: "9px", background: p.bg, font: "inherit", textAlign: "left", color: "#3F2B22", cursor: "pointer" }} className={DH.h4}>
                                  <span style={{ flex: "0 0 22px", height: "22px", borderRadius: "50%", background: p.tint, color: p.fg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{p.ini}</span>
                                  <span style={{ flex: "1", fontSize: "14px", fontWeight: p.w }}>{p.label}</span>
                                  <span style={{ fontSize: "12.5px", color: "#806B60" }}>{p.n}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </Fragment>))}
                        </div>
                      </>)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", color: "#806B60" }}>Sort by</span>
                      <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
                        {(v.cpSorts).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ height: "30px", padding: "0 12px", border: "0", borderRadius: "9px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                        </Fragment>))}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", flexWrap: "wrap", gap: "6px", minWidth: "0" }}>
                  {(v.cpChips).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.pick} style={{ flex: "0 0 auto", height: "34px", padding: `0 ${v.cpChipPad}`, borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, font: "inherit", fontSize: "13.5px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}>{c.label}<span style={{ color: c.nfg, fontWeight: "500" }}>{c.n}</span></button>
                  </Fragment>))}
                </div>
                <div style={{ border: "1px solid #EBDDD2", borderRadius: "18px", background: "#fff", overflowX: "auto" }}>
                  <div style={{ minWidth: v.cpMinW, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "grid", gridTemplateColumns: v.cpG, gap: "16px", padding: "12px 20px", borderBottom: "1px solid #EBDDD2", fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>
                      <span>CUSTOMER</span>
                      <span style={{ textAlign: "center" }}>PROGRESS</span>
                      {!!(v.cpWide) && (<>
                        <span>STATUS</span>
                      </>)}
                      {!!(v.cpWide) && (<>
                        <span>LAST UPDATE</span>
                      </>)}
                    </div>
                    {!!(v.cpEmpty) && (<>
                      <span style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "#806B60" }}>No chats in this time and filter</span>
                    </>)}
                    {(v.cpRows).map((r, r_i) => (<Fragment key={r_i}>
                      <button type="button" onClick={r.open} style={{ display: "grid", gridTemplateColumns: v.cpG, gap: "16px", alignItems: "center", padding: "14px 20px", border: "0", borderBottom: "1px solid #F1E7DF", background: r.bg, font: "inherit", textAlign: "left", color: "#3F2B22", cursor: "pointer" }} className={DH.h19}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{r.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "#806B60", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ad}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 20px", height: "20px", borderRadius: "50%", background: r.ttint, color: r.tfg, fontSize: "9.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.init}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "600", whiteSpace: "nowrap" }}>{r.owner}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "600", color: r.tfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {r.team}</span>
                          </span>
                          {!!(r.hasMine) && (<>
                            <span style={{ alignSelf: "flex-start", marginTop: "2px", height: "22px", padding: "0 8px", borderRadius: "11px", background: "#F5EBE3", color: "#4E2F20", fontSize: "12px", fontWeight: "650", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{r.mineTxt}</span>
                          </>)}
                          {!!(r.hasSh) && (<>
                            <span style={{ fontSize: "12px", fontWeight: "600", color: "#8E4B6E", paddingLeft: "26px" }}>{r.shTxt}</span>
                          </>)}
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                          {(r.steps).map((p, p_i) => (<Fragment key={p_i}>
                            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: "0" }}>
                              <div style={{ position: "relative", width: "100%", height: "14px", display: "grid", placeItems: "center" }}>
                                <span style={{ position: "absolute", top: "6px", left: "0", width: "50%", height: "2px", background: p.lL }}>
                                </span>
                                <span style={{ position: "absolute", top: "6px", right: "0", width: "50%", height: "2px", background: p.lR }}>
                                </span>
                                <span style={{ position: "relative", width: `${p.size}px`, height: `${p.size}px`, boxSizing: "border-box", borderRadius: "50%", background: p.dot, border: `2px solid ${p.ring}` }}>
                                </span>
                              </div>
                              <span style={{ fontSize: "12px", fontWeight: p.w, color: p.lab, whiteSpace: "nowrap" }}>{p.label}</span>
                              <span style={{ fontSize: "11.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.date}</span>
                            </div>
                          </Fragment>))}
                        </div>
                        {!!(v.cpWide) && (<>
                          <span>
                            <span style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 10px", borderRadius: "12px", background: r.sbg, color: r.sfg, fontSize: "12.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{r.status}</span>
                          </span>
                        </>)}
                        {!!(v.cpWide) && (<>
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "600", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.last}</span>
                            <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap" }}>{r.lastWho}</span>
                          </span>
                        </>)}
                      </button>
                    </Fragment>))}
                  </div>
                </div>
              </>)}
              {!!(v.isNtfOp) && (<>
                <span style={{ fontSize: "15px", color: "#806B60", marginTop: "-12px" }}>{v.ntfHead}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "3px", padding: "4px", borderRadius: "16px", background: "#F5EBE3" }}>
                      {(v.ntfCats).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.pick} style={{ height: "42px", padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", border: "0", borderRadius: "12px", background: c.bg, boxShadow: c.sh, font: "inherit", fontSize: "14.5px", fontWeight: c.fw, color: c.fg, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}{!!(c.hasN) && (<>
                            <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: c.nbg, color: c.nfg, fontSize: "11.5px", fontWeight: "700", display: "inline-grid", placeItems: "center" }}>{c.n}</span>
                          </>)}</button>
                      </Fragment>))}
                    </div>
                    <div style={{ flex: "0 0 auto", marginLeft: "auto", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#fff" }}>
                      {(v.ntfTabs).map((b, b_i) => (<Fragment key={b_i}>
                        <button type="button" onClick={b.pick} style={{ height: "34px", padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", border: "0", borderRadius: "9px", background: b.bg, boxShadow: b.sh, font: "inherit", fontSize: "13.5px", fontWeight: b.fw, color: b.fg, cursor: "pointer" }}>{b.label}</button>
                      </Fragment>))}
                    </div>
                    {!!(v.ntfNoSel) && (<>
                      <button type="button" onClick={v.ntfSelOn} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="4">
                          </rect>
                          <path d="m8 12 3 3 5-6">
                          </path>
                        </svg>Select</button>
                    </>)}
                    <button type="button" onClick={v.ntfMarkAll} disabled={v.ntfNoUnread} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: v.ntfMarkFg, cursor: v.ntfMarkCur, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16">
                        </path>
                      </svg>Mark all read</button>
                  </div>
                  {!!(v.ntfSelMode) && (<>
                    <div style={{ position: "sticky", top: "0", zIndex: "3", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px 10px 16px", borderRadius: "14px", background: "#3F2B22", color: "#fff" }}>
                      <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>{v.ntfSelN}</strong>
                      <button type="button" onClick={v.ntfSelAll} style={{ height: "34px", padding: "0 12px", border: "0", borderRadius: "17px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#F6B48A", cursor: "pointer" }}>{v.ntfAllLabel}</button>
                      <button type="button" onClick={v.ntfReadSel} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid rgba(255,255,255,.35)", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: v.ntfActCur, opacity: v.ntfActOp }}>Mark read</button>
                      <button type="button" onClick={v.ntfDelSel} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "0", background: "#C8452A", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: v.ntfActCur, opacity: v.ntfActOp, display: "inline-flex", alignItems: "center", gap: "6px" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6">
                          </path>
                        </svg>Delete</button>
                      <button type="button" onClick={v.ntfSelOff} title="Cancel" style={{ width: "34px", height: "34px", border: "0", borderRadius: "50%", background: "rgba(255,255,255,.12)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                          <path d="M6 6l12 12M18 6 6 18">
                          </path>
                        </svg>
                      </button>
                    </div>
                  </>)}
                  {(v.ntfGroups).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{g.label}</span>
                      <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                        {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                          <button type="button" onClick={n.click} title={n.tip} style={{ display: "grid", gridTemplateColumns: n.cols, alignItems: "center", columnGap: "16px", padding: "18px 22px 18px 14px", boxSizing: "border-box", width: "100%", border: "0", borderBottom: "1px solid #F1E7DF", background: n.bg, font: "inherit", textAlign: "left", color: "#3F2B22", cursor: "pointer" }} className={DH.h4}>
                            {!!(n.sel) && (<>
                              <span style={{ width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "6px", border: `1.5px solid ${n.cbBd}`, background: n.cbBg, display: "grid", placeItems: "center" }}>
                                {!!(n.pk) && (<>
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m5 12 5 5 9-10">
                                    </path>
                                  </svg>
                                </>)}
                              </span>
                            </>)}
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: n.dotC }}>
                            </span>
                            <span style={{ width: "46px", height: "46px", borderRadius: "14px", background: n.icBg, color: n.icFg, display: "grid", placeItems: "center" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d={n.ic}>
                                </path>
                              </svg>
                            </span>
                            <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "5px" }}>
                              <span style={{ fontSize: "15.5px", lineHeight: "1.4", textWrap: "pretty" }}><strong style={{ fontWeight: "700" }}>{n.who}</strong> {n.rest}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#806B60", minWidth: "0" }}>
                                <span style={{ flex: "0 0 auto", height: "22px", padding: "0 9px", borderRadius: "11px", background: n.icBg, color: n.icFg, fontSize: "12px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{n.type}</span>
                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.sub}</span>
                              </span>
                              {!!(n.goAs) && (<>
                                <span onClick={n.openAs} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "4px", height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #BD4A19", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h11}>{n.goAsLabel}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m9 6 6 6-6 6">
                                    </path>
                                  </svg></span>
                              </>)}
                              {!!(n.goCp) && (<>
                                <span onClick={n.open} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "2px", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h20}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2">
                                    </path>
                                  </svg>View in Chat progress<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m9 6 6 6-6 6">
                                    </path>
                                  </svg></span>
                              </>)}
                            </span>
                            <span style={{ alignSelf: "flex-start", paddingTop: "3px", fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{n.time}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </div>
                  </Fragment>))}
                  {!!(v.ntfEmpty) && (<>
                    <div style={{ padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px" }}>
                      <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                          </path>
                        </svg>
                      </span>
                      <span style={{ fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>Nothing here right now.</span>
                      <span style={{ fontSize: "13.5px", color: "#806B60" }}>{v.ntfEmptyMsg}</span>
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.isCltOp) && (<>
                <span style={{ fontSize: "14px", color: "#806B60", marginTop: "-10px", maxWidth: "760px" }}>Salespeople can send these once the 24-hour reply window has closed on a cold lead's chat. Only approved templates can be switched on.</span>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.cltToggleF} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", font: "inherit", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22" }} className={DH.h8}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.cltFDot }}>
                      </span>{v.cltFLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.cltFOpen) && (<>
                      <div onClick={v.cltToggleF} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "220px", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {(v.cltFOpts).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "38px", padding: "0 12px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.dot }}>
                            </span>
                            <span style={{ flex: "1" }}>{o.label}</span>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{o.n}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </>)}
                  </span>
                  <span style={{ flex: "1" }}>
                  </span>
                  <button type="button" onClick={v.cltNewT} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", font: "inherit", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "1px solid #E2CFC1", background: "#fff", color: "#BD4A19" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>New template</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px", alignItems: "stretch" }}>
                  {(v.cltCards).map((t, t_i) => (<Fragment key={t_i}>
                    <div style={{ background: "#fff", border: `1px solid ${t.bd}`, borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(63,43,34,.04)", display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", padding: "16px 20px" }}>
                        <span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "12px", background: t.chBg, color: t.chFg, display: "grid", placeItems: "center" }}>
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                            </path>
                          </svg>
                        </span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "26px" }}>
                            <strong style={{ flex: "1", minWidth: "0", fontSize: "16px", fontWeight: "700", letterSpacing: "-.005em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.dname}</strong>
                            <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "10px", whiteSpace: "nowrap", fontSize: "13px", fontWeight: "650", color: t.onFg }}>{t.onLabel}<button type="button" onClick={t.toggle} disabled={t.locked} title={t.tip} style={{ flex: "0 0 auto", width: "44px", height: "26px", padding: "0", border: "0", borderRadius: "13px", background: t.track, position: "relative", cursor: t.cur }}>
                                <span style={{ position: "absolute", top: "3px", left: `${t.knob}px`, width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                                </span>
                              </button><button type="button" onClick={t.ask} title="Delete template" style={{ flex: "0 0 auto", width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#A3371A", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h21}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6">
                                  </path>
                                </svg>
                              </button></span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "#806B60" }}>
                            <span style={{ fontWeight: "650", color: t.chFg }}>{t.channel}</span>
                            <span style={{ color: "#D3C4B8" }}>·</span>
                            <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "5px", height: "20px", padding: "0 8px", borderRadius: "10px", background: t.stBg, color: t.stFg, fontSize: "11.5px", fontWeight: "700" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }}>
                              </span>{t.status}</span>
                          </span>
                        </span>
                      </div>
                      <div style={{ padding: "0 20px 18px", flex: "1", display: "flex", flexDirection: "column" }}>
                        {!!(t.askDel) && (<>
                          <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", border: "1px solid #F0C9BC", background: "#FBE9E4" }}>
                            <span style={{ flex: "1", fontSize: "13.5px", fontWeight: "650", color: "#A3371A" }}>Delete this template?</span>
                            <button type="button" onClick={t.askNo} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                            <button type="button" onClick={t.delNow} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "0", background: "#A3371A", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Delete</button>
                          </div>
                        </>)}
                        {!!(t.view) && (<>
                          <div onClick={t.edit} title="Click to edit" style={{ position: "relative", padding: "16px 18px", borderRadius: "14px", background: "#FBF6F2", cursor: "pointer" }} className={DH.h22}>
                            <div style={{ maxWidth: "520px", padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "#fff", border: "1px solid #F1E7DF", fontSize: "14.5px", lineHeight: "1.6", color: "#3F2B22", textWrap: "pretty" }}>
                              {(t.segs).map((g, g_i) => (<Fragment key={g_i}>
                                {!!(g.tag) && (<>
                                  <span style={{ padding: "1px 7px", borderRadius: "6px", background: "#FFF0E4", color: "#BD4A19", fontWeight: "650", fontSize: "13.5px" }}>{g.t}</span>
                                </>)}
                                {!!(g.txt) && (<>{g.t}</>)}
                              </Fragment>))}
                            </div>
                            <span style={{ position: "absolute", top: "12px", right: "14px", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                                </path>
                              </svg>Edit</span>
                          </div>
                        </>)}
                      </div>
                    </div>
                  </Fragment>))}
                  {!!(v.cltEmpty) && (<>
                    <div style={{ gridColumn: "1 / -1", padding: "32px", textAlign: "center", fontSize: "14px", color: "#806B60", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px" }}>No templates in this status</div>
                  </>)}
                </div>
              </>)}
              {!!(v.isHistOp) && (<DeskHistory v={v.history} />)}{!!(v.isMwtOp) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "-10px" }}>
                  <span style={{ flex: "1", minWidth: "260px", fontSize: "14px", color: "#806B60" }}>Turned on here, they appear in Assignment › Full time lead allocation, where you pick their days.</span>
                  {!!(v.mwtSavedMsg) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#387557" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5 9-10">
                        </path>
                      </svg>Saved</span>
                  </>)}
                  {!!(v.mwtDirty) && (<>
                    <span style={{ fontSize: "13px", color: "#A46312", fontWeight: "650" }}>Unsaved changes</span>
                  </>)}
                  <button type="button" onClick={v.mwtSave} disabled={v.mwtClean} style={{ height: "40px", padding: "0 24px", borderRadius: "20px", border: "0", background: v.mwtBtnBg, font: "inherit", fontSize: "14.5px", fontWeight: "650", color: "#fff", cursor: v.mwtBtnCur }}>Save</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px", alignItems: "stretch" }}>
                  {(v.mwtTeams).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "1px solid #F1E7DF" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: g.color }}>
                        </span>
                        <strong style={{ flex: "1", fontSize: "14.5px", fontWeight: "700", color: g.color }}>{g.name}</strong>
                        <span style={{ fontSize: "12.5px", color: "#806B60" }}>{g.count}</span>
                      </div>
                      {(g.people).map((p, p_i) => (<Fragment key={p_i}>
                        <button type="button" onClick={p.toggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{p.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{p.name}</strong>
                            <span style={{ fontSize: "12.5px", color: "#806B60" }}>{p.role}</span>
                          </span>
                          <span style={{ flex: "0 0 auto", height: "24px", padding: "0 10px", borderRadius: "12px", background: p.wtBg, color: p.wtFg, fontSize: "12px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{p.wt}</span>
                          <span style={{ flex: "0 0 auto", width: "40px", height: "24px", borderRadius: "12px", background: p.track, position: "relative", display: "block" }}>
                            <span style={{ position: "absolute", top: "3px", left: `${p.knob}px`, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                            </span>
                          </span>
                        </button>
                      </Fragment>))}
                    </div>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.plainOp) && (<>
                <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.opRows).map((r, r_i) => (<Fragment key={r_i}>
                    <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid #F1E7DF", background: r.bg, cursor: r.cur }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "15px", fontWeight: "650" }}>{r.t}</strong>
                        <span style={{ fontSize: "13px", color: "#806B60" }}>{r.s}</span>
                        {!!(r.note) && (<>
                          <span style={{ fontSize: "12.5px", color: r.noteColor, fontWeight: "600" }}>{r.note}</span>
                        </>)}
                      </span>
                      {!!(r.right) && (<>
                        <span style={{ fontSize: "13.5px", fontWeight: "650", color: r.rc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.right}</span>
                      </>)}
                      {!!(r.go) && (<>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </>)}
                      {!!(r.btn2) && (<>
                        <button type="button" onClick={r.act2} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                            </path>
                          </svg>{r.btn2}</button>
                      </>)}
                      {!!(r.btn) && (<>
                        <button type="button" onClick={r.act} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #BD4A19", background: r.btnBg, color: "#BD4A19", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer" }} className={DH.h11}>{r.btn}</button>
                      </>)}
                    </div>
                  </Fragment>))}
                </div>
              </>)}
            </div>
            {!!(v.sheetOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.menuW}px`, width: `${v.menuW}px`, boxSizing: "border-box", position: "relative", overflow: "auto", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragMenu} onDoubleClick={v.resetMenu} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: "12px", padding: "18px 12px 16px 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em", color: "#3F2B22" }}>{v.sheetTitle}</strong>
                    <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.sheetSub}</span>
                  </span>
                  <button type="button" onClick={v.closePane} title="Close (Esc)" style={{ flex: "0 0 auto", width: "32px", height: "32px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", padding: "8px 12px" }}>
                  {(v.sheetRows).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "60px", padding: "10px 8px", border: "0", borderTop: c.bt, borderRadius: "0", background: "transparent", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                      <span style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "8px", background: c.tint, display: "grid", placeItems: "center" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d={c.d}>
                          </path>
                        </svg>
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "650" }}>{c.title}</span>
                        <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
                      </span>
                      {!!(c.badge) && (<>
                        <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{c.badge}</span>
                      </>)}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#A08E82" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </button>
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.mwtLogClosed) && (<>
              <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <button type="button" onClick={v.mwtLogToggle} title="Open audit log" style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid #EBDDD2", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h24}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m11 17-5-5 5-5M18 17l-5-5 5-5">
                    </path>
                  </svg>
                </button>
                <button type="button" onClick={v.mwtLogToggle} title="Open audit log" style={{ marginTop: "18px", padding: "6px 0", border: "0", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                  {(v.mwtLogRail).map((d, d_i) => (<Fragment key={d_i}>
                    <span title={d.tip} style={{ width: "10px", height: "10px", borderRadius: "50%", background: d.dot }}>
                    </span>
                    <span style={{ width: "2px", height: "18px", background: d.gap }}>
                    </span>
                  </Fragment>))}
                </button>
              </aside>
            </>)}
            {!!(v.mwtLogOpen) && (<>
              <aside style={{ position: "relative", flex: `0 1 ${v.mwtLogW}px`, width: `${v.mwtLogW}px`, minWidth: "220px", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragMwtLog} onDoubleClick={v.resetMwtLog} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 0 16px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>Audit log</strong>
                    <span style={{ fontSize: "12px", color: "#806B60" }}>Member work type</span>
                  </span>
                  <button type="button" onClick={v.mwtLogToggle} title="Close" style={{ flex: "0 0 34px", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m13 17 5-5-5-5M6 17l5-5-5-5">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "16px", display: "flex", flexDirection: "column" }}>
                  {(v.mwtLog).map((e, e_i) => (<Fragment key={e_i}>
                    <div style={{ display: "grid", gridTemplateColumns: "44px 24px minmax(0, 1fr)", columnGap: "10px" }}>
                      <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "4px", textAlign: "right" }}>
                        <strong style={{ fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                        <span style={{ fontSize: "11.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <span style={{ flex: "0 0 24px", width: "24px", height: "24px", borderRadius: "50%", background: e.bg, color: e.fg, display: "grid", placeItems: "center" }}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d={e.d}>
                            </path>
                          </svg>
                        </span>
                        <span style={{ flex: "1", width: "2px", minHeight: "12px", background: e.line }}>
                        </span>
                      </span>
                      <span style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 0 16px", minWidth: "0" }}>
                        <span style={{ fontSize: "13px", fontWeight: "600", lineHeight: "1.35", textWrap: "pretty" }}>{e.text}</span>
                        <span style={{ fontSize: "12px", color: "#806B60" }}>{e.who}</span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.adNone) && (<>
              <aside style={{ flex: `0 0 ${v.adNoneW}px`, width: `${v.adNoneW}px`, boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center", padding: "24px" }}>
                <span style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fff", border: "1px solid #EBDDD2", display: "grid", placeItems: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>Pick an ad</strong>
                <span style={{ maxWidth: "280px", fontSize: "13px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>Its split, performance and audit log open here</span>
              </aside>
            </>)}
            {!!(v.adOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.name}</strong>
                    <span style={{ fontSize: "12px", color: "#806B60" }}>{v.ad.meta}</span>
                  </span>
                  <button type="button" onClick={v.closeAd} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", overflowX: "hidden", padding: "0 20px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid #EBDDD2" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>SPLIT METHOD</span>
                    <div style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                      {(v.adModes).map((o, o_i) => (<Fragment key={o_i}>
                        {!!(o.on) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "34px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                        </>)}
                        {!!(o.off) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "34px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "13.5px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                        </>)}
                      </Fragment>))}
                    </div>
                  </div>
                  {!!(v.adEvenly) && (<>
                    <div style={{ display: "flex", flexDirection: "column", padding: "18px 0" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", paddingBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", flex: "1" }}>TEAMS</span>
                        <span style={{ fontSize: "12px", color: "#806B60" }}><b style={{ fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{v.evenTotal}</b> people share equally</span>
                      </div>
                      {(v.evenTeams).map((t, t_i) => (<Fragment key={t_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #F1E7DF" }}>
                          <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>
                          </span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{t.name}</strong>
                            <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.names}</span>
                          </span>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>Equal share</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.adByTeam) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid #EBDDD2" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", flex: "1" }}>SPLIT ACROSS TEAMS</span>
                        <span style={{ fontSize: "12px", fontWeight: "650", color: "#387557", fontVariantNumeric: "tabular-nums" }}>100%</span>
                        <button type="button" onClick={v.resetSplit} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h25}>Reset</button>
                      </div>
                      <div style={{ display: "flex", gap: "2px", height: "6px", borderRadius: "3px", overflow: "hidden" }}>
                        {(v.adSplit).map((t, t_i) => (<Fragment key={t_i}>
                          <span style={{ flex: `${t.pct} 0 0`, background: t.color }}>
                          </span>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        {(v.adSplit).map((t, t_i) => (<Fragment key={t_i}>
                          <div style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 0" }}>
                            <span style={{ flex: "0 0 104px", display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>
                              </span>{t.name}</span>
                            <span style={{ flex: "1", position: "relative", height: "4px", borderRadius: "2px", background: "#F1E7DF" }}>
                              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: `${t.pct}%`, background: t.color, borderRadius: "2px" }}>
                              </span>
                              <span style={{ position: "absolute", top: "50%", left: `${t.pct}%`, width: "16px", height: "16px", margin: "-8px 0 0 -8px", boxSizing: "border-box", borderRadius: "50%", background: "#fff", border: `2px solid ${t.color}`, pointerEvents: "none" }}>
                              </span>
                              <input type="range" min="0" max="100" step="5" value={t.pct} onChange={t.onRange} aria-label={`${t.name} share`} style={{ position: "absolute", left: "-8px", right: "-8px", top: "-12px", bottom: "-12px", width: "calc(100% + 16px)", margin: "0", opacity: "0", cursor: "pointer" }} />
                            </span>
                            <span style={{ flex: "0 0 64px", height: "34px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", padding: "0 10px", borderRadius: "8px", border: "1px solid #EBDDD2" }}>
                              <input type="text" inputMode="numeric" value={t.pctStr} onChange={t.onRange} style={{ width: "30px", border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textAlign: "right", fontVariantNumeric: "tabular-nums", outline: "none" }} />
                              <span style={{ fontSize: "12px", color: "#806B60" }}>%</span>
                            </span>
                          </div>
                        </Fragment>))}
                      </div>
                    </div>
                    {(v.adTeams).map((t, t_i) => (<Fragment key={t_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid #EBDDD2" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>
                          </span>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>{t.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{t.share} of leads</span>
                        </div>
                        <div style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                          {(t.opts).map((o, o_i) => (<Fragment key={o_i}>
                            {!!(o.on) && (<>
                              <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "30px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "12.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                            </>)}
                            {!!(o.off) && (<>
                              <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "30px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "12.5px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                            </>)}
                          </Fragment>))}
                        </div>
                        {!!(t.evenShut) && (<>
                          <button type="button" onClick={t.toggleList} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", border: "0", background: "transparent", font: "inherit", color: "#806B60", textAlign: "left", cursor: "pointer" }} className={DH.h2}>
                            <span style={{ flex: "1", fontSize: "12.5px" }}>{t.memberCount} members · each gets an equal share</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}>Show<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg></span>
                          </button>
                        </>)}
                        {!!(t.listShown) && (<>
                          {!!(t.evenOpen) && (<>
                            <button type="button" onClick={t.toggleList} style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "3px", padding: "0", border: "0", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Hide<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m18 15-6-6-6 6">
                                </path>
                              </svg></button>
                          </>)}
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {(t.members).map((m, m_i) => (<Fragment key={m_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", padding: "4px 0", borderTop: "1px solid #F1E7DF" }}>
                                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                                  <span style={{ fontSize: "13.5px", fontWeight: "600" }}>{m.name}</span>
                                  <span style={{ fontSize: "12px", color: m.subColor }}>{m.sub}</span>
                                </span>
                                {!!(t.field) && (<>
                                  <span style={{ flex: "0 0 auto", height: "32px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "4px", padding: "0 10px", borderRadius: "8px", border: "1px solid #EBDDD2" }}>
                                    <input type="text" inputMode="numeric" value={m.valueStr} onChange={m.onVal} style={{ width: "28px", border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textAlign: "right", fontVariantNumeric: "tabular-nums", outline: "none" }} />
                                    <span style={{ fontSize: "12px", color: "#806B60" }}>{t.unit}</span>
                                  </span>
                                </>)}
                              </div>
                            </Fragment>))}
                            <span style={{ paddingTop: "6px", fontSize: "12px", fontWeight: "600", color: t.noteColor }}>{t.note}</span>
                          </div>
                        </>)}
                      </div>
                    </Fragment>))}
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 20px", borderTop: "1px solid #EBDDD2" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "#3F2B22", cursor: "pointer" }}><input type="checkbox" checked={v.applyChk} onChange={v.toggleApplyChk} style={{ width: "16px", height: "16px", margin: "0", accentColor: "#BD4A19" }} />{v.applyChkLabel}</label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={v.closeAd} style={{ flex: "0 0 auto", height: "40px", padding: "0 20px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }} className={DH.h8}>Cancel</button>
                    <button type="button" onClick={v.saveOrApply} style={{ flex: "1", height: "40px", borderRadius: "20px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                </div>
              </aside>
            </>)}
            {!!(v.adOpen) && (<>
              {!(v.perfShut) && (<><aside style={{ position: "relative", flex: `0 1 ${v.perfW}px`, width: `${v.perfW}px`, minWidth: "220px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragPerf} onDoubleClick={v.resetPerf} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", padding: "0 16px", borderBottom: "1px solid #EBDDD2" }}>
                  <button type="button" onClick={v.perfFold} title="Fold Ad performance" className={DX.emo} style={{ flex: "0 0 30px", width: "30px", height: "30px", margin: "0 6px 0 -8px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17 5-5-5-5M6 17l5-5-5-5"></path></svg></button><strong style={{ flex: "1", fontSize: "15px", fontWeight: "650" }}>Ad performance</strong>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.adPerToggle} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "30px", padding: "0 8px 0 12px", borderRadius: "15px", border: "1px solid #EBDDD2", background: v.adPerBg, font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>{v.adPerLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.adPerOpen) && (<>
                      <div onClick={v.adPerToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "36px", right: "0", zIndex: "8", width: "226px", boxSizing: "border-box", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {!!(v.adCalList) && (<>
                          {(v.adPerOpts).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", fontWeight: o.w, color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                              <span style={{ flex: "1" }}>{o.label}</span>
                              <span style={{ fontSize: "11.5px", color: "#806B60" }}>{o.range}</span>
                            </button>
                          </Fragment>))}
                        </>)}
                        {!!(v.adCalOpen) && (<>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 4px 2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <button type="button" onClick={v.adCalBack} title="Back" style={{ width: "26px", height: "26px", border: "0", borderRadius: "8px", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>October 2026</strong>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: "2px", fontSize: "10.5px", fontWeight: "700", color: "#A08E82", textAlign: "center" }}>
                              <span>M</span>
                              <span>T</span>
                              <span>W</span>
                              <span>T</span>
                              <span>F</span>
                              <span>S</span>
                              <span>S</span>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: "2px" }}>
                              {(v.adCalDays).map((d, d_i) => (<Fragment key={d_i}>
                                <button type="button" onClick={d.pick} style={{ width: "28px", height: "28px", border: "0", borderRadius: "50%", background: d.bg, color: d.fg, font: "inherit", fontSize: "12px", fontWeight: d.w, fontVariantNumeric: "tabular-nums", cursor: d.cur, padding: "0" }}>{d.l}</button>
                              </Fragment>))}
                            </div>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{v.adCalHint}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "6px", borderTop: "1px solid #F1E7DF" }}>
                              <span style={{ flex: "1", fontSize: "12.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{v.adCalLabel}</span>
                              <button type="button" onClick={v.adCalApply} style={{ height: "30px", padding: "0 14px", borderRadius: "15px", border: "0", background: "#BD4A19", color: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h26}>Apply</button>
                            </div>
                          </div>
                        </>)}
                      </div>
                    </>)}
                  </span>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", padding: "14px 0 6px" }}>
                    <span style={{ paddingBottom: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>OVERALL</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 12px", padding: "6px 0 12px" }}>
                      {(v.adSum.rows).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{r.k}</span>
                          <span style={{ fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.v}</span>
                          <span style={{ fontSize: "11.5px", color: "#806B60" }}>{r.sub}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px 0", borderTop: "1px solid #EBDDD2" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>FUNNEL</span>
                    {(v.adFunnel).map((f, f_i) => (<Fragment key={f_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                          <span style={{ flex: "1", fontSize: "12px", color: "#806B60" }}>{f.k}</span>
                          <b style={{ fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{f.n}</b>
                        </span>
                        <span style={{ display: "block", height: "6px", borderRadius: "3px", background: "#F5EEE8" }}>
                          <span style={{ display: "block", height: "6px", width: `${f.w}%`, borderRadius: "3px", background: f.color }}>
                          </span>
                        </span>
                        <span style={{ fontSize: "11.5px", color: "#806B60", minHeight: "13px" }}>{f.sub}</span>
                      </div>
                    </Fragment>))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", padding: "14px 0 4px", borderTop: "1px solid #EBDDD2" }}>
                    <span style={{ paddingBottom: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>COSTS</span>
                    {(v.adCosts).map((c, c_i) => (<Fragment key={c_i}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "7px 0", borderBottom: "1px solid #F5EEE8" }}>
                        <span style={{ flex: "1", fontSize: "12.5px", color: "#806B60" }}>{c.k}</span>
                        <b style={{ fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.v}</b>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", padding: "14px 16px", borderTop: "1px solid #EBDDD2" }}>
                  <button type="button" onClick={v.openAdsPerf} style={{ width: "100%", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", borderRadius: "20px", border: "1px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h11}>Full Ads Performance<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17 17 7M8 7h9v9">
                      </path>
                    </svg></button>
                </div>
              </aside></>)}{!!(v.perfShut) && (<DeskFoldRail v={v.perfRail} />)}
              {!!(v.adLogClosed) && (<>
                <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <button type="button" onClick={v.adLogToggle} title="Open audit log" style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid #EBDDD2", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h24}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m11 17-5-5 5-5M18 17l-5-5 5-5">
                      </path>
                    </svg>
                  </button>
                  <button type="button" onClick={v.adLogToggle} title="Open audit log" style={{ marginTop: "18px", padding: "6px 0", border: "0", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                    {(v.adLogRail).map((d, d_i) => (<Fragment key={d_i}>
                      <span title={d.tip} style={{ width: "10px", height: "10px", boxSizing: "border-box", borderRadius: "50%", background: d.dot }}>
                      </span>
                      <span style={{ width: "2px", height: "18px", background: d.gap }}>
                      </span>
                    </Fragment>))}
                  </button>
                </aside>
              </>)}
              {!!(v.adLogOpen) && (<>
                <aside className={DX.slideIn} style={v.adLogStyle}>
                  <div onPointerDown={v.dragAudit} onDoubleClick={v.resetAudit} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                  </div>
                  <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 0 16px", borderBottom: "1px solid #EBDDD2" }}>
                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>Audit log</strong>
                      <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.name}</span>
                    </span>
                    <button type="button" onClick={v.adLogToggle} title="Close" style={{ flex: "0 0 34px", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m13 17 5-5-5-5M6 17l5-5-5-5">
                        </path>
                      </svg>
                    </button>
                  </div>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "16px", display: "flex", flexDirection: "column" }}>
                    {(v.adLog).map((e, e_i) => (<Fragment key={e_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "44px 24px minmax(0, 1fr)", columnGap: "10px" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "4px", textAlign: "right" }}>
                          <strong style={{ fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                          <span style={{ fontSize: "11.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ flex: "0 0 24px", width: "24px", height: "24px", borderRadius: "50%", background: e.bg, color: e.fg, display: "grid", placeItems: "center" }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={e.d}>
                              </path>
                            </svg>
                          </span>
                          <span style={{ flex: "1", width: "2px", minHeight: "12px", background: e.line }}>
                          </span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 0 16px", minWidth: "0" }}>
                          <span style={{ fontSize: "13px", fontWeight: "600", lineHeight: "1.35", textWrap: "pretty" }}>{e.text}</span>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{e.who}</span>
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </aside>
              </>)}
            </>)}
            {!!(v.cpOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cpName}</strong>
                    <span style={{ fontSize: "12.5px", color: "#806B60", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.cpSub}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 10px", borderRadius: "12px", background: v.cpSbg, color: v.cpSfg, fontSize: "12.5px", fontWeight: "700" }}>{v.cpStatus}</span>
                  <button type="button" onClick={v.cpClose} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ padding: "16px 8px 12px", border: "1px solid #EBDDD2", borderRadius: "14px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                      {(v.cpSteps).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: "0" }}>
                          <div style={{ position: "relative", width: "100%", height: "14px", display: "grid", placeItems: "center" }}>
                            <span style={{ position: "absolute", top: "6px", left: "0", width: "50%", height: "2px", background: p.lL }}>
                            </span>
                            <span style={{ position: "absolute", top: "6px", right: "0", width: "50%", height: "2px", background: p.lR }}>
                            </span>
                            <span style={{ position: "relative", width: `${p.size}px`, height: `${p.size}px`, boxSizing: "border-box", borderRadius: "50%", background: p.dot, border: `2px solid ${p.ring}` }}>
                            </span>
                          </div>
                          <span style={{ fontSize: "12px", fontWeight: p.w, color: p.lab, whiteSpace: "nowrap" }}>{p.label}</span>
                          <span style={{ fontSize: "11.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.date}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(v.cpEv).map((e, e_i) => (<Fragment key={e_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "62px 30px minmax(0, 1fr)", columnGap: "12px", paddingTop: e.pt }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "5px", textAlign: "right" }}>
                          <strong style={{ fontSize: "12.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                          <span style={{ fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                          <span style={{ flex: "0 0 30px", width: "30px", height: "30px", borderRadius: "50%", background: e.bg, color: e.fg, display: "grid", placeItems: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d={e.d}>
                              </path>
                            </svg>
                          </span>
                          <span style={{ flex: "1", width: "2px", minHeight: "14px", background: e.line }}>
                          </span>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "5px 0 18px", minWidth: "0" }}>
                          <span style={{ fontSize: "14px", fontWeight: "600", textWrap: "pretty" }}>{e.text}</span>
                          <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "12.5px", color: "#806B60" }}>{e.who}</span>
                            {!!(e.hasSt) && (<>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 8px", borderRadius: "11px", background: e.stbg, color: e.stfg, fontSize: "12px", fontWeight: "700" }}>→ <span>{e.st}</span></span>
                            </>)}
                          </span>
                          {!!(e.hasNote) && (<>
                            <span style={{ padding: "10px 12px", borderRadius: "10px", background: "#FBF6F2", fontSize: "13.5px", color: "#3F2B22", textWrap: "pretty" }}>{e.note}</span>
                          </>)}
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid #EBDDD2", background: "#fff" }}>
                  <button type="button" onClick={v.cpOpenChat} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "44px", borderRadius: "22px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                      </path>
                    </svg>Open chat</button>
                </div>
              </aside>
            </>)}
            {!!(v.frmOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {!!(v.frmIsBase) && (<>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>Customer details</strong>
                    </>)}
                    {!!(v.frmNotBase) && (<>
                      <input value={v.frmTitle} onChange={v.setFrmName} placeholder="Form name" title="Rename form" style={{ height: "28px", boxSizing: "border-box", padding: "0 6px", marginLeft: "-6px", border: "1px solid transparent", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", outline: "none" }} className={DH.h27 + " " + DH.f2} />
                    </>)}
                    <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.frmSub}</span>
                  </span>
                  {!!(v.frmCanRm) && (<>
                    <button type="button" onClick={v.frmRm} title="Delete form" style={{ height: "34px", padding: "0 12px", borderRadius: "17px", border: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#A3371A", cursor: "pointer" }}>Delete form</button>
                  </>)}
                  <button type="button" onClick={v.frmClose} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "22px" }}>
                  {(v.frmSecs).map((sec, sec_i) => (<Fragment key={sec_i}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: "0 0 7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
                        </span>
                        <input value={sec.title} onChange={sec.setTitle} title="Rename section" placeholder="Section title" style={{ flex: "1", minWidth: "0", height: "34px", boxSizing: "border-box", padding: "0 8px", marginLeft: "-8px", border: "1px solid transparent", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "#3F2B22", outline: "none" }} className={DH.h27 + " " + DH.f2} />
                        <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap" }}>{sec.n}</span>
                        {!!(sec.canDel) && (<>
                          <button type="button" onClick={sec.del} title="Delete section" style={{ width: "30px", height: "30px", border: "0", borderRadius: "8px", background: "transparent", color: "#806B60", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h28}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                              </path>
                            </svg>
                          </button>
                        </>)}
                        {!!(sec.noDel) && (<>
                          <span title="Has Name or Phone, can't be deleted" style={{ width: "30px", height: "30px", color: "#D9C6B8", display: "grid", placeItems: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4">
                              </path>
                            </svg>
                          </span>
                        </>)}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                        {!!(sec.empty) && (<>
                          <span style={{ padding: "14px", fontSize: "13.5px", color: "#806B60", textAlign: "center" }}>No fields yet</span>
                        </>)}
                        {(sec.fields).map((f, f_i) => (<Fragment key={f_i}>
                          <div style={{ display: "flex", flexDirection: "column", borderTop: f.bt, background: f.bg }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px" }}>
                              <span style={{ display: "flex", flexDirection: "column" }}>
                                <button type="button" onClick={f.up} title="Move up" style={{ width: "20px", height: "15px", padding: "0", border: "0", background: "transparent", color: f.upFg, cursor: "pointer", display: "grid", placeItems: "center" }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m6 15 6-6 6 6">
                                    </path>
                                  </svg>
                                </button>
                                <button type="button" onClick={f.down} title="Move down" style={{ width: "20px", height: "15px", padding: "0", border: "0", background: "transparent", color: f.dnFg, cursor: "pointer", display: "grid", placeItems: "center" }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m6 9 6 6 6-6">
                                    </path>
                                  </svg>
                                </button>
                              </span>
                              <button type="button" onClick={f.toggle} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", padding: "0", border: "0", background: "transparent", font: "inherit", textAlign: "left", color: "#3F2B22", cursor: "pointer" }}>
                                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <strong style={{ fontSize: "14px", fontWeight: "650" }}>{f.label}{f.star}</strong>
                                    {!!(f.isNew) && (<>
                                      <span style={{ height: "18px", padding: "0 6px", borderRadius: "9px", background: "#FFF0E4", color: "#BD4A19", fontSize: "11px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>New</span>
                                    </>)}
                                  </span>
                                  <span style={{ fontSize: "12.5px", color: "#806B60" }}>{f.summary}</span>
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: f.chev }}>
                                  <path d="m6 9 6 6 6-6">
                                  </path>
                                </svg>
                              </button>
                              {!!(f.canDel) && (<>
                                <button type="button" onClick={f.del} title="Delete field" style={{ width: "30px", height: "30px", border: "0", borderRadius: "8px", background: "transparent", color: "#806B60", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h28}>
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                                    </path>
                                  </svg>
                                </button>
                              </>)}
                              {!!(f.noDel) && (<>
                                <span title="Always on the form" style={{ width: "30px", height: "30px", color: "#D9C6B8", display: "grid", placeItems: "center" }}>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4">
                                    </path>
                                  </svg>
                                </span>
                              </>)}
                            </div>
                            {!!(f.open) && (<>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "4px 14px 16px 40px" }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                  <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>FIELD NAME</span>
                                  <input value={f.lab} onChange={f.setLabel} placeholder="e.g. Gender" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "#3F2B22", outline: "none", width: "100%" }} className={DH.f1} />
                                </label>
                                {!!(f.typeFree) && (<>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>TYPE</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {(f.types).map((t, t_i) => (<Fragment key={t_i}>
                                        <button type="button" onClick={t.pick} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, font: "inherit", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
                                      </Fragment>))}
                                    </div>
                                  </div>
                                </>)}
                                {!!(f.isC) && (<>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>OPTIONS</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {(f.opts).map((o, o_i) => (<Fragment key={o_i}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "32px", padding: "0 4px 0 14px", borderRadius: "16px", background: "#fff", border: "1px solid #E2CFC1", fontSize: "13.5px", fontWeight: "600", whiteSpace: "nowrap" }}>{o.t}<button type="button" onClick={o.rm} title="Remove option" style={{ width: "22px", height: "22px", border: "0", borderRadius: "50%", background: "transparent", color: "#806B60", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h3}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                              <path d="M6 6l12 12M18 6 6 18">
                                              </path>
                                            </svg>
                                          </button></span>
                                      </Fragment>))}
                                    </div>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                      <input value={f.optIn} onChange={f.setOptIn} onKeyDown={f.optKey} placeholder="Add an option" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "#3F2B22", outline: "none", width: "100%", flex: "1", minWidth: "0" }} className={DH.f1} />
                                      <button type="button" onClick={f.addOpt} style={{ height: "40px", padding: "0 14px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Add</button>
                                    </div>
                                  </div>
                                </>)}
                                {!!(f.notC) && (<>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>HINT TEXT</span>
                                    <input value={f.ph} onChange={f.setPh} placeholder="Shown in the empty box, e.g. RM" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #E2CFC1", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "#3F2B22", outline: "none", width: "100%" }} className={DH.f1} />
                                  </label>
                                </>)}
                                {!!(f.reqFree) && (<>
                                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <span style={{ flex: "1", fontSize: "14px" }}>Required</span>
                                    <button type="button" onClick={f.toggleReq} title="Required" style={{ width: "40px", height: "24px", padding: "0", border: "0", borderRadius: "12px", background: f.track, position: "relative", cursor: "pointer" }}>
                                      <span style={{ position: "absolute", top: "3px", left: `${f.knob}px`, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                                      </span>
                                    </button>
                                  </div>
                                </>)}
                                {!!(f.reqLocked) && (<>
                                  <span style={{ fontSize: "12.5px", color: "#806B60" }}>Name is always required</span>
                                </>)}
                              </div>
                            </>)}
                          </div>
                        </Fragment>))}
                      </div>
                      <button type="button" onClick={sec.addField} style={{ alignSelf: "flex-start", height: "32px", padding: "0 4px", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>+ Add field</button>
                    </div>
                  </Fragment>))}
                  <button type="button" onClick={v.frmAddSec} style={{ height: "44px", flex: "0 0 auto", borderRadius: "14px", border: "1.5px dashed #D9C6B8", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h17}>+ Add section</button>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 20px 6px", borderTop: "1px solid #EBDDD2" }}>
                  <button type="button" onClick={v.frmClose} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                  <button type="button" onClick={v.frmSave} style={{ flex: "1.6", height: "44px", borderRadius: "22px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save and update sales app</button>
                </div>
              </aside>
            </>)}
            {!!(v.cltOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cltE.dname}</strong>
                    {!!(v.cltE.hasMode) && (<>
                      <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.cltE.mode}</span>
                    </>)}
                  </span>
                  <button type="button" onClick={v.cltE.del} style={{ height: "34px", padding: "0 12px", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#A3371A", cursor: "pointer" }} className={DH.h20}>Delete</button>
                  <button type="button" onClick={v.cltE.cancel} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <span style={{ fontWeight: "650", color: v.cltE.chFg }}>{v.cltE.channel}</span>
                    <span style={{ color: "#D3C4B8" }}>·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "22px", padding: "0 9px", borderRadius: "11px", background: v.cltE.stBg, color: v.cltE.stFg, fontSize: "12px", fontWeight: "700" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }}>
                      </span>{v.cltE.status}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>TEMPLATE NAME</span>
                    <input value={v.cltE.dn} onChange={v.cltE.setDN} placeholder="e.g. Weekend promo" style={{ height: "44px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #E2CFC1", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>CHANNEL</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "4px", borderRadius: "14px", background: "#F5EBE3" }}>
                      {(v.cltE.chOpts).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.pick} style={{ height: "38px", border: "0", borderRadius: "10px", background: c.bg, boxShadow: c.sh, font: "inherit", fontSize: "14px", fontWeight: c.fw, color: c.fg, cursor: "pointer" }}>{c.label}</button>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>MESSAGE</span>
                    <textarea ref={v.cltTaRef} value={v.cltE.draft} onChange={v.cltE.setDraft} placeholder="Hi {name}, …" rows={6} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid #BD4A19", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14.5px", lineHeight: "1.6", color: "#3F2B22", resize: "vertical", outline: "none" }}>
                    </textarea>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", marginRight: "4px" }}>INSERT</span>
                      {(v.cltE.vars).map((vi, vi_i) => (<Fragment key={vi_i}>
                        <button type="button" onClick={vi.add} style={{ flex: "0 0 auto", whiteSpace: "nowrap", height: "28px", padding: "0 11px", border: "1px solid #F6D9C4", borderRadius: "14px", background: "#fff", color: "#BD4A19", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h29}>+ {vi.label}</button>
                      </Fragment>))}
                      <span style={{ display: "contents" }}>
                        <button type="button" onClick={v.cltE.toggleMore} style={{ flex: "0 0 auto", whiteSpace: "nowrap", height: "28px", padding: "0 11px", border: "1px dashed #D9C6B8", borderRadius: "14px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h30}>Add variable</button>
                      </span>
                    </div>
                    {!!(v.cltE.moreOpen) && (<>
                      <div style={{ width: "100%", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", display: "flex", flexDirection: "column" }}>
                        <span style={{ padding: "8px 10px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>FROM CUSTOMER INFO</span>
                        {(v.cltE.moreOpts).map((m, m_i) => (<Fragment key={m_i}>
                          <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "9px 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                            <span style={{ fontSize: "13.5px", color: "#3F2B22" }}>{m.d}</span>
                            <span style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{m.v}</span>
                          </button>
                        </Fragment>))}
                        {!!(v.cltE.moreNone) && (<>
                          <span style={{ padding: "9px 10px", fontSize: "13px", color: "#806B60" }}>All variables added</span>
                        </>)}
                      </div>
                    </>)}
                    <span style={{ fontSize: "12px", color: "#806B60" }}>Click a variable to insert it at the cursor. You can also type it, e.g. {"{"}name{"}"}.</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>PREVIEW</span>
                    <div style={{ padding: "16px", borderRadius: "14px", background: "#FBF6F2" }}>
                      <div style={{ padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "#fff", border: "1px solid #F1E7DF", fontSize: "14.5px", lineHeight: "1.6", color: "#3F2B22", textWrap: "pretty" }}>
                        {(v.cltE.dsegs).map((g, g_i) => (<Fragment key={g_i}>
                          {!!(g.tag) && (<>
                            <span style={{ padding: "1px 7px", borderRadius: "6px", background: "#FFF0E4", color: "#BD4A19", fontWeight: "650", fontSize: "13.5px" }}>{g.t}</span>
                          </>)}
                          {!!(g.txt) && (<>{g.t}</>)}
                        </Fragment>))}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 20px", borderTop: "1px solid #EBDDD2" }}>
                  <button type="button" onClick={v.cltE.saveDraft} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Save draft</button>
                  <button type="button" onClick={v.cltE.submit} disabled={v.cltE.empty} style={{ flex: "1.4", height: "44px", borderRadius: "22px", border: "0", background: v.cltE.subBg, font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: v.cltE.subCur }}>Submit for review</button>
                </div>
              </aside>
            </>)}
            {!!(v.srOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.srE.name}</strong>
                  </span>
                  <button type="button" onClick={v.srClose} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "4px", borderRadius: "14px", background: "#F5EBE3" }}>
                    {(v.srTabs).map((o, o_i) => (<Fragment key={o_i}>
                      <button type="button" onClick={o.pick} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "38px", border: "0", borderRadius: "11px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "14px", fontWeight: "650", color: o.fg, cursor: "pointer" }}>{o.label}{!!(o.n) && (<>
                          <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: o.nBg, color: o.nFg, fontSize: "11.5px", fontWeight: "700", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{o.n}</span>
                        </>)}</button>
                    </Fragment>))}
                  </div>
                  {!!(v.srTabInfo) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>PHOTO</span>
                        <label style={{ position: "relative", display: "block", height: "170px", borderRadius: "14px", overflow: "hidden", border: `1.5px dashed ${v.srE.photoBd}`, background: "#FBF6F2", cursor: "pointer" }}>
                          {!!(v.srE.photo) && (<>
                            <img src={v.srE.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            <span style={{ position: "absolute", right: "10px", bottom: "10px", height: "30px", padding: "0 12px", borderRadius: "15px", background: "rgba(63,43,34,.78)", color: "#fff", fontSize: "12.5px", fontWeight: "650", display: "inline-flex", alignItems: "center" }}>Change photo</span>
                          </>)}
                          {!!(v.srE.noPhoto) && (<>
                            <span style={{ position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", color: "#806B60" }}>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5L5 19">
                                </path>
                              </svg>
                              <b style={{ fontSize: "14px", fontWeight: "650", color: "#3F2B22" }}>Add a photo</b>
                              <span style={{ fontSize: "12px" }}>Shown to customers when they book · JPG or PNG</span>
                            </span>
                          </>)}
                          <input type="file" accept="image/*" onChange={v.srSetPhoto} style={{ position: "absolute", inset: "0", opacity: "0", cursor: "pointer" }} />
                        </label>
                        {!!(v.srE.photo) && (<>
                          <button type="button" onClick={v.srRemovePhoto} style={{ alignSelf: "flex-start", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#A3371A", cursor: "pointer" }}>Remove photo</button>
                        </>)}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>NAME</span>
                        <input type="text" value={v.srE.dispName} onChange={v.srSetName} placeholder="e.g. Puchong Showroom" style={{ width: "100%", boxSizing: "border-box", height: "44px", padding: "0 14px", border: "1.5px solid #E8DBD0", borderRadius: "12px", font: "inherit", fontSize: "14.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z">
                            </path>
                          </svg>ADDRESS</span>
                        <input type="text" value={v.srE.addr} onChange={v.srSetAddr} placeholder="Street, area, city" style={{ width: "100%", boxSizing: "border-box", height: "44px", padding: "0 14px", border: "1.5px solid #E8DBD0", borderRadius: "12px", font: "inherit", fontSize: "14.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "14px", background: "#FBF6F2" }}>
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z">
                              </path>
                            </svg>BOOKING LIMIT</span>
                        </span>
                        <button type="button" onClick={v.srLimDown} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "18px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>−</button>
                        <b style={{ minWidth: "24px", textAlign: "center", fontSize: "17px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.srE.limit}</b>
                        <button type="button" onClick={v.srLimUp} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "18px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>+</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "#FBF6F2" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ flex: "1", fontSize: "13.5px", fontWeight: "700" }}>Directions</b>
                          <span style={{ display: "inline-flex", padding: "3px", borderRadius: "10px", background: "#EFE3D9" }}>
                            {(v.srLinkModes).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ height: "26px", padding: "0 10px", border: "0", borderRadius: "7px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "12px", fontWeight: "650", color: o.fg, cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                            </Fragment>))}
                          </span>
                        </span>
                        {!!(v.srE.manual) && (<>
                          {(v.srE.linkFields).map((lf, lf_i) => (<Fragment key={lf_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ flex: "0 0 22px", width: "22px", height: "22px", borderRadius: "6px", background: lf.bg, color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>{lf.ch}</span>
                              <input type="text" value={lf.v} onChange={lf.set} placeholder={lf.ph} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 12px", boxSizing: "border-box", border: "1.5px solid #E8DBD0", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} className={DH.f1} />
                            </div>
                          </Fragment>))}
                          <span style={{ fontSize: "12px", color: "#806B60" }}>Paste the share link from Google Maps or Waze. Empty fields fall back to the address.</span>
                        </>)}
                        {!!(v.srE.showAuto) && (<>
                          <a href={v.srE.gmapUrl} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid #EBDDD2", textDecoration: "none", color: "#3F2B22" }} className={DH.h12}>
                            <span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#34A853", color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>G</span>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                              <b style={{ fontSize: "13.5px", fontWeight: "650" }}>Google Maps</b>
                              <span style={{ fontSize: "11.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.srE.gmapUrl}</span>
                            </span>
                            <span style={{ fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}>Test</span>
                          </a>
                          <a href={v.srE.wazeUrl} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid #EBDDD2", textDecoration: "none", color: "#3F2B22" }} className={DH.h12}>
                            <span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#33CCFF", color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>W</span>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                              <b style={{ fontSize: "13.5px", fontWeight: "650" }}>Waze</b>
                              <span style={{ fontSize: "11.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.srE.wazeUrl}</span>
                            </span>
                            <span style={{ fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}>Test</span>
                          </a>
                        </>)}
                        {!!(v.srE.showNoAddr) && (<>
                          <span style={{ fontSize: "13px", color: "#A08E82" }}>Add an address above to create the links</span>
                        </>)}
                      </div>
                    </div>
                  </>)}
                  {!!(v.srTabSlots) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2">
                            </path>
                          </svg>OPEN SLOTS</span>
                        <span style={{ flex: "1" }}>
                        </span>
                        <button type="button" onClick={v.srAll} style={{ border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>{v.srE.allLabel}</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "72px repeat(7, minmax(0, 1fr)) 26px", gap: "6px", alignItems: "center" }}>
                        <span>
                        </span>
                        {(v.srDays).map((d, d_i) => (<Fragment key={d_i}>
                          <span style={{ textAlign: "center", fontSize: "11.5px", fontWeight: "700", color: "#806B60" }}>{d.l}</span>
                        </Fragment>))}
                        <span>
                        </span>
                        {(v.srE.slots).map((sl, sl_i) => (<Fragment key={sl_i}>
                          <span style={{ fontSize: "13px", fontWeight: "650", color: "#4E2F20", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{sl.time}</span>
                          {(sl.cells).map((c, c_i) => (<Fragment key={c_i}>
                            <button type="button" onClick={c.toggle} style={{ height: "34px", borderRadius: "9px", border: `1px solid ${c.bd}`, background: c.bg, display: "grid", placeItems: "center", cursor: "pointer", padding: "0" }}>
                              {!!(c.on) && (<>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-10">
                                  </path>
                                </svg>
                              </>)}
                            </button>
                          </Fragment>))}
                          <button type="button" onClick={sl.remove} title="Remove this time" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "0", background: "transparent", color: "#A3371A", display: "grid", placeItems: "center", cursor: "pointer", padding: "0" }} className={DH.h14}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12">
                              </path>
                            </svg>
                          </button>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", background: "#FBF6F2" }}>
                        <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Add a time</b>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
                          {(v.srNewDays).map((d, d_i) => (<Fragment key={d_i}>
                            <button type="button" onClick={d.toggle} style={{ height: "34px", padding: "0", borderRadius: "10px", border: `1.5px solid ${d.bd}`, background: d.bg, font: "inherit", fontSize: "13px", fontWeight: "650", color: d.fg, cursor: "pointer" }}>{d.l}</button>
                          </Fragment>))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <select value={v.srNewT} onChange={v.srSetNewT} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid #E8DBD0", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "#3F2B22" }}>
                            {(v.srNewOpts).map((h, h_i) => (<Fragment key={h_i}>
                              <option value={h.v}>{h.v}</option>
                            </Fragment>))}
                          </select>
                          <button type="button" onClick={v.srAddTime} disabled={v.srNoNewT} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "40px", padding: "0 16px", borderRadius: "20px", border: "0", background: v.srAddTBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>Add time</button>
                        </div>
                        <span style={{ fontSize: "12px", color: "#A3371A" }}>{v.srNewHint}</span>
                      </div>
                    </div>
                  </>)}
                  {!!(v.srTabBlk) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <strong style={{ fontSize: "16px", fontWeight: "700" }}>Blocked time slots</strong>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "16px", background: "#FBF6F2" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <b style={{ fontSize: "14.5px", fontWeight: "700" }}>Every week</b>
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
                          {(v.srBlkDays).map((d, d_i) => (<Fragment key={d_i}>
                            <button type="button" onClick={d.toggle} style={{ height: "38px", padding: "0", borderRadius: "12px", border: `1.5px solid ${d.bd}`, background: d.bg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: d.fg, cursor: "pointer" }}>{d.l}</button>
                          </Fragment>))}
                        </div>
                        <span style={{ fontSize: "12.5px", color: v.srWkFg }}>{v.srWkNote}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "16px", background: "#FBF6F2" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <b style={{ fontSize: "14.5px", fontWeight: "700" }}>Dates</b>
                        </span>
                        <div style={{ height: "1px", background: "#EFE3D9" }}>
                        </div>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Which dates</b>
                        </span>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button type="button" onClick={v.srCalFrom} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "10px", height: "50px", padding: "0 14px", boxSizing: "border-box", border: `1.5px solid ${v.srBlk.fromBd}`, borderRadius: "14px", background: "#fff", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                              </path>
                            </svg>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#806B60" }}>From</span>
                              <b style={{ fontSize: "14.5px", fontWeight: "650", color: v.srBlk.fromFg }}>{v.srBlk.fromTxt}</b>
                            </span>
                          </button>
                          <button type="button" onClick={v.srCalTo} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "10px", height: "50px", padding: "0 14px", boxSizing: "border-box", border: `1.5px solid ${v.srBlk.toBd}`, borderRadius: "14px", background: "#fff", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                              </path>
                            </svg>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#806B60" }}>To</span>
                              <b style={{ fontSize: "14.5px", fontWeight: "650", color: v.srBlk.toFg }}>{v.srBlk.toTxt}</b>
                            </span>
                          </button>
                        </div>
                        {!!(v.srCalOpen) && (<>
                          <div style={{ padding: "12px", borderRadius: "14px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <button type="button" onClick={v.srCalPrev} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", textAlign: "center", fontSize: "14px", fontWeight: "700" }}>{v.srCalLabel}</strong>
                              <button type="button" onClick={v.srCalNext} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m9 6 6 6-6 6">
                                  </path>
                                </svg>
                              </button>
                            </div>
                            <span style={{ textAlign: "center", fontSize: "12px", fontWeight: "600", color: "#BD4A19" }}>{v.srCalHint}</span>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                              {(v.srCalDow).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ height: "24px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", color: "#A08E82" }}>{d.l}</span>
                              </Fragment>))}
                              {(v.srCalCells).map((c, c_i) => (<Fragment key={c_i}>
                                <button type="button" onClick={c.pick} disabled={c.dis} style={{ height: "34px", border: "0", padding: "0", background: c.band, borderRadius: c.br, font: "inherit", cursor: c.cur, display: "grid", placeItems: "center" }}>
                                  <span style={{ width: "30px", height: "30px", borderRadius: "50%", background: c.dot, color: c.fg, border: c.ring, boxSizing: "border-box", fontSize: "13px", fontWeight: c.w, display: "grid", placeItems: "center" }}>{c.n}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </div>
                        </>)}
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ fontSize: "13.5px", fontWeight: "700" }}>What time</b>
                        </span>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "3px", borderRadius: "12px", background: "#EFE3D9" }}>
                          {(v.srTimeModes).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ height: "36px", border: "0", borderRadius: "9px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: o.fg, cursor: "pointer" }}>{o.label}</button>
                          </Fragment>))}
                        </div>
                        {!!(v.srPickTime) && (<>
                          {(v.srRanges).map((r, r_i) => (<Fragment key={r_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <select value={r.f} onChange={r.setF} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid #E8DBD0", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "#3F2B22" }}>
                                {(r.fromHours).map((h, h_i) => (<Fragment key={h_i}>
                                  <option value={h.v}>{h.v}</option>
                                </Fragment>))}
                              </select>
                              <span style={{ color: "#806B60" }}>–</span>
                              <select value={r.t} onChange={r.setT} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid #E8DBD0", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "#3F2B22" }}>
                                {(r.toHours).map((h, h_i) => (<Fragment key={h_i}>
                                  <option value={h.v}>{h.v}</option>
                                </Fragment>))}
                              </select>
                              <button type="button" onClick={r.remove} title="Remove time" style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", border: "0", background: "transparent", color: "#A3371A", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h14}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 6 6 18M6 6l12 12">
                                  </path>
                                </svg>
                              </button>
                            </div>
                          </Fragment>))}
                          <button type="button" onClick={v.srAddRange} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px dashed #D9B79F", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>Add another time</button>
                        </>)}
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Reason</b>
                          <span style={{ fontSize: "12.5px", color: "#A08E82" }}>· optional</span>
                        </span>
                        <input type="text" value={v.srBlk.reason} onChange={v.srBlkReason} placeholder="e.g. Staff training" style={{ height: "44px", padding: "0 14px", boxSizing: "border-box", border: "1.5px solid #E8DBD0", borderRadius: "14px", background: "#fff", font: "inherit", fontSize: "14.5px", color: "#3F2B22", outline: "none" }} />
                        <div style={{ height: "1px", background: "#EFE3D9" }}>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                          <span style={{ flex: "1", fontSize: "12.5px", color: v.srDtHintFg }}>{v.srDtHint}</span>
                          <button type="button" onClick={v.srDtAdd} disabled={v.srDtNoAdd} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "40px", padding: "0 18px", borderRadius: "20px", border: "0", background: v.srDtAddBg, font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: v.srDtCur, whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>Add to blocked</button>
                        </div>
                      </div>
                      {!!(v.srHasBlocks) && (<>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#A08E82" }}>BLOCKED DATES</span>
                      </>)}
                      {(v.srE.blocks).map((k, k_i) => (<Fragment key={k_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#fff" }}>
                          <span style={{ flex: "0 0 auto", height: "22px", padding: "0 8px", borderRadius: "11px", background: k.tagBg, color: k.tagFg, fontSize: "11px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{k.tag}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <b style={{ fontSize: "13.5px", fontWeight: "650" }}>{k.when}</b>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{k.sub}</span>
                          </span>
                          <button type="button" onClick={k.remove} title="Remove" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "0", background: "transparent", color: "#A3371A", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h14}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12">
                              </path>
                            </svg>
                          </button>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "10px", padding: "14px 20px 16px", borderTop: "1px solid #EBDDD2" }}>
                  <button type="button" onClick={v.srApplyAll} style={{ height: "42px", borderRadius: "21px", border: "1.5px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h8}>Save and apply to all {v.srN} showrooms</button>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={v.srClose} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                    <button type="button" onClick={v.srSave} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                </div>
              </aside>
            </>)}
            {!!(v.ftNone) && (<>
              <aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center", padding: "24px" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>Pick a team</strong>
                <span style={{ maxWidth: "260px", fontSize: "13px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>Set which full-time people get leads on which days</span>
              </aside>
            </>)}
            {!!(v.ftOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: v.ftE.color }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ftE.name}</strong>
                    <span style={{ fontSize: "12px", color: "#806B60" }}>Full time lead allocation</span>
                  </span>
                  <button type="button" onClick={v.closeFt} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid #EBDDD2" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>FULL TIME ALLOCATION</span>
                    <div style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                      {(v.ftModes).map((o, o_i) => (<Fragment key={o_i}>
                        {!!(o.on) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", border: "0", height: "34px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.bg }}>
                            </span>{o.label}</button>
                        </>)}
                        {!!(o.off) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", border: "0", height: "34px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "13.5px", fontWeight: "550", cursor: "pointer" }} className={DH.h2}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#C9B8AB" }}>
                            </span>{o.label}</button>
                        </>)}
                      </Fragment>))}
                    </div>
                    {!!(v.ftOff) && (<>
                      <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>New leads for this team follow <b style={{ color: "#3F2B22", fontWeight: "650" }}>Ads to teams</b>. Turn on to give full-time people the leads on the days you tick.</span>
                    </>)}
                  </div>
                  {!!(v.ftOn) && (<>
                    <div style={{ display: "flex", flexDirection: "column", padding: "18px 0", borderBottom: "1px solid #EBDDD2" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", flex: "1" }}>WHO WORKS WHICH DAY</span>
                        <button type="button" onClick={v.ftAllToggle} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h25}>{v.ftAllLabel}</button>
                      </div>
                      {(v.ftE.people).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderTop: "1px solid #F1E7DF" }}>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                            <button type="button" onClick={p.all} style={{ alignSelf: "flex-start", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "12px", color: "#806B60", cursor: "pointer" }} className={DH.h2}>{p.allLabel}</button>
                          </span>
                          <span style={{ display: "flex", gap: "4px" }}>
                            {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                              <button type="button" onClick={d.toggle} style={{ width: "28px", height: "28px", border: "0", borderRadius: "50%", background: d.bg, color: d.fg, font: "inherit", fontSize: "11.5px", fontWeight: "700", cursor: "pointer" }}>{d.l}</button>
                            </Fragment>))}
                          </span>
                        </div>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", padding: "18px 0 0" }}>
                      <span style={{ paddingBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>WHO GETS EACH DAY</span>
                      </span>
                      {(v.ftE.summary).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", gap: "12px", padding: "7px 0", borderTop: "1px solid #F5EEE8", fontSize: "13px" }}>
                          <b style={{ flex: "0 0 36px", fontWeight: "650" }}>{r.day}</b>
                          <span style={{ flex: "1", color: r.fg }}>{r.who}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 20px", borderTop: "1px solid #EBDDD2" }}>
                  <label title={v.ftApplyTip} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: v.ftApplyFg, cursor: v.ftApplyCur }}>
                    <input type="checkbox" checked={v.ftApplyOn} disabled={v.ftApplyDis} onChange={v.toggleFtApplyChk} style={{ flex: "0 0 16px", width: "16px", height: "16px", margin: "1px 0 0", accentColor: "#BD4A19" }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span>Also apply to all 3 teams</span>
                      {!!(v.ftApplyDis) && (<>
                        <span style={{ fontSize: "12px", color: "#A08E82" }}>Only when everyone here works the same days</span>
                      </>)}
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={v.closeFt} style={{ flex: "0 0 auto", height: "40px", padding: "0 20px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }} className={DH.h8}>Cancel</button>
                    <button type="button" onClick={v.ftSaveOrApply} style={{ flex: "1", height: "40px", borderRadius: "20px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                </div>
              </aside>
            </>)}
            {!!(v.sendOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>Send {v.sendName} to</strong>
                    <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.sendMeta}</span>
                  </span>
                  <button type="button" onClick={v.closeSend} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                  {(v.sendGroups).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 20px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "#806B60" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                      </span>{g.label}</div>
                    {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                      <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 20px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                        <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: m.bg, color: m.fg, fontSize: "11.5px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{m.sub}</span>
                        </span>
                        <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: "1px solid #BD4A19", color: "#BD4A19", fontSize: "12.5px", fontWeight: "650" }}>Send</span>
                      </button>
                    </Fragment>))}
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.awOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 16px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: "#E4EDF8", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.aw.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.aw.name}</strong>
                    <span style={{ fontSize: "12.5px", color: "#387557", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.aw.ad}</span>
                  </span>
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <button type="button" onClick={v.awMenuToggle} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", boxSizing: "border-box", cursor: "pointer" }} className={DH.h8}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="#3F2B22">
                        <circle cx="12" cy="5" r="1.8">
                        </circle>
                        <circle cx="12" cy="12" r="1.8">
                        </circle>
                        <circle cx="12" cy="19" r="1.8">
                        </circle>
                      </svg>
                    </button>
                    {!!(v.awMenu) && (<>
                      <div onClick={v.awMenuToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "40px", right: "0", zIndex: "8", minWidth: "250px", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", boxShadow: "0 10px 30px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <button type="button" onClick={v.awAssign} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "#3F2B22", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "#E4EDF8", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2F6FB5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 4l3 3-3 3M4 7h16M7 20l-3-3 3-3M20 17H4">
                              </path>
                            </svg>
                          </span>Assign to</button>
                        {!!(v.aw.notReminded) && (<>
                          <button type="button" onClick={v.awRemind} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "#3F2B22", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "#FFF0CC", display: "grid", placeItems: "center" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A46312" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                                </path>
                              </svg>
                            </span>Send reminder</button>
                        </>)}
                        {!!(v.aw.reminded) && (<>
                          <span style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", fontSize: "16px", fontWeight: "700", color: "#387557", whiteSpace: "nowrap" }}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "#E8F3ED", display: "grid", placeItems: "center" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#387557" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </span>Reminder sent</span>
                        </>)}
                        <button type="button" onClick={v.awInfo} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "#3F2B22", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "#E8F3ED", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#387557" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0">
                              </path>
                            </svg>
                          </span>Customer info</button>
                        <button type="button" onClick={v.awBook} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "#3F2B22", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "#F3E8EF", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8E4B6E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                              </path>
                            </svg>
                          </span>Appointment</button>
                      </div>
                    </>)}
                  </span>
                  <button type="button" onClick={v.closeAw} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <p style={{ flex: "0 0 auto", margin: "0", padding: "8px 20px", fontSize: "12px", color: "#806B60", background: "#fff" }}>{v.aw.owner}</p>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "10px 20px", backgroundColor: "#EFE7DE", backgroundImage: "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22240%22%20viewBox%3D%220%200%20240%20240%22%20xmlns%3Ac2pa%3D%22http%3A%2F%2Fc2pa.org%2Fmanifest%22%3E%3Cmetadata%3E%3Cc2pa%3Amanifest%3EAAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTo5ZWFmOWIzOC1kNTkzLTQyOWQtOTkyNi1hNjdmZWE4ZjVmNDcAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaC5n%2B3GamVtjP1Nu48g4xPcAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDo2ZTVkNDFiZi02MmFhLTQyMDctOWI3Mi01ZjZlODE4OGIzYjdscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoHNx5AoLe0IwABjDTTKVPyAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggmA28hKHq5ZZucVKZm8w1CnHJ%2BNSw7C98gSiG8i6awQGkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaI6watomDKJihMTdVS%2BG5MAAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCAn2KA2qq3Hfr2%2BBiY8Sgy%2BQNuiXnmF5YsIFByFf8DaeWRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBiWZmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjllYWY5YjM4LWQ1OTMtNDI5ZC05OTI2LWE2N2ZlYThmNWY0Ny9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjAyMjQ4MDljLWI2YmQtNDRkMi05YjhiLTA5YTExMzYyNDFmN3JjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCYDbyEoerllm5xUpmbzDUKccn41LDsL3yBKIbyLprBAaJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFgguHSE7PUzPOmyhR0uRwsvmsJwFG3dCIkkvUEl71ykvnKiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFgg3VBiBu4TxTGlGeik8yy6aCcS6ZdyaPY0DKPa0IOmJNp0Y2xhaW1fZ2VuZXJhdG9yX2luZm%2BjZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g%2FoGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd%2F3cyjxFA3Qo5S46fX0%2FihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB%2FwQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB%2FwQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj%2BOPEz5o%2BnMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn%2FaArXyTwFAZfKrPzxF2vPoJNf1%2BUCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9%2B1rdDwSPLMOPOjKuiXjoU%2FpUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQINdsvbpy3jWu6IJsli1FAPfajxZrqIIYnIGv53ID%2Fk3teatYqNqVpsUQKnGE80cQQdlE1awJpC%2FV%2ByuaFcAZpo%3D%3C%2Fc2pa%3Amanifest%3E%3C%2Fmetadata%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%237A6457%22%20stroke-opacity%3D%22.13%22%20stroke-width%3D%221.3%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20transform%3D%22translate(14%2012)%20rotate(-12%2012%2012)%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(92%208)%20rotate(10%2012%2012)%22%20d%3D%22M20%209V6a2%202%200%200%200-2-2H6a2%202%200%200%200-2%202v3M2%2016a2%202%200%200%200%202%202h16a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v1.5a.5.5%200%200%201-.5.5h-11a.5.5%200%200%201-.5-.5V11a2%202%200%200%200-4%200zM4%2018v2M20%2018v2M12%204v9%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(176%2020)%20rotate(-6%2012%2012)%22%20d%3D%22M2%204v16M2%208h18a2%202%200%200%201%202%202v10M2%2017h20M6%208v9%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(40%2074)%20rotate(8%2012%2012)%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(124%2066)%20rotate(-14%2012%2012)%22%20d%3D%22M8%202h8l4%2010H4L8%202ZM12%2012v6M8%2022v-2c0-1.1.9-2%202-2h4a2%202%200%200%201%202%202v2H8Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(200%2092)%20rotate(12%2012%2012)%22%20d%3D%22M19%2014c1.49-1.46%203-3.21%203-5.5A5.5%205.5%200%200%200%2016.5%203c-1.76%200-3%20.5-4.5%202-1.5-1.5-2.74-2-4.5-2A5.5%205.5%200%200%200%202%208.5c0%202.3%201.5%204.05%203%205.5l7%207Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(10%20140)%20rotate(6%2012%2012)%22%20d%3D%22M12%202l3.09%206.26L22%209.27l-5%204.87%201.18%206.88L12%2017.77l-6.18%203.25L7%2014.14%202%209.27l6.91-1.01L12%202z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(78%20128)%20rotate(-8%2012%2012)%22%20d%3D%22M8%202v4M16%202v4M3%2010h18M5%204h14a2%202%200%200%201%202%202v14a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2V6a2%202%200%200%201%202-2Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(160%20150)%20rotate(14%2012%2012)%22%20d%3D%22M19%209V6a2%202%200%200%200-2-2H7a2%202%200%200%200-2%202v3M3%2016a2%202%200%200%200%202%202h14a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v2H7v-2a2%202%200%200%200-4%200ZM5%2018v2M19%2018v2%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(34%20200)%20rotate(-10%2012%2012)%22%20d%3D%22M22%2016.92v3a2%202%200%200%201-2.18%202%2019.79%2019.79%200%200%201-8.63-3.07%2019.5%2019.5%200%200%201-6-6%2019.79%2019.79%200%200%201-3.07-8.67A2%202%200%200%201%204.11%202h3a2%202%200%200%201%202%201.72%2012.84%2012.84%200%200%200%20.7%202.81%202%202%200%200%201-.45%202.11L8.09%209.91a16%2016%200%200%200%206%206l1.27-1.27a2%202%200%200%201%202.11-.45%2012.84%2012.84%200%200%200%202.81.7A2%202%200%200%201%2022%2016.92z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(118%20196)%20rotate(4%2012%2012)%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(196%20206)%20rotate(-12%2012%2012)%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20fill%3D%22%237A6457%22%20fill-opacity%3D%22.12%22%3E%3Ccircle%20cx%3D%2266%22%20cy%3D%2240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%2240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22104%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22230%22%20cy%3D%2260%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%22170%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22140%22%20cy%3D%22120%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22224%22%20cy%3D%22160%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%22230%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%22240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%22100%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3C%2Fg%3E%3C%2Fsvg%3E')", backgroundSize: "240px 240px" }}>
                  <span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#fff", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{v.aw.time}</span>
                  {!!(v.aw.inn) && (<>
                    <div style={{ alignSelf: "flex-start", maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: "16px 16px 16px 4px", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", background: "#fff", color: "#3F2B22" }}>
                      <p style={{ margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{v.aw.msg}</p>
                      <span style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px", fontSize: "11px", color: "#806B60" }}>{v.aw.clock}</span>
                    </div>
                  </>)}
                  {!!(v.aw.out) && (<>
                    <div style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: "16px 16px 4px 16px", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", background: "#F9D5B8", color: "#3F2B22" }}>
                      <p style={{ margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{v.aw.msg}</p>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "4px", fontSize: "11px", color: "#806B60" }}>{v.aw.clock}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B8FD9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5">
                          </path>
                        </svg></span>
                    </div>
                  </>)}
                  {!!(v.aw.reminded) && (<>
                    <span style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", maxWidth: "86%", margin: "4px 0", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "#6B645A", fontSize: "12px", fontWeight: "600", textAlign: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                        </path>
                      </svg>{v.aw.remindLog}</span>
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", padding: "12px 16px", borderTop: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span title="Send a file" style={{ flex: "0 0 auto", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 6px 0 16px", borderRadius: "22px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "#757575", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.aw.reply}</span>
                    <span style={{ flex: "0 0 auto", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">
                        </path>
                      </svg>
                    </span>
                  </span>
                  <span title="Send a photo" style={{ flex: "0 0 auto", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z">
                      </path>
                    </svg>
                  </span>
                  <span title="Voice note" style={{ flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "50%", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Zm7 9a7 7 0 0 1-14 0m7 7v3">
                      </path>
                    </svg>
                  </span>
                </div>
              </aside>
            </>)}
          </>)}
          {!!(v.isWide) && (<>
            <div style={{ flex: "0 0 380px", boxSizing: "border-box", borderRight: "1px solid #EBDDD2", padding: "8px 16px", display: "flex", flexDirection: "column", overflow: "auto", background: "#fff" }}>
              {(v.listCards).map((c, c_i) => (<Fragment key={c_i}>
                <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 10px", border: "0", borderBottom: "1px solid #F1E7DF", borderRadius: "0", background: c.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                  <span style={{ flex: "0 0 44px", width: "44px", height: "44px", borderRadius: "50%", background: c.bg, display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={c.d}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", letterSpacing: "-.01em", color: c.titleColor }}>{c.title}</strong>
                    <span style={{ fontSize: "12.5px", color: "#806B60" }}>{c.sub}</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </button>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.isCenter) && (<>
            <div style={{ flex: "1", minWidth: "0", overflow: "auto", padding: "32px 40px", display: "flex", justifyContent: "center", background: "#fff" }}>
              <div style={{ width: "100%", maxWidth: "1080px", display: "flex", flexDirection: "column" }}>
                {(v.listCards).map((c, c_i) => (<Fragment key={c_i}>
                  <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "22px", padding: "22px 8px", border: "0", borderBottom: "1px solid #F1E7DF", borderRadius: "0", background: c.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                    <span style={{ flex: "0 0 78px", width: "78px", height: "78px", borderRadius: "50%", background: c.bg, display: "grid", placeItems: "center" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d={c.d}>
                        </path>
                      </svg>
                    </span>
                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <strong style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.01em", color: c.titleColor }}>{c.title}</strong>
                      <span style={{ fontSize: "17px", color: "#806B60" }}>{c.sub}</span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </button>
                </Fragment>))}
              </div>
            </div>
          </>)}
          {!!(v.notWide) && (<>
            <div style={{ flex: "1", minWidth: "0", boxSizing: "border-box", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "14px", overflow: "auto" }}>
              {!!(v.kList) && (<>
                {!!(v.showWho) && (<>
                  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ position: "relative", flex: "0 0 auto" }}>
                      <button type="button" onClick={v.toggleWho} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px 0 6px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ display: "flex", paddingLeft: "5px" }}>
                          {(v.whoAvs).map((vi, vi_i) => (<Fragment key={vi_i}>
                            <span style={{ width: "24px", height: "24px", marginLeft: "-5px", borderRadius: "50%", border: "2px solid #fff", boxSizing: "border-box", background: vi.bg, color: vi.fg, fontSize: "9.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{vi.ini}</span>
                          </Fragment>))}
                        </span>{v.whoLabel} <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></button>
                      {!!(v.whoOpen) && (<>
                        <div onClick={v.toggleWho} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                        </div>
                        <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "290px", maxHeight: "460px", overflow: "auto", padding: "8px", gap: "2px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column" }}>
                          <span style={{ padding: "6px 10px 8px", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>Show the inbox of · pick one or more</span>
                          {(v.whoOpts).map((w, w_i) => (<Fragment key={w_i}>
                            {!!(w.head) && (<>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 4px 0", padding: "10px 6px 4px", borderTop: "1px solid #F1E7DF", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", color: "#806B60" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }}>
                                </span>{w.label}</div>
                            </>)}
                            {!!(w.sel) && (<>
                              <button type="button" onClick={w.pick} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "40px", padding: "6px 10px", border: "0", borderRadius: "10px", background: "#FFF1E6", font: "inherit", color: "#BD4A19", cursor: "pointer", textAlign: "left" }} className={DH.h11}>
                                {!!(w.isGroup) && (<>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", display: "grid", placeItems: "center" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: w.color }}>
                                    </span>
                                  </span>
                                </>)}
                                {!!(w.isPerson) && (<>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "50%", background: w.avBg, color: w.avFg, fontSize: "10px", fontWeight: "650", display: "grid", placeItems: "center" }}>{w.ini}</span>
                                </>)}
                                <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.label}</span>
                                <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: "1.5px solid #BD4A19", background: "#BD4A19", display: "grid", placeItems: "center" }}>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m5 12 5 5 9-10">
                                    </path>
                                  </svg>
                                </span>
                                {!!(w.hasN) && (<>
                                  <span style={{ minWidth: "22px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{w.n}</span>
                                </>)}
                                {!!(w.noN) && (<>
                                  <span style={{ minWidth: "22px", textAlign: "center", fontSize: "12px", color: "#C9B8AC", fontVariantNumeric: "tabular-nums" }}>0</span>
                                </>)}
                              </button>
                            </>)}
                            {!!(w.unsel) && (<>
                              <button type="button" onClick={w.pick} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "40px", padding: "6px 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", color: "#3F2B22", cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                                {!!(w.isGroup) && (<>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", display: "grid", placeItems: "center" }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: w.color }}>
                                    </span>
                                  </span>
                                </>)}
                                {!!(w.isPerson) && (<>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "50%", background: w.avBg, color: w.avFg, fontSize: "10px", fontWeight: "650", display: "grid", placeItems: "center" }}>{w.ini}</span>
                                </>)}
                                <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "550", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.label}</span>
                                <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: "1.5px solid #CDBCAE", background: "#fff", display: "grid", placeItems: "center" }}>
                                </span>
                                {!!(w.hasN) && (<>
                                  <span style={{ minWidth: "22px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", background: "#F5EBE3", color: "#4E2F20", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{w.n}</span>
                                </>)}
                                {!!(w.noN) && (<>
                                  <span style={{ minWidth: "22px", textAlign: "center", fontSize: "12px", color: "#C9B8AC", fontVariantNumeric: "tabular-nums" }}>0</span>
                                </>)}
                              </button>
                            </>)}
                          </Fragment>))}
                          <div style={{ position: "sticky", bottom: "-8px", display: "flex", gap: "8px", margin: "6px -8px -8px", padding: "10px", background: "#fff", borderTop: "1px solid #F1E7DF" }}>
                            <button type="button" onClick={v.whoClear} style={{ flex: "1", height: "36px", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Clear</button>
                            <button type="button" onClick={v.toggleWho} style={{ flex: "1", height: "36px", borderRadius: "18px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Done</button>
                          </div>
                        </div>
                      </>)}
                    </span>
                    {(v.whoChips).map((p, p_i) => (<Fragment key={p_i}>
                      <span style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 4px 0 4px", boxSizing: "border-box", borderRadius: "15px", background: p.tint, color: p.ink, fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap" }}><span style={{ width: "22px", height: "22px", borderRadius: "50%", background: p.bg, color: p.fg, fontSize: "9.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{p.ini}</span>{p.label}<button type="button" onClick={p.remove} title="Remove" style={{ width: "22px", height: "22px", border: "0", borderRadius: "50%", background: "transparent", color: "inherit", display: "grid", placeItems: "center", cursor: "pointer", padding: "0" }} className={DH.h31}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12">
                            </path>
                          </svg>
                        </button></span>
                    </Fragment>))}
                    <span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap" }}>{v.whoCount}</span>
                  </div>
                </>)}
                {!!(v.isAction) && (<>
                  <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "3px", padding: "2px 2px 0" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>Organic leads to assign · {v.actN}</strong>
                  </div>
                </>)}
                {!!(v.notAction) && (<>
                  <div style={{ flex: "0 0 auto", display: "flex", gap: "6px", flexWrap: "nowrap", alignItems: "center", minWidth: "0" }}>
                    <div style={{ flex: "1", minWidth: "0", display: "flex", gap: "6px", flexWrap: "nowrap", overflowX: "auto", scrollbarWidth: "none", padding: "2px 24px 2px 0", WebkitMaskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)", maskImage: "linear-gradient(to right, #000 calc(100% - 28px), transparent)" }}>
                      {(v.filters).map((f, f_i) => (<Fragment key={f_i}>
                        <span onClick={f.pick} style={{ cursor: "pointer",  flex: "0 0 auto", height: "32px", lineHeight: "30px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${f.bd}`, background: f.bg, color: f.fg, fontSize: "12.5px", fontWeight: "650", whiteSpace: "nowrap" }}>{f.label}</span>
                      </Fragment>))}
                    </div>
                  </div>
                </>)}
                {!!(v.actEmpty) && (<>
                  <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", textAlign: "center", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                    <span style={{ width: "44px", height: "44px", borderRadius: "50%", background: "#E8F3ED", color: "#387557", display: "grid", placeItems: "center" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5 9-10">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>All organic leads sent</strong>
                    <span style={{ fontSize: "13px", color: "#806B60" }}>New ones land here.</span>
                  </div>
                </>)}
                <div style={{ display: "flex", flexDirection: "column", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.chats).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: c.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                      <span style={{ flex: "0 0 38px", width: "38px", height: "38px", borderRadius: "50%", background: c.avBg, color: "#3F2B22", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{c.ini}</span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650", whiteSpace: "nowrap" }}>{c.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "#387557", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.ad}</span>
                          <span style={{ flex: "1" }}>
                          </span>
                          {!!(c.muted) && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A8968B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", alignSelf: "center" }}><path d="M13.7 21a2 2 0 0 1-3.4 0M18.6 13A17.9 17.9 0 0 1 18 8M6.3 6.3A5.9 5.9 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.3-5M2 2l20 20"></path></svg>)}{!!(c.pinned) && (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#A8968B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", alignSelf: "center" }}><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z"></path></svg>)}<small style={{ fontSize: "12px", color: c.timeFg, fontWeight: c.timeW, whiteSpace: "nowrap" }}>{c.time}</small>
                        </span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: "0" }}><span style={{ flex: "1", minWidth: "0", fontSize: "13.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.msg}</span>{!!(c.unreadN) && (<span style={{ flex: "0 0 auto", minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", display: "inline-grid", placeItems: "center" }}>{c.unreadN}</span>)}{!!(c.unreadDot) && (<span style={{ flex: "0 0 auto", width: "10px", height: "10px", borderRadius: "50%", background: "#BD4A19" }}></span>)}</span>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "3px" }}>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{c.owner}</span>
                          <span style={{ height: "20px", lineHeight: "20px", padding: "0 8px", borderRadius: "10px", background: c.stBg, color: c.stFg, fontSize: "11.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{c.status}</span>
                          {!!(c.canSend) && (<>
                            <span style={{ flex: "1" }}>
                            </span>
                            <span role="button" onClick={c.send} style={{ flex: "0 0 auto", height: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "14px", border: "1px solid #BD4A19", background: c.sendBg, color: "#BD4A19", fontSize: "12.5px", fontWeight: "650", lineHeight: "26px", whiteSpace: "nowrap", cursor: "pointer" }} className={DH.h11}>Send to</span>
                          </>)}
                        </span>
                      </span>
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.kInsight) && (<>
                <div style={{ flex: "0 0 auto", position: "relative", padding: "26px 30px 0", borderRadius: "26px", background: "linear-gradient(135deg, #F08C52 0%, #DE6A30 50%, #BE4A1A 100%)", color: "#fff", boxShadow: "0 18px 40px rgba(189,74,25,.22)", overflow: "hidden" }}>
                  <span style={{ fontSize: "15px", fontWeight: "550", opacity: ".92" }}>{v.hero.label}</span>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "14px", marginTop: "6px" }}>
                    <button type="button" onClick={v.hero.open} style={{ display: "inline-flex", alignItems: "baseline", gap: "8px", padding: "0", border: "0", background: "none", color: "#fff", font: "inherit", cursor: "pointer" }} className={DH.h32}>
                      <b style={{ fontSize: "64px", fontWeight: "700", letterSpacing: "-.04em", lineHeight: "1", fontVariantNumeric: "tabular-nums" }}>{v.hero.value}</b>
                      <span style={{ fontSize: "22px", opacity: ".85" }}>›</span>
                    </button>
                    <span style={{ fontSize: "16px", opacity: ".92" }}>{v.hero.sub}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", marginTop: "26px", borderTop: "1px solid rgba(255,255,255,.28)" }}>
                    {(v.heroStats).map((k, k_i) => (<Fragment key={k_i}>
                      <div style={{ minWidth: "0", padding: `20px 16px 26px ${k.pl}px`, borderLeft: k.bl, display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "14px", opacity: ".9" }}>{k.label}</span>
                        <button type="button" onClick={k.open} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "baseline", gap: "6px", padding: "0", border: "0", background: "none", color: "#fff", font: "inherit", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,.45)", whiteSpace: "nowrap" }} className={DH.h33}>
                          <b style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{k.value}</b>
                          <span style={{ fontSize: "16px", opacity: ".85" }}>›</span>
                        </button>
                        <span style={{ fontSize: "12.5px", opacity: ".85" }}>{k.sub}</span>
                        <span style={{ alignSelf: "flex-start", marginTop: "2px", padding: "2px 8px", borderRadius: "10px", background: "rgba(255,255,255,.18)", fontSize: "11.5px", fontWeight: "650", whiteSpace: "nowrap" }}>{k.delta}</span>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: "10px", marginTop: "22px" }}>
                  <strong style={{ flex: "1", fontSize: "22px", fontWeight: "700", letterSpacing: "-.01em" }}>Team performance</strong>
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(5, 84px)", gap: "12px", padding: "12px 20px", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>
                    <span>TEAM</span>
                    <span style={{ textAlign: "right" }}>LEADS</span>
                    <span style={{ textAlign: "right" }}>APPT</span>
                    <span style={{ textAlign: "right" }}>SHOW-UP</span>
                    <span style={{ textAlign: "right" }}>WON RATE</span>
                    <span style={{ textAlign: "right" }}>LOST RATE</span>
                  </div>
                  {(v.teams).map((t, t_i) => (<Fragment key={t_i}>
                    <button type="button" onClick={t.open} style={{ width: "100%", display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(5, 84px)", gap: "12px", alignItems: "center", padding: "14px 20px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer", fontVariantNumeric: "tabular-nums" }} className={DH.h8}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                        <span style={{ flex: "0 0 9px", width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{t.name}</strong>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{t.lead}</span>
                        </span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600" }}>{t.leads}</span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600" }}>{t.appt}</span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600" }}>{t.show}</span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600", color: "#387557" }}>{t.won}</span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600", color: "#A3371A" }}>{t.lost}</span>
                    </button>
                  </Fragment>))}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: "10px", marginTop: "22px" }}>
                  <strong style={{ flex: "1", fontSize: "22px", fontWeight: "700", letterSpacing: "-.01em" }}>Leads by status</strong>
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) 84px 84px", gap: "12px", padding: "12px 20px", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>
                    <span>STATUS</span>
                    <span>
                    </span>
                    <span style={{ textAlign: "right" }}>LEADS</span>
                    <span style={{ textAlign: "right" }}>SHARE</span>
                  </div>
                  {(v.leadStatus).map((r, r_i) => (<Fragment key={r_i}>
                    <button type="button" onClick={r.open} style={{ width: "100%", display: "grid", gridTemplateColumns: "180px minmax(0, 1fr) 84px 84px", gap: "12px", alignItems: "center", padding: "14px 20px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer", fontVariantNumeric: "tabular-nums" }} className={DH.h8}>
                      <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ flex: "0 0 9px", width: "9px", height: "9px", borderRadius: "50%", background: r.color }}>
                        </span>
                        <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{r.label}</strong>
                      </span>
                      <span style={{ height: "8px", borderRadius: "4px", background: "#F5EBE3", overflow: "hidden" }}>
                        <span style={{ display: "block", height: "100%", width: `${r.pct}%`, background: r.color, borderRadius: "4px" }}>
                        </span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600" }}>{r.n}</span>
                      <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "600", color: "#806B60" }}>{r.share}</span>
                    </button>
                  </Fragment>))}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: "10px", marginTop: "22px" }}>
                  <strong style={{ flex: "1", fontSize: "22px", fontWeight: "700", letterSpacing: "-.01em" }}>Ads Performance</strong>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#806B60" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.metaDot }}>
                    </span>{v.metaSync}</span>
                  <DeskCardPicker v={v} />
                  <button type="button" onClick={v.goAdsPerf} style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>View all<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg></button>
                </div>
                <div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
                  {(v.adTotals).map((k, k_i) => (<Fragment key={k_i}>
                    <div style={{ padding: "14px 18px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "12.5px", color: "#806B60", fontWeight: "600" }}>{k.label}</span>
                      <b style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{k.value}</b>
                    </div>
                  </Fragment>))}
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflowX: "auto" }}>
                  <div style={{ minWidth: `${v.insAdMinW}px` }}>
                    <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", padding: "12px 20px", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>
                      {(v.insHead).map((h, h_i) => (<Fragment key={h_i}><button type="button" onClick={h.sort} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: h.justify, gap: "5px", padding: "0", border: "0", background: "none", font: "inherit", color: h.fg, letterSpacing: "inherit", textTransform: "uppercase", textAlign: h.align, cursor: "pointer" }}><span>{h.label}</span><span style={{ flex: "0 0 auto", fontSize: "10px", color: h.ac }}>{h.arrow}</span><span onPointerDown={h.resize} onDoubleClick={h.unsize} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}><span style={{ width: "1px", margin: "8px 0", background: "#EBDDD2" }}></span></span></button></Fragment>))}
                    </div>
                    {(v.adPerf).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #F1E7DF", fontSize: "14.5px", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600" }}>
                            <span style={{ color: r.chFg }}>{r.channel}</span>
                            <span style={{ color: "#C9B8AC" }}>·</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: r.stInk }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.stDot }}>
                              </span>{r.status}</span>
                          </span>
                        </span>
                        <span style={{ textAlign: "center" }}>{r.spend}</span>
                        <span style={{ textAlign: "center" }}>{r.reach}</span>
                        <span style={{ textAlign: "center" }}>{r.clicks}</span>
                        <span style={{ textAlign: "center", color: "#806B60" }}>{r.ctr}</span>
                        <span style={{ textAlign: "center" }}>{r.leads}</span>
                        <span style={{ textAlign: "center", color: r.cplColor }}>{r.cpl}</span>
                        <span style={{ textAlign: "center" }}>{r.appt}</span>
                      </div>
                    </Fragment>))}
                    <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", alignItems: "center", padding: "14px 20px", background: "#FBF6F2", fontSize: "14.5px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ fontSize: "12px", letterSpacing: ".08em", color: "#4E2F20" }}>TOTAL · {v.adTot.n} ADS</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.spend}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.reach}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.clicks}</span>
                      <span style={{ textAlign: "center", color: "#806B60" }}>{v.adTot.ctr}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.leads}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.cpl}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.appt}</span>
                    </div>
                  </div>
                </div>
              </>)}
              {!!(v.kCh) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1100px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", borderBottom: "1px solid #EBDDD2" }}>
                    {(v.chTabs).map((t, t_i) => (<Fragment key={t_i}>
                      {!!(t.on) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid #BD4A19", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}<span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.dot }}>
                          </span></button>
                      </>)}
                      {!!(t.off) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid transparent", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "550", color: "#806B60", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{t.label}<span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.dot }}>
                          </span></button>
                      </>)}
                    </Fragment>))}
                    <span style={{ flex: "1" }}>
                    </span>
                    <span style={{ paddingBottom: "12px" }}>
                      <a href="https://business.facebook.com" target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", textDecoration: "none" }}>Open in Meta Business Suite<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17 17 7M8 7h9v9">
                          </path>
                        </svg></a>
                    </span>
                  </div>
                  {!!(v.chNote) && (<>
                    <div style={{ padding: "10px 14px", borderRadius: "10px", background: "#FBF6F2", fontSize: "13px", color: "#806B60" }}>{v.chNote}</div>
                  </>)}
                  {!!(v.chHasSave) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "-6px" }}>
                      <span style={{ flex: "1", fontSize: "13px", color: "#806B60" }}>Changes are sent to Meta when you save. They can take a few minutes to show.</span>
                      {!!(v.chDirtyNow) && (<>
                        <button type="button" onClick={v.chDiscard} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Discard</button>
                      </>)}
                      <button type="button" onClick={v.chSave} style={{ height: "36px", padding: "0 20px", borderRadius: "18px", border: "0", background: v.chSaveBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Save to Meta</button>
                    </div>
                  </>)}
                  {!!(v.chConn) && (<>
                    {(v.chGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderBottom: "1px solid #F1E7DF" }}>
                          <span style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "8px", background: g.c, color: "#fff", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{g.ini}</span>
                          <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{g.title} <span style={{ fontWeight: "500", fontSize: "12.5px", color: "#806B60" }}>· {g.n}</span></strong>
                            <span style={{ fontSize: "12.5px", color: "#806B60" }}>{g.desc}</span>
                          </span>
                          <button type="button" onClick={g.add} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h11}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>{g.addL}</button>
                        </div>
                        {(g.rows).map((x, x_i) => (<Fragment key={x_i}>
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: x.bt, opacity: x.op }}>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{x.name}</strong>
                                {!!(x.def) && (<>
                                  <span style={{ height: "20px", display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "10px", background: "#FFF0E4", color: "#BD4A19", fontSize: "11px", fontWeight: "700" }}>Default</span>
                                </>)}
                              </span>
                              <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.sub} · ID {x.id}</span>
                            </span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: x.stC, whiteSpace: "nowrap" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: x.stC }}>
                              </span>{x.stL}</span>
                            {!!(x.notDef) && (<>
                              <button type="button" onClick={x.setDef} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}>Set default</button>
                            </>)}
                            {!!(x.on) && (<>
                              <button type="button" onClick={x.unlink} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", color: "#A3371A" }} className={DH.h34}>Unlink</button>
                            </>)}
                            {!!(x.off) && (<>
                              <button type="button" onClick={x.relink} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", borderColor: "#BD4A19", color: "#BD4A19" }}>Link again</button>
                            </>)}
                          </div>
                        </Fragment>))}
                      </div>
                    </Fragment>))}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px 18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>API access</strong>
                          <button type="button" onClick={v.chRefresh} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>Refresh</button>
                        </div>
                        <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.chTokenLine}</span>
                        <span style={{ fontSize: "12px", color: "#A08E82", fontFamily: "ui-monospace, monospace" }}>{v.chTokenMask}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px 18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>Webhook</strong>
                          <button type="button" onClick={v.chTestHook} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>Send test</button>
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: v.chHookC, fontWeight: "650" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.chHookC }}>
                          </span>{v.chHookLine}</span>
                        <span style={{ fontSize: "12px", color: "#A08E82", fontFamily: "ui-monospace, monospace" }}>{v.chHookUrl}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid #F1E7DF" }}>
                        <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>What the CRM may do on Meta</strong>
                        <button type="button" onClick={v.chReconnect} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Reconnect</button>
                      </div>
                      {(v.chPerms).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid #F5EEE8" }}>
                          <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "600" }}>{p.t}</span>
                            <span style={{ fontSize: "11.5px", color: "#A08E82", fontFamily: "ui-monospace, monospace" }}>{p.code}</span>
                          </span>
                          <span style={{ height: "24px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "12px", background: p.bg, color: p.fg, fontSize: "12px", fontWeight: "650" }}>{p.stt}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.chPage) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                        <strong style={{ fontSize: "14px", fontWeight: "650" }}>Page details</strong>
                        {(v.chPageF).map((f, f_i) => (<Fragment key={f_i}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ display: "flex", fontSize: "12.5px", color: "#806B60" }}>
                              <span style={{ flex: "1" }}>{f.label}</span>
                              <span style={{ color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                            </span>
                            {!!(f.short) && (<>
                              <input type="text" value={f.val} onChange={f.set} readOnly={f.ro} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0" }} />
                            </>)}
                            {!!(f.long) && (<>
                              <textarea value={f.val} onChange={f.set} readOnly={f.ro} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                              </textarea>
                            </>)}
                          </label>
                        </Fragment>))}
                        <span style={{ fontSize: "12.5px", color: "#806B60" }}>Changing the Page name goes through Meta review. <a href="https://business.facebook.com" target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", textDecoration: "none" }}>Change in Meta<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M7 17 17 7M8 7h9v9">
                              </path>
                            </svg></a></span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Profile picture and cover</strong>
                          <div style={{ position: "relative", height: "120px", borderRadius: "10px", background: "repeating-linear-gradient(45deg, #F5EEE8 0 10px, #FBF6F2 10px 20px)", display: "grid", placeItems: "center", fontSize: "12px", color: "#806B60" }}>Cover photo · 1640 × 624<span style={{ position: "absolute", left: "14px", bottom: "-22px", width: "64px", height: "64px", borderRadius: "50%", border: "3px solid #fff", background: "#FFF0E4", color: "#BD4A19", fontSize: "18px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.chPageIni}</span></div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "6px" }}>
                            <button type="button" onClick={v.chOpenPage} style={{ height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Change picture</button>
                            <button type="button" onClick={v.chOpenPage} style={{ height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Change cover</button>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ paddingBottom: "6px", fontSize: "14px", fontWeight: "650" }}>Opening hours</strong>
                          {(v.chHours).map((h, h_i) => (<Fragment key={h_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderTop: "1px solid #F5EEE8" }}>
                              <b style={{ flex: "0 0 40px", fontSize: "13px", fontWeight: "650" }}>{h.d}</b>
                              <button type="button" onClick={h.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: h.trk, cursor: "pointer" }}>
                                <span style={{ position: "absolute", top: "2px", left: h.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                </span>
                              </button>
                              {!!(h.open) && (<>
                                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#806B60" }}><input type="time" value={h.from} onChange={h.setFrom} style={{ height: "32px", padding: "0 8px", border: "1px solid #EBDDD2", borderRadius: "8px", font: "inherit", fontSize: "13px", color: "#3F2B22" }} />–<input type="time" value={h.to} onChange={h.setTo} style={{ height: "32px", padding: "0 8px", border: "1px solid #EBDDD2", borderRadius: "8px", font: "inherit", fontSize: "13px", color: "#3F2B22" }} /></span>
                              </>)}
                              {!!(h.closed) && (<>
                                <span style={{ fontSize: "13px", color: "#A08E82" }}>Closed</span>
                              </>)}
                            </div>
                          </Fragment>))}
                        </div>
                      </div>
                    </div>
                  </>)}
                  {!!(v.chMsgr) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Greeting</strong>
                          <span style={{ marginTop: "-6px", fontSize: "12.5px", color: "#806B60" }}>{v.chGreetHint}</span>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ alignSelf: "flex-end", fontSize: "12px", color: v.chGreet.cc }}>{v.chGreet.count}</span>
                            <textarea value={v.chGreet.val} onChange={v.chGreet.set} readOnly={v.chGreet.ro} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                            </textarea>
                          </label>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                          <div style={{ display: "flex", alignItems: "baseline" }}>
                            <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>Ice breakers</strong>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{v.chIceN}</span>
                          </div>
                          <span style={{ marginTop: "-4px", fontSize: "12.5px", color: "#806B60" }}>Questions people can tap to start a chat</span>
                          {(v.chIce).map((q, q_i) => (<Fragment key={q_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ flex: "0 0 20px", fontSize: "12px", color: "#A08E82", textAlign: "right" }}>{q.n}</span>
                              <input type="text" value={q.q} onChange={q.set} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0" }} />
                              <button type="button" onClick={q.remove} title="Remove" style={{ flex: "0 0 28px", width: "28px", height: "28px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#A08E82", cursor: "pointer" }}>×</button>
                            </div>
                          </Fragment>))}
                          {!!(v.chIceCanAdd) && (<>
                            <button type="button" onClick={v.chIceAdd} style={{ alignSelf: "flex-start", marginLeft: "28px", border: "0", background: "transparent", padding: "4px 0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>+ Add question</button>
                          </>)}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Menu</strong>
                          <span style={{ marginTop: "-4px", fontSize: "12.5px", color: "#806B60" }}>Always there next to the message box</span>
                          {(v.chMenu).map((m, m_i) => (<Fragment key={m_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="text" value={m.l} onChange={m.set} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0" }} />
                              <span style={{ flex: "0 0 auto", height: "28px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "14px", background: "#F5EEE8", fontSize: "12px", fontWeight: "650", color: "#806B60" }}>{m.t}</span>
                              <button type="button" onClick={m.remove} title="Remove" style={{ flex: "0 0 28px", width: "28px", height: "28px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#A08E82", cursor: "pointer" }}>×</button>
                            </div>
                          </Fragment>))}
                          <button type="button" onClick={v.chMenuAdd} style={{ alignSelf: "flex-start", border: "0", background: "transparent", padding: "4px 0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>+ Add menu item</button>
                        </div>
                      </div>
                      <div style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "10px", padding: "16px", borderRadius: "14px", background: "#F0F2F5" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#65676B" }}>MESSENGER PREVIEW</span>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 0" }}>
                          <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.chPageIni}</span>
                          <strong style={{ fontSize: "14px" }}>{v.chPageName}</strong>
                        </div>
                        <div style={{ alignSelf: "flex-start", maxWidth: "90%", padding: "10px 12px", borderRadius: "16px", background: "#fff", fontSize: "13px", lineHeight: "1.4", color: "#050505" }}>{v.chGreet.val}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                          {(v.chIce).map((q, q_i) => (<Fragment key={q_i}>
                            <span style={{ padding: "8px 12px", borderRadius: "16px", border: "1px solid #0866FF", color: "#0866FF", background: "#fff", fontSize: "12.5px", fontWeight: "600" }}>{q.q}</span>
                          </Fragment>))}
                        </div>
                      </div>
                    </div>
                  </>)}
                  {!!(v.chWa) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff", minHeight: "560px" }}>
                      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid #EBDDD2" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 14px 10px" }}>
                          <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>Phone numbers · {v.waCount}</strong>
                          <button type="button" onClick={v.waAdd} title="Add a number" style={{ width: "28px", height: "28px", padding: "0", borderRadius: "50%", border: "1px dashed #C9B8AB", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>
                          </button>
                        </div>
                        {(v.waNums).map((n, n_i) => (<Fragment key={n_i}>
                          <button type="button" onClick={n.pick} style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 8px 4px", padding: "10px", border: "0", borderLeft: `3px solid ${n.bd}`, borderRadius: "8px", background: n.bg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                            <span style={{ position: "relative", flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", background: "#F5EEE8", display: "grid", placeItems: "center" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z">
                                </path>
                              </svg>
                              <span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "13px", height: "13px", borderRadius: "50%", background: "#25D366", border: "2px solid #fff" }}>
                              </span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                              <span style={{ fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap" }}>{n.name}</span>
                              <span style={{ fontSize: "11.5px", color: "#806B60" }}>{n.region}</span>
                            </span>
                          </button>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px 10px" }}>
                          <span style={{ flex: "0 0 44px", width: "44px", height: "44px", borderRadius: "50%", background: "#F5EEE8", display: "grid", placeItems: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z">
                              </path>
                            </svg>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <strong style={{ fontSize: "16px", fontWeight: "650" }}><span style={{ fontSize: "11px", fontWeight: "700", color: "#806B60", paddingRight: "4px" }}>MY</span>{v.wn.name}</strong>
                            <span style={{ fontSize: "13px", color: "#3F2B22" }}>{v.wn.disp}</span>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>Phone number ID <span style={{ color: "#2F6FB5", fontVariantNumeric: "tabular-nums" }}>{v.wn.id}</span></span>
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "4px", padding: "0 20px", borderBottom: "1px solid #EBDDD2", overflowX: "auto" }}>
                          {(v.waSubs).map((t, t_i) => (<Fragment key={t_i}>
                            {!!(t.on) && (<>
                              <button type="button" onClick={t.pick} style={{ height: "34px", margin: "6px 0", padding: "0 12px", border: "0", borderRadius: "8px", background: "#FFF0E4", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
                            </>)}
                            {!!(t.off) && (<>
                              <button type="button" onClick={t.pick} style={{ height: "34px", margin: "6px 0", padding: "0 12px", border: "0", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "550", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h4}>{t.label}</button>
                            </>)}
                          </Fragment>))}
                        </div>
                        {!!(v.waProf) && (<>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "20px", padding: "18px 20px 20px", alignItems: "start" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Profile picture</strong>
                                  <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>Shown on your business profile</span>
                                </span>
                                <button type="button" onClick={v.chOpenWaManager} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Choose file</button>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Display name</strong>
                                </span>
                                {!!(v.waDn.notEditing) && (<>
                                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>{v.wn.disp}<span style={{ height: "20px", display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "10px", background: v.waDn.bg, color: v.waDn.fg, fontSize: "11.5px", fontWeight: "700" }}>{v.waDn.st}</span></span>
                                  <button type="button" onClick={v.waDn.edit} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Edit</button>
                                </>)}
                                {!!(v.waDn.editing) && (<>
                                  <input type="text" value={v.waDn.draft} onChange={v.waDn.setDraft} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0" }} />
                                  <span style={{ fontSize: "12px", color: "#806B60" }}>Meta reviews every new display name. It must match your business.</span>
                                  <span style={{ display: "flex", gap: "8px" }}>
                                    <button type="button" onClick={v.waDn.cancel} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>Cancel</button>
                                    <button type="button" onClick={v.waDn.submit} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "0", background: "#BD4A19", color: "#fff" }}>Submit for review</button>
                                  </span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Username</strong>
                                  <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>A way for customers to reach you without your phone number. Your number still shows on the profile.</span>
                                </span>
                                {!!(v.waUserNone) && (<>
                                  <button type="button" onClick={v.waUserCreate} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Create</button>
                                </>)}
                                {!!(v.waUserHas) && (<>
                                  <span style={{ fontSize: "13.5px", fontWeight: "650" }}>{v.waUser}</span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Official business account</strong>
                                  <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>A blue tick next to your name. It means WhatsApp has confirmed the account belongs to a real, well-known brand.</span>
                                </span>
                                {!!(v.waObaNone) && (<>
                                  <button type="button" onClick={v.waObaReq} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Submit request</button>
                                </>)}
                                {!!(v.waObaHas) && (<>
                                  <span style={{ fontSize: "13px", color: "#A46312", fontWeight: "650" }}>{v.waOba}</span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "14px", borderTop: "1px solid #F1E7DF" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Business info</strong>
                                  <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>Shown on your profile</span>
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <span style={{ fontSize: "12.5px", fontWeight: "650" }}>Category</span>
                                  <span style={{ position: "relative" }}>
                                    <button type="button" onClick={v.waCatToggle} style={{ display: "flex", alignItems: "center", height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0", cursor: "pointer", textAlign: "left" }}>
                                      <span style={{ flex: "1" }}>{v.wn.cat}</span>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m6 9 6 6 6-6">
                                        </path>
                                      </svg>
                                    </button>
                                    {!!(v.waCatOpen) && (<>
                                      <div onClick={v.waCatToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                                      </div>
                                      <div style={{ position: "absolute", top: "42px", left: "0", right: "0", zIndex: "8", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                                        {(v.waCats).map((o, o_i) => (<Fragment key={o_i}>
                                          <button type="button" onClick={o.pick} style={{ height: "34px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>{o.c}</button>
                                        </Fragment>))}
                                      </div>
                                    </>)}
                                  </span>
                                </div>
                                {(v.waF).map((f, f_i) => (<Fragment key={f_i}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "12.5px", fontWeight: "650", color: "#3F2B22" }}>{f.label} <span style={{ fontWeight: "500", color: "#A08E82" }}>· Optional</span></span>
                                    <span style={{ position: "relative", display: "block" }}>
                                      {!!(f.short) && (<>
                                        <input type="text" value={f.val} onChange={f.set} placeholder={f.ph} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0", paddingRight: "70px" }} />
                                      </>)}
                                      {!!(f.long) && (<>
                                        <textarea value={f.val} onChange={f.set} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                                        </textarea>
                                      </>)}
                                      <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "11.5px", color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                                    </span>
                                  </label>
                                </Fragment>))}
                                {(v.waWeb).map((f, f_i) => (<Fragment key={f_i}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "12.5px", fontWeight: "650", color: "#3F2B22" }}>{f.label} <span style={{ fontWeight: "500", color: "#A08E82" }}>· Optional</span></span>
                                    <span style={{ position: "relative", display: "block" }}>
                                      {!!(f.short) && (<>
                                        <input type="text" value={f.val} onChange={f.set} placeholder={f.ph} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0", paddingRight: "70px" }} />
                                      </>)}
                                      {!!(f.long) && (<>
                                        <textarea value={f.val} onChange={f.set} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                                        </textarea>
                                      </>)}
                                      <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "11.5px", color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                                    </span>
                                  </label>
                                </Fragment>))}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid #F1E7DF" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Social accounts</strong>
                                  <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>Link your Facebook Page or Instagram to run click-to-WhatsApp ads and keep one inbox.</span>
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "6px", background: "#1877F2", color: "#fff", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>f</span>
                                  <span style={{ flex: "1", fontSize: "13px" }}><b style={{ fontWeight: "650" }}>Facebook</b> · {v.waFb}</span>
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "6px", background: "#C13584", color: "#fff", fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>IG</span>
                                  <span style={{ flex: "1", fontSize: "13px" }}>
                                    <b style={{ fontWeight: "650" }}>Instagram</b>
                                    {!!(v.waIgHas) && (<> · {v.waIg}</>)}
                                  </span>
                                  {!!(v.waIgNone) && (<>
                                    <button type="button" onClick={v.waIgLink} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>Link Instagram</button>
                                  </>)}
                                </span>
                              </div>
                            </div>
                            <div style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "#F0F2F5" }}>
                              <div style={{ display: "flex", flexDirection: "column", borderRadius: "12px", background: "#fff", overflow: "hidden" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "18px 14px 14px" }}>
                                  <span style={{ width: "72px", height: "72px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "22px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.waIni}</span>
                                  <strong style={{ fontSize: "15px", textAlign: "center" }}>{v.wn.disp}</strong>
                                  <span style={{ fontSize: "12.5px", color: "#3F2B22" }}>{v.wn.name}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderTop: "6px solid #F0F2F5", fontSize: "12.5px", color: "#54656F" }}>
                                  <span>🏷 {v.wn.cat}</span>
                                  {(v.waF).map((f, f_i) => (<Fragment key={f_i}>
                                    <span style={{ lineHeight: "1.4", overflowWrap: "anywhere" }}>{f.val}</span>
                                  </Fragment>))}
                                </div>
                              </div>
                              <span style={{ fontSize: "11.5px", color: "#667781", textAlign: "center" }}>It may look a little different on each phone</span>
                            </div>
                          </div>
                        </>)}
                        {!!(v.waIns) && (<>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", padding: "18px 20px" }}>
                            {(v.waStats).map((k, k_i) => (<Fragment key={k_i}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 16px", border: "1px solid #EBDDD2", borderRadius: "12px" }}>
                                <span style={{ fontSize: "12px", color: "#806B60" }}>{k.k}</span>
                                <span style={{ fontSize: "20px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{k.v}</span>
                              </div>
                            </Fragment>))}
                          </div>
                        </>)}
                        {!!(v.waAuto) && (<>
                          <div style={{ display: "flex", flexDirection: "column", padding: "8px 20px 18px" }}>
                            {(v.waAutoRows).map((x, x_i) => (<Fragment key={x_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid #F5EEE8" }}>
                                <span style={{ flex: "1" }}>
                                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{x.t}</strong>
                                    <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>{x.sub}</span>
                                  </span>
                                </span>
                                <button type="button" onClick={x.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: x.trk, cursor: "pointer" }}>
                                  <span style={{ position: "absolute", top: "2px", left: x.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                  </span>
                                </button>
                              </div>
                            </Fragment>))}
                            <span style={{ paddingTop: "12px", fontSize: "12.5px", color: "#806B60" }}>Texts for these are set in Profile › Auto-reply in the app.</span>
                          </div>
                        </>)}
                        {!!(v.waLinks) && (<>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "18px 20px", maxWidth: "560px" }}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Message link</strong>
                              <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>Opens a chat with this number. Put it on your website or posts.</span>
                            </span>
                            <span style={{ display: "flex", gap: "8px" }}>
                              <input type="text" readOnly={true} value={v.waLink} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0", fontFamily: "ui-monospace, monospace" }} />
                              <button type="button" onClick={v.waCopy} style={{ padding: "0 14px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap", height: "38px" }}>Copy</button>
                            </span>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", fontWeight: "650" }}>Pre-filled message</span>
                              <textarea value={v.waLinkMsg} onChange={v.setWaLinkMsg} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                              </textarea>
                            </label>
                          </div>
                        </>)}
                        {!!(v.waCalls) && (<>
                          <div style={{ display: "flex", flexDirection: "column", padding: "8px 20px 18px" }}>
                            {(v.waCallRows).map((x, x_i) => (<Fragment key={x_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid #F5EEE8" }}>
                                <span style={{ flex: "1" }}>
                                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{x.t}</strong>
                                    <span style={{ fontSize: "12.5px", color: "#806B60", textWrap: "pretty" }}>{x.sub}</span>
                                  </span>
                                </span>
                                <button type="button" onClick={x.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: x.trk, cursor: "pointer" }}>
                                  <span style={{ position: "absolute", top: "2px", left: x.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                  </span>
                                </button>
                              </div>
                            </Fragment>))}
                          </div>
                        </>)}
                        {!!(v.waLog) && (<>
                          <div style={{ display: "flex", flexDirection: "column", padding: "8px 20px 18px" }}>
                            {(v.waCallLog).map((c, c_i) => (<Fragment key={c_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid #F5EEE8", fontSize: "13px" }}>
                                <strong style={{ flex: "1", fontWeight: "650" }}>{c.n}</strong>
                                <span style={{ color: c.c }}>{c.t}</span>
                                <span style={{ width: "140px", textAlign: "right", color: "#806B60" }}>{c.at}</span>
                              </div>
                            </Fragment>))}
                          </div>
                        </>)}
                      </div>
                    </div>
                  </>)}
                  {!!(v.chTpl) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid #EBDDD2" }}>
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>WhatsApp message templates</strong>
                          <span style={{ fontSize: "12.5px", color: "#806B60" }}>Needed to message someone after the 24 h reply window. Meta reviews each one.</span>
                        </span>
                        <button type="button" onClick={v.chNewToggle} style={{ height: "36px", padding: "0 16px", borderRadius: "18px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>New template</button>
                      </div>
                      {!!(v.chNewOpen) && (<>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "14px", padding: "16px 18px", background: "#FBF6F2", borderBottom: "1px solid #EBDDD2" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "12.5px", color: "#806B60" }}>Name</span>
                            <input type="text" value={v.chNewF.name} onChange={v.chNewF.setName} placeholder="e.g. visit_follow_up" style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none", width: "100%", minWidth: "0" }} />
                          </label>
                          <div style={{ display: "flex", gap: "14px" }}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "#806B60" }}>Category</span>
                              <span style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                                {(v.chNewF.cats).map((o, o_i) => (<Fragment key={o_i}>
                                  <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 12px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{o.c}</button>
                                </Fragment>))}
                              </span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "#806B60" }}>Language</span>
                              <span style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                                {(v.chNewF.langs).map((o, o_i) => (<Fragment key={o_i}>
                                  <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 10px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap" }}>{o.c}</button>
                                </Fragment>))}
                              </span>
                            </span>
                          </div>
                          <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.chTplHint}</span>
                            <textarea value={v.chNewF.body} onChange={v.chNewF.setBody} placeholder={v.chTplPh} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "#3F2B22", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                            </textarea>
                          </label>
                          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                            <button type="button" onClick={v.chNewToggle} style={{ height: "36px", padding: "0 16px", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                            <button type="button" onClick={v.chNewF.submit} style={{ height: "36px", padding: "0 18px", borderRadius: "18px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Send for review</button>
                          </div>
                        </div>
                      </>)}
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 110px 130px 120px 80px", gap: "12px", padding: "10px 18px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", borderBottom: "1px solid #F1E7DF" }}>
                        <span>NAME</span>
                        <span>CATEGORY</span>
                        <span>LANGUAGE</span>
                        <span>STATUS</span>
                        <span>UPDATED</span>
                      </div>
                      {(v.chTpls).map((t, t_i) => (<Fragment key={t_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 110px 130px 120px 80px", gap: "12px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid #F5EEE8", fontSize: "13px" }}>
                          <span style={{ fontWeight: "600", fontFamily: "ui-monospace, monospace", fontSize: "12.5px" }}>{t.n}</span>
                          <span>{t.c}</span>
                          <span>{t.l}</span>
                          <span>
                            <span style={{ height: "24px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "12px", background: t.bg, color: t.fg, fontSize: "12px", fontWeight: "650" }}>{t.stt}</span>
                          </span>
                          <span style={{ color: "#806B60" }}>{t.at}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.chAds) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 110px 70px 120px 150px", gap: "12px", padding: "10px 18px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", borderBottom: "1px solid #F1E7DF" }}>
                        <span>AD</span>
                        <span>SPEND · {v.chMonth}</span>
                        <span>LEADS</span>
                        <span>DAILY BUDGET</span>
                        <span>STATUS</span>
                      </div>
                      {(v.chAdsRows).map((a, a_i) => (<Fragment key={a_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 110px 70px 120px 150px", gap: "12px", alignItems: "center", padding: "10px 18px", borderTop: "1px solid #F5EEE8", fontSize: "13px" }}>
                          <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                            <strong style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</strong>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{a.ch}</span>
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.spend}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.leads}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 10px", boxSizing: "border-box", border: "1px solid #EBDDD2", borderRadius: "8px" }}>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>RM</span>
                            <input type="text" inputMode="numeric" value={a.budget} onChange={a.setBudget} style={{ width: "100%", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", outline: "none", fontVariantNumeric: "tabular-nums" }} />
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <button type="button" onClick={a.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: a.trk, cursor: "pointer" }}>
                              <span style={{ position: "absolute", top: "2px", left: a.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                              </span>
                            </button>
                            <span style={{ fontSize: "13px", fontWeight: "650", color: a.stC }}>{a.stL}</span>
                          </span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.chDlgOpen) && (<>
                    <div onClick={v.chDlgClose} style={{ position: "absolute", inset: "0", zIndex: "20", background: "rgba(40,25,18,.32)" }}>
                    </div>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: "21", width: "440px", maxWidth: "calc(100% - 40px)", display: "flex", flexDirection: "column", gap: "14px", padding: "22px", boxSizing: "border-box", borderRadius: "18px", background: "#fff", boxShadow: "0 20px 50px rgba(40,25,18,.25)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <strong style={{ flex: "1", fontSize: "17px", fontWeight: "650" }}>{v.chDlg.title}</strong>
                        <button type="button" onClick={v.chDlgClose} title="Close" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", cursor: "pointer" }}>×</button>
                      </div>
                      {!!(v.chDlg.isUnlink) && (<>
                        <span style={{ fontSize: "13.5px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>{v.chDlg.body}</span>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                          <button type="button" onClick={v.chDlgClose} style={{ height: "38px", padding: "0 16px", borderRadius: "19px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "38px", padding: "0 18px", borderRadius: "19px", border: "0", background: "#A3371A", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Unlink</button>
                        </div>
                      </>)}
                      {!!(v.chDlg.isLink1) && (<>
                        <span style={{ fontSize: "13.5px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>Sign in with the Facebook account that manages it. Meta asks which ones the CRM may use.</span>
                        <button type="button" onClick={v.chDlg.next} style={{ height: "44px", borderRadius: "22px", border: "0", background: "#1877F2", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Continue with Facebook</button>
                      </>)}
                      {!!(v.chDlg.isLink2) && (<>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {(v.chDlg.cands).map((c, c_i) => (<Fragment key={c_i}>
                            <button type="button" onClick={c.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: `1px solid ${c.bd}`, borderRadius: "12px", background: c.bg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }}>
                              <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: `1.5px solid ${c.bd}`, display: "grid", placeItems: "center" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.chk} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-10">
                                  </path>
                                </svg>
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{c.n}</strong>
                                <span style={{ fontSize: "12px", color: "#806B60" }}>{c.sub}</span>
                              </span>
                            </button>
                          </Fragment>))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                          <button type="button" onClick={v.chDlgClose} style={{ height: "38px", padding: "0 16px", borderRadius: "19px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "38px", padding: "0 18px", borderRadius: "19px", border: "0", background: v.chDlg.linkBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Link</button>
                        </div>
                      </>)}
                      {!!(v.chDlg.isWa1) && (<>
                        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "12.5px", color: "#806B60" }}>Phone number</span>
                          <input type="tel" value={v.chDlg.num} onChange={v.chDlg.setNum} placeholder="+60 12-345 6789" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #E2CFC1", borderRadius: "10px", font: "inherit", fontSize: "14px", color: "#3F2B22", outline: "none" }} />
                        </label>
                        <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "#806B60" }}>Send code by<span style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                            {(v.chDlg.vias).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 12px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{o.v}</button>
                            </Fragment>))}
                          </span></span>
                        <span style={{ fontSize: "12px", color: "#A08E82", textWrap: "pretty" }}>The number can't be in use on the WhatsApp app at the same time.</span>
                        <button type="button" onClick={v.chDlg.next} style={{ height: "42px", borderRadius: "21px", border: "0", background: v.chDlg.nextBg, font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Send code</button>
                      </>)}
                      {!!(v.chDlg.isWa2) && (<>
                        <span style={{ fontSize: "13px", color: "#806B60" }}>{v.chDlg.sentTo}</span>
                        <input type="text" inputMode="numeric" value={v.chDlg.code} onChange={v.chDlg.setCode} placeholder="••••••" style={{ height: "48px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #E2CFC1", borderRadius: "12px", font: "inherit", fontSize: "22px", letterSpacing: ".4em", textAlign: "center", color: "#3F2B22", outline: "none", fontVariantNumeric: "tabular-nums" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <button type="button" onClick={v.chDlg.resend} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Send again</button>
                          <span style={{ flex: "1" }}>
                          </span>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "40px", padding: "0 20px", borderRadius: "20px", border: "0", background: v.chDlg.nextBg, font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Verify and add</button>
                        </div>
                      </>)}
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.kPeople) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", maxWidth: "1180px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px 16px", border: "1px solid #EBDDD2", borderRadius: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>Filter by Customer info</strong>
                      <span style={{ flex: "0 1 320px", minWidth: "220px", display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "18px", background: "#fff" }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z">
                          </path>
                        </svg>
                        <input type="text" value={v.ppQ} onChange={v.setPpQ} placeholder="Search name, phone, requirement…" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} />
                      </span>
                    </div>
                    {(v.ppSelGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", paddingTop: "10px", borderTop: "1px solid #F5EEE8" }}>
                        <span style={{ flex: "0 0 72px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{g.label}</span>
                        {(g.sels).map((f, f_i) => (<Fragment key={f_i}>
                          <span style={{ position: "relative" }}>
                            <button type="button" onClick={f.toggle} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 9px 0 12px", boxSizing: "border-box", border: `1px solid ${f.bd}`, borderRadius: "18px", background: f.bg, font: "inherit", fontSize: "13px", color: "#806B60", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h35}>{f.label}<b style={{ fontWeight: "650", color: "#3F2B22" }}>{f.value}</b><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg></button>
                            {!!(f.open) && (<>
                              <div onClick={f.close} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                              </div>
                              <div style={{ position: "absolute", top: "38px", left: "0", zIndex: "8", minWidth: "200px", maxHeight: "300px", overflow: "auto", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                                {(f.opts).map((o, o_i) => (<Fragment key={o_i}>
                                  <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", fontWeight: o.w, color: "#3F2B22", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={o.chk} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="m5 12 5 5 9-10">
                                      </path>
                                    </svg>
                                    <span style={{ flex: "1" }}>{o.v}</span>
                                    <span style={{ fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{o.n}</span>
                                  </button>
                                </Fragment>))}
                              </div>
                            </>)}
                          </span>
                        </Fragment>))}
                      </div>
                    </Fragment>))}
                  </div>
                  {!!(v.ppHasChips) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "-8px" }}>
                      {(v.ppChips).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.clear} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "28px", padding: "0 10px 0 12px", borderRadius: "14px", border: "0", background: "#FFF0E4", color: "#BD4A19", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{c.label}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 6 6 18M6 6l12 12">
                            </path>
                          </svg></button>
                      </Fragment>))}
                      <button type="button" onClick={v.ppClear} style={{ border: "0", background: "transparent", padding: "0 4px", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#806B60", cursor: "pointer" }} className={DH.h2}>Clear all</button>
                    </div>
                  </>)}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#FBF6F2" }}>
                    {(v.ppStats).map((k, k_i) => (<Fragment key={k_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "16px 20px", borderLeft: "1px solid #EBDDD2", marginLeft: "-1px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", textTransform: "uppercase" }}>{k.k}</span>
                        <span style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>{k.v}</span>
                        <span style={{ fontSize: "12px", color: "#806B60" }}>{k.sub}</span>
                      </div>
                    </Fragment>))}
                  </div>
                  {!(v.ppRail) && (<><div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: "1px solid #EBDDD2", borderRadius: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                      <strong style={{ flex: "1", minWidth: "160px", fontSize: "15px", fontWeight: "650" }}>{v.ppChartTitle}</strong>
                      <div style={{ display: "flex", flexWrap: "wrap", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                        {(v.ppBys).map((o, o_i) => (<Fragment key={o_i}>
                          {!!(o.on) && (<>
                            <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 10px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "12.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                          </>)}
                          {!!(o.off) && (<>
                            <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 10px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "12.5px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                          </>)}
                        </Fragment>))}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "2px", height: "10px", borderRadius: "5px", overflow: "hidden", background: "#F5EEE8" }}>
                      {(v.ppStack).map((g, g_i) => (<Fragment key={g_i}>
                        <span style={{ flex: `${g.n} 0 0`, background: g.color }}>
                        </span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {(v.ppBars).map((b, b_i) => (<Fragment key={b_i}>
                        <button type="button" onClick={b.pick} title="Click to filter" style={{ display: "grid", gridTemplateColumns: "minmax(120px, 180px) minmax(0, 1fr) 36px 48px", gap: "14px", alignItems: "center", padding: "7px 8px", margin: "0 -8px", border: "0", borderRadius: "8px", background: b.bg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: b.fw, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: b.color }}>
                            </span>{b.label}</span>
                          <span style={{ display: "block", height: "8px", borderRadius: "4px", background: "#F5EEE8" }}>
                            <span style={{ display: "block", height: "8px", width: `${b.w}%`, borderRadius: "4px", background: b.color }}>
                            </span>
                          </span>
                          <span style={{ textAlign: "right", fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                          <span style={{ textAlign: "right", fontSize: "12.5px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{b.pct}</span>
                        </button>
                      </Fragment>))}
                    </div>
                  </div></>)}
                  {!!(v.ppHas) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "auto" }}>
                      <div style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", padding: "10px 20px", background: "#FBF6F2", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", minWidth: "max-content" }}>
                        <span style={{ position: "relative", whiteSpace: "nowrap" }}>
                          {(v.ppSortCols0).map((c, c_i) => (<Fragment key={c_i}>
                            <button type="button" onClick={c.pick} title="Sort" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0", border: "0", background: "transparent", font: "inherit", letterSpacing: "inherit", color: c.fg, cursor: "pointer" }}>CONTACT<span style={{ fontSize: "12px" }}>{c.arrow}</span></button>
                          </Fragment>))}
                          <span onPointerDown={v.ppDragC} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-11px", width: "9px", zIndex: "2", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                          </span>
                        </span>
                        {(v.ppHead).map((h, h_i) => (<Fragment key={h_i}>
                          <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap", minWidth: "0" }}>
                            <button type="button" onClick={h.pick} title="Sort" style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "0", border: "0", background: "transparent", font: "inherit", letterSpacing: "inherit", color: h.fg, cursor: "pointer" }}>{h.label}<span style={{ fontSize: "12px" }}>{h.arrow}</span></button>
                            <button type="button" onClick={h.remove} title="Hide column" style={{ width: "18px", height: "18px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "#A08E82", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h36}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 6 6 18M6 6l12 12">
                                </path>
                              </svg>
                            </button>
                            <span onPointerDown={h.drag} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-11px", width: "9px", zIndex: "2", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                            </span>
                          </span>
                        </Fragment>))}
                        <span style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
                          <button type="button" onClick={v.ppAddToggle} title="Add a column from Customer info" style={{ width: "26px", height: "26px", margin: "-4px 0", padding: "0", boxSizing: "border-box", borderRadius: "50%", border: "1px dashed #C9B8AB", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h37}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>
                          </button>
                          {!!(v.ppAddOpen) && (<>
                            <div onClick={v.ppAddClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                            </div>
                            <div style={{ position: "absolute", top: "30px", right: "0", zIndex: "8", width: "220px", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px", letterSpacing: "0", textTransform: "none" }}>
                              <span style={{ padding: "6px 10px 4px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>ADD FROM CUSTOMER INFO</span>
                              {(v.ppAddOpts).map((o, o_i) => (<Fragment key={o_i}>
                                <button type="button" onClick={o.toggle} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", fontWeight: "550", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                                  <span style={{ flex: "0 0 16px", width: "16px", height: "16px", boxSizing: "border-box", borderRadius: "4px", border: `1.5px solid ${o.bd}`, display: "grid", placeItems: "center" }}>
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={o.chk} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                      <path d="m5 12 5 5 9-10">
                                      </path>
                                    </svg>
                                  </span>
                                  <span style={{ flex: "1" }}>{o.label}</span>
                                  <span style={{ fontSize: "11.5px", color: "#A08E82" }}>{o.grp}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </>)}
                        </span>
                      </div>
                      {(v.ppRows).map((d, d_i) => (<Fragment key={d_i}>
                        <button type="button" onClick={d.open} title="Open chat and Customer info" style={{ display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", padding: "10px 20px", border: "0", borderTop: "1px solid #F5EEE8", background: d.rowBg, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer", minWidth: "max-content" }} className={DH.h12}>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 30px", width: "30px", height: "30px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{d.ini}</span>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                              <span style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                              <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{d.phone}</span>
                            </span>
                          </span>
                          {(d.cells).map((x, x_i) => (<Fragment key={x_i}>
                            <span style={{ minWidth: "0", display: "flex" }}>
                              {!!(x.pill) && (<>
                                <span style={{ display: "inline-flex", height: "22px", alignItems: "center", padding: "0 9px", borderRadius: "11px", background: x.bg, color: x.fg, fontSize: "12px", fontWeight: "650", whiteSpace: "nowrap" }}>{x.v}</span>
                              </>)}
                              {!!(x.plain) && (<>
                                <span style={{ fontSize: "13px", color: x.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{x.v}</span>
                              </>)}
                            </span>
                          </Fragment>))}
                          <span>
                          </span>
                        </button>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.ppPagerOn) && (<DeskPager v={v.ppPager} />)}
                  {!!(v.ppEmpty) && (<>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "48px 20px", border: "1px dashed #E2CFC1", borderRadius: "14px", textAlign: "center" }}>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>No contacts match these filters</strong>
                      <button type="button" onClick={v.ppClear} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Clear filters</button>
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.kAudit) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "1100px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", borderBottom: "1px solid #EBDDD2" }}>
                    {(v.auTabs).map((t, t_i) => (<Fragment key={t_i}>
                      {!!(t.on) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid #BD4A19", background: "transparent", font: "inherit", fontSize: "14.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>{t.label}<span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#FFF0E4", color: "#BD4A19", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{t.n}</span></button>
                      </>)}
                      {!!(t.off) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 14px", marginBottom: "-1px", border: "0", borderBottom: "2px solid transparent", background: "transparent", font: "inherit", fontSize: "14.5px", fontWeight: "550", color: "#806B60", cursor: "pointer" }} className={DH.h2}>{t.label}<span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#F5EEE8", color: "#806B60", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{t.n}</span></button>
                      </>)}
                    </Fragment>))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#FBF6F2" }}>
                    {(v.auStats).map((k, k_i) => (<Fragment key={k_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "16px 20px", borderLeft: "1px solid #EBDDD2", marginLeft: "-1px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", textTransform: "uppercase" }}>{k.k}</span>
                        <span style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums" }}>{k.v}</span>
                        <span style={{ fontSize: "12px", color: "#806B60" }}>{k.sub}</span>
                      </div>
                    </Fragment>))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                      {(v.auPers).map((o, o_i) => (<Fragment key={o_i}>
                        {!!(o.on) && (<>
                          <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 12px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13px", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                        </>)}
                        {!!(o.off) && (<>
                          <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 12px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "13px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                        </>)}
                      </Fragment>))}
                    </div>
                    <span style={{ flex: "1 1 220px", display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "18px", background: "#fff" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z">
                        </path>
                      </svg>
                      <input type="text" value={v.auQ} onChange={v.setAuQ} placeholder="Search name, ad, team…" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} />
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "12px", fontWeight: "650", color: "#806B60", paddingRight: "4px" }}>Who</span>
                    {(v.auWhoOpts).map((o, o_i) => (<Fragment key={o_i}>
                      <button type="button" onClick={o.pick} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, font: "inherit", fontSize: "12.5px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                    </Fragment>))}
                  </div>
                  {!!(v.auHas) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: v.auGrid, gap: "16px", padding: "10px 20px", background: "#FBF6F2", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>
                        <span style={{ position: "relative" }}>TIME<span onPointerDown={v.auDrag0} onDoubleClick={v.auReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-13px", width: "9px", zIndex: "2", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                          </span></span>
                        <span style={{ position: "relative" }}>WHO<span onPointerDown={v.auDrag1} onDoubleClick={v.auReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-13px", width: "9px", zIndex: "2", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                          </span></span>
                        <span style={{ position: "relative" }}>WHAT<span onPointerDown={v.auDrag2} onDoubleClick={v.auReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-13px", width: "9px", zIndex: "2", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                          </span></span>
                        <span>DETAIL</span>
                      </div>
                      {(v.auRows).map((e, e_i) => (<Fragment key={e_i}>
                        {!!(e.showDay) && (<>
                          <div style={{ padding: "10px 20px 6px", fontSize: "12px", fontWeight: "700", color: "#3F2B22", borderTop: "1px solid #F1E7DF" }}>{e.day}</div>
                        </>)}
                        <div style={{ display: "grid", gridTemplateColumns: v.auGrid, gap: "16px", alignItems: "center", padding: "10px 20px", borderTop: "1px solid #F5EEE8" }}>
                          <span style={{ fontSize: "12.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 28px", width: "28px", height: "28px", borderRadius: "50%", background: e.avBg, color: e.avFg, fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{e.ini}</span>
                            <span style={{ fontSize: "13.5px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.who}</span>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "650" }}>{e.action}</span>
                            <span style={{ fontSize: "12.5px", color: "#3F2B22", textWrap: "pretty" }}>{e.target}</span>
                          </span>
                          <span style={{ fontSize: "12.5px", color: "#806B60", lineHeight: "1.4", textWrap: "pretty" }}>{e.detail}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.auEmpty) && (<>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "48px 20px", border: "1px dashed #E2CFC1", borderRadius: "14px", textAlign: "center" }}>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>Nothing recorded under this filter</strong>
                      <button type="button" onClick={v.auClear} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Clear filters</button>
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.kAdsPerf) && (<>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apStToggle} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: v.apStCur.dot }}>
                      </span>{v.apStCur.label}<span style={{ color: "#806B60", fontWeight: "500" }}>{v.apStCur.n}</span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.apStOpen) && (<>
                      <div style={{ position: "absolute", top: "42px", left: "0", zIndex: "30", width: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", boxShadow: "0 10px 30px rgba(63,43,34,.14)", display: "flex", flexDirection: "column" }}>
                        {(v.apStOpts).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "38px", padding: "0 10px", border: "0", borderRadius: "9px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: o.fg, textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: o.dot }}>
                            </span>
                            <span style={{ flex: "1" }}>{o.label}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "500", color: "#806B60" }}>{o.n}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </>)}
                  </span>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.dpOpen} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 14px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                        </path>
                      </svg>{v.apRangeLabel}{!!(v.apCmpOn) && (<>
                        <span style={{ height: "22px", padding: "0 8px", borderRadius: "11px", background: "#FFF1E6", color: "#BD4A19", fontSize: "12px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{v.apCmpLabel}</span>
                      </>)}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.dp.open) && (<>
                      <div onClick={v.dpCancel} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "44px", left: "0", zIndex: "8", width: "660px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "20px", boxShadow: "0 16px 40px rgba(40,25,18,.18)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ display: "flex", minHeight: "0" }}>
                          <div style={{ flex: "0 0 230px", display: "flex", flexDirection: "column", borderRight: "1px solid #F1E7DF", padding: "8px" }}>
                            {(v.dp.presets).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", height: "38px", padding: "0 12px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: o.w, color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>{o.label}</button>
                            </Fragment>))}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "12px 8px 4px", borderTop: "1px solid #F1E7DF", fontSize: "13.5px", color: "#3F2B22" }}><input type="number" min="1" max="365" value={v.dp.days} onChange={v.dpSetDays} style={{ width: "54px", height: "36px", padding: "0 8px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "9px", font: "inherit", fontSize: "14px", fontWeight: "650", textAlign: "center", color: "#3F2B22" }} />days up to today</div>
                            <button type="button" onClick={v.dpToggleCmp} style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", padding: "12px 8px 4px", border: "0", borderTop: "1px solid #F1E7DF", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", textAlign: "left" }}>
                              <span style={{ flex: "1" }}>Compare</span>
                              <span style={{ width: "40px", height: "24px", borderRadius: "12px", background: v.dp.cmpTrack, position: "relative", display: "block" }}>
                                <span style={{ position: "absolute", top: "3px", left: `${v.dp.cmpKnob}px`, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                                </span>
                              </span>
                            </button>
                            {!!(v.dp.cmp) && (<>
                              <span style={{ padding: "6px 8px 4px", fontSize: "12.5px", color: "#806B60" }}>{v.dp.cmpHint}</span>
                            </>)}
                          </div>
                          <div style={{ flex: "1", minWidth: "0", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#BD4A19" }}>START</span>
                                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.fromV} onChange={v.dp.fromIn} onFocus={v.dp.fromFocus} onBlur={v.dp.fromBlur} onKeyDown={v.dp.fromKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.fromBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.fromErr}` }} />
                              </div>
                              <span style={{ paddingBottom: "10px", color: "#806B60" }}>–</span>
                              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#BD4A19" }}>END</span>
                                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.toV} onChange={v.dp.toIn} onFocus={v.dp.toFocus} onBlur={v.dp.toBlur} onKeyDown={v.dp.toKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.toBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.toErr}` }} />
                              </div>
                            </div>
                            {!!(v.dp.cmp) && (<>
                              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#2F6FB5" }}>COMPARE START</span>
                                  <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.cfV} onChange={v.dp.cfIn} onFocus={v.dp.cfFocus} onBlur={v.dp.cfBlur} onKeyDown={v.dp.cfKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.cfBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.cfErr}` }} />
                                </div>
                                <span style={{ paddingBottom: "10px", color: "#806B60" }}>–</span>
                                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#2F6FB5" }}>COMPARE END</span>
                                  <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.ctV} onChange={v.dp.ctIn} onFocus={v.dp.ctFocus} onBlur={v.dp.ctBlur} onKeyDown={v.dp.ctKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.ctBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.ctErr}` }} />
                                </div>
                              </div>
                              <span style={{ fontSize: "12px", color: "#806B60" }}>{v.dp.tgtHint}</span>
                            </>)}
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <button type="button" onClick={v.dpPrev} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", textAlign: "center", fontSize: "15px", fontWeight: "700" }}>{v.dp.monthLabel}</strong>
                              <button type="button" onClick={v.dpNext} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3F2B22" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m9 6 6 6-6 6">
                                  </path>
                                </svg>
                              </button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px" }}>
                              {(v.dow).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ height: "26px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>{d.l}</span>
                              </Fragment>))}
                              {(v.dp.cells).map((c, c_i) => (<Fragment key={c_i}>
                                <button type="button" onClick={c.pick} disabled={c.off} style={{ height: "38px", border: "0", padding: "0", background: c.band, borderRadius: c.br, font: "inherit", cursor: "pointer", display: "grid", placeItems: "center" }}>
                                  <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: c.dotBg, color: c.fg, border: c.ring, boxSizing: "border-box", fontSize: "13.5px", fontWeight: c.w, display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{c.num}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "12px 18px", borderTop: "1px solid #F1E7DF" }}>
                          <button type="button" onClick={v.dpCancel} style={{ height: "40px", padding: "0 20px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.dpApply} style={{ height: "40px", padding: "0 24px", borderRadius: "20px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Apply</button>
                        </div>
                      </div>
                    </>)}
                  </span>
                  <span style={{ flex: "1" }}>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "#806B60" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.metaDot }}>
                    </span>{v.metaSync}</span>
                  <button type="button" onClick={v.openMetrics} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 14px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>Metrics · <span>{v.apNSel}</span></button>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apToggleDl} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 16px", boxSizing: "border-box", borderRadius: "18px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h26}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2">
                        </path>
                      </svg>Download report</button>
                    {!!(v.apDlOpen) && (<>
                      <div onClick={v.apToggleDl} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "42px", zIndex: "8", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px", right: "0", width: "240px" }}>
                        <span style={{ padding: "6px 10px", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{v.apRangeLabel} · {v.apNSel} metrics</span>
                        {(v.apDl).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "40px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "600", color: "#3F2B22", cursor: "pointer", textAlign: "left" }} className={DH.h8}><span style={{ width: "34px", height: "22px", borderRadius: "6px", background: o.bg, color: o.fg, fontSize: "10.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{o.tag}</span>{o.label}</button>
                        </Fragment>))}
                      </div>
                    </>)}
                  </span>
                </div>
                {!!(v.apCmpOn) && (<>
                  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "18px", fontSize: "13px", fontWeight: "650" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#BD4A19" }}>
                      </span>{v.apMainShort}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", color: "#2F6FB5" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "#2F6FB5" }}>
                      </span>{v.apCmpShort}</span>
                    <span style={{ color: "#806B60", fontWeight: "500" }}>▲▼ change from blue to orange</span>
                  </div>
                </>)}
                <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflowX: "auto" }}>
                  <div style={{ minWidth: `${v.apMinW}px` }}>
                    <div style={{ display: "grid", gridTemplateColumns: v.apCols, gap: "12px", padding: "12px 20px", borderBottom: "1px solid #EBDDD2", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>
                      <button type="button" onClick={v.apSortName} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "5px", padding: "0", border: "0", background: "none", font: "inherit", color: "inherit", letterSpacing: "inherit", cursor: "pointer", textAlign: "left" }}>AD<span style={{ fontSize: "10px", color: v.apNameAc }}>{v.apNameArrow}</span><span onPointerDown={v.apNameResize} onDoubleClick={v.apNameUnsize} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}><span style={{ width: "1px", margin: "8px 0", background: "#EBDDD2" }}></span></span></button>
                      {(v.apHead).map((h, h_i) => (<Fragment key={h_i}>
                        <button type="button" onClick={h.sort} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", padding: "0", border: "0", background: "none", font: "inherit", color: h.fg, letterSpacing: "inherit", textTransform: "uppercase", textAlign: "center", cursor: "pointer" }} className={DH.h2}>
                          <span>{h.label}</span>
                          <span style={{ flex: "0 0 auto", fontSize: "10px", color: h.ac }}>{h.arrow}</span><span onPointerDown={h.resize} onDoubleClick={h.unsize} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}><span style={{ width: "1px", margin: "8px 0", background: "#EBDDD2" }}></span></span>
                        </button>
                      </Fragment>))}
                    </div>
                    {(v.apRows).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "grid", gridTemplateColumns: v.apCols, gap: "12px", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid #F1E7DF", background: r.bg, fontSize: "14px", fontWeight: r.w, fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                          <span style={{ flex: "0 0 10px", width: "10px", height: "10px", borderRadius: "50%", background: r.dot }}>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                            <strong style={{ fontSize: "14.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                            <span style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{r.meta}</span>
                          </span>
                        </span>
                        {(r.cells).map((c, c_i) => (<Fragment key={c_i}>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>{!!(c.cv) && (<>
                                <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#BD4A19" }}>
                                </span>
                              </>)}{c.v}</span>
                            {!!(c.cv) && (<>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "550", color: "#2F6FB5" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#2F6FB5" }}>
                                </span>{c.cv}</span>
                            </>)}
                            {!!(c.d) && (<>
                              <span style={{ height: "18px", padding: "0 6px", borderRadius: "9px", background: c.db, fontSize: "11.5px", fontWeight: "700", color: c.dc, display: "inline-flex", alignItems: "center" }}>{c.d}</span>
                            </>)}
                          </span>
                        </Fragment>))}
                      </div>
                    </Fragment>))}
                  </div>
                </div>
              </>)}
              {!!(v.kCal) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.toggleRange} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                        </path>
                      </svg>{v.rangeLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.rangeOpen) && (<>
                      <div onClick={v.toggleRange} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "280px", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {(v.rangeOpts).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "40px", padding: "0 12px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                            <span style={{ flex: "1" }}>{o.label}</span>
                            <span style={{ fontSize: "12px", color: "#806B60", fontWeight: "500" }}>{o.hint}</span>
                          </button>
                        </Fragment>))}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px", padding: "10px 12px 6px", borderTop: "1px solid #F1E7DF" }}>
                          <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>CUSTOM</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <input type="date" value={v.rangeFrom} min="2026-10-01" max="2026-10-31" onChange={v.setFrom} style={{ flex: "1", minWidth: "0", height: "34px", padding: "0 8px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "9px", font: "inherit", fontSize: "13px", color: "#3F2B22" }} />
                            <span style={{ color: "#806B60" }}>–</span>
                            <input type="date" value={v.rangeTo} min="2026-10-01" max="2026-10-31" onChange={v.setTo} style={{ flex: "1", minWidth: "0", height: "34px", padding: "0 8px", boxSizing: "border-box", border: "1px solid #E2CFC1", borderRadius: "9px", font: "inherit", fontSize: "13px", color: "#3F2B22" }} />
                          </div>
                        </div>
                      </div>
                    </>)}
                  </span>
                  <select onChange={v.pickShowroom} value={v.calShowroom} style={{ height: "34px", minWidth: "200px", padding: "0 30px 0 12px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>
                    {(v.showroomOpts).map((o, o_i) => (<Fragment key={o_i}>
                      <option value={o.v}>{o.label}</option>
                    </Fragment>))}
                  </select>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <button type="button" onClick={v.toggleCalWho} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "32px", padding: "0 10px 0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75">
                        </path>
                      </svg>{v.calWhoLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.calWhoOpen) && (<>
                      <div onClick={v.toggleCalWho} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "280px", maxHeight: "420px", overflow: "auto", padding: "8px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 12px 32px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ padding: "6px 10px 6px", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>Show visits of · pick one or more</span>
                        {(v.calWhoOpts).map((w, w_i) => (<Fragment key={w_i}>
                          {!!(w.head) && (<>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 4px 0", padding: "10px 6px 4px", borderTop: "1px solid #F1E7DF", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", color: "#806B60" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }}>
                              </span>{w.label}</div>
                          </>)}
                          {!!(w.sel) && (<>
                            <button type="button" onClick={w.pick} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "38px", padding: "4px 10px", border: "0", borderRadius: "10px", background: "#FFF1E6", font: "inherit", color: "#BD4A19", cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                              <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "50%", background: w.avBg, color: w.avFg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{w.ini}</span>
                              <span style={{ flex: "1", fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap" }}>{w.label}</span>
                              <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: "1.5px solid #BD4A19", background: "#BD4A19", display: "grid", placeItems: "center" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-10">
                                  </path>
                                </svg>
                              </span>
                            </button>
                          </>)}
                          {!!(w.unsel) && (<>
                            <button type="button" onClick={w.pick} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "38px", padding: "4px 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", color: "#3F2B22", cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                              <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "50%", background: w.avBg, color: w.avFg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{w.ini}</span>
                              <span style={{ flex: "1", fontSize: "14px", fontWeight: "550", whiteSpace: "nowrap" }}>{w.label}</span>
                              <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: "1.5px solid #CDBCAE", background: "#fff", display: "grid", placeItems: "center" }}>
                              </span>
                            </button>
                          </>)}
                        </Fragment>))}
                        <div style={{ position: "sticky", bottom: "-8px", display: "flex", gap: "8px", margin: "6px -8px -8px", padding: "10px", background: "#fff", borderTop: "1px solid #F1E7DF" }}>
                          <button type="button" onClick={v.calWhoClear} style={{ flex: "1", height: "36px", borderRadius: "18px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Clear</button>
                          <button type="button" onClick={v.toggleCalWho} style={{ flex: "1", height: "36px", borderRadius: "18px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Done</button>
                        </div>
                      </div>
                    </>)}
                  </span>
                  <span style={{ width: "1px", height: "22px", background: "#EBDDD2" }}>
                  </span>
                  {(v.calTeams).map((o, o_i) => (<Fragment key={o_i}>
                    <button type="button" onClick={o.pick} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, font: "inherit", fontSize: "13px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap" }}>{!!(o.dot) && (<>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.dot }}>
                        </span>
                      </>)}{o.label}</button>
                  </Fragment>))}
                  <span style={{ flex: "1" }}>
                  </span>
                  <button type="button" onClick={v.goToday} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 8px 0 14px", boxSizing: "border-box", borderRadius: "18px", border: `1px solid ${v.todayBd}`, background: v.todayBg, color: "#BD4A19", font: "inherit", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h11}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM12 14h.01">
                      </path>
                    </svg>Today's appt<span style={{ minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.todayN}</span></button>
                  <div style={{ display: "inline-flex", background: "#F5EBE3", borderRadius: "11px", padding: "3px", gap: "2px" }}>
                    {(v.calViews).map((o, o_i) => (<Fragment key={o_i}>
                      {!!(o.on) && (<>
                        <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 14px", borderRadius: "8px", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13px", fontWeight: "650", boxShadow: "rgba(63,43,34,.14) 0 1px 3px", cursor: "pointer" }}>{o.label}</button>
                      </>)}
                      {!!(o.off) && (<>
                        <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 14px", borderRadius: "8px", background: "transparent", color: "#806B60", font: "inherit", fontSize: "13px", fontWeight: "550", cursor: "pointer" }} className={DH.h2}>{o.label}</button>
                      </>)}
                    </Fragment>))}
                  </div>
                </div>
                {!(v.calRail) && (<><div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr)) minmax(0, 1.8fr)", gap: "14px", alignItems: "center", padding: "18px 22px", borderRadius: "20px", background: "linear-gradient(135deg, #5A3826, #3A2218)", color: "#fff" }}>
                  {(v.calStats).map((k, k_i) => (<Fragment key={k_i}>
                    <button type="button" onClick={k.open} style={{ display: "flex", flexDirection: "column", gap: "2px", margin: "-8px -10px", padding: "8px 10px", border: "0", borderRadius: "12px", background: "transparent", font: "inherit", color: "#fff", textAlign: "left", cursor: "pointer" }} className={DH.h38}>
                      <b style={{ fontSize: "26px", fontWeight: "700", color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</b>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12.5px", opacity: ".85" }}>{k.label}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg></span>
                    </button>
                  </Fragment>))}
                  <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ display: "flex", gap: "4px", marginBottom: "2px" }}>
                      {(v.calBarBy).map((o, o_i) => (<Fragment key={o_i}>
                        <button type="button" onClick={o.pick} style={{ height: "22px", padding: "0 9px", border: "0", borderRadius: "11px", background: o.bg, opacity: o.op, font: "inherit", fontSize: "11.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>{o.l}</button>
                      </Fragment>))}
                    </span>
                    {(v.calTeamBars).map((t, t_i) => (<Fragment key={t_i}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                        <span style={{ flex: "0 0 60px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                        <span style={{ flex: "1", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,.15)", overflow: "hidden" }}>
                          <span style={{ display: "block", height: "100%", width: `${t.pct}%`, background: t.color }}>
                          </span>
                        </span>
                        <span style={{ flex: "0 0 auto", opacity: ".85", fontVariantNumeric: "tabular-nums" }}>{t.label}</span>
                      </span>
                    </Fragment>))}
                  </span>
                </div></>)}
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <strong style={{ fontSize: "18px", fontWeight: "700" }}>{v.calTitle}</strong>
                  <span style={{ fontSize: "13px", color: "#806B60" }}>{v.calSub}</span>
                </div>
                {!!(v.calMonth) && (<>
                  <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderBottom: "1px solid #EBDDD2" }}>
                      {(v.dow).map((d, d_i) => (<Fragment key={d_i}>
                        <span style={{ padding: "10px 12px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{d.l}</span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                      {(v.monthCells).map((c, c_i) => (<Fragment key={c_i}>
                        <div style={{ minHeight: "92px", padding: "6px", borderRight: "1px solid #F1E7DF", borderBottom: "1px solid #F1E7DF", background: c.bg, display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span style={{ alignSelf: "flex-start", minWidth: "24px", height: "24px", padding: "0 6px", boxSizing: "border-box", borderRadius: "12px", background: c.numBg, color: c.numFg, fontSize: "12.5px", fontWeight: "700", display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{c.num}</span>
                          {(c.visits).map((vi, vi_i) => (<Fragment key={vi_i}>
                            <button type="button" onClick={vi.open} style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: "0", padding: "3px 6px", border: "0", borderRadius: "6px", background: vi.tint, color: vi.color, font: "inherit", fontSize: "11.5px", fontWeight: "650", textAlign: "left", cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden" }}>
                              <span style={{ flex: "0 0 auto", fontVariantNumeric: "tabular-nums" }}>{vi.short}</span>
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", color: "#3F2B22" }}>{vi.name}</span>
                            </button>
                          </Fragment>))}
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                </>)}
                {!!(v.calWeek) && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "8px" }}>
                    {(v.weekCols).map((c, c_i) => (<Fragment key={c_i}>
                      <div style={{ minHeight: "320px", padding: "10px 8px", borderRadius: "16px", border: `1px solid ${c.bd}`, background: "#fff", display: "flex", flexDirection: "column", gap: "6px", minWidth: "0" }}>
                        <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", paddingBottom: "6px", borderBottom: "1px solid #F1E7DF" }}>
                          <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: c.fg }}>{c.dow}</span>
                          <b style={{ fontSize: "20px", fontWeight: "700", color: c.fg }}>{c.num}</b>
                        </span>
                        {(c.visits).map((vi, vi_i) => (<Fragment key={vi_i}>
                          <button type="button" onClick={vi.open} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px", border: "0", borderLeft: `3px solid ${vi.color}`, borderRadius: "8px", background: vi.tint, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer", minWidth: "0" }}>
                            <b style={{ fontSize: "12px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{vi.time}</b>
                            <span style={{ fontSize: "12.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vi.name}</span>
                            <span style={{ fontSize: "11px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vi.rep}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.calDay) && (<>
                  <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                    {(v.daySlots).map((t, t_i) => (<Fragment key={t_i}>
                      <div style={{ display: "flex", alignItems: "stretch", gap: "14px", padding: "12px 16px", borderBottom: "1px solid #F1E7DF", minHeight: "44px" }}>
                        <b style={{ flex: "0 0 72px", paddingTop: "8px", fontSize: "14px", fontWeight: "700", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{t.time}</b>
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(t.visits).map((vi, vi_i) => (<Fragment key={vi_i}>
                            <button type="button" onClick={vi.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 14px", border: "0", borderLeft: `4px solid ${vi.color}`, borderRadius: "10px", background: vi.tint, font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }}>
                              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{vi.name}</strong>
                                <span style={{ fontSize: "12.5px", color: "#806B60" }}>{vi.who}</span>
                              </span>
                              <span style={{ height: "22px", lineHeight: "22px", padding: "0 9px", borderRadius: "11px", background: vi.stBg, color: vi.stFg, fontSize: "11.5px", fontWeight: "700" }}>{vi.status}</span>
                            </button>
                          </Fragment>))}
                          {!!(t.free) && (<>
                            <span style={{ paddingTop: "8px", fontSize: "13px", color: "#C9B8AC" }}>{v.freeLabel}</span>
                          </>)}
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.calUp) && (<>
                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    {(v.upDays).map((d, d_i) => (<Fragment key={d_i}>
                      <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "18px", overflow: "hidden" }}>
                        <span style={{ display: "block", padding: "12px 16px 8px", fontSize: "13px", fontWeight: "700", color: d.fg }}>{d.label}</span>
                        {(d.visits).map((vi, vi_i) => (<Fragment key={vi_i}>
                          <button type="button" onClick={vi.open} style={{ width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", border: "0", borderTop: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                            <span style={{ flex: "0 0 4px", width: "4px", height: "38px", borderRadius: "2px", background: vi.color }}>
                            </span>
                            <b style={{ flex: "0 0 72px", fontSize: "15px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{vi.time}</b>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <strong style={{ fontSize: "15px", fontWeight: "650" }}>{vi.name}</strong>
                              <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{vi.who}</span>
                            </span>
                            <span style={{ height: "22px", lineHeight: "22px", padding: "0 9px", borderRadius: "11px", background: vi.stBg, color: vi.stFg, fontSize: "11.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{vi.status}</span>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 6 6 6-6 6">
                              </path>
                            </svg>
                          </button>
                        </Fragment>))}
                      </div>
                    </Fragment>))}
                  </div>
                </>)}
              </>)}
            </div>
          </>)}
          {!!(v.showScrim) && (<>
            <div onClick={v.closePane} style={{ position: "absolute", inset: "0", background: "rgba(40,25,18,.18)", cursor: "pointer" }}>
            </div>
          </>)}
          {!!(v.paneShown) && (<>
            <aside style={v.paneStyle}>
              {!!(v.paneDrag) && (<>
                <div onPointerDown={v.dragPane} onDoubleClick={v.resetPane} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
              </>)}
              {!!(v.ibCols) && (<>
                <div onPointerDown={v.dragList} onDoubleClick={v.resetList} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", display: "flex", justifyContent: "center", touchAction: "none" }} className={DH.h23}>
                </div>
              </>)}
              {!!(v.paneEmpty) && (<>
                <div style={{ flex: "1", display: "grid", placeItems: "center", padding: "24px", textAlign: "center" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9B8AC" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={v.emptyIcon}>
                      </path>
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "#806B60" }}>{v.emptyText}</span>
                    <span style={{ fontSize: "12.5px", color: "#A8968B" }}>{v.emptyHint}</span>
                  </div>
                </div>
              </>)}
              {!!(v.paneFull) && (<>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 16px", background: "#fff", borderBottom: "1px solid #EBDDD2" }}>
                  {!!(v.ph.avatar) && (<>
                    <span style={{ flex: "0 0 auto", width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", background: "#E4EDF8", color: "#3F2B22" }}>{v.ph.avatar}</span>
                  </>)}
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.title}</strong>
                    <span style={{ fontSize: "12.5px", color: v.ph.subColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.sub}</span>
                  </span>
                  {!!(v.ph.menu) && (<>
                    <span style={{ position: "relative", flex: "0 0 auto" }}>
                      <button type="button" onClick={v.toggleMenu} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid #EBDDD2", background: v.menuBtnBg, display: "grid", placeItems: "center", boxSizing: "border-box", cursor: "pointer" }} className={DH.h8}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="#3F2B22">
                          <circle cx="12" cy="5" r="1.8">
                          </circle>
                          <circle cx="12" cy="12" r="1.8">
                          </circle>
                          <circle cx="12" cy="19" r="1.8">
                          </circle>
                        </svg>
                      </button>
                      {!!(v.menuOpen) && (<>
                        <div onClick={v.closeMenu} style={{ position: "fixed", inset: "-2000px", zIndex: "7", background: "transparent" }}>
                        </div>
                        <div style={{ position: "absolute", top: "40px", right: "0", zIndex: "8", width: "240px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column" }}>
                          {(v.chatMenuItems).map((o, o_i) => (<Fragment key={o_i}>
                            {!!(o.sep) && (<>
                              <span style={{ height: "1px", margin: "4px 10px", background: "#F1E7DF" }}>
                              </span>
                            </>)}
                            <button type="button" onClick={o.run} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "42px", padding: "4px 12px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "550", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={o.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 20px" }}>
                                <path d={o.d}>
                                </path>
                              </svg>
                              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1px" }}>{o.label}{!!(o.sub) && (<>
                                  <span style={{ fontSize: "12px", fontWeight: "500", color: "#806B60" }}>{o.sub}</span>
                                </>)}</span>
                            </button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </span>
                  </>)}
                  <button type="button" onClick={v.closePane} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "#3F2B22" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                {!!(v.kChat) && (<>
                  {!!(v.chatFromList) && (<>
                    <button type="button" onClick={v.backToStatus} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.backStatusLabel}</button>
                  </>)}
                  {!!(v.chatFromTeam) && (<>
                    <button type="button" onClick={v.backToPerson} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.backPersonLabel}</button>
                  </>)}
                  <p style={{ flex: "0 0 auto", margin: "0", padding: "8px 20px", fontSize: "12px", color: "#806B60", background: "#fff" }}>{v.chatOwner}</p>
                  <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "10px 20px", backgroundColor: "#EFE7DE", backgroundImage: "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22240%22%20viewBox%3D%220%200%20240%20240%22%20xmlns%3Ac2pa%3D%22http%3A%2F%2Fc2pa.org%2Fmanifest%22%3E%3Cmetadata%3E%3Cc2pa%3Amanifest%3EAAAWgmp1bWIAAAAeanVtZGMycGEAEQAQgAAAqgA4m3EDYzJwYQAAABZcanVtYgAAAEdqdW1kYzJtYQARABCAAACqADibcQN1cm46YzJwYTo5ZWFmOWIzOC1kNTkzLTQyOWQtOTkyNi1hNjdmZWE4ZjVmNDcAAAADl2p1bWIAAAApanVtZGMyYXMAEQAQgAAAqgA4m3EDYzJwYS5hc3NlcnRpb25zAAAAALxqdW1iAAAARGp1bWRjYm9yABEAEIAAAKoAOJtxE2MycGEuaW5ncmVkaWVudC52MwAAAAAYYzJzaC5n%2B3GamVtjP1Nu48g4xPcAAABwY2JvcqNpZGM6Zm9ybWF0bWltYWdlL3N2Zyt4bWxqaW5zdGFuY2VJRHgseG1wOmlpZDo2ZTVkNDFiZi02MmFhLTQyMDctOWI3Mi01ZjZlODE4OGIzYjdscmVsYXRpb25zaGlwaHBhcmVudE9mAAAB4mp1bWIAAABBanVtZGNib3IAEQAQgAAAqgA4m3ETYzJwYS5hY3Rpb25zLnYyAAAAABhjMnNoHNx5AoLe0IwABjDTTKVPyAAAAZljYm9yomdhY3Rpb25zgqJmYWN0aW9ua2MycGEub3BlbmVkanBhcmFtZXRlcnOha2luZ3JlZGllbnRzgaJjdXJseC1zZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmluZ3JlZGllbnQudjNkaGFzaFggmA28hKHq5ZZucVKZm8w1CnHJ%2BNSw7C98gSiG8i6awQGkZmFjdGlvbngdY29tLmFudGhyb3BpYy5jbGF1ZGUucHJvdmlkZWRqcGFyYW1ldGVyc6F4H2NvbS5hbnRocm9waWMub3JpZ2luLWNvbmZpZGVuY2VndW5rbm93bmtkZXNjcmlwdGlvbnhmQ2xhdWRlIHByb3ZpZGVkIHRoaXMgZmlsZSBhdCB0aGUgcmVxdWVzdCBvZiBhIHVzZXIgYW5kIG1heSBoYXZlIGNyZWF0ZWQgb3IgbW9kaWZpZWQgdGhlIGZpbGUgY29udGVudHMubXNvZnR3YXJlQWdlbnShZG5hbWVmQ2xhdWRlcmFsbEFjdGlvbnNJbmNsdWRlZPUAAADIanVtYgAAAEBqdW1kY2JvcgARABCAAACqADibcRNjMnBhLmhhc2guZGF0YQAAAAAYYzJzaI6watomDKJihMTdVS%2BG5MAAAACAY2JvcqVjYWxnZnNoYTI1NmNwYWRNAAAAAAAAAAAAAAAAAGRoYXNoWCAn2KA2qq3Hfr2%2BBiY8Sgy%2BQNuiXnmF5YsIFByFf8DaeWRuYW1lbmp1bWJmIG1hbmlmZXN0amV4Y2x1c2lvbnOBomVzdGFydBiWZmxlbmd0aBkeBAAAAj5qdW1iAAAAJ2p1bWRjMmNsABEAEIAAAKoAOJtxA2MycGEuY2xhaW0udjIAAAACD2Nib3KlY2FsZ2ZzaGEyNTZpc2lnbmF0dXJleE1zZWxmI2p1bWJmPS9jMnBhL3VybjpjMnBhOjllYWY5YjM4LWQ1OTMtNDI5ZC05OTI2LWE2N2ZlYThmNWY0Ny9jMnBhLnNpZ25hdHVyZWppbnN0YW5jZUlEeCx4bXA6aWlkOjAyMjQ4MDljLWI2YmQtNDRkMi05YjhiLTA5YTExMzYyNDFmN3JjcmVhdGVkX2Fzc2VydGlvbnODomN1cmx4LXNlbGYjanVtYmY9YzJwYS5hc3NlcnRpb25zL2MycGEuaW5ncmVkaWVudC52M2RoYXNoWCCYDbyEoerllm5xUpmbzDUKccn41LDsL3yBKIbyLprBAaJjdXJseCpzZWxmI2p1bWJmPWMycGEuYXNzZXJ0aW9ucy9jMnBhLmFjdGlvbnMudjJkaGFzaFgguHSE7PUzPOmyhR0uRwsvmsJwFG3dCIkkvUEl71ykvnKiY3VybHgpc2VsZiNqdW1iZj1jMnBhLmFzc2VydGlvbnMvYzJwYS5oYXNoLmRhdGFkaGFzaFgg3VBiBu4TxTGlGeik8yy6aCcS6ZdyaPY0DKPa0IOmJNp0Y2xhaW1fZ2VuZXJhdG9yX2luZm%2BjZG5hbWVvQW50aHJvcGljIEZpbGVzZ3ZlcnNpb25lMS4wLjBrc3BlY1ZlcnNpb25lMi40LjAAABA4anVtYgAAAChqdW1kYzJjcwARABCAAACqADibcQNjMnBhLnNpZ25hdHVyZQAAABAIY2JvctKEWQISogEmGCFZAgowggIGMIIBjaADAgECAhRA5aAK7sI50L64g%2FoGQgU9Z1UTADAKBggqhkjOPQQDAzBJMRcwFQYDVQQKEw5BbnRocm9waWMsIFBCQzEuMCwGA1UEAxMlQW50aHJvcGljIENvbnRlbnQgQ3JlZGVudGlhbHMgUm9vdCBDQTAeFw0yNjA4MDcxODQzNTZaFw0yODA4MDYxOTQzNTZaMEQxFzAVBgNVBAoTDkFudGhyb3BpYywgUEJDMSkwJwYDVQQDEyBBbnRocm9waWMgQ2xhdWRlIENvbnRlbnQgU2lnbmluZzBZMBMGByqGSM49AgEGCCqGSM49AwEHA0IABJh6CmvLUBgFFNU0vUKlOVtE6djd17L5SuwX0LemFisBM3dkd%2F3cyjxFA3Qo5S46fX0%2FihY0VZ7mfb9KF703t5OjWDBWMA4GA1UdDwEB%2FwQEAwIHgDAVBgNVHSUEDjAMBgorBgEEAYPoXgIBMAwGA1UdEwEB%2FwQCMAAwHwYDVR0jBBgwFoAUzlHiBIFOZFsj%2BOPEz5o%2BnMHXXMIwCgYIKoZIzj0EAwMDZwAwZAIwMXMdFJ4BetLLVY7ORuE9noqbbAZOZn%2FaArXyTwFAZfKrPzxF2vPoJNf1%2BUCdg1XGAjBwX1zd9WGqYkqmL5SFqw1QySjr1zJfpJM9%2B1rdDwSPLMOPOjKuiXjoU%2FpUUeG9RwmhY3BhZFkNngAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPZYQINdsvbpy3jWu6IJsli1FAPfajxZrqIIYnIGv53ID%2Fk3teatYqNqVpsUQKnGE80cQQdlE1awJpC%2FV%2ByuaFcAZpo%3D%3C%2Fc2pa%3Amanifest%3E%3C%2Fmetadata%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%237A6457%22%20stroke-opacity%3D%22.13%22%20stroke-width%3D%221.3%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20transform%3D%22translate(14%2012)%20rotate(-12%2012%2012)%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(92%208)%20rotate(10%2012%2012)%22%20d%3D%22M20%209V6a2%202%200%200%200-2-2H6a2%202%200%200%200-2%202v3M2%2016a2%202%200%200%200%202%202h16a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v1.5a.5.5%200%200%201-.5.5h-11a.5.5%200%200%201-.5-.5V11a2%202%200%200%200-4%200zM4%2018v2M20%2018v2M12%204v9%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(176%2020)%20rotate(-6%2012%2012)%22%20d%3D%22M2%204v16M2%208h18a2%202%200%200%201%202%202v10M2%2017h20M6%208v9%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(40%2074)%20rotate(8%2012%2012)%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(124%2066)%20rotate(-14%2012%2012)%22%20d%3D%22M8%202h8l4%2010H4L8%202ZM12%2012v6M8%2022v-2c0-1.1.9-2%202-2h4a2%202%200%200%201%202%202v2H8Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(200%2092)%20rotate(12%2012%2012)%22%20d%3D%22M19%2014c1.49-1.46%203-3.21%203-5.5A5.5%205.5%200%200%200%2016.5%203c-1.76%200-3%20.5-4.5%202-1.5-1.5-2.74-2-4.5-2A5.5%205.5%200%200%200%202%208.5c0%202.3%201.5%204.05%203%205.5l7%207Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(10%20140)%20rotate(6%2012%2012)%22%20d%3D%22M12%202l3.09%206.26L22%209.27l-5%204.87%201.18%206.88L12%2017.77l-6.18%203.25L7%2014.14%202%209.27l6.91-1.01L12%202z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(78%20128)%20rotate(-8%2012%2012)%22%20d%3D%22M8%202v4M16%202v4M3%2010h18M5%204h14a2%202%200%200%201%202%202v14a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2V6a2%202%200%200%201%202-2Z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(160%20150)%20rotate(14%2012%2012)%22%20d%3D%22M19%209V6a2%202%200%200%200-2-2H7a2%202%200%200%200-2%202v3M3%2016a2%202%200%200%200%202%202h14a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v2H7v-2a2%202%200%200%200-4%200ZM5%2018v2M19%2018v2%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(34%20200)%20rotate(-10%2012%2012)%22%20d%3D%22M22%2016.92v3a2%202%200%200%201-2.18%202%2019.79%2019.79%200%200%201-8.63-3.07%2019.5%2019.5%200%200%201-6-6%2019.79%2019.79%200%200%201-3.07-8.67A2%202%200%200%201%204.11%202h3a2%202%200%200%201%202%201.72%2012.84%2012.84%200%200%200%20.7%202.81%202%202%200%200%201-.45%202.11L8.09%209.91a16%2016%200%200%200%206%206l1.27-1.27a2%202%200%200%201%202.11-.45%2012.84%2012.84%200%200%200%202.81.7A2%202%200%200%201%2022%2016.92z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(118%20196)%20rotate(4%2012%2012)%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%3E%3C%2Fpath%3E%3Cpath%20transform%3D%22translate(196%20206)%20rotate(-12%2012%2012)%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%3E%3C%2Fpath%3E%3C%2Fg%3E%3Cg%20fill%3D%22%237A6457%22%20fill-opacity%3D%22.12%22%3E%3Ccircle%20cx%3D%2266%22%20cy%3D%2240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%2240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22104%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22230%22%20cy%3D%2260%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%22170%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22140%22%20cy%3D%22120%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22224%22%20cy%3D%22160%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%22230%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%22240%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%22100%22%20r%3D%221.6%22%3E%3C%2Fcircle%3E%3C%2Fg%3E%3C%2Fsvg%3E')", backgroundSize: "240px 240px" }}>
                    {!!(v.firstDay) && (<><span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#fff", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{v.firstDay}</span></>)}{!!(v.pinShown) && (<>
                      <div style={{ position: "sticky", top: "-10px", zIndex: "3", margin: "-10px -20px 0", display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px", background: "#fff", borderBottom: "1px solid #EBDDD2" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z">
                          </path>
                        </svg>
                        <span style={{ flex: "1", minWidth: "0", fontSize: "12.5px", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.pinText}</span>
                        <button type="button" onClick={v.unpinMsg} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Unpin</button>
                      </div>
                    </>)}{(v.sysLines).map((x, x_i) => (<Fragment key={x_i}>
                      <span style={{ alignSelf: "center", maxWidth: "86%", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "#6B645A", fontSize: "12px", fontWeight: "600", textAlign: "center" }}>{x.text} · {x.at}</span>
                    </Fragment>))}
                    {(v.msgs).map((m, m_i) => (<Fragment key={m.key}>{!!(m.day) && (<><span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#fff", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{m.day}</span></>)}{!!(m.sys) && (<><span style={{ alignSelf: "center", maxWidth: "86%", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "#6B645A", fontSize: "12px", fontWeight: "600", textAlign: "center" }}>{m.sys}</span></>)}{!!(m.inn) && (<>
                        <div onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ position: "relative", alignSelf: "flex-start", maxWidth: "80%", marginBottom: m.rxGap }}>
                          <div data-msg={m.id} style={{ display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: "16px 16px 16px 4px", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", background: "#fff", color: "#3F2B22" }}>
                            {!!(m.quote) && (<span style={{ display: "flex", flexDirection: "column", gap: "1px", margin: m.quoteMargin, padding: "6px 10px", borderRadius: "10px", borderLeft: "3px solid #BD4A19", background: "rgba(63,43,34,.06)" }}><strong style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.quote.text}</span></span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(63,43,34,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "rgba(63,43,34,.06)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "#C8402A", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "#3F2B22", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "12px", color: "#806B60" }}>{m.docType}</small></span></span>)}{!!(m.text) && (<p style={{ display: m.pShow, padding: m.inPad, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>)}
                            <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: "#806B60" }}>{!!(m.starred) && (<>
                                <span style={{ color: "#A46312", fontSize: "12px" }}>★</span>
                              </>)}{m.time}</span>
                          </div>
                          {!!(m.hasReaction) && (<>
                            <span style={{ position: "absolute", bottom: "-14px", left: "10px", minWidth: "26px", height: "24px", padding: "0 5px", boxSizing: "border-box", borderRadius: "12px", background: "#fff", border: "1px solid #EBDDD2", fontSize: "14px", display: "grid", placeItems: "center" }}>{m.reaction}</span>
                          </>)}
                          {!!(m.hover) && (<>
                            <button type="button" onClick={m.menuToggle} title="Message options" style={{ position: "absolute", top: "4px", right: "-34px", width: "28px", height: "28px", border: "1px solid #EBDDD2", borderRadius: "50%", background: "#fff", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(63,43,34,.12)" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg>
                            </button>
                          </>)}
                          {!!(m.menuOpen) && (<>
                            <div onClick={m.menuClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                            </div>
                            <div style={{ position: "absolute", top: "36px", left: "0", zIndex: "8", width: "230px", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 10px 28px rgba(40,25,18,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 4px 8px", borderBottom: "1px solid #F1E7DF", marginBottom: "4px" }}>
                                {(m.reactBar).map((r, r_i) => (<Fragment key={r_i}>
                                  <button type="button" onClick={r.pick} style={{ width: "32px", height: "32px", padding: "0", border: "0", borderRadius: "50%", background: r.bg, fontSize: "18px", cursor: "pointer" }} className={DH.h3}>{r.e}</button>
                                </Fragment>))}
                              </div>
                              {(m.acts).map((m, m_i) => (<Fragment key={m_i}>
                                <button type="button" onClick={m.run} style={{ display: "flex", alignItems: "center", gap: "12px", height: "36px", padding: "0 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "600", color: m.fg, textAlign: "left", cursor: "pointer" }} className={DH.h8}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d={m.d}>
                                    </path>
                                  </svg>{m.label}</button>
                              </Fragment>))}
                            </div>
                          </>)}
                        </div>
                      </>)}{!!(m.out) && (<>
                        <div onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ position: "relative", alignSelf: "flex-end", maxWidth: "80%", marginBottom: m.rxGap }}>
                          <div data-msg={m.id} style={{ display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: "16px 16px 4px 16px", boxShadow: "rgba(63,43,34,.1) 0 1px 1px", background: "#F9D5B8", color: "#3F2B22" }}>
                            {!!(m.quote) && (<span style={{ display: "flex", flexDirection: "column", gap: "1px", margin: m.quoteMargin, padding: "6px 10px", borderRadius: "10px", borderLeft: "3px solid #BD4A19", background: "rgba(63,43,34,.06)" }}><strong style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.quote.text}</span></span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(63,43,34,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "rgba(63,43,34,.06)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "#C8402A", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "#3F2B22", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "12px", color: "#806B60" }}>{m.docType}</small></span></span>)}{!!(m.text) && (<p style={{ display: m.pShow, padding: m.inPad, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>)}
                            <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: "#806B60" }}>{!!(m.starred) && (<>
                                <span style={{ color: "#A46312", fontSize: "12px" }}>★</span>
                              </>)}{m.time}{!!(m.hasTick) && (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.tick} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5">
                                </path>
                              </svg>)}{!!(m.failed) && (<span style={{ color: "#A3371A", fontWeight: "600" }}>Not sent</span>)}</span>
                          </div>
                          {!!(m.hasReaction) && (<>
                            <span style={{ position: "absolute", bottom: "-14px", right: "10px", minWidth: "26px", height: "24px", padding: "0 5px", boxSizing: "border-box", borderRadius: "12px", background: "#fff", border: "1px solid #EBDDD2", fontSize: "14px", display: "grid", placeItems: "center" }}>{m.reaction}</span>
                          </>)}
                          {!!(m.hover) && (<>
                            <button type="button" onClick={m.menuToggle} title="Message options" style={{ position: "absolute", top: "4px", left: "-34px", width: "28px", height: "28px", border: "1px solid #EBDDD2", borderRadius: "50%", background: "#fff", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(63,43,34,.12)" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg>
                            </button>
                          </>)}
                          {!!(m.menuOpen) && (<>
                            <div onClick={m.menuClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                            </div>
                            <div style={{ position: "absolute", top: "36px", right: "0", zIndex: "8", width: "230px", padding: "6px", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 10px 28px rgba(40,25,18,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 4px 8px", borderBottom: "1px solid #F1E7DF", marginBottom: "4px" }}>
                                {(m.reactBar).map((r, r_i) => (<Fragment key={r_i}>
                                  <button type="button" onClick={r.pick} style={{ width: "32px", height: "32px", padding: "0", border: "0", borderRadius: "50%", background: r.bg, fontSize: "18px", cursor: "pointer" }} className={DH.h3}>{r.e}</button>
                                </Fragment>))}
                              </div>
                              {(m.acts).map((m, m_i) => (<Fragment key={m_i}>
                                <button type="button" onClick={m.run} style={{ display: "flex", alignItems: "center", gap: "12px", height: "36px", padding: "0 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "600", color: m.fg, textAlign: "left", cursor: "pointer" }} className={DH.h8}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                                    <path d={m.d}>
                                    </path>
                                  </svg>{m.label}</button>
                              </Fragment>))}
                            </div>
                          </>)}
                        </div>
                      </>)}{!!(m.appt) && (<>
                      <div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", width: "300px", maxWidth: "86%", padding: "6px 6px 4px", boxSizing: "border-box", borderRadius: "16px 16px 4px 16px", background: "#F9D5B8", boxShadow: "rgba(63,43,34,.1) 0 1px 1px" }}>
                        <div style={{ borderRadius: "12px", overflow: "hidden", background: "#fff" }}>
                          <div style={{ display: "flex", gap: "12px", padding: "12px" }}>
                            <span style={{ flex: "0 0 52px", width: "52px", padding: "6px 0", borderRadius: "10px", background: "#FFF0E4", color: "#BD4A19", display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.05" }}>
                              <b style={{ fontSize: "10.5px", fontWeight: "700", letterSpacing: ".06em" }}>{m.appt.dow}</b>
                              <b style={{ fontSize: "22px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.appt.day}</b>
                              <b style={{ fontSize: "10.5px", fontWeight: "700", letterSpacing: ".06em" }}>{m.appt.mon}</b>
                            </span>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "3px" }}>
                              <span style={{ padding: "2px 7px", borderRadius: "5px", background: "#FFF0E4", color: "#BD4A19", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".08em" }}>{m.appt.kind}</span>
                              <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>Showroom visit</strong>
                              <strong style={{ fontSize: "16px", fontWeight: "650", fontVariantNumeric: "tabular-nums", textDecoration: m.appt.deco }}>{m.appt.time}</strong>
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "10px", padding: "10px 12px", borderTop: "1px solid #F1E7DF", background: "#FDFAF7" }}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 15px", marginTop: "2px" }}>
                              <path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11zM12 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4z">
                              </path>
                            </svg>
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <strong style={{ fontSize: "13px", fontWeight: "650" }}>{m.appt.place}</strong>
                              <span style={{ fontSize: "12.5px", color: "#806B60", lineHeight: "1.4" }}>{m.appt.addr}</span>
                            </span>
                          </div>
                        </div>
                        <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", padding: "4px 6px 0", fontSize: "11px", color: "#806B60" }}>{m.appt.sent}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.tick} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5">
                            </path>
                          </svg></span>
                      </div>
                    </>)}</Fragment>))}<span data-chat-end="1" style={{ display: "none" }}></span>
                  </div>
                  {!!(v.replyOn) && (<>
                    <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "10px", padding: "8px 16px", background: "#fff", borderTop: "1px solid #EBDDD2" }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px", paddingLeft: "10px", borderLeft: "3px solid #BD4A19" }}>
                        <strong style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19" }}>{v.replyWho}</strong>
                        <span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.replyText}</span>
                      </span>
                      <button type="button" onClick={v.cancelReply} title="Cancel reply" style={{ width: "32px", height: "32px", border: "0", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12">
                          </path>
                        </svg>
                      </button>
                    </div>
                  </>)}
                  <div style={{ flex: "0 0 auto", background: "#fff", padding: "12px 16px", borderTop: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px" }}>
                    <span style={{ position: "relative", flex: "0 0 auto" }}>
                      <button type="button" onClick={v.attachToggle} title="Attach" style={{ width: "44px", height: "44px", padding: "0", background: "#fff", cursor: "pointer", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12h14">
                          </path>
                        </svg>
                      </button>
                      {!!(v.attachOpen) && (<>
                        <div onClick={v.attachClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                        </div>
                        <div style={{ position: "absolute", bottom: "54px", left: "0", zIndex: "8", width: "220px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "16px", boxShadow: "0 -6px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column" }}>
                          {(v.attachOpts).map((o, o_i) => (<Fragment key={o_i}>
                            {!!(o.sep) && (<>
                              <span style={{ height: "1px", margin: "4px 10px", background: "#F1E7DF" }}>
                              </span>
                            </>)}
                            <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "14px", height: "42px", padding: "0 12px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "550", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={o.bg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d={o.d}>
                                </path>
                              </svg>{o.label}</button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </span>
                    <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 6px 0 16px", borderRadius: "22px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "4px" }}>
                      <input data-draft="1" value={v.draft} onChange={v.setDraft} onKeyDown={v.draftKey} placeholder={v.chatReply} style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", border: "0", outline: "none", background: "transparent", padding: "0", margin: "0", fontFamily: "inherit" }} />
                      <span title="Emoji" onClick={v.emojiToggle} style={{ position: "relative", flex: "0 0 auto", width: "32px", height: "32px", display: "grid", placeItems: "center", color: v.emojiFg, cursor: "pointer" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">
                          </path>
                        </svg>{!!(v.emojiOpen) && (<DeskEmoji v={v.emoji} />)}
                      </span>
                    </span>
                    <span title="Send a photo" onClick={v.photo} style={{ flex: "0 0 auto", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z">
                        </path>
                      </svg>
                    </span>
                    <span title={v.sendTitle} onClick={v.send} style={{ flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "50%", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={v.micD}>
                        </path>
                      </svg>
                    </span>
                  </div>
                </>)}
                {!!(v.kBook) && (<DeskBook v={v.book} />)}{!!(v.kNote) && (<DeskNote v={v.note} />)}{!!(v.kForm) && (<DeskCustomerForm v={v.cform} />)}{!!(v.kAlerts) && (<DeskAlerts v={v.alertsP} />)}
                {!!(v.kTopMove) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", padding: "48px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
                    <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", display: "grid", placeItems: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 20h20M4 20 7 8l5 5 5-5 3 12">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ fontSize: "16px", fontWeight: "650" }}>You're the top level</strong>
                    <span style={{ maxWidth: "300px", fontSize: "13.5px", lineHeight: "1.5", color: "#806B60", textWrap: "pretty" }}>As Principal there's no one above you, so this chat can't be moved up. You can still invite people from your team into it.</span>
                    <button type="button" onClick={v.shareFromTop} style={{ marginTop: "8px", height: "38px", padding: "0 18px", borderRadius: "19px", border: "1px solid #BD4A19", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h11}>Invite your team</button>
                  </div>
                </>)}
                {!!(v.kPick) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {(v.pickGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "#806B60" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                        </span>{g.label}</div>
                      {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{m.sub}</span>
                          </span>
                          <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: `1px solid ${m.bc}`, color: m.bc, fontSize: "12.5px", fontWeight: "650" }}>{m.btn}</span>
                        </button>
                      </Fragment>))}
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kAssign) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {(v.assignGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "#806B60" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                        </span>{g.label}</div>
                      {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                            <span style={{ fontSize: "12px", color: "#806B60" }}>{m.sub}</span>
                          </span>
                          <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: "1px solid #BD4A19", color: "#BD4A19", fontSize: "12.5px", fontWeight: "650" }}>Send</span>
                        </button>
                      </Fragment>))}
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kTeam) && (<>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {!!(v.teamPeople) && (<>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 54px 54px 64px", gap: "8px", padding: "10px 16px", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60", borderBottom: "1px solid #EBDDD2", background: "#fff" }}>
                        <span>PERSON</span>
                        <span style={{ textAlign: "right" }}>LEADS</span>
                        <span style={{ textAlign: "right" }}>APPT</span>
                        <span style={{ textAlign: "right" }}>SHOW-UP</span>
                      </div>
                      {(v.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.open} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 54px 54px 64px", gap: "8px", alignItems: "center", padding: "12px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer", fontVariantNumeric: "tabular-nums" }} className={DH.h8}>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", background: "#F5EBE3", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{m.ini}</span>
                            <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                              <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                              <span style={{ fontSize: "12px", color: "#806B60" }}>{m.chats}</span>
                            </span>
                          </span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.leads}</span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.appt}</span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.show}</span>
                        </button>
                      </Fragment>))}
                    </>)}
                    {!!(v.personChats) && (<>
                      <button type="button" onClick={v.backToTeam} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 6-6 6 6 6">
                          </path>
                        </svg><span>{v.teamName}</span> · all people</button>
                      {(v.pChats).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.open} style={{ display: "flex", gap: "12px", padding: "12px 16px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: "#E4EDF8", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{c.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                              <strong style={{ fontSize: "14px", fontWeight: "650" }}>{c.name}</strong>
                              <span style={{ flex: "1" }}>
                              </span>
                              <small style={{ fontSize: "12px", color: "#A8968B" }}>{c.time}</small>
                            </span>
                            <span style={{ fontSize: "12.5px", color: "#387557", fontWeight: "600" }}>{c.ad}</span>
                            <span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.msg}</span>
                            <span style={{ alignSelf: "flex-start", marginTop: "3px", height: "20px", lineHeight: "20px", padding: "0 8px", borderRadius: "10px", background: c.stBg, color: c.stFg, fontSize: "11.5px", fontWeight: "700" }}>{c.status}</span>
                          </span>
                        </button>
                      </Fragment>))}
                      {!!(v.pNoChats) && (<>
                        <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "13.5px", color: "#806B60" }}>No open chats</div>
                      </>)}
                    </>)}
                  </div>
                </>)}
                {!!(v.kMetrics) && (<>
                  <div style={{ flex: "0 0 auto", padding: "14px 18px", background: "#fff", borderBottom: "1px solid #F1E7DF" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px", border: "1px solid #E2CFC1", borderRadius: "10px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3">
                        </path>
                      </svg>
                      <input type="text" value={v.mq} onChange={v.setMq} placeholder="Search metrics" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", font: "inherit", fontSize: "14px", color: "#3F2B22", background: "transparent" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", background: "#fff", padding: "6px 10px 12px" }}>
                    <button type="button" onClick={v.mOrdFold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${v.mOrdRot}deg)`, transition: "transform .15s" }}>
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg>
                      <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "#4E2F20" }}>Column order</strong>
                      <span style={{ fontSize: "11.5px", color: "#806B60" }}>Drag to reorder</span>
                    </button>
                    {!!(v.mOrdOpen) && (<>
                      <div style={{ display: "flex", flexDirection: "column", margin: "0 8px 8px", border: "1px solid #EBDDD2", borderRadius: "12px", padding: "4px" }}>
                        {(v.mOrder).map((o, o_i) => (<Fragment key={o_i}>
                          <div draggable="true" onDragStart={o.dStart} onDragOver={o.dOver} onDrop={o.dDrop} onDragEnd={o.dEnd} style={{ position: "relative", zIndex: o.z, display: "flex", alignItems: "center", gap: "12px", height: "44px", padding: "0 8px 0 10px", borderBottom: `1px solid ${o.bd}`, background: o.bg, boxShadow: o.sh, borderRadius: "6px", cursor: "grab" }} className={DH.h4}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6B574C" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M5 9h14M5 15h14">
                              </path>
                            </svg>
                            <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                            <button type="button" onClick={o.rm} title="Remove" style={{ width: "30px", height: "30px", border: "0", borderRadius: "50%", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h3}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B574C" strokeWidth="1.8" strokeLinecap="round">
                                <circle cx="12" cy="12" r="9">
                                </circle>
                                <path d="m9 9 6 6M15 9l-6 6">
                                </path>
                              </svg>
                            </button>
                          </div>
                        </Fragment>))}
                      </div>
                    </>)}
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "4px 8px 0" }}>
                      <button type="button" onClick={v.mFoldAll} style={{ height: "28px", padding: "0 8px", border: "0", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }} className={DH.h8}>{v.mFoldAllLabel}</button>
                    </div>
                    {(v.mGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <button type="button" onClick={g.fold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", borderTop: "1px solid #F1E7DF", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", transform: `rotate(${g.rot}deg)`, transition: "transform .15s" }}>
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                        <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "#4E2F20" }}>{g.label}</strong>
                        <span style={{ fontSize: "11.5px", fontWeight: "600", color: "#806B60" }}>{g.nSel}</span>
                        <span style={{ fontSize: "11.5px", color: "#A8968B" }}>· {g.src}</span>
                      </button>
                      {!!(g.open) && (<>
                        {(g.items).map((m, m_i) => (<Fragment key={m_i}>
                          <button type="button" onClick={m.toggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", minHeight: "40px", padding: "4px 8px", border: "0", borderRadius: "9px", background: "transparent", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                            <span style={{ flex: "0 0 20px", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "6px", border: `1.5px solid ${m.bd}`, background: m.bg, display: "grid", placeItems: "center" }}>
                              {!!(m.on) && (<>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-10">
                                  </path>
                                </svg>
                              </>)}
                            </span>
                            <span style={{ flex: "1", display: "flex", flexDirection: "column" }}>
                              <span style={{ fontSize: "14px", fontWeight: "600" }}>{m.label}</span>
                              <span style={{ fontSize: "11.5px", color: "#806B60" }}>{m.hint}</span>
                            </span>
                          </button>
                        </Fragment>))}
                      </>)}
                    </Fragment>))}
                  </div>
                  <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 18px", borderTop: "1px solid #EBDDD2", background: "#fff" }}>
                    <button type="button" onClick={v.resetMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Reset</button>
                    <button type="button" onClick={v.saveMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                  {!!(v.mDirty) && (<>
                    <span style={{ flex: "0 0 auto", padding: "0 18px 12px", fontSize: "12.5px", color: "#A46312", textAlign: "center", background: "#fff" }}>Unsaved changes · the table updates when you save</span>
                  </>)}
                </>)}
                {!!(v.kClist) && (<>
                  <div style={{ flex: "0 0 auto", position: "relative", zIndex: "5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "10px 18px", borderBottom: "1px solid #EBDDD2", background: "#FBF6F2" }}>
                    <span style={{ fontSize: "13px", color: "#806B60" }}>{v.clistN}</span>
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={v.clSortToggle} style={{ height: "32px", padding: "0 10px 0 12px", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", color: "#3F2B22", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }} className={DH.h35}>
                        <span style={{ color: "#806B60" }}>Sort by</span>
                        <strong style={{ fontWeight: "650" }}>{v.clSortLabel}</strong>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                      </button>
                      {!!(v.clSortOpen) && (<>
                        <div style={{ position: "absolute", top: "38px", right: "0", width: "180px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid #EBDDD2", borderRadius: "12px", boxShadow: "0 10px 30px rgba(63,43,34,.14)", display: "flex", flexDirection: "column" }}>
                          {(v.clSorts).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ height: "36px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, color: o.fg, font: "inherit", fontSize: "13.5px", fontWeight: o.w, textAlign: "left", cursor: "pointer" }} className={DH.h4}>{o.label}</button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </div>
                  </div>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", background: "#fff", display: "flex", flexDirection: "column" }}>
                    {!!(v.clistEmpty) && (<>
                      <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "14px", color: "#806B60" }}>No chats in this status yet</div>
                    </>)}
                    {(v.clistRows).map((c, c_i) => (<Fragment key={c_i}>
                      <button type="button" onClick={c.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", border: "0", borderBottom: "1px solid #F1E7DF", background: "#fff", font: "inherit", color: "#3F2B22", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                        <span style={{ flex: "0 0 38px", width: "38px", height: "38px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{c.ini}</span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{c.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
                        </span>
                        <span style={{ height: "22px", lineHeight: "22px", padding: "0 9px", borderRadius: "11px", background: c.stBg, color: c.stFg, fontSize: "11.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{c.status}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </button>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kInfo) && (<>
                  {!!(v.infoBack) && (<>
                    <button type="button" onClick={v.backToList} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.infoBackLabel}</button>
                  </>)}
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <span style={{ flex: "0 0 52px", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "17px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.ci.ini}</span>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "20px", fontWeight: "700" }}>{v.ci.name}</strong>
                      <span onClick={v.editInfo} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", color: "#BD4A19", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap"  }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                          </path>
                        </svg>Edit</span>
                    </div>
                    <div style={{ border: "1px solid #EBDDD2", borderRadius: "16px", overflow: "hidden" }}>
                      {(v.ci.rows).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 14px", borderTop: r.bt, fontSize: "14px" }}>
                          <span style={{ flex: "0 0 auto", color: "#806B60" }}>{r.k}</span>
                          <span style={{ flex: "1", minWidth: "0", textAlign: "right", fontWeight: r.w, color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><InfoValue v={r.v} href={r.href} /></span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  {!!(v.infoChat) && (<>
                    <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid #EBDDD2", background: "#fff" }}>
                      <button type="button" onClick={v.openInfoChat} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "44px", borderRadius: "22px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                          </path>
                        </svg>Open chat</button>
                    </div>
                  </>)}
                </>)}
                {!!(v.kSection) && (<>
                  <div style={{ flex: "1", minHeight: "0", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                    <div style={{ background: "#fff", border: "1px solid #EBDDD2", borderRadius: "14px", overflow: "hidden" }}>
                      {(v.opRows).map((r, r_i) => (<Fragment key={r_i}>
                        <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid #F1E7DF", background: r.bg, cursor: r.cur }}>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                            <strong style={{ fontSize: "15px", fontWeight: "650" }}>{r.t}</strong>
                            <span style={{ fontSize: "13px", color: "#806B60" }}>{r.s}</span>
                            {!!(r.note) && (<>
                              <span style={{ fontSize: "12.5px", color: "#A46312", fontWeight: "600" }}>{r.note}</span>
                            </>)}
                          </span>
                          {!!(r.right) && (<>
                            <span style={{ fontSize: "13.5px", fontWeight: "650", color: r.rc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.right}</span>
                          </>)}
                          {!!(r.go) && (<>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 6 6 6-6 6">
                              </path>
                            </svg>
                          </>)}
                          {!!(r.btn2) && (<>
                            <button type="button" onClick={r.act2} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                                </path>
                              </svg>{r.btn2}</button>
                          </>)}
                          {!!(r.btn) && (<>
                            <button type="button" onClick={r.act} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #BD4A19", background: r.btnBg, color: "#BD4A19", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer" }} className={DH.h11}>{r.btn}</button>
                          </>)}
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                </>)}
              </>)}
            </aside>
          </>)}{!!(v.railOn) && (<DeskRail v={v.rail} />)}
          {!!(v.ibCols) && (<>
            <aside style={{ position: "relative", flex: `0 0 ${v.ibInfoW}px`, width: `${v.ibInfoW}px`, boxSizing: "border-box", minHeight: "0", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
              <div onPointerDown={v.dragInfo} onDoubleClick={v.resetInfo} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", display: "flex", justifyContent: "center", touchAction: "none" }} className={DH.h23}>
              </div>
              <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 16px", borderBottom: "1px solid #EBDDD2" }}>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650" }}>Customer info</strong>
                <button type="button" disabled={v.ibNone} style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                    </path>
                  </svg>Edit</button>
              </div>
              <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column" }}>
                {!!(v.ibNone) && (<>
                  <span style={{ padding: "40px 8px", textAlign: "center", fontSize: "13px", lineHeight: "1.5", color: "#806B60" }}>Pick a chat to see the customer</span>
                </>)}
                {!!(v.ibHas) && (<>
                  {(v.ibInfo.groups).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", flexDirection: "column", padding: "14px 0 6px", borderBottom: "1px solid #EBDDD2" }}>
                      <span style={{ paddingBottom: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "#806B60" }}>{g.label}</span>
                      {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "7px 0" }}>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{r.k}</span>
                          <span style={{ fontSize: "13.5px", lineHeight: "1.35", fontWeight: r.w, color: r.c, overflowWrap: "anywhere", textWrap: "pretty" }}><InfoValue v={r.v} href={r.href} /></span>
                        </div>
                      </Fragment>))}
                    </div>
                  </Fragment>))}
                </>)}
              </div>
            </aside>
            {!!(v.ibCpClosed) && (<>
              <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <button type="button" onClick={v.ibCpToggle} title="Open chat progress" style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid #EBDDD2", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h24}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m11 17-5-5 5-5M18 17l-5-5 5-5">
                    </path>
                  </svg>
                </button>
                {!!(v.ibHas) && (<>
                  <button type="button" onClick={v.ibCpToggle} title="Open chat progress" style={{ marginTop: "18px", padding: "6px 0", border: "0", background: "transparent", display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                    {(v.ibCp.rail).map((d, d_i) => (<Fragment key={d_i}>
                      <span title={d.tip} style={{ width: `${d.size}px`, height: `${d.size}px`, boxSizing: "border-box", borderRadius: "50%", background: d.dot, border: `2px solid ${d.ring}` }}>
                      </span>
                      <span style={{ width: "2px", height: "18px", background: d.gap }}>
                      </span>
                    </Fragment>))}
                  </button>
                </>)}
              </aside>
            </>)}
            {!!(v.ibCpOpen) && (<>
              <aside style={v.ibCpStyle}>
                <div onPointerDown={v.dragCp} onDoubleClick={v.resetCp} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", display: "flex", justifyContent: "center", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 0 16px", borderBottom: "1px solid #EBDDD2" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "3px" }}>
                    {!!(v.ibNone) && (<>
                      <span style={{ fontSize: "13px", fontWeight: "650", color: "#806B60" }}>Chat progress</span>
                    </>)}
                    {!!(v.ibHas) && (<>
                      {!!(v.ibCp.has) && (<>
                        <span style={{ display: "inline-flex", alignItems: "center", height: "22px", padding: "0 9px", borderRadius: "11px", background: v.ibCp.sbg, color: v.ibCp.sfg, fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>{v.ibCp.status}</span>
                        <span style={{ maxWidth: "100%", fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ibCp.owner}</span>
                      </>)}
                    </>)}
                  </span>
                  <button type="button" onClick={v.ibCpToggle} title="Close" style={{ flex: "0 0 34px", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m13 17 5-5-5-5M6 17l5-5-5-5">
                      </path>
                    </svg>
                  </button>
                </div>
                {!!(v.ibNone) && (<>
                  <span style={{ padding: "40px 16px", textAlign: "center", fontSize: "13px", color: "#806B60" }}>Pick a chat to see its steps</span>
                </>)}
                {!!(v.ibHas) && (<>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "4px 0 14px", borderBottom: "1px solid #EBDDD2" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
                        {(v.ibCp.steps).map((p, p_i) => (<Fragment key={p_i}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", minWidth: "0" }}>
                            <div style={{ position: "relative", width: "100%", height: "14px", display: "grid", placeItems: "center" }}>
                              <span style={{ position: "absolute", top: "6px", left: "0", width: "50%", height: "2px", background: p.lL }}>
                              </span>
                              <span style={{ position: "absolute", top: "6px", right: "0", width: "50%", height: "2px", background: p.lR }}>
                              </span>
                              <span style={{ position: "relative", width: `${p.size}px`, height: `${p.size}px`, boxSizing: "border-box", borderRadius: "50%", background: p.dot, border: `2px solid ${p.ring}` }}>
                              </span>
                            </div>
                            <span style={{ fontSize: "11px", fontWeight: p.w, color: p.lab, whiteSpace: "nowrap" }}>{p.label}</span>
                            <span style={{ fontSize: "10.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.date}</span>
                          </div>
                        </Fragment>))}
                      </div>
                    </div>
                    {!!(v.ibCp.none) && (<>
                      <span style={{ padding: "20px 8px", textAlign: "center", fontSize: "13px", color: "#806B60" }}>No steps yet for this chat</span>
                    </>)}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {(v.ibCp.ev).map((e, e_i) => (<Fragment key={e_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "44px 24px minmax(0, 1fr)", columnGap: "10px", paddingTop: e.pt }}>
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "4px", textAlign: "right" }}>
                            <strong style={{ fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                            <span style={{ fontSize: "11.5px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <span style={{ flex: "0 0 24px", width: "24px", height: "24px", borderRadius: "50%", background: e.bg, color: e.fg, display: "grid", placeItems: "center" }}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d={e.d}>
                                </path>
                              </svg>
                            </span>
                            <span style={{ flex: "1", width: "2px", minHeight: "12px", background: e.line }}>
                            </span>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "4px 0 16px", minWidth: "0" }}>
                            <span style={{ fontSize: "13px", fontWeight: "600", lineHeight: "1.35", textWrap: "pretty" }}>{e.text}</span>
                            <span style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px" }}>
                              <span style={{ fontSize: "12px", color: "#806B60" }}>{e.who}</span>
                              {!!(e.hasSt) && (<>
                                <span style={{ display: "inline-flex", alignItems: "center", height: "20px", padding: "0 7px", borderRadius: "10px", background: e.stbg, color: e.stfg, fontSize: "11.5px", fontWeight: "700" }}>→ <span>{e.st}</span></span>
                              </>)}
                            </span>
                            {!!(e.hasNote) && (<>
                              <span style={{ padding: "8px 10px", borderRadius: "10px", background: "#FBF6F2", fontSize: "12.5px", lineHeight: "1.4", color: "#3F2B22", textWrap: "pretty" }}>{e.note}</span>
                            </>)}
                          </span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                </>)}
              </aside>
            </>)}
          </>)}
          {!!(v.showToast) && (<>
            <div style={{ position: "absolute", left: "50%", bottom: "24px", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "16px", padding: "11px 14px 11px 18px", borderRadius: "12px", background: "#3F2B22", color: "#fff", fontSize: "13.5px", fontWeight: "550", boxShadow: "0 8px 24px rgba(40,25,18,.28)", whiteSpace: "nowrap", zIndex: "5" }}>{v.toastText}{!!(v.canUndo) && (<>
                <button type="button" onClick={v.undoSend} style={{ border: "0", padding: "0", background: "transparent", font: "inherit", color: "#F6B48A", fontWeight: "700", cursor: "pointer" }}>Undo</button>
              </>)}</div>
          </>)}
        </div>
      </div>
    </div>
  </>);
}
