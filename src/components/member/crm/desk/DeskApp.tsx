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
import { Desk4aHead, Desk4aSide, Desk4aTop, DeskAdList4a, DeskAdTabs4a, DeskAdsTable4a, DeskAudit4a, DeskCalFigures4a, DeskCalendar4a, DeskChannels4a, DeskContactFigures4a, DeskContacts4a, DeskForm4a, DeskInboxList4a, DeskInboxSide4a, DeskInsight4a, DeskRail4a, DeskSettings4a, DeskShowrooms4a } from "./Desk4a";
import { DeskBook, DeskCardPicker, DeskAlerts, DeskAnalysis, DeskContactSide, DeskCustomerForm, DeskEmoji, DeskFoldRail, DeskActive, DeskAddAd, DeskFormPages, DeskHistory, DeskNote, DeskPager, DeskPhoneForm, DeskPie, DeskRail } from "./DeskExtras";
import type { DeskVM } from "./vm/app";

/** The whole desktop CRM: the Revenue app's frame around it (sidebar, top bar), every page, pane, menu and the toast. */
export default function DeskApp({ v }: { v: DeskVM }) {
  return (<>
    <div style={{ width: `${v.W}px`, height: `${v.H}px`, position: "relative", overflow: "hidden", borderRadius: v.frameRadius, background: "var(--crm-page)", fontFamily: "Inter, sans-serif", color: "var(--crm-ink)", WebkitFontSmoothing: "antialiased", boxShadow: v.frameShadow }}>
      {!!(v.sbOpen) && (<>
        <Desk4aSide v={v} />
      </>)}
      {!!(v.sbClosed) && (<>
        <aside style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "72px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", background: "var(--crm-cream-nav)", borderRight: "1px solid var(--crm-rule)", zIndex: "6" }}>
          <div style={{ height: "60px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-ink)" }}>HV</div>
          <button type="button" onClick={v.toggleSb} title="Expand sidebar" style={{ width: "40px", height: "36px", border: "0", borderRadius: "8px", background: "transparent", color: "var(--crm-faint)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h1}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM9 3v18M14 9l3 3-3 3">
              </path>
            </svg>
          </button>
          <div style={{ flex: "1", minHeight: "0", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", paddingTop: "6px" }}>
            {(v.sections).map((g, g_i) => (<Fragment key={g_i}>
              <span style={{ width: "32px", height: "1px", background: "var(--crm-rule)", margin: "8px 0" }}>
              </span>
              {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                {!!(n.on) && (<>
                  <button type="button" onClick={n.pick} title={n.label} style={{ position: "relative", width: "44px", height: "40px", border: "0", borderRadius: "10px", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={n.d}>
                      </path>
                    </svg>
                    {!!(n.count) && (<>
                      <span style={{ position: "absolute", top: "4px", right: "4px", minWidth: "15px", height: "15px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-rust)", color: "#fff", fontSize: "9.5px", fontWeight: "700", lineHeight: "15px" }}>{n.count}</span>
                    </>)}
                  </button>
                </>)}
                {!!(n.off) && (<>
                  <button type="button" onClick={n.pick} title={n.label} style={{ position: "relative", width: "44px", height: "40px", border: "0", borderRadius: "10px", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h7}>
                    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={n.d}>
                      </path>
                    </svg>
                    {!!(n.count) && (<>
                      <span style={{ position: "absolute", top: "4px", right: "4px", minWidth: "15px", height: "15px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-rust)", color: "#fff", fontSize: "9.5px", fontWeight: "700", lineHeight: "15px" }}>{n.count}</span>
                    </>)}
                  </button>
                </>)}
              </Fragment>))}
            </Fragment>))}
          </div>
          <button type="button" onClick={v.returnApp} title="Back to Revenue app" style={{ marginBottom: "10px", width: "44px", height: "40px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", color: "var(--crm-rust)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h5}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11">
              </path>
            </svg>
          </button>
          <span title={v.me.name} style={{ marginBottom: "18px", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-ink)", color: "#fff", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{v.me.ini}</span>
        </aside>
      </>)}
      <Desk4aTop f4={v.f4} left={v.sbW} />
      <div style={{ position: "absolute", left: `${v.sbW}px`, top: "56px", right: "0", bottom: "0", display: "flex", flexDirection: "column", background: "var(--crm-page)", fontSize: "14px" }}>
        <Desk4aHead f4={v.f4} />
        <div style={{ flex: "1", minHeight: "0", position: "relative", display: "flex", borderTop: v.f4.bodyTop }}>
          {!!(v.sheetMode) && (<>
            <div style={{ flex: "1", minWidth: `${v.listMin}px`, overflow: "auto", background: "#fff", padding: v.pagePad, boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "18px" }}>
              {!(v.adList) && !!(v.opSub) && (<span style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>{v.opSub}</span>)}
              {!!(v.adList) && (<DeskAdList4a v={v} />)}
              {!!(v.adGrid) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "14px" }}>
                  {(v.adCards).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: `1px solid ${c.bd}`, borderRadius: "18px", background: "#fff", boxShadow: c.ring, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h13}>
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
                          <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>leads</span>
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
                      <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "var(--crm-field)" }}>
                        {(c.segs).map((g, g_i) => (<Fragment key={g_i}>
                          <span style={{ flex: `${g.pct} 0 0`, background: g.color }}>
                          </span>
                        </Fragment>))}
                      </div>
                      {!!(c.set) && (<>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {(c.segs).map((g, g_i) => (<Fragment key={g_i}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "var(--crm-ink)" }}><span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                                </span>{g.label}</span>
                              {!!(g.detail) && (<>
                                <span style={{ paddingLeft: "16px", fontSize: "12.5px", lineHeight: "1.45", color: "var(--crm-muted)", textWrap: "pretty" }}>{g.detail}</span>
                              </>)}
                            </span>
                          </Fragment>))}
                        </div>
                      </>)}
                      {!!(c.unset) && (<>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", color: "var(--crm-brown)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 8v4M12 16h.01">
                            </path>
                          </svg>Not assigned yet · goes to the Revenue Director</span>
                      </>)}
                      <div style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--crm-field)" }}>
                        <span style={{ flex: "1", fontSize: "13px", color: "var(--crm-muted)" }}>{c.mode}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)" }}>{c.cta}<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg></span>
                      </div>
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.isFtOp) && (<>
                <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.ftCards).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.open} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", border: "0", borderTop: "1px solid var(--crm-field)", marginTop: "-1px", background: c.rowBg, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
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
                            <span style={{ flex: "1", minWidth: "0", fontSize: "13px", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                            <span style={{ display: "flex", gap: "3px" }}>
                              {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ width: "20px", height: "20px", borderRadius: "50%", background: d.bg, color: d.fg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{d.l}</span>
                              </Fragment>))}
                            </span>
                          </span>
                        </Fragment>))}
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: "1", fontSize: "12px", color: "var(--crm-muted)" }}>{c.mode}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}>{c.cta}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg></span>
                      </span>
                    </button>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.isSrOp) && (<DeskShowrooms4a v={v} />)}
              {!!(v.cfOn) && (<DeskForm4a v={v} preview={<DeskPhoneForm v={v.cfReal} scale={v.cfRealScale} />} />)} {!!(v.isFrmOp) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px" }}>
                  {(v.frmCards).map((fc, fc_i) => (<Fragment key={fc_i}>
                    <button type="button" onClick={fc.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "18px 20px", borderRadius: "18px", border: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", textAlign: "left", color: "var(--crm-ink)", cursor: "pointer", boxShadow: "0 1px 2px rgba(42,22,12,.04)" }} className={DH.h16}>
                      <span style={{ flex: "0 0 44px", height: "44px", borderRadius: "12px", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center" }}>
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
                        <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{fc.sum}</span>
                      </span>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </button>
                  </Fragment>))}
                  <button type="button" onClick={v.frmNew} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", minHeight: "82px", padding: "18px 20px", borderRadius: "18px", border: "1.5px dashed var(--crm-line)", background: "transparent", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h17}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>New form</button>
                </div>
              </>)}
              {!!(v.isCpOp) && (<>
                <span style={{ fontSize: "14px", color: "var(--crm-muted)", marginTop: "-10px", maxWidth: "760px" }}>Each chat's steps with time, person and status. Only you and team leaders see this page.</span>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px" }}>
                  <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>
                    {(v.cpTimes).map((o, o_i) => (<Fragment key={o_i}>
                      <button type="button" onClick={o.pick} style={{ height: "32px", padding: "0 14px", border: "0", borderRadius: "9px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "13.5px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                    </Fragment>))}
                  </div>
                  {!!(v.cpCustom) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input type="date" value={v.cpFromV} onChange={v.setCpFrom} style={{ height: "34px", boxSizing: "border-box", padding: "0 10px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                      <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>to</span>
                      <input type="date" value={v.cpToV} onChange={v.setCpTo} style={{ height: "34px", boxSizing: "border-box", padding: "0 10px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                    </div>
                  </>)}
                  <span style={{ fontSize: "13.5px", fontWeight: "600", color: "var(--crm-muted)" }}>{v.cpRange}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "12px", marginLeft: "auto", minWidth: "0", flex: v.cpCtlFlex }}>
                    <button type="button" onClick={v.cpMineToggle} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: `1px solid ${v.cpMineBd}`, background: v.cpMineBg, color: v.cpMineFg, font: "inherit", fontSize: "13.5px", fontWeight: "600", cursor: "pointer", display: "flex", alignItems: "center", gap: "7px", whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 19a6 6 0 0 0-12 0M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 11l2 2 4-4">
                        </path>
                      </svg>My actions<span style={{ color: v.cpMineNfg, fontWeight: "500" }}>{v.cpMineN}</span></button>
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={v.cpPToggle} style={{ height: "36px", padding: "0 12px 0 14px", borderRadius: "18px", border: `1px solid ${v.cpPBd}`, background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", whiteSpace: "nowrap" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={v.cpPDot} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z">
                          </path>
                        </svg>{v.cpPLabel}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></button>
                      {!!(v.cpPOpen) && (<>
                        <div style={{ position: "absolute", top: "42px", right: "0", zIndex: "20", width: "260px", maxHeight: "440px", overflow: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "14px", boxShadow: "0 10px 30px rgba(42,22,12,.14)", display: "flex", flexDirection: "column" }}>
                          <span style={{ padding: "8px 10px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>SHOW CHATS OF</span>
                          <button type="button" onClick={v.cpAll.pick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", height: "38px", padding: "0 10px", border: "0", borderRadius: "9px", background: v.cpAll.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: v.cpAll.fg, textAlign: "left", cursor: "pointer" }}>
                            <span>Everyone</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "500", color: "var(--crm-muted)" }}>{v.cpAll.n}</span>
                          </button>
                          {(v.cpTeams).map((t, t_i) => (<Fragment key={t_i}>
                            <div style={{ display: "flex", flexDirection: "column", marginTop: "6px", paddingTop: "6px", borderTop: "1px solid var(--crm-field)" }}>
                              <button type="button" onClick={t.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px", border: "0", borderRadius: "9px", background: t.bg, font: "inherit", textAlign: "left", cursor: "pointer", "--h18-0": t.tint } as React.CSSProperties} className={DH.h18}>
                                <span style={{ flex: "0 0 10px", height: "10px", borderRadius: "3px", background: t.fg }}>
                                </span>
                                <strong style={{ flex: "1", fontSize: "13.5px", fontWeight: "700", color: t.fg }}>{t.label}</strong>
                                <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{t.n}</span>
                              </button>
                              {(t.members).map((p, p_i) => (<Fragment key={p_i}>
                                <button type="button" onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px 0 14px", border: "0", borderRadius: "9px", background: p.bg, font: "inherit", textAlign: "left", color: "var(--crm-ink)", cursor: "pointer" }} className={DH.h4}>
                                  <span style={{ flex: "0 0 22px", height: "22px", borderRadius: "50%", background: p.tint, color: p.fg, fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>{p.ini}</span>
                                  <span style={{ flex: "1", fontSize: "14px", fontWeight: p.w }}>{p.label}</span>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{p.n}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </Fragment>))}
                        </div>
                      </>)}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>Sort by</span>
                      <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>
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
                <div style={{ border: "1px solid var(--crm-rule)", borderRadius: "18px", background: "#fff", overflowX: "auto" }}>
                  <div style={{ minWidth: v.cpMinW, display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "grid", gridTemplateColumns: v.cpG, gap: "16px", padding: "12px 20px", borderBottom: "1px solid var(--crm-rule)", fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>
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
                      <span style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-muted)" }}>No chats in this time and filter</span>
                    </>)}
                    {(v.cpRows).map((r, r_i) => (<Fragment key={r_i}>
                      <button type="button" onClick={r.open} style={{ display: "grid", gridTemplateColumns: v.cpG, gap: "16px", alignItems: "center", padding: "14px 20px", border: "0", borderBottom: "1px solid var(--crm-field)", background: r.bg, font: "inherit", textAlign: "left", color: "var(--crm-ink)", cursor: "pointer" }} className={DH.h19}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{r.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.ad}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "4px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 20px", height: "20px", borderRadius: "50%", background: r.ttint, color: r.tfg, fontSize: "9.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.init}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "600", whiteSpace: "nowrap" }}>{r.owner}</span>
                            <span style={{ fontSize: "12.5px", fontWeight: "600", color: r.tfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>· {r.team}</span>
                          </span>
                          {!!(r.hasMine) && (<>
                            <span style={{ alignSelf: "flex-start", marginTop: "2px", height: "22px", padding: "0 8px", borderRadius: "11px", background: "var(--crm-field)", color: "var(--crm-ink)", fontSize: "12px", fontWeight: "650", display: "inline-flex", alignItems: "center", whiteSpace: "nowrap" }}>{r.mineTxt}</span>
                          </>)}
                          {!!(r.hasSh) && (<>
                            <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--crm-ink-soft)", paddingLeft: "26px" }}>{r.shTxt}</span>
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
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.date}</span>
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
                            <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{r.lastWho}</span>
                          </span>
                        </>)}
                      </button>
                    </Fragment>))}
                  </div>
                </div>
              </>)}
              {!!(v.isGenOp) && (<DeskSettings4a v={v} />)}{!!(v.isNtfOp) && (<>
                <span style={{ fontSize: "15px", color: "var(--crm-muted)", marginTop: "-12px" }}>{v.ntfHead}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                    <div style={{ flex: "1 1 100%", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "3px", padding: "4px", borderRadius: "16px", background: "var(--crm-field)" }}>
                      {(v.ntfCats).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.pick} style={{ height: "42px", padding: "0 10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", border: "0", borderRadius: "12px", background: c.bg, boxShadow: c.sh, font: "inherit", fontSize: "14.5px", fontWeight: c.fw, color: c.fg, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}{!!(c.hasN) && (<>
                            <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: c.nbg, color: c.nfg, fontSize: "11.5px", fontWeight: "700", display: "inline-grid", placeItems: "center" }}>{c.n}</span>
                          </>)}</button>
                      </Fragment>))}
                    </div>
                    <div style={{ flex: "0 0 auto", marginLeft: "auto", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "#fff" }}>
                      {(v.ntfTabs).map((b, b_i) => (<Fragment key={b_i}>
                        <button type="button" onClick={b.pick} style={{ height: "34px", padding: "0 14px", display: "flex", alignItems: "center", gap: "6px", border: "0", borderRadius: "9px", background: b.bg, boxShadow: b.sh, font: "inherit", fontSize: "13.5px", fontWeight: b.fw, color: b.fg, cursor: "pointer" }}>{b.label}</button>
                      </Fragment>))}
                    </div>
                    {!!(v.ntfNoSel) && (<>
                      <button type="button" onClick={v.ntfSelOn} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="4">
                          </rect>
                          <path d="m8 12 3 3 5-6">
                          </path>
                        </svg>Select</button>
                    </>)}
                    <button type="button" onClick={v.ntfMarkAll} disabled={v.ntfNoUnread} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: v.ntfMarkFg, cursor: v.ntfMarkCur, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6 7 17l-5-5M22 10l-7.5 7.5L13 16">
                        </path>
                      </svg>Mark all read</button>
                  </div>
                  {!!(v.ntfSelMode) && (<>
                    <div style={{ position: "sticky", top: "0", zIndex: "3", display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px 10px 16px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff" }}>
                      <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>{v.ntfSelN}</strong>
                      <button type="button" onClick={v.ntfSelAll} style={{ height: "34px", padding: "0 12px", border: "0", borderRadius: "17px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-peach)", cursor: "pointer" }}>{v.ntfAllLabel}</button>
                      <button type="button" onClick={v.ntfReadSel} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid rgba(255,255,255,.35)", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: v.ntfActCur, opacity: v.ntfActOp }}>Mark read</button>
                      <button type="button" onClick={v.ntfDelSel} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "0", background: "var(--crm-oxblood)", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: v.ntfActCur, opacity: v.ntfActOp, display: "inline-flex", alignItems: "center", gap: "6px" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                      <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>{g.label}</span>
                      <div style={{ background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "18px", overflow: "hidden" }}>
                        {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                          <button type="button" onClick={n.click} title={n.tip} style={{ display: "grid", gridTemplateColumns: n.cols, alignItems: "center", columnGap: "16px", padding: "18px 22px 18px 14px", boxSizing: "border-box", width: "100%", border: "0", borderBottom: "1px solid var(--crm-field)", background: n.bg, font: "inherit", textAlign: "left", color: "var(--crm-ink)", cursor: "pointer" }} className={DH.h4}>
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
                              <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--crm-muted)", minWidth: "0" }}>
                                <span style={{ flex: "0 0 auto", height: "22px", padding: "0 9px", borderRadius: "11px", background: n.icBg, color: n.icFg, fontSize: "12px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{n.type}</span>
                                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.sub}</span>
                              </span>
                              {!!(n.goAs) && (<>
                                <span onClick={n.openAs} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", marginTop: "4px", height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid var(--crm-rust)", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h11}>{n.goAsLabel}<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m9 6 6 6-6 6">
                                    </path>
                                  </svg></span>
                              </>)}
                              {!!(n.goCp) && (<>
                                <span onClick={n.open} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", marginTop: "2px", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h20}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2">
                                    </path>
                                  </svg>View in Chat progress<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="m9 6 6 6-6 6">
                                    </path>
                                  </svg></span>
                              </>)}
                            </span>
                            <span style={{ alignSelf: "flex-start", paddingTop: "3px", fontSize: "13px", color: "var(--crm-muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{n.time}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </div>
                  </Fragment>))}
                  {!!(v.ntfEmpty) && (<>
                    <div style={{ padding: "56px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "18px" }}>
                      <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-muted)", display: "grid", placeItems: "center" }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                          </path>
                        </svg>
                      </span>
                      <span style={{ fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)" }}>Nothing here right now.</span>
                      <span style={{ fontSize: "13.5px", color: "var(--crm-muted)" }}>{v.ntfEmptyMsg}</span>
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.isCltOp) && (<>
                <span style={{ fontSize: "14px", color: "var(--crm-muted)", marginTop: "-10px", maxWidth: "760px" }}>Salespeople can send these once the 24-hour reply window has closed on a cold lead's chat. Only approved templates can be switched on.</span>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.cltToggleF} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", font: "inherit", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }} className={DH.h8}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.cltFDot }}>
                      </span>{v.cltFLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.cltFOpen) && (<>
                      <div onClick={v.cltToggleF} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "40px", left: "0", zIndex: "8", width: "220px", padding: "8px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", boxShadow: "0 12px 32px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {(v.cltFOpts).map((o, o_i) => (<Fragment key={o_i}>
                          <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "38px", padding: "0 12px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: "600", color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.dot }}>
                            </span>
                            <span style={{ flex: "1" }}>{o.label}</span>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{o.n}</span>
                          </button>
                        </Fragment>))}
                      </div>
                    </>)}
                  </span>
                  <span style={{ flex: "1" }}>
                  </span>
                  <button type="button" onClick={v.cltNewT} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", font: "inherit", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-rust)" }} className={DH.h8}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>New template</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px", alignItems: "stretch" }}>
                  {(v.cltCards).map((t, t_i) => (<Fragment key={t_i}>
                    <div style={{ background: "#fff", border: `1px solid ${t.bd}`, borderRadius: "18px", overflow: "hidden", boxShadow: "0 1px 2px rgba(42,22,12,.04)", display: "flex", flexDirection: "column" }}>
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
                              </button><button type="button" onClick={t.ask} title="Delete template" style={{ flex: "0 0 auto", width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h21}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6">
                                  </path>
                                </svg>
                              </button></span>
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--crm-muted)" }}>
                            <span style={{ fontWeight: "650", color: t.chFg }}>{t.channel}</span>
                            <span style={{ color: "var(--crm-faint-2)" }}>·</span>
                            <span style={{ flex: "0 0 auto", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "5px", height: "20px", padding: "0 8px", borderRadius: "10px", background: t.stBg, color: t.stFg, fontSize: "11.5px", fontWeight: "700" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }}>
                              </span>{t.status}</span>
                          </span>
                        </span>
                      </div>
                      <div style={{ padding: "0 20px 18px", flex: "1", display: "flex", flexDirection: "column" }}>
                        {!!(t.askDel) && (<>
                          <div style={{ marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--crm-tint-attention)", background: "var(--crm-tint-attention)" }}>
                            <span style={{ flex: "1", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-oxblood)" }}>Delete this template?</span>
                            <button type="button" onClick={t.askNo} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                            <button type="button" onClick={t.delNow} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "0", background: "var(--crm-oxblood)", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Delete</button>
                          </div>
                        </>)}
                        {!!(t.view) && (<>
                          <div onClick={t.edit} title="Click to edit" style={{ position: "relative", padding: "16px 18px", borderRadius: "14px", background: "var(--crm-cream-nav)", cursor: "pointer" }} className={DH.h22}>
                            <div style={{ maxWidth: "520px", padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "#fff", border: "1px solid var(--crm-field)", fontSize: "14.5px", lineHeight: "1.6", color: "var(--crm-ink)", textWrap: "pretty" }}>
                              {(t.segs).map((g, g_i) => (<Fragment key={g_i}>
                                {!!(g.tag) && (<>
                                  <span style={{ padding: "1px 7px", borderRadius: "6px", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontWeight: "650", fontSize: "13.5px" }}>{g.t}</span>
                                </>)}
                                {!!(g.txt) && (<>{g.t}</>)}
                              </Fragment>))}
                            </div>
                            <span style={{ position: "absolute", top: "12px", right: "14px", display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                                </path>
                              </svg>Edit</span>
                          </div>
                        </>)}
                      </div>
                    </div>
                  </Fragment>))}
                  {!!(v.cltEmpty) && (<>
                    <div style={{ gridColumn: "1 / -1", padding: "32px", textAlign: "center", fontSize: "14px", color: "var(--crm-muted)", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px" }}>No templates in this status</div>
                  </>)}
                </div>
              </>)}
              {!!(v.isHistOp) && (<DeskHistory v={v.history} />)}{!!(v.isActOp) && (<DeskActive v={v.actVM} />)}{!!(v.addAd?.open) && (<DeskAddAd v={v.addAd} />)}{!!(v.isMwtOp) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "-10px" }}>
                  <span style={{ flex: "1", minWidth: "260px", fontSize: "14px", color: "var(--crm-muted)" }}>Turned on here, they appear in Assignment › Full time lead allocation, where you pick their days.</span>
                  {!!(v.mwtSavedMsg) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "var(--crm-brown)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5 9-10">
                        </path>
                      </svg>Saved</span>
                  </>)}
                  {!!(v.mwtDirty) && (<>
                    <span style={{ fontSize: "13px", color: "var(--crm-brown)", fontWeight: "650" }}>Unsaved changes</span>
                  </>)}
                  <button type="button" onClick={v.mwtSave} disabled={v.mwtClean} style={{ height: "40px", padding: "0 24px", borderRadius: "20px", border: "0", background: v.mwtBtnBg, font: "inherit", fontSize: "14.5px", fontWeight: "650", color: "#fff", cursor: v.mwtBtnCur }}>Save</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "14px", alignItems: "stretch" }}>
                  {(v.mwtTeams).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px", borderBottom: "1px solid var(--crm-field)" }}>
                        <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: g.color }}>
                        </span>
                        <strong style={{ flex: "1", fontSize: "14.5px", fontWeight: "700", color: g.color }}>{g.name}</strong>
                        <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{g.count}</span>
                      </div>
                      {(g.people).map((p, p_i) => (<Fragment key={p_i}>
                        <button type="button" onClick={p.toggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{p.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{p.name}</strong>
                            <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{p.role}</span>
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
                <div style={{ background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "14px", overflow: "hidden" }}>
                  {(v.opRows).map((r, r_i) => (<Fragment key={r_i}>
                    <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid var(--crm-field)", background: r.bg, cursor: r.cur }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "15px", fontWeight: "650" }}>{r.t}</strong>
                        <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{r.s}</span>
                        {!!(r.note) && (<>
                          <span style={{ fontSize: "12.5px", color: r.noteColor, fontWeight: "600" }}>{r.note}</span>
                        </>)}
                      </span>
                      {!!(r.right) && (<>
                        <span style={{ fontSize: "13.5px", fontWeight: "650", color: r.rc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.right}</span>
                      </>)}
                      {!!(r.go) && (<>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </>)}
                      {!!(r.btn2) && (<>
                        <button type="button" onClick={r.act2} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                            </path>
                          </svg>{r.btn2}</button>
                      </>)}
                      {!!(r.btn) && (<>
                        <button type="button" onClick={r.act} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-rust)", background: r.btnBg, color: "var(--crm-rust)", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer" }} className={DH.h11}>{r.btn}</button>
                      </>)}
                    </div>
                  </Fragment>))}
                </div>
              </>)}
            </div>
            {!!(v.sheetOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.menuW}px`, width: `${v.menuW}px`, boxSizing: "border-box", position: "relative", overflow: "auto", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragMenu} onDoubleClick={v.resetMenu} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "flex-start", gap: "12px", padding: "18px 12px 16px 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em", color: "var(--crm-ink)" }}>{v.sheetTitle}</strong>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.sheetSub}</span>
                  </span>
                  <button type="button" onClick={v.closePane} title="Close (Esc)" style={{ flex: "0 0 auto", width: "32px", height: "32px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", padding: "8px 12px" }}>
                  {(v.sheetRows).map((c, c_i) => (<Fragment key={c_i}>
                    <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "60px", padding: "10px 8px", border: "0", borderTop: c.bt, borderRadius: "0", background: "transparent", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                      <span style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "8px", background: c.tint, display: "grid", placeItems: "center" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={c.bg} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                          <path d={c.d}>
                          </path>
                        </svg>
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <span style={{ fontSize: "14px", fontWeight: "650" }}>{c.title}</span>
                        <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
                      </span>
                      {!!(c.badge) && (<>
                        <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "var(--crm-rust)", color: "#fff", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{c.badge}</span>
                      </>)}
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </button>
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.mwtLogClosed) && (<>
              <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <button type="button" onClick={v.mwtLogToggle} title="Open audit log" style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h24}>
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
              <aside style={{ position: "relative", flex: `0 1 ${v.mwtLogW}px`, width: `${v.mwtLogW}px`, minWidth: "220px", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragMwtLog} onDoubleClick={v.resetMwtLog} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 0 16px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>Audit log</strong>
                    <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Member work type</span>
                  </span>
                  <button type="button" onClick={v.mwtLogToggle} title="Close" style={{ flex: "0 0 34px", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
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
                        <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
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
                        <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{e.who}</span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.adNone) && (<>
              <aside style={{ flex: `0 0 ${v.adNoneW}px`, width: `${v.adNoneW}px`, boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center", padding: "24px" }}>
                <span style={{ width: "48px", height: "48px", borderRadius: "50%", background: "#fff", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 5 6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>Pick an ad</strong>
                <span style={{ maxWidth: "280px", fontSize: "13px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>Its split, performance and audit log open here</span>
              </aside>
            </>)}
            {!!(v.adOpen) && (<>
              {!!(v.splitShut) && (<DeskFoldRail v={v.splitRail} />)}<aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: v.splitShut ? "none" : "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <DeskAdTabs4a v={v} which="split" />
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "20px 24px 4px" }}>
                  <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Ad name</span>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "42px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-ink)" }}>
                    {v.ad.canName ? (<input aria-label="Ad name" value={v.ad.nameDraft} onChange={v.ad.onName} onBlur={v.ad.saveName} onKeyDown={v.ad.nameKey} placeholder={v.ad.headline} maxLength={120} style={{ flex: "1", minWidth: "0", margin: "0", padding: "0", border: "0", background: "transparent", font: "500 15px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", color: "var(--crm-ink)", outline: "none" }} />) : (<span style={{ flex: "1", font: "500 15px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", color: "var(--crm-ink)" }}>{v.ad.name}</span>)}
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4"></path></svg>
                  </label>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", overflowX: "hidden", padding: "0 20px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>SPLIT METHOD</span>
                    <div style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                      {(v.adModes).map((o, o_i) => (<Fragment key={o_i}>
                        {!!(o.on) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "34px", borderRadius: "8px", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "13.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(42,22,12,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                        </>)}
                        {!!(o.off) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "34px", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", font: "inherit", fontSize: "13.5px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                        </>)}
                      </Fragment>))}
                    </div>
                  </div>
                  {!!(v.adEvenly) && (<>
                    <div style={{ display: "flex", flexDirection: "column", padding: "18px 0" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", paddingBottom: "8px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", flex: "1" }}>TEAMS</span>
                        <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}><b style={{ fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{v.evenTotal}</b> people share equally</span>
                      </div>
                      {(v.evenTeams).map((t, t_i) => (<Fragment key={t_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-field)" }}>
                          <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>
                          </span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{t.name}</strong>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.names}</span>
                          </span>
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Equal share</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.adByTeam) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", flex: "1" }}>SPLIT ACROSS TEAMS</span>
                        <span style={{ fontSize: "12px", fontWeight: "650", color: "var(--crm-brown)", fontVariantNumeric: "tabular-nums" }}>100%</span>
                        <button type="button" onClick={v.resetSplit} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h25}>Reset</button>
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
                            <span style={{ flex: "1", position: "relative", height: "4px", borderRadius: "2px", background: "var(--crm-field)" }}>
                              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: `${t.pct}%`, background: t.color, borderRadius: "2px" }}>
                              </span>
                              <span style={{ position: "absolute", top: "50%", left: `${t.pct}%`, width: "16px", height: "16px", margin: "-8px 0 0 -8px", boxSizing: "border-box", borderRadius: "50%", background: "#fff", border: `2px solid ${t.color}`, pointerEvents: "none" }}>
                              </span>
                              <input type="range" min="0" max="100" step="5" value={t.pct} onChange={t.onRange} aria-label={`${t.name} share`} style={{ position: "absolute", left: "-8px", right: "-8px", top: "-12px", bottom: "-12px", width: "calc(100% + 16px)", margin: "0", opacity: "0", cursor: "pointer" }} />
                            </span>
                            <span style={{ flex: "0 0 64px", height: "34px", boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--crm-rule)" }}>
                              <input type="text" inputMode="decimal" value={t.pctStr} onChange={t.onRange} style={{ width: "50px", border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", textAlign: "right", fontVariantNumeric: "tabular-nums", outline: "none" }} />
                              <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>%</span>
                            </span>
                          </div>
                        </Fragment>))}
                      </div>
                    </div>
                    {(v.adTeams).map((t, t_i) => (<Fragment key={t_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.color }}>
                          </span>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>{t.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{t.share} of leads</span>
                        </div>
                        <div style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                          {(t.opts).map((o, o_i) => (<Fragment key={o_i}>
                            {!!(o.on) && (<>
                              <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "30px", borderRadius: "8px", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "12.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(42,22,12,.12)", cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                            </>)}
                            {!!(o.off) && (<>
                              <button type="button" onClick={o.pick} style={{ flex: "1", border: "0", height: "30px", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", font: "inherit", fontSize: "12.5px", fontWeight: "550", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{o.label}</button>
                            </>)}
                          </Fragment>))}
                        </div>
                        {!!(t.evenShut) && (<>
                          <button type="button" onClick={t.toggleList} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", border: "0", background: "transparent", font: "inherit", color: "var(--crm-muted)", textAlign: "left", cursor: "pointer" }} className={DH.h2}>
                            <span style={{ flex: "1", fontSize: "12.5px" }}>{t.memberCount} members · each gets an equal share</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}>Show<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg></span>
                          </button>
                        </>)}
                        {!!(t.listShown) && (<>
                          {!!(t.evenOpen) && (<>
                            <button type="button" onClick={t.toggleList} style={{ alignSelf: "flex-end", display: "inline-flex", alignItems: "center", gap: "3px", padding: "0", border: "0", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Hide<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m18 15-6-6-6 6">
                                </path>
                              </svg></button>
                          </>)}
                          <div style={{ display: "flex", flexDirection: "column" }}>
                            {(t.members).map((m, m_i) => (<Fragment key={m_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", padding: "4px 0", borderTop: "1px solid var(--crm-field)" }}>
                                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                                  <span style={{ fontSize: "13.5px", fontWeight: "600", color: m.locked ? "var(--crm-faint)" : undefined }}>{m.name}</span>
                                  <span style={{ fontSize: "12px", color: m.subColor }}>{m.sub}</span>
                                </span>
                                {!!(m.locked) && (<span aria-label="Locked" style={{ flex: "0 0 auto", width: "56px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-faint)" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg></span>)}{!!(t.field && !m.locked) && (<>
                                  <span style={{ flex: "0 0 auto", height: "32px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "4px", padding: "0 10px", borderRadius: "8px", border: "1px solid var(--crm-rule)" }}>
                                    <input type="text" inputMode="numeric" value={m.valueStr} onChange={m.onVal} style={{ width: "28px", border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", textAlign: "right", fontVariantNumeric: "tabular-nums", outline: "none" }} />
                                    <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{t.unit}</span>
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
                <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "16px 24px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.saveOne4} style={{ flex: "0 0 auto", height: "38px", padding: "0 18px", borderRadius: "7px", border: "0", background: "var(--crm-rust)", font: "500 13px Inter, sans-serif", color: "#fff", cursor: "pointer" }} className="crm4a-primary">Save</button>
                  <button type="button" onClick={v.saveAll4} style={{ flex: "1", height: "38px", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer" }} className="crm4a-outline">{v.applyLabel}</button>
                </div>
              </aside>
            </>)}
            {!!(v.adOpen) && (<>
              {!(v.perfShut) && (<><aside style={{ position: "relative", flex: `0 1 ${v.perfW}px`, width: `${v.perfW}px`, minWidth: "220px", boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragPerf} onDoubleClick={v.resetPerf} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <DeskAdTabs4a v={v} which="perf" />
                <div style={{ flex: "none", display: "flex", alignItems: "center", padding: "14px 24px 0" }}><span style={{ position: "relative" }}>
                    <button type="button" onClick={v.adPerToggle} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "30px", padding: "0 8px 0 12px", borderRadius: "15px", border: "1px solid var(--crm-rule)", background: v.adPerBg, font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h8}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>{v.adPerLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></button>
                    {!!(v.adPerOpen) && (<>
                      <div onClick={v.adPerToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "36px", right: "0", zIndex: "8", width: "226px", boxSizing: "border-box", padding: "6px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "12px", boxShadow: "0 10px 28px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {!!(v.adCalList) && (<>
                          {(v.adPerOpts).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", fontWeight: o.w, color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                              <span style={{ flex: "1" }}>{o.label}</span>
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{o.range}</span>
                            </button>
                          </Fragment>))}
                        </>)}
                        {!!(v.adCalOpen) && (<>
                          <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 4px 2px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                              <button type="button" onClick={v.adCalBack} title="Back" style={{ width: "26px", height: "26px", border: "0", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h8}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>October 2026</strong>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 28px)", gap: "2px", fontSize: "10.5px", fontWeight: "700", color: "var(--crm-faint)", textAlign: "center" }}>
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
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{v.adCalHint}</span>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingTop: "6px", borderTop: "1px solid var(--crm-field)" }}>
                              <span style={{ flex: "1", fontSize: "12.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{v.adCalLabel}</span>
                              <button type="button" onClick={v.adCalApply} style={{ height: "30px", padding: "0 14px", borderRadius: "15px", border: "0", background: "var(--crm-rust)", color: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h26}>Apply</button>
                            </div>
                          </div>
                        </>)}
                      </div>
                    </>)}
                  </span></div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "4px 16px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", padding: "14px 0 6px" }}>
                    <span style={{ paddingBottom: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>OVERALL</span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px 12px", padding: "6px 0 12px" }}>
                      {(v.adSum.rows).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{r.k}</span>
                          <span style={{ fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{r.v}</span>
                          <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{r.sub}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px 0", borderTop: "1px solid var(--crm-rule)" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>FUNNEL</span>
                    {(v.adFunnel).map((f, f_i) => (<Fragment key={f_i}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <span style={{ display: "flex", alignItems: "baseline", gap: "6px" }}>
                          <span style={{ flex: "1", fontSize: "12px", color: "var(--crm-muted)" }}>{f.k}</span>
                          <b style={{ fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{f.n}</b>
                        </span>
                        <span style={{ display: "block", height: "6px", borderRadius: "3px", background: "var(--crm-field)" }}>
                          <span style={{ display: "block", height: "6px", width: `${f.w}%`, borderRadius: "3px", background: f.color }}>
                          </span>
                        </span>
                        <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", minHeight: "13px" }}>{f.sub}</span>
                      </div>
                    </Fragment>))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", padding: "14px 0 4px", borderTop: "1px solid var(--crm-rule)" }}>
                    <span style={{ paddingBottom: "4px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>COSTS</span>
                    {(v.adCosts).map((c, c_i) => (<Fragment key={c_i}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "7px 0", borderBottom: "1px solid var(--crm-field)" }}>
                        <span style={{ flex: "1", fontSize: "12.5px", color: "var(--crm-muted)" }}>{c.k}</span>
                        <b style={{ fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.v}</b>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", padding: "14px 16px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.openAdsPerf} style={{ width: "100%", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "6px", borderRadius: "20px", border: "1px solid var(--crm-rust)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h11}>Full Ads Performance<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M7 17 17 7M8 7h9v9">
                      </path>
                    </svg></button>
                </div>
              </aside></>)}{!!(v.perfShut) && (<DeskFoldRail v={v.perfRail} />)}
              {!!(v.adLogClosed) && (<DeskFoldRail v={{ title: "Audit log", open: v.adLogToggle }} />)}
              {!!(v.adLogOpen) && (<>
                <aside className={DX.slideIn} style={v.adLogStyle}>
                  <div onPointerDown={v.dragAudit} onDoubleClick={v.resetAudit} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                  </div>
                  <DeskAdTabs4a v={v} which="audit" />
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "16px", display: "flex", flexDirection: "column" }}>
                    {(v.adLog).map((e, e_i) => (<Fragment key={e_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "44px 24px minmax(0, 1fr)", columnGap: "10px" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "4px", textAlign: "right" }}>
                          <strong style={{ fontSize: "12px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                          <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
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
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{e.who}</span>
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </aside>
              </>)}
            </>)}
            {!!(v.cpOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cpName}</strong>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.cpSub}</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: "24px", padding: "0 10px", borderRadius: "12px", background: v.cpSbg, color: v.cpSfg, fontSize: "12.5px", fontWeight: "700" }}>{v.cpStatus}</span>
                  <button type="button" onClick={v.cpClose} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "22px" }}>
                  <div style={{ padding: "16px 8px 12px", border: "1px solid var(--crm-rule)", borderRadius: "14px" }}>
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
                          <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{p.date}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {(v.cpEv).map((e, e_i) => (<Fragment key={e_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "62px 30px minmax(0, 1fr)", columnGap: "12px", paddingTop: e.pt }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px", paddingTop: "5px", textAlign: "right" }}>
                          <strong style={{ fontSize: "12.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{e.date}</strong>
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{e.time}</span>
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
                            <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{e.who}</span>
                            {!!(e.hasSt) && (<>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 8px", borderRadius: "11px", background: e.stbg, color: e.stfg, fontSize: "12px", fontWeight: "700" }}>→ <span>{e.st}</span></span>
                            </>)}
                          </span>
                          {!!(e.hasNote) && (<>
                            <span style={{ padding: "10px 12px", borderRadius: "10px", background: "var(--crm-cream-nav)", fontSize: "13.5px", color: "var(--crm-ink)", textWrap: "pretty" }}>{e.note}</span>
                          </>)}
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}>
                  <button type="button" onClick={v.cpOpenChat} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                      </path>
                    </svg>Open chat</button>
                </div>
              </aside>
            </>)}
            {!!(v.frmOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {!!(v.frmIsBase) && (<>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>Customer details</strong>
                    </>)}
                    {!!(v.frmNotBase) && (<>
                      <input value={v.frmTitle} onChange={v.setFrmName} placeholder="Form name" title="Rename form" style={{ height: "28px", boxSizing: "border-box", padding: "0 6px", marginLeft: "-6px", border: "1px solid transparent", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", outline: "none" }} className={DH.h27 + " " + DH.f2} />
                    </>)}
                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.frmSub}</span>
                  </span>
                  {!!(v.frmCanRm) && (<>
                    <button type="button" onClick={v.frmRm} title="Delete form" style={{ height: "34px", padding: "0 12px", borderRadius: "17px", border: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-oxblood)", cursor: "pointer" }}>Delete form</button>
                  </>)}
                  <button type="button" onClick={v.frmClose} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", cursor: "pointer" }}>
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
                        <span style={{ flex: "0 0 7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                        </span>
                        <input value={sec.title} onChange={sec.setTitle} title="Rename section" placeholder="Section title" style={{ flex: "1", minWidth: "0", height: "34px", boxSizing: "border-box", padding: "0 8px", marginLeft: "-8px", border: "1px solid transparent", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", outline: "none" }} className={DH.h27 + " " + DH.f2} />
                        <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{sec.n}</span>
                        {!!(sec.canDel) && (<>
                          <button type="button" onClick={sec.del} title="Delete section" style={{ width: "30px", height: "30px", border: "0", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h28}>
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                              </path>
                            </svg>
                          </button>
                        </>)}
                        {!!(sec.noDel) && (<>
                          <span title="Has Name or Phone, can't be deleted" style={{ width: "30px", height: "30px", color: "var(--crm-line)", display: "grid", placeItems: "center" }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M6 11h12v10H6zM8 11V7a4 4 0 0 1 8 0v4">
                              </path>
                            </svg>
                          </span>
                        </>)}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "14px", overflow: "hidden" }}>
                        {!!(sec.empty) && (<>
                          <span style={{ padding: "14px", fontSize: "13.5px", color: "var(--crm-muted)", textAlign: "center" }}>No fields yet</span>
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
                              <button type="button" onClick={f.toggle} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", padding: "0", border: "0", background: "transparent", font: "inherit", textAlign: "left", color: "var(--crm-ink)", cursor: "pointer" }}>
                                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <strong style={{ fontSize: "14px", fontWeight: "650" }}>{f.label}{f.star}</strong>
                                    {!!(f.isNew) && (<>
                                      <span style={{ height: "18px", padding: "0 6px", borderRadius: "9px", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "11px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>New</span>
                                    </>)}
                                  </span>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{f.summary}</span>
                                </span>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: f.chev }}>
                                  <path d="m6 9 6 6 6-6">
                                  </path>
                                </svg>
                              </button>
                              {!!(f.canDel) && (<>
                                <button type="button" onClick={f.del} title="Delete field" style={{ width: "30px", height: "30px", border: "0", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h28}>
                                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                                    </path>
                                  </svg>
                                </button>
                              </>)}
                              {!!(f.noDel) && (<>
                                <span title="Always on the form" style={{ width: "30px", height: "30px", color: "var(--crm-line)", display: "grid", placeItems: "center" }}>
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
                                  <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>FIELD NAME</span>
                                  <input value={f.lab} onChange={f.setLabel} placeholder="e.g. Gender" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none", width: "100%" }} className={DH.f1} />
                                </label>
                                {!!(f.typeFree) && (<>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>TYPE</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {(f.types).map((t, t_i) => (<Fragment key={t_i}>
                                        <button type="button" onClick={t.pick} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: `1px solid ${t.bd}`, background: t.bg, color: t.fg, font: "inherit", fontSize: "13px", fontWeight: "600", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
                                      </Fragment>))}
                                    </div>
                                  </div>
                                </>)}
                                {!!(f.isC) && (<>
                                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>OPTIONS</span>
                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                                      {(f.opts).map((o, o_i) => (<Fragment key={o_i}>
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "32px", padding: "0 4px 0 14px", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-line)", fontSize: "13.5px", fontWeight: "600", whiteSpace: "nowrap" }}>{o.t}<button type="button" onClick={o.rm} title="Remove option" style={{ width: "22px", height: "22px", border: "0", borderRadius: "50%", background: "transparent", color: "var(--crm-muted)", cursor: "pointer", display: "grid", placeItems: "center" }} className={DH.h3}>
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                                              <path d="M6 6l12 12M18 6 6 18">
                                              </path>
                                            </svg>
                                          </button></span>
                                      </Fragment>))}
                                    </div>
                                    <div style={{ display: "flex", gap: "8px" }}>
                                      <input value={f.optIn} onChange={f.setOptIn} onKeyDown={f.optKey} placeholder="Add an option" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none", width: "100%", flex: "1", minWidth: "0" }} className={DH.f1} />
                                      <button type="button" onClick={f.addOpt} style={{ height: "40px", padding: "0 14px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Add</button>
                                    </div>
                                  </div>
                                </>)}
                                {!!(f.notC) && (<>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>HINT TEXT</span>
                                    <input value={f.ph} onChange={f.setPh} placeholder="Shown in the empty box, e.g. RM" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none", width: "100%" }} className={DH.f1} />
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
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Name is always required</span>
                                </>)}
                              </div>
                            </>)}
                          </div>
                        </Fragment>))}
                      </div>
                      <button type="button" onClick={sec.addField} style={{ alignSelf: "flex-start", height: "32px", padding: "0 4px", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>+ Add field</button>
                    </div>
                  </Fragment>))}
                  <button type="button" onClick={v.frmAddSec} style={{ height: "44px", flex: "0 0 auto", borderRadius: "14px", border: "1.5px dashed var(--crm-line)", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h17}>+ Add section</button>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 20px 6px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.frmClose} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                  <button type="button" onClick={v.frmSave} style={{ flex: "1.6", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save and update sales app</button>
                </div>
              </aside>
            </>)}
            {!!(v.cltOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cltE.dname}</strong>
                    {!!(v.cltE.hasMode) && (<>
                      <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.cltE.mode}</span>
                    </>)}
                  </span>
                  <button type="button" onClick={v.cltE.del} style={{ height: "34px", padding: "0 12px", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-oxblood)", cursor: "pointer" }} className={DH.h20}>Delete</button>
                  <button type="button" onClick={v.cltE.cancel} title="Close" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6 6 18">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" }}>
                    <span style={{ fontWeight: "650", color: v.cltE.chFg }}>{v.cltE.channel}</span>
                    <span style={{ color: "var(--crm-faint-2)" }}>·</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", height: "22px", padding: "0 9px", borderRadius: "11px", background: v.cltE.stBg, color: v.cltE.stFg, fontSize: "12px", fontWeight: "700" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor" }}>
                      </span>{v.cltE.status}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>TEMPLATE NAME</span>
                    <input value={v.cltE.dn} onChange={v.cltE.setDN} placeholder="e.g. Weekend promo" style={{ height: "44px", boxSizing: "border-box", padding: "0 14px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>CHANNEL</span>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
                      {(v.cltE.chOpts).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.pick} style={{ height: "38px", border: "0", borderRadius: "10px", background: c.bg, boxShadow: c.sh, font: "inherit", fontSize: "14px", fontWeight: c.fw, color: c.fg, cursor: "pointer" }}>{c.label}</button>
                      </Fragment>))}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>MESSAGE</span>
                    <textarea ref={v.cltTaRef} value={v.cltE.draft} onChange={v.cltE.setDraft} placeholder="Hi {name}, …" rows={6} style={{ width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1.5px solid var(--crm-rust)", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14.5px", lineHeight: "1.6", color: "var(--crm-ink)", resize: "vertical", outline: "none" }}>
                    </textarea>
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", marginRight: "4px" }}>INSERT</span>
                      {(v.cltE.vars).map((vi, vi_i) => (<Fragment key={vi_i}>
                        <button type="button" onClick={vi.add} style={{ flex: "0 0 auto", whiteSpace: "nowrap", height: "28px", padding: "0 11px", border: "1px solid var(--crm-tint-attention)", borderRadius: "14px", background: "#fff", color: "var(--crm-rust)", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h29}>+ {vi.label}</button>
                      </Fragment>))}
                      <span style={{ display: "contents" }}>
                        <button type="button" onClick={v.cltE.toggleMore} style={{ flex: "0 0 auto", whiteSpace: "nowrap", height: "28px", padding: "0 11px", border: "1px dashed var(--crm-line)", borderRadius: "14px", background: "transparent", color: "var(--crm-muted)", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }} className={DH.h30}>Add variable</button>
                      </span>
                    </div>
                    {!!(v.cltE.moreOpen) && (<>
                      <div style={{ width: "100%", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "14px", display: "flex", flexDirection: "column" }}>
                        <span style={{ padding: "8px 10px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>FROM CUSTOMER INFO</span>
                        {(v.cltE.moreOpts).map((m, m_i) => (<Fragment key={m_i}>
                          <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "9px 10px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                            <span style={{ fontSize: "13.5px", color: "var(--crm-ink)" }}>{m.d}</span>
                            <span style={{ fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)" }}>{m.v}</span>
                          </button>
                        </Fragment>))}
                        {!!(v.cltE.moreNone) && (<>
                          <span style={{ padding: "9px 10px", fontSize: "13px", color: "var(--crm-muted)" }}>All variables added</span>
                        </>)}
                      </div>
                    </>)}
                    <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Click a variable to insert it at the cursor. You can also type it, e.g. {"{"}name{"}"}.</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <span style={{ fontSize: "11.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>PREVIEW</span>
                    <div style={{ padding: "16px", borderRadius: "14px", background: "var(--crm-cream-nav)" }}>
                      <div style={{ padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "#fff", border: "1px solid var(--crm-field)", fontSize: "14.5px", lineHeight: "1.6", color: "var(--crm-ink)", textWrap: "pretty" }}>
                        {(v.cltE.dsegs).map((g, g_i) => (<Fragment key={g_i}>
                          {!!(g.tag) && (<>
                            <span style={{ padding: "1px 7px", borderRadius: "6px", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontWeight: "650", fontSize: "13.5px" }}>{g.t}</span>
                          </>)}
                          {!!(g.txt) && (<>{g.t}</>)}
                        </Fragment>))}
                      </div>
                    </div>
                  </div>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.cltE.saveDraft} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Save draft</button>
                  <button type="button" onClick={v.cltE.submit} disabled={v.cltE.empty} style={{ flex: "1.4", height: "44px", borderRadius: "22px", border: "0", background: v.cltE.subBg, font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: v.cltE.subCur }}>Submit for review</button>
                </div>
              </aside>
            </>)}
            {!!(v.srOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.srE.name}</strong>
                  </span>
                  <button type="button" onClick={v.srClose} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: "20px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
                    {(v.srTabs).map((o, o_i) => (<Fragment key={o_i}>
                      <button type="button" onClick={o.pick} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "38px", border: "0", borderRadius: "11px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "14px", fontWeight: "650", color: o.fg, cursor: "pointer" }}>{o.label}{!!(o.n) && (<>
                          <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: o.nBg, color: o.nFg, fontSize: "11.5px", fontWeight: "700", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{o.n}</span>
                        </>)}</button>
                    </Fragment>))}
                  </div>
                  {!!(v.srTabInfo) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>PHOTO</span>
                        <label style={{ position: "relative", display: "block", height: "170px", borderRadius: "14px", overflow: "hidden", border: `1.5px dashed ${v.srE.photoBd}`, background: "var(--crm-cream-nav)", cursor: "pointer" }}>
                          {!!(v.srE.photo) && (<>
                            <img src={v.srE.photo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                            <span style={{ position: "absolute", right: "10px", bottom: "10px", height: "30px", padding: "0 12px", borderRadius: "15px", background: "rgba(42,22,12,.78)", color: "#fff", fontSize: "12.5px", fontWeight: "650", display: "inline-flex", alignItems: "center" }}>Change photo</span>
                          </>)}
                          {!!(v.srE.noPhoto) && (<>
                            <span style={{ position: "absolute", inset: "0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "6px", color: "var(--crm-muted)" }}>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5L5 19">
                                </path>
                              </svg>
                              <b style={{ fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)" }}>Add a photo</b>
                              <span style={{ fontSize: "12px" }}>Shown to customers when they book · JPG or PNG</span>
                            </span>
                          </>)}
                          <input type="file" accept="image/*" onChange={v.srSetPhoto} style={{ position: "absolute", inset: "0", opacity: "0", cursor: "pointer" }} />
                        </label>
                        {!!(v.srE.photo) && (<>
                          <button type="button" onClick={v.srRemovePhoto} style={{ alignSelf: "flex-start", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove photo</button>
                        </>)}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>NAME</span>
                        <input type="text" value={v.srE.dispName} onChange={v.srSetName} placeholder="e.g. Puchong Showroom" style={{ width: "100%", boxSizing: "border-box", height: "44px", padding: "0 14px", border: "1.5px solid var(--crm-rule)", borderRadius: "12px", font: "inherit", fontSize: "14.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z">
                            </path>
                          </svg>ADDRESS</span>
                        <input type="text" value={v.srE.addr} onChange={v.srSetAddr} placeholder="Street, area, city" style={{ width: "100%", boxSizing: "border-box", height: "44px", padding: "0 14px", border: "1.5px solid var(--crm-rule)", borderRadius: "12px", font: "inherit", fontSize: "14.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "14px", background: "var(--crm-cream-nav)" }}>
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "3px" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z">
                              </path>
                            </svg>BOOKING LIMIT</span>
                        </span>
                        <button type="button" onClick={v.srLimDown} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "18px", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>−</button>
                        <b style={{ minWidth: "24px", textAlign: "center", fontSize: "17px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.srE.limit}</b>
                        <button type="button" onClick={v.srLimUp} style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "18px", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>+</button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "var(--crm-cream-nav)" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ flex: "1", fontSize: "13.5px", fontWeight: "700" }}>Directions</b>
                          <span style={{ display: "inline-flex", padding: "3px", borderRadius: "10px", background: "var(--crm-rule-soft)" }}>
                            {(v.srLinkModes).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ height: "26px", padding: "0 10px", border: "0", borderRadius: "7px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "12px", fontWeight: "650", color: o.fg, cursor: "pointer", whiteSpace: "nowrap" }}>{o.label}</button>
                            </Fragment>))}
                          </span>
                        </span>
                        {!!(v.srE.manual) && (<>
                          {(v.srE.linkFields).map((lf, lf_i) => (<Fragment key={lf_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <span style={{ flex: "0 0 22px", width: "22px", height: "22px", borderRadius: "6px", background: lf.bg, color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>{lf.ch}</span>
                              <input type="text" value={lf.v} onChange={lf.set} placeholder={lf.ph} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 12px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none" }} className={DH.f1} />
                            </div>
                          </Fragment>))}
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Paste the share link from Google Maps or Waze. Empty fields fall back to the address.</span>
                        </>)}
                        {!!(v.srE.showAuto) && (<>
                          <a href={v.srE.gmapUrl} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid var(--crm-rule)", textDecoration: "none", color: "var(--crm-ink)" }} className={DH.h12}>
                            <span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "var(--crm-brand-maps)", color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>G</span>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                              <b style={{ fontSize: "13.5px", fontWeight: "650" }}>Google Maps</b>
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.srE.gmapUrl}</span>
                            </span>
                            <span style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}>Test</span>
                          </a>
                          <a href={v.srE.wazeUrl} target="_blank" rel="noopener" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff", border: "1px solid var(--crm-rule)", textDecoration: "none", color: "var(--crm-ink)" }} className={DH.h12}>
                            <span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "var(--crm-brand-waze)", color: "#fff", fontSize: "11px", fontWeight: "800", display: "grid", placeItems: "center" }}>W</span>
                            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                              <b style={{ fontSize: "13.5px", fontWeight: "650" }}>Waze</b>
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.srE.wazeUrl}</span>
                            </span>
                            <span style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}>Test</span>
                          </a>
                        </>)}
                        {!!(v.srE.showNoAddr) && (<>
                          <span style={{ fontSize: "13px", color: "var(--crm-faint)" }}>Add an address above to create the links</span>
                        </>)}
                      </div>
                    </div>
                  </>)}
                  {!!(v.srTabSlots) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2">
                            </path>
                          </svg>OPEN SLOTS</span>
                        <span style={{ flex: "1" }}>
                        </span>
                        <button type="button" onClick={v.srAll} style={{ border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>{v.srE.allLabel}</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "72px repeat(7, minmax(0, 1fr)) 26px", gap: "6px", alignItems: "center" }}>
                        <span>
                        </span>
                        {(v.srDays).map((d, d_i) => (<Fragment key={d_i}>
                          <span style={{ textAlign: "center", fontSize: "11.5px", fontWeight: "700", color: "var(--crm-muted)" }}>{d.l}</span>
                        </Fragment>))}
                        <span>
                        </span>
                        {(v.srE.slots).map((sl, sl_i) => (<Fragment key={sl_i}>
                          <span style={{ fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{sl.time}</span>
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
                          <button type="button" onClick={sl.remove} title="Remove this time" style={{ width: "26px", height: "26px", borderRadius: "50%", border: "0", background: "transparent", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", cursor: "pointer", padding: "0" }} className={DH.h14}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M18 6 6 18M6 6l12 12">
                              </path>
                            </svg>
                          </button>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "14px", background: "var(--crm-cream-nav)" }}>
                        <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Add a time</b>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
                          {(v.srNewDays).map((d, d_i) => (<Fragment key={d_i}>
                            <button type="button" onClick={d.toggle} style={{ height: "34px", padding: "0", borderRadius: "10px", border: `1.5px solid ${d.bd}`, background: d.bg, font: "inherit", fontSize: "13px", fontWeight: "650", color: d.fg, cursor: "pointer" }}>{d.l}</button>
                          </Fragment>))}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <select value={v.srNewT} onChange={v.srSetNewT} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "var(--crm-ink)" }}>
                            {(v.srNewOpts).map((h, h_i) => (<Fragment key={h_i}>
                              <option value={h.v}>{h.v}</option>
                            </Fragment>))}
                          </select>
                          <button type="button" onClick={v.srAddTime} disabled={v.srNoNewT} style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "6px", height: "40px", padding: "0 16px", borderRadius: "20px", border: "0", background: v.srAddTBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>Add time</button>
                        </div>
                        <span style={{ fontSize: "12px", color: "var(--crm-oxblood)" }}>{v.srNewHint}</span>
                      </div>
                    </div>
                  </>)}
                  {!!(v.srTabBlk) && (<>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                      <strong style={{ fontSize: "16px", fontWeight: "700" }}>Blocked time slots</strong>
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "16px", background: "var(--crm-cream-nav)" }}>
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
                      <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px", borderRadius: "16px", background: "var(--crm-cream-nav)" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                          <b style={{ fontSize: "14.5px", fontWeight: "700" }}>Dates</b>
                        </span>
                        <div style={{ height: "1px", background: "var(--crm-rule-soft)" }}>
                        </div>
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Which dates</b>
                        </span>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button type="button" onClick={v.srCalFrom} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "10px", height: "50px", padding: "0 14px", boxSizing: "border-box", border: `1.5px solid ${v.srBlk.fromBd}`, borderRadius: "14px", background: "#fff", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                              </path>
                            </svg>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "var(--crm-muted)" }}>From</span>
                              <b style={{ fontSize: "14.5px", fontWeight: "650", color: v.srBlk.fromFg }}>{v.srBlk.fromTxt}</b>
                            </span>
                          </button>
                          <button type="button" onClick={v.srCalTo} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "10px", height: "50px", padding: "0 14px", boxSizing: "border-box", border: `1.5px solid ${v.srBlk.toBd}`, borderRadius: "14px", background: "#fff", font: "inherit", textAlign: "left", cursor: "pointer" }}>
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z">
                              </path>
                            </svg>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                              <span style={{ fontSize: "11.5px", fontWeight: "600", color: "var(--crm-muted)" }}>To</span>
                              <b style={{ fontSize: "14.5px", fontWeight: "650", color: v.srBlk.toFg }}>{v.srBlk.toTxt}</b>
                            </span>
                          </button>
                        </div>
                        {!!(v.srCalOpen) && (<>
                          <div style={{ padding: "12px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "8px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <button type="button" onClick={v.srCalPrev} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", textAlign: "center", fontSize: "14px", fontWeight: "700" }}>{v.srCalLabel}</strong>
                              <button type="button" onClick={v.srCalNext} style={{ width: "30px", height: "30px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m9 6 6 6-6 6">
                                  </path>
                                </svg>
                              </button>
                            </div>
                            <span style={{ textAlign: "center", fontSize: "12px", fontWeight: "600", color: "var(--crm-rust)" }}>{v.srCalHint}</span>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                              {(v.srCalDow).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ height: "24px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", color: "var(--crm-faint)" }}>{d.l}</span>
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
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", padding: "3px", borderRadius: "12px", background: "var(--crm-rule-soft)" }}>
                          {(v.srTimeModes).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ height: "36px", border: "0", borderRadius: "9px", background: o.bg, boxShadow: o.sh, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: o.fg, cursor: "pointer" }}>{o.label}</button>
                          </Fragment>))}
                        </div>
                        {!!(v.srPickTime) && (<>
                          {(v.srRanges).map((r, r_i) => (<Fragment key={r_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <select value={r.f} onChange={r.setF} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "var(--crm-ink)" }}>
                                {(r.fromHours).map((h, h_i) => (<Fragment key={h_i}>
                                  <option value={h.v}>{h.v}</option>
                                </Fragment>))}
                              </select>
                              <span style={{ color: "var(--crm-muted)" }}>–</span>
                              <select value={r.t} onChange={r.setT} style={{ flex: "1", minWidth: "0", height: "40px", padding: "0 10px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "12px", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "600", color: "var(--crm-ink)" }}>
                                {(r.toHours).map((h, h_i) => (<Fragment key={h_i}>
                                  <option value={h.v}>{h.v}</option>
                                </Fragment>))}
                              </select>
                              <button type="button" onClick={r.remove} title="Remove time" style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", border: "0", background: "transparent", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h14}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M18 6 6 18M6 6l12 12">
                                  </path>
                                </svg>
                              </button>
                            </div>
                          </Fragment>))}
                          <button type="button" onClick={v.srAddRange} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px dashed var(--crm-st-won)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>Add another time</button>
                        </>)}
                        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <b style={{ fontSize: "13.5px", fontWeight: "700" }}>Reason</b>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-faint)" }}>· optional</span>
                        </span>
                        <input type="text" value={v.srBlk.reason} onChange={v.srBlkReason} placeholder="e.g. Staff training" style={{ height: "44px", padding: "0 14px", boxSizing: "border-box", border: "1.5px solid var(--crm-rule)", borderRadius: "14px", background: "#fff", font: "inherit", fontSize: "14.5px", color: "var(--crm-ink)", outline: "none" }} />
                        <div style={{ height: "1px", background: "var(--crm-rule-soft)" }}>
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
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-faint)" }}>BLOCKED DATES</span>
                      </>)}
                      {(v.srE.blocks).map((k, k_i) => (<Fragment key={k_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "#fff" }}>
                          <span style={{ flex: "0 0 auto", height: "22px", padding: "0 8px", borderRadius: "11px", background: k.tagBg, color: k.tagFg, fontSize: "11px", fontWeight: "700", display: "inline-flex", alignItems: "center" }}>{k.tag}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <b style={{ fontSize: "13.5px", fontWeight: "650" }}>{k.when}</b>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{k.sub}</span>
                          </span>
                          <button type="button" onClick={k.remove} title="Remove" style={{ width: "28px", height: "28px", borderRadius: "50%", border: "0", background: "transparent", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h14}>
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
                <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "10px", padding: "14px 20px 16px", borderTop: "1px solid var(--crm-rule)" }}>
                  <button type="button" onClick={v.srApplyAll} style={{ height: "42px", borderRadius: "21px", border: "1.5px solid var(--crm-rust)", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h8}>Save and apply to all {v.srN} showrooms</button>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={v.srClose} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                    <button type="button" onClick={v.srSave} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                </div>
              </aside>
            </>)}
            {!!(v.ftNone) && (<>
              <aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", textAlign: "center", padding: "24px" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>Pick a team</strong>
                <span style={{ maxWidth: "260px", fontSize: "13px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>Set which full-time people get leads on which days</span>
              </aside>
            </>)}
            {!!(v.ftOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: v.splitFlex, width: `${v.sheetW}px`, minWidth: "320px", position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: v.ftE.color }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ftE.name}</strong>
                    <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Full time lead allocation</span>
                  </span>
                  <button type="button" onClick={v.closeFt} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>FULL TIME ALLOCATION</span>
                    <div style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                      {(v.ftModes).map((o, o_i) => (<Fragment key={o_i}>
                        {!!(o.on) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", border: "0", height: "34px", borderRadius: "8px", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "13.5px", fontWeight: "650", boxShadow: "0 1px 2px rgba(42,22,12,.12)", cursor: "pointer" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.bg }}>
                            </span>{o.label}</button>
                        </>)}
                        {!!(o.off) && (<>
                          <button type="button" onClick={o.pick} style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", border: "0", height: "34px", borderRadius: "8px", background: "transparent", color: "var(--crm-muted)", font: "inherit", fontSize: "13.5px", fontWeight: "550", cursor: "pointer" }} className={DH.h2}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-faint-2)" }}>
                            </span>{o.label}</button>
                        </>)}
                      </Fragment>))}
                    </div>
                    {!!(v.ftOff) && (<>
                      <span style={{ fontSize: "13px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>New leads for this team follow <b style={{ color: "var(--crm-ink)", fontWeight: "650" }}>Ads to teams</b>. Turn on to give full-time people the leads on the days you tick.</span>
                    </>)}
                  </div>
                  {!!(v.ftOn) && (<>
                    <div style={{ display: "flex", flexDirection: "column", padding: "18px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", paddingBottom: "6px" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", flex: "1" }}>WHO WORKS WHICH DAY</span>
                        <button type="button" onClick={v.ftAllToggle} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h25}>{v.ftAllLabel}</button>
                      </div>
                      {(v.ftE.people).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 0", borderTop: "1px solid var(--crm-field)" }}>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                            <button type="button" onClick={p.all} style={{ alignSelf: "flex-start", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "12px", color: "var(--crm-muted)", cursor: "pointer" }} className={DH.h2}>{p.allLabel}</button>
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
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>WHO GETS EACH DAY</span>
                      </span>
                      {(v.ftE.summary).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", gap: "12px", padding: "7px 0", borderTop: "1px solid var(--crm-field)", fontSize: "13px" }}>
                          <b style={{ flex: "0 0 36px", fontWeight: "650" }}>{r.day}</b>
                          <span style={{ flex: "1", color: r.fg }}>{r.who}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", gap: "12px", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)" }}>
                  <label title={v.ftApplyTip} style={{ display: "flex", alignItems: "flex-start", gap: "10px", fontSize: "13px", color: v.ftApplyFg, cursor: v.ftApplyCur }}>
                    <input type="checkbox" checked={v.ftApplyOn} disabled={v.ftApplyDis} onChange={v.toggleFtApplyChk} style={{ flex: "0 0 16px", width: "16px", height: "16px", margin: "1px 0 0", accentColor: "var(--crm-rust)" }} />
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span>Also apply to all 3 teams</span>
                      {!!(v.ftApplyDis) && (<>
                        <span style={{ fontSize: "12px", color: "var(--crm-faint)" }}>Only when everyone here works the same days</span>
                      </>)}
                    </span>
                  </label>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button type="button" onClick={v.closeFt} style={{ flex: "0 0 auto", height: "40px", padding: "0 20px", borderRadius: "20px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }} className={DH.h8}>Cancel</button>
                    <button type="button" onClick={v.ftSaveOrApply} style={{ flex: "1", height: "40px", borderRadius: "20px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                </div>
              </aside>
            </>)}
            {!!(v.sendOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 20px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>Send {v.sendName} to</strong>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.sendMeta}</span>
                  </span>
                  <button type="button" onClick={v.closeSend} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                  {(v.sendGroups).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 20px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                      </span>{g.label}</div>
                    {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                      <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 20px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                        <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: m.bg, color: m.fg, fontSize: "11.5px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                          <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.sub}</span>
                        </span>
                        <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: "1px solid var(--crm-rust)", color: "var(--crm-rust)", fontSize: "12.5px", fontWeight: "650" }}>Send</span>
                      </button>
                    </Fragment>))}
                  </Fragment>))}
                </div>
              </aside>
            </>)}
            {!!(v.awOpen) && (<>
              <aside className={DX.slideIn} style={{ flex: `0 0 ${v.sheetW}px`, width: `${v.sheetW}px`, position: "relative", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
                <div onPointerDown={v.dragSheet} onDoubleClick={v.resetSheet} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: "0", bottom: "0", width: "9px", zIndex: "6", cursor: "col-resize", touchAction: "none" }} className={DH.h23}>
                </div>
                <div style={{ flex: "0 0 60px", height: "60px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "10px", padding: "0 12px 0 16px", borderBottom: "1px solid var(--crm-rule)" }}>
                  <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-tint-cold)", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.aw.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.aw.name}</strong>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-brown)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.aw.ad}</span>
                  </span>
                  <span style={{ position: "relative", flex: "0 0 auto" }}>
                    <button type="button" onClick={v.awMenuToggle} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", boxSizing: "border-box", cursor: "pointer" }} className={DH.h8}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--crm-ink)">
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
                      <div style={{ position: "absolute", top: "40px", right: "0", zIndex: "8", minWidth: "250px", padding: "8px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "18px", boxShadow: "0 10px 30px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <button type="button" onClick={v.awAssign} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "var(--crm-tint-cold)", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 4l3 3-3 3M4 7h16M7 20l-3-3 3-3M20 17H4">
                              </path>
                            </svg>
                          </span>Assign to</button>
                        {!!(v.aw.notReminded) && (<>
                          <button type="button" onClick={v.awRemind} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "var(--crm-tint-appt)", display: "grid", placeItems: "center" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-brown)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                                </path>
                              </svg>
                            </span>Send reminder</button>
                        </>)}
                        {!!(v.aw.reminded) && (<>
                          <span style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", fontSize: "16px", fontWeight: "700", color: "var(--crm-brown)", whiteSpace: "nowrap" }}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "var(--crm-tint-follow)", display: "grid", placeItems: "center" }}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-brown)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </span>Reminder sent</span>
                        </>)}
                        <button type="button" onClick={v.awInfo} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "var(--crm-tint-follow)", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-brown)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0">
                              </path>
                            </svg>
                          </span>Customer info</button>
                        <button type="button" onClick={v.awBook} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "8px 10px", border: "0", borderRadius: "14px", background: "transparent", font: "inherit", fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left", whiteSpace: "nowrap" }} className={DH.h8}><span style={{ flex: "0 0 40px", width: "40px", height: "40px", borderRadius: "10px", background: "var(--crm-tint-new)", display: "grid", placeItems: "center" }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                              </path>
                            </svg>
                          </span>Appointment</button>
                      </div>
                    </>)}
                  </span>
                  <button type="button" onClick={v.closeAw} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>
                </div>
                <p style={{ flex: "0 0 auto", margin: "0", padding: "8px 20px", fontSize: "12px", color: "var(--crm-muted)", background: "#fff" }}>{v.aw.owner}</p>
                <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", padding: "20px 24px 104px", backgroundColor: "var(--crm-cream)" }}>
                  <span style={{ alignSelf: "center", padding: "0 0 6px", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{v.aw.time}</span>
                  {!!(v.aw.inn) && (<>
                    <div style={{ alignSelf: "flex-start", maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: "14px 14px 14px 4px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}>
                      <p style={{ margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{v.aw.msg}</p>
                      <span style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px", fontSize: "11px", color: "var(--crm-muted)" }}>{v.aw.clock}</span>
                    </div>
                  </>)}
                  {!!(v.aw.out) && (<>
                    <div style={{ alignSelf: "flex-end", maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: "16px 16px 4px 16px", boxShadow: "rgba(42,22,12,.1) 0 1px 1px", background: "var(--crm-tint-attention)", color: "var(--crm-ink)" }}>
                      <p style={{ margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{v.aw.msg}</p>
                      <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "4px", fontSize: "11px", color: "var(--crm-muted)" }}>{v.aw.clock}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5">
                          </path>
                        </svg></span>
                    </div>
                  </>)}
                  {!!(v.aw.reminded) && (<>
                    <span style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", maxWidth: "86%", margin: "4px 0", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "var(--crm-ink-soft)", fontSize: "12px", fontWeight: "600", textAlign: "center" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto" }}>
                        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                        </path>
                      </svg>{v.aw.remindLog}</span>
                  </>)}
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", padding: "12px 16px", borderTop: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px" }}>
                  <span title="Send a file" style={{ flex: "0 0 auto", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 6px 0 16px", borderRadius: "22px", border: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "4px" }}>
                    <span style={{ flex: "1", minWidth: "0", fontSize: "15px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.aw.reply}</span>
                    <span style={{ flex: "0 0 auto", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">
                        </path>
                      </svg>
                    </span>
                  </span>
                  <span title="Send a photo" style={{ flex: "0 0 auto", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z">
                      </path>
                    </svg>
                  </span>
                  <span title="Voice note" style={{ flex: "0 0 auto", width: "44px", height: "44px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center" }}>
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
            <div style={{ flex: "0 0 380px", boxSizing: "border-box", borderRight: "1px solid var(--crm-rule)", padding: "8px 16px", display: "flex", flexDirection: "column", overflow: "auto", background: "#fff" }}>
              {(v.listCards).map((c, c_i) => (<Fragment key={c_i}>
                <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 10px", border: "0", borderBottom: "1px solid var(--crm-field)", borderRadius: "0", background: c.rowBg, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                  <span style={{ flex: "0 0 44px", width: "44px", height: "44px", borderRadius: "50%", background: c.bg, display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                      <path d={c.d}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", letterSpacing: "-.01em", color: c.titleColor }}>{c.title}</strong>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{c.sub}</span>
                  </span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
                  <button type="button" onClick={c.pick} style={{ display: "flex", alignItems: "center", gap: "22px", padding: "22px 8px", border: "0", borderBottom: "1px solid var(--crm-field)", borderRadius: "0", background: c.rowBg, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                    <span style={{ flex: "0 0 78px", width: "78px", height: "78px", borderRadius: "50%", background: c.bg, display: "grid", placeItems: "center" }}>
                      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                        <path d={c.d}>
                        </path>
                      </svg>
                    </span>
                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <strong style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.01em", color: c.titleColor }}>{c.title}</strong>
                      <span style={{ fontSize: "17px", color: "var(--crm-muted)" }}>{c.sub}</span>
                    </span>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </button>
                </Fragment>))}
              </div>
            </div>
          </>)}
          {!!(v.notWide) && (<>
            <div style={{ flex: "1", minWidth: "0", boxSizing: "border-box", padding: v.f4.pad, display: "flex", flexDirection: "column", gap: v.f4.gap, overflow: "auto" }}>
              {!!(v.kList) && (<DeskInboxList4a v={v} />)}
              {!!(v.kInsight) && (<>
                <DeskInsight4a v={v} />
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "baseline", gap: "10px", marginTop: "22px" }}>
                  <strong style={{ flex: "1", font: "500 18px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", color: "var(--crm-ink)" }}>Ads Performance</strong>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--crm-muted)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.metaDot }}>
                    </span>{v.metaSync}</span>
                  <DeskCardPicker v={v} />
                  <button type="button" onClick={v.goAdsPerf} style={{ display: "inline-flex", alignItems: "center", gap: "4px", border: "0", padding: "0", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>View all<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg></button>
                </div>
                <div style={{ flex: "0 0 auto", display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "12px" }}>
                  {(v.adTotals).map((k, k_i) => (<Fragment key={k_i}>
                    <div style={{ padding: "14px 18px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", display: "flex", flexDirection: "column", gap: "2px" }}>
                      <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", fontWeight: "600" }}>{k.label}</span>
                      <b style={{ fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{k.value}</b>
                    </div>
                  </Fragment>))}
                </div>
                <div style={{ flex: "0 0 auto", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "18px", overflowX: "auto" }}>
                  <div style={{ minWidth: `${v.insAdMinW}px` }}>
                    <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", padding: "12px 20px", borderBottom: "1px solid var(--crm-rule)", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>
                      {(v.insHead).map((h, h_i) => (<Fragment key={h_i}><button type="button" onClick={h.sort} style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: h.justify, gap: "5px", padding: "0", border: "0", background: "none", font: "inherit", color: h.fg, letterSpacing: "inherit", textTransform: "uppercase", textAlign: h.align, cursor: "pointer" }}><span>{h.label}</span><span style={{ flex: "0 0 auto", fontSize: "10px", color: h.ac }}>{h.arrow}</span><span onPointerDown={h.resize} onDoubleClick={h.unsize} onClick={e => e.stopPropagation()} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-12px", bottom: "-12px", right: "-12px", width: "12px", cursor: "col-resize", display: "flex", justifyContent: "center" }}><span style={{ width: "1px", margin: "8px 0", background: "var(--crm-rule)" }}></span></span></button></Fragment>))}
                    </div>
                    {(v.adPerf).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", alignItems: "center", padding: "13px 20px", borderBottom: "1px solid var(--crm-field)", fontSize: "14.5px", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>
                        <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: "600" }}>
                            <span style={{ color: r.chFg }}>{r.channel}</span>
                            <span style={{ color: "var(--crm-faint-2)" }}>·</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: r.stInk }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.stDot }}>
                              </span>{r.status}</span>
                          </span>
                        </span>
                        <span style={{ textAlign: "center" }}>{r.spend}</span>
                        <span style={{ textAlign: "center" }}>{r.reach}</span>
                        <span style={{ textAlign: "center" }}>{r.clicks}</span>
                        <span style={{ textAlign: "center", color: "var(--crm-muted)" }}>{r.ctr}</span>
                        <span style={{ textAlign: "center" }}>{r.leads}</span>
                        <span style={{ textAlign: "center", color: r.cplColor }}>{r.cpl}</span>
                        <span style={{ textAlign: "center" }}>{r.appt}</span>
                      </div>
                    </Fragment>))}
                    <div style={{ display: "grid", gridTemplateColumns: v.insAdCols, gap: "12px", alignItems: "center", padding: "14px 20px", background: "var(--crm-cream-nav)", fontSize: "14.5px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--crm-ink)" }}>TOTAL · {v.adTot.n} ADS</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.spend}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.reach}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.clicks}</span>
                      <span style={{ textAlign: "center", color: "var(--crm-muted)" }}>{v.adTot.ctr}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.leads}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.cpl}</span>
                      <span style={{ textAlign: "center" }}>{v.adTot.appt}</span>
                    </div>
                  </div>
                </div>
              </>)}
              {!!(v.kCh) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "20px", paddingTop: "8px" }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", borderBottom: "1px solid var(--crm-rule)" }}>
                    {(v.chTabs).map((t, t_i) => (<Fragment key={t_i}>
                      {!!(t.on) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 2px", margin: "0 10px -1px 0", border: "0", borderBottom: "2px solid var(--crm-rust)", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}<span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.dot }}>
                          </span></button>
                      </>)}
                      {!!(t.off) && (<>
                        <button type="button" onClick={t.pick} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 2px", margin: "0 10px -1px 0", border: "0", borderBottom: "2px solid transparent", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "550", color: "var(--crm-muted)", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h2}>{t.label}<span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.dot }}>
                          </span></button>
                      </>)}
                    </Fragment>))}
                    <span style={{ flex: "1" }}>
                    </span>
                    <span style={{ paddingBottom: "12px" }}>
                      <a href="https://business.facebook.com" target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", textDecoration: "none" }}>Open in Meta Business Suite<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M7 17 17 7M8 7h9v9">
                          </path>
                        </svg></a>
                    </span>
                  </div>
                  {!!(v.chNote) && (<>
                    <div style={{ padding: "10px 14px", borderRadius: "10px", background: "var(--crm-cream-nav)", fontSize: "13px", color: "var(--crm-muted)" }}>{v.chNote}</div>
                  </>)}
                  {!!(v.chHasSave) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "-6px" }}>
                      <span style={{ flex: "1", fontSize: "13px", color: "var(--crm-muted)" }}>Changes are sent to Meta when you save. They can take a few minutes to show.</span>
                      {!!(v.chDirtyNow) && (<>
                        <button type="button" onClick={v.chDiscard} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Discard</button>
                      </>)}
                      <button type="button" onClick={v.chSave} style={{ height: "36px", padding: "0 20px", borderRadius: "18px", border: "0", background: v.chSaveBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Save to Meta</button>
                    </div>
                  </>)}
                  {!!(v.chConn) && (<>
                    <DeskChannels4a v={v} />
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "12px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px 18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>API access</strong>
                          <button type="button" onClick={v.chRefresh} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>Refresh</button>
                        </div>
                        <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.chTokenLine}</span>
                        <span style={{ fontSize: "12px", color: "var(--crm-faint)", fontFamily: "ui-monospace, monospace" }}>{v.chTokenMask}</span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "16px 18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>Webhook</strong>
                          <button type="button" onClick={v.chTestHook} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>Send test</button>
                        </div>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: v.chHookC, fontWeight: "650" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.chHookC }}>
                          </span>{v.chHookLine}</span>
                        <span style={{ fontSize: "12px", color: "var(--crm-faint)", fontFamily: "ui-monospace, monospace" }}>{v.chHookUrl}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid var(--crm-field)" }}>
                        <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>What the CRM may do on Meta</strong>
                        <button type="button" onClick={v.chReconnect} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-rust)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Reconnect</button>
                      </div>
                      {(v.chPerms).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "11px 18px", borderTop: "1px solid var(--crm-field)" }}>
                          <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <span style={{ fontSize: "13.5px", fontWeight: "600" }}>{p.t}</span>
                            <span style={{ fontSize: "11.5px", color: "var(--crm-faint)", fontFamily: "ui-monospace, monospace" }}>{p.code}</span>
                          </span>
                          <span style={{ height: "24px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "12px", background: p.bg, color: p.fg, fontSize: "12px", fontWeight: "650" }}>{p.stt}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.chPage) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)", gap: "16px", alignItems: "start" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                        <strong style={{ fontSize: "14px", fontWeight: "650" }}>Page details</strong>
                        {(v.chPageF).map((f, f_i) => (<Fragment key={f_i}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ display: "flex", fontSize: "12.5px", color: "var(--crm-muted)" }}>
                              <span style={{ flex: "1" }}>{f.label}</span>
                              <span style={{ color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                            </span>
                            {!!(f.short) && (<>
                              <input type="text" value={f.val} onChange={f.set} readOnly={f.ro} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0" }} />
                            </>)}
                            {!!(f.long) && (<>
                              <textarea value={f.val} onChange={f.set} readOnly={f.ro} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                              </textarea>
                            </>)}
                          </label>
                        </Fragment>))}
                        <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Changing the Page name goes through Meta review. <a href="https://business.facebook.com" target="_blank" rel="noopener" style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", textDecoration: "none" }}>Change in Meta<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M7 17 17 7M8 7h9v9">
                              </path>
                            </svg></a></span>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Profile picture and cover</strong>
                          <div style={{ position: "relative", height: "120px", borderRadius: "10px", background: "repeating-linear-gradient(45deg, var(--crm-field) 0 10px, var(--crm-cream-nav) 10px 20px)", display: "grid", placeItems: "center", fontSize: "12px", color: "var(--crm-muted)" }}>Cover photo · 1640 × 624<span style={{ position: "absolute", left: "14px", bottom: "-22px", width: "64px", height: "64px", borderRadius: "50%", border: "3px solid #fff", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "18px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.chPageIni}</span></div>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", paddingTop: "6px" }}>
                            <button type="button" onClick={v.chOpenPage} style={{ height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Change picture</button>
                            <button type="button" onClick={v.chOpenPage} style={{ height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Change cover</button>
                          </div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", padding: "14px 18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ paddingBottom: "6px", fontSize: "14px", fontWeight: "650" }}>Opening hours</strong>
                          {(v.chHours).map((h, h_i) => (<Fragment key={h_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", borderTop: "1px solid var(--crm-field)" }}>
                              <b style={{ flex: "0 0 40px", fontSize: "13px", fontWeight: "650" }}>{h.d}</b>
                              <button type="button" onClick={h.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: h.trk, cursor: "pointer" }}>
                                <span style={{ position: "absolute", top: "2px", left: h.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                </span>
                              </button>
                              {!!(h.open) && (<>
                                <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--crm-muted)" }}><input type="time" value={h.from} onChange={h.setFrom} style={{ height: "32px", padding: "0 8px", border: "1px solid var(--crm-rule)", borderRadius: "8px", font: "inherit", fontSize: "13px", color: "var(--crm-ink)" }} />–<input type="time" value={h.to} onChange={h.setTo} style={{ height: "32px", padding: "0 8px", border: "1px solid var(--crm-rule)", borderRadius: "8px", font: "inherit", fontSize: "13px", color: "var(--crm-ink)" }} /></span>
                              </>)}
                              {!!(h.closed) && (<>
                                <span style={{ fontSize: "13px", color: "var(--crm-faint)" }}>Closed</span>
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
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Greeting</strong>
                          <span style={{ marginTop: "-6px", fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.chGreetHint}</span>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ alignSelf: "flex-end", fontSize: "12px", color: v.chGreet.cc }}>{v.chGreet.count}</span>
                            <textarea value={v.chGreet.val} onChange={v.chGreet.set} readOnly={v.chGreet.ro} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                            </textarea>
                          </label>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                          <div style={{ display: "flex", alignItems: "baseline" }}>
                            <strong style={{ flex: "1", fontSize: "14px", fontWeight: "650" }}>Ice breakers</strong>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{v.chIceN}</span>
                          </div>
                          <span style={{ marginTop: "-4px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Questions people can tap to start a chat</span>
                          {(v.chIce).map((q, q_i) => (<Fragment key={q_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ flex: "0 0 20px", fontSize: "12px", color: "var(--crm-faint)", textAlign: "right" }}>{q.n}</span>
                              <input type="text" value={q.q} onChange={q.set} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0" }} />
                              <button type="button" onClick={q.remove} title="Remove" style={{ flex: "0 0 28px", width: "28px", height: "28px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "var(--crm-faint)", cursor: "pointer" }}>×</button>
                            </div>
                          </Fragment>))}
                          {!!(v.chIceCanAdd) && (<>
                            <button type="button" onClick={v.chIceAdd} style={{ alignSelf: "flex-start", marginLeft: "28px", border: "0", background: "transparent", padding: "4px 0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>+ Add question</button>
                          </>)}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "18px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>Menu</strong>
                          <span style={{ marginTop: "-4px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Always there next to the message box</span>
                          {(v.chMenu).map((m, m_i) => (<Fragment key={m_i}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="text" value={m.l} onChange={m.set} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0" }} />
                              <span style={{ flex: "0 0 auto", height: "28px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "14px", background: "var(--crm-field)", fontSize: "12px", fontWeight: "650", color: "var(--crm-muted)" }}>{m.t}</span>
                              <button type="button" onClick={m.remove} title="Remove" style={{ flex: "0 0 28px", width: "28px", height: "28px", padding: "0", border: "0", borderRadius: "50%", background: "transparent", color: "var(--crm-faint)", cursor: "pointer" }}>×</button>
                            </div>
                          </Fragment>))}
                          <button type="button" onClick={v.chMenuAdd} style={{ alignSelf: "flex-start", border: "0", background: "transparent", padding: "4px 0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>+ Add menu item</button>
                        </div>
                      </div>
                      <div style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "10px", padding: "16px", borderRadius: "14px", background: "var(--crm-field)" }}>
                        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)" }}>MESSENGER PREVIEW</span>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", padding: "10px 0" }}>
                          <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.chPageIni}</span>
                          <strong style={{ fontSize: "14px" }}>{v.chPageName}</strong>
                        </div>
                        <div style={{ alignSelf: "flex-start", maxWidth: "90%", padding: "10px 12px", borderRadius: "16px", background: "#fff", fontSize: "13px", lineHeight: "1.4", color: "var(--crm-black)" }}>{v.chGreet.val}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                          {(v.chIce).map((q, q_i) => (<Fragment key={q_i}>
                            <span style={{ padding: "8px 12px", borderRadius: "16px", border: "1px solid var(--crm-messenger)", color: "var(--crm-messenger)", background: "#fff", fontSize: "12.5px", fontWeight: "600" }}>{q.q}</span>
                          </Fragment>))}
                        </div>
                      </div>
                    </div>
                  </>)}
                  {!!(v.chWa) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "230px minmax(0, 1fr)", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff", minHeight: "560px" }}>
                      <div style={{ display: "flex", flexDirection: "column", borderRight: "1px solid var(--crm-rule)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 14px 10px" }}>
                          <strong style={{ flex: "1", fontSize: "13px", fontWeight: "650" }}>Phone numbers · {v.waCount}</strong>
                          <button type="button" onClick={v.waAdd} title="Add a number" style={{ width: "28px", height: "28px", padding: "0", borderRadius: "50%", border: "1px dashed var(--crm-faint-2)", background: "#fff", color: "var(--crm-rust)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M12 5v14M5 12h14">
                              </path>
                            </svg>
                          </button>
                        </div>
                        {(v.waNums).map((n, n_i) => (<Fragment key={n_i}>
                          <button type="button" onClick={n.pick} style={{ display: "flex", alignItems: "center", gap: "10px", margin: "0 8px 4px", padding: "10px", border: "0", borderLeft: `3px solid ${n.bd}`, borderRadius: "8px", background: n.bg, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h12}>
                            <span style={{ position: "relative", flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", background: "var(--crm-field)", display: "grid", placeItems: "center" }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z">
                                </path>
                              </svg>
                              <span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "13px", height: "13px", borderRadius: "50%", background: "var(--crm-whatsapp)", border: "2px solid #fff" }}>
                              </span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                              <span style={{ fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap" }}>{n.name}</span>
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{n.region}</span>
                            </span>
                          </button>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 20px 10px" }}>
                          <span style={{ flex: "0 0 44px", width: "44px", height: "44px", borderRadius: "50%", background: "var(--crm-field)", display: "grid", placeItems: "center" }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z">
                              </path>
                            </svg>
                          </span>
                          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <strong style={{ fontSize: "16px", fontWeight: "650" }}><span style={{ fontSize: "11px", fontWeight: "700", color: "var(--crm-muted)", paddingRight: "4px" }}>MY</span>{v.wn.name}</strong>
                            <span style={{ fontSize: "13px", color: "var(--crm-ink)" }}>{v.wn.disp}</span>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Phone number ID <span style={{ color: "var(--crm-ink-soft)", fontVariantNumeric: "tabular-nums" }}>{v.wn.id}</span></span>
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "4px", padding: "0 20px", borderBottom: "1px solid var(--crm-rule)", overflowX: "auto" }}>
                          {(v.waSubs).map((t, t_i) => (<Fragment key={t_i}>
                            {!!(t.on) && (<>
                              <button type="button" onClick={t.pick} style={{ height: "34px", margin: "6px 0", padding: "0 12px", border: "0", borderRadius: "8px", background: "var(--crm-tint-attention)", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", whiteSpace: "nowrap" }}>{t.label}</button>
                            </>)}
                            {!!(t.off) && (<>
                              <button type="button" onClick={t.pick} style={{ height: "34px", margin: "6px 0", padding: "0 12px", border: "0", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "13px", fontWeight: "550", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }} className={DH.h4}>{t.label}</button>
                            </>)}
                          </Fragment>))}
                        </div>
                        {!!(v.waProf) && (<>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: "20px", padding: "18px 20px 20px", alignItems: "start" }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Profile picture</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>Shown on your business profile</span>
                                </span>
                                <button type="button" onClick={v.chOpenWaManager} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Choose file</button>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Display name</strong>
                                </span>
                                {!!(v.waDn.notEditing) && (<>
                                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13.5px" }}>{v.wn.disp}<span style={{ height: "20px", display: "inline-flex", alignItems: "center", padding: "0 8px", borderRadius: "10px", background: v.waDn.bg, color: v.waDn.fg, fontSize: "11.5px", fontWeight: "700" }}>{v.waDn.st}</span></span>
                                  <button type="button" onClick={v.waDn.edit} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Edit</button>
                                </>)}
                                {!!(v.waDn.editing) && (<>
                                  <input type="text" value={v.waDn.draft} onChange={v.waDn.setDraft} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0" }} />
                                  <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>Meta reviews every new display name. It must match your business.</span>
                                  <span style={{ display: "flex", gap: "8px" }}>
                                    <button type="button" onClick={v.waDn.cancel} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>Cancel</button>
                                    <button type="button" onClick={v.waDn.submit} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap", border: "0", background: "var(--crm-rust)", color: "#fff" }}>Submit for review</button>
                                  </span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Username</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>A way for customers to reach you without your phone number. Your number still shows on the profile.</span>
                                </span>
                                {!!(v.waUserNone) && (<>
                                  <button type="button" onClick={v.waUserCreate} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Create</button>
                                </>)}
                                {!!(v.waUserHas) && (<>
                                  <span style={{ fontSize: "13.5px", fontWeight: "650" }}>{v.waUser}</span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Official business account</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>A blue tick next to your name. It means WhatsApp has confirmed the account belongs to a real, well-known brand.</span>
                                </span>
                                {!!(v.waObaNone) && (<>
                                  <button type="button" onClick={v.waObaReq} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", alignSelf: "flex-start" }}>Submit request</button>
                                </>)}
                                {!!(v.waObaHas) && (<>
                                  <span style={{ fontSize: "13px", color: "var(--crm-brown)", fontWeight: "650" }}>{v.waOba}</span>
                                </>)}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px", paddingTop: "14px", borderTop: "1px solid var(--crm-field)" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Business info</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>Shown on your profile</span>
                                </span>
                                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                  <span style={{ fontSize: "12.5px", fontWeight: "650" }}>Category</span>
                                  <span style={{ position: "relative" }}>
                                    <button type="button" onClick={v.waCatToggle} style={{ display: "flex", alignItems: "center", height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0", cursor: "pointer", textAlign: "left" }}>
                                      <span style={{ flex: "1" }}>{v.wn.cat}</span>
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="m6 9 6 6 6-6">
                                        </path>
                                      </svg>
                                    </button>
                                    {!!(v.waCatOpen) && (<>
                                      <div onClick={v.waCatToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                                      </div>
                                      <div style={{ position: "absolute", top: "42px", left: "0", right: "0", zIndex: "8", padding: "6px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "12px", boxShadow: "0 10px 28px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "2px" }}>
                                        {(v.waCats).map((o, o_i) => (<Fragment key={o_i}>
                                          <button type="button" onClick={o.pick} style={{ height: "34px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, font: "inherit", fontSize: "13px", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>{o.c}</button>
                                        </Fragment>))}
                                      </div>
                                    </>)}
                                  </span>
                                </div>
                                {(v.waF).map((f, f_i) => (<Fragment key={f_i}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)" }}>{f.label} <span style={{ fontWeight: "500", color: "var(--crm-faint)" }}>· Optional</span></span>
                                    <span style={{ position: "relative", display: "block" }}>
                                      {!!(f.short) && (<>
                                        <input type="text" value={f.val} onChange={f.set} placeholder={f.ph} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0", paddingRight: "70px" }} />
                                      </>)}
                                      {!!(f.long) && (<>
                                        <textarea value={f.val} onChange={f.set} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                                        </textarea>
                                      </>)}
                                      <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "11.5px", color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                                    </span>
                                  </label>
                                </Fragment>))}
                                {(v.waWeb).map((f, f_i) => (<Fragment key={f_i}>
                                  <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                                    <span style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)" }}>{f.label} <span style={{ fontWeight: "500", color: "var(--crm-faint)" }}>· Optional</span></span>
                                    <span style={{ position: "relative", display: "block" }}>
                                      {!!(f.short) && (<>
                                        <input type="text" value={f.val} onChange={f.set} placeholder={f.ph} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0", paddingRight: "70px" }} />
                                      </>)}
                                      {!!(f.long) && (<>
                                        <textarea value={f.val} onChange={f.set} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                                        </textarea>
                                      </>)}
                                      <span style={{ position: "absolute", right: "12px", top: "11px", fontSize: "11.5px", color: f.cc, fontVariantNumeric: "tabular-nums" }}>{f.count}</span>
                                    </span>
                                  </label>
                                </Fragment>))}
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid var(--crm-field)" }}>
                                <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                  <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Social accounts</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>Link your Facebook Page or Instagram to run click-to-WhatsApp ads and keep one inbox.</span>
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "6px", background: "var(--crm-messenger)", color: "#fff", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>f</span>
                                  <span style={{ flex: "1", fontSize: "13px" }}><b style={{ fontWeight: "650" }}>Facebook</b> · {v.waFb}</span>
                                </span>
                                <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                  <span style={{ flex: "0 0 26px", width: "26px", height: "26px", borderRadius: "6px", background: "var(--crm-brand-instagram)", color: "#fff", fontSize: "10px", fontWeight: "700", display: "grid", placeItems: "center" }}>IG</span>
                                  <span style={{ flex: "1", fontSize: "13px" }}>
                                    <b style={{ fontWeight: "650" }}>Instagram</b>
                                    {!!(v.waIgHas) && (<> · {v.waIg}</>)}
                                  </span>
                                  {!!(v.waIgNone) && (<>
                                    <button type="button" onClick={v.waIgLink} style={{ height: "32px", padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>Link Instagram</button>
                                  </>)}
                                </span>
                              </div>
                            </div>
                            <div style={{ position: "sticky", top: "0", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "14px", background: "var(--crm-field)" }}>
                              <div style={{ display: "flex", flexDirection: "column", borderRadius: "12px", background: "#fff", overflow: "hidden" }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", padding: "18px 14px 14px" }}>
                                  <span style={{ width: "72px", height: "72px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "22px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.waIni}</span>
                                  <strong style={{ fontSize: "15px", textAlign: "center" }}>{v.wn.disp}</strong>
                                  <span style={{ fontSize: "12.5px", color: "var(--crm-ink)" }}>{v.wn.name}</span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderTop: "6px solid var(--crm-field)", fontSize: "12.5px", color: "var(--crm-muted)" }}>
                                  <span>🏷 {v.wn.cat}</span>
                                  {(v.waF).map((f, f_i) => (<Fragment key={f_i}>
                                    <span style={{ lineHeight: "1.4", overflowWrap: "anywhere" }}>{f.val}</span>
                                  </Fragment>))}
                                </div>
                              </div>
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)", textAlign: "center" }}>It may look a little different on each phone</span>
                            </div>
                          </div>
                        </>)}
                        {!!(v.waIns) && (<>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px", padding: "18px 20px" }}>
                            {(v.waStats).map((k, k_i) => (<Fragment key={k_i}>
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px 16px", border: "1px solid var(--crm-rule)", borderRadius: "12px" }}>
                                <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{k.k}</span>
                                <span style={{ fontSize: "20px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{k.v}</span>
                              </div>
                            </Fragment>))}
                          </div>
                        </>)}
                        {!!(v.waAuto) && (<>
                          <div style={{ display: "flex", flexDirection: "column", padding: "8px 20px 18px" }}>
                            {(v.waAutoRows).map((x, x_i) => (<Fragment key={x_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid var(--crm-field)" }}>
                                <span style={{ flex: "1" }}>
                                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{x.t}</strong>
                                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>{x.sub}</span>
                                  </span>
                                </span>
                                <button type="button" onClick={x.toggle} style={{ position: "relative", flex: "0 0 38px", width: "38px", height: "22px", padding: "0", border: "0", borderRadius: "11px", background: x.trk, cursor: "pointer" }}>
                                  <span style={{ position: "absolute", top: "2px", left: x.knob, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,.2)" }}>
                                  </span>
                                </button>
                              </div>
                            </Fragment>))}
                            <span style={{ paddingTop: "12px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Texts for these are set in Profile › Auto-reply in the app.</span>
                          </div>
                        </>)}
                        {!!(v.waLinks) && (<>
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "18px 20px", maxWidth: "560px" }}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                              <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>Message link</strong>
                              <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>Opens a chat with this number. Put it on your website or posts.</span>
                            </span>
                            <span style={{ display: "flex", gap: "8px" }}>
                              <input type="text" readOnly={true} value={v.waLink} style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0", fontFamily: "ui-monospace, monospace" }} />
                              <button type="button" onClick={v.waCopy} style={{ padding: "0 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap", height: "38px" }}>Copy</button>
                            </span>
                            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", fontWeight: "650" }}>Pre-filled message</span>
                              <textarea value={v.waLinkMsg} onChange={v.setWaLinkMsg} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "76px", resize: "vertical" }}>
                              </textarea>
                            </label>
                          </div>
                        </>)}
                        {!!(v.waCalls) && (<>
                          <div style={{ display: "flex", flexDirection: "column", padding: "8px 20px 18px" }}>
                            {(v.waCallRows).map((x, x_i) => (<Fragment key={x_i}>
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 0", borderBottom: "1px solid var(--crm-field)" }}>
                                <span style={{ flex: "1" }}>
                                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{x.t}</strong>
                                    <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", textWrap: "pretty" }}>{x.sub}</span>
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
                              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--crm-field)", fontSize: "13px" }}>
                                <strong style={{ flex: "1", fontWeight: "650" }}>{c.n}</strong>
                                <span style={{ color: c.c }}>{c.t}</span>
                                <span style={{ width: "140px", textAlign: "right", color: "var(--crm-muted)" }}>{c.at}</span>
                              </div>
                            </Fragment>))}
                          </div>
                        </>)}
                      </div>
                    </div>
                  </>)}
                  {!!(v.chTpl) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 18px", borderBottom: "1px solid var(--crm-rule)" }}>
                        <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650" }}>WhatsApp message templates</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Needed to message someone after the 24 h reply window. Meta reviews each one.</span>
                        </span>
                        <button type="button" onClick={v.chNewToggle} style={{ height: "36px", padding: "0 16px", borderRadius: "18px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>New template</button>
                      </div>
                      {!!(v.chNewOpen) && (<>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: "14px", padding: "16px 18px", background: "var(--crm-cream-nav)", borderBottom: "1px solid var(--crm-rule)" }}>
                          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Name</span>
                            <input type="text" value={v.chNewF.name} onChange={v.chNewF.setName} placeholder="e.g. visit_follow_up" style={{ height: "38px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none", width: "100%", minWidth: "0" }} />
                          </label>
                          <div style={{ display: "flex", gap: "14px" }}>
                            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Category</span>
                              <span style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                                {(v.chNewF.cats).map((o, o_i) => (<Fragment key={o_i}>
                                  <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 12px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{o.c}</button>
                                </Fragment>))}
                              </span>
                            </span>
                            <span style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                              <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Language</span>
                              <span style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                                {(v.chNewF.langs).map((o, o_i) => (<Fragment key={o_i}>
                                  <button type="button" onClick={o.pick} style={{ border: "0", height: "30px", padding: "0 10px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap" }}>{o.c}</button>
                                </Fragment>))}
                              </span>
                            </span>
                          </div>
                          <label style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "6px" }}>
                            <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.chTplHint}</span>
                            <textarea value={v.chNewF.body} onChange={v.chNewF.setBody} placeholder={v.chTplPh} style={{ boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", lineHeight: "1.45", color: "var(--crm-ink)", outline: "none", width: "100%", minHeight: "84px", resize: "vertical" }}>
                            </textarea>
                          </label>
                          <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                            <button type="button" onClick={v.chNewToggle} style={{ height: "36px", padding: "0 16px", borderRadius: "18px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                            <button type="button" onClick={v.chNewF.submit} style={{ height: "36px", padding: "0 18px", borderRadius: "18px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Send for review</button>
                          </div>
                        </div>
                      </>)}
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 110px 130px 120px 80px", gap: "12px", padding: "10px 18px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", borderBottom: "1px solid var(--crm-field)" }}>
                        <span>NAME</span>
                        <span>CATEGORY</span>
                        <span>LANGUAGE</span>
                        <span>STATUS</span>
                        <span>UPDATED</span>
                      </div>
                      {(v.chTpls).map((t, t_i) => (<Fragment key={t_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) 110px 130px 120px 80px", gap: "12px", alignItems: "center", padding: "11px 18px", borderTop: "1px solid var(--crm-field)", fontSize: "13px" }}>
                          <span style={{ fontWeight: "600", fontFamily: "ui-monospace, monospace", fontSize: "12.5px" }}>{t.n}</span>
                          <span>{t.c}</span>
                          <span>{t.l}</span>
                          <span>
                            <span style={{ height: "24px", display: "inline-flex", alignItems: "center", padding: "0 10px", borderRadius: "12px", background: t.bg, color: t.fg, fontSize: "12px", fontWeight: "650" }}>{t.stt}</span>
                          </span>
                          <span style={{ color: "var(--crm-muted)" }}>{t.at}</span>
                        </div>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.chAds) && (<>
                    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 110px 70px 120px 150px", gap: "12px", padding: "10px 18px", fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", borderBottom: "1px solid var(--crm-field)" }}>
                        <span>AD</span>
                        <span>SPEND · {v.chMonth}</span>
                        <span>LEADS</span>
                        <span>DAILY BUDGET</span>
                        <span>STATUS</span>
                      </div>
                      {(v.chAdsRows).map((a, a_i) => (<Fragment key={a_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) 110px 70px 120px 150px", gap: "12px", alignItems: "center", padding: "10px 18px", borderTop: "1px solid var(--crm-field)", fontSize: "13px" }}>
                          <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                            <strong style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</strong>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{a.ch}</span>
                          </span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.spend}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums" }}>{a.leads}</span>
                          <span style={{ display: "flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 10px", boxSizing: "border-box", border: "1px solid var(--crm-rule)", borderRadius: "8px" }}>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>RM</span>
                            <input type="text" inputMode="numeric" value={a.budget} onChange={a.setBudget} style={{ width: "100%", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", outline: "none", fontVariantNumeric: "tabular-nums" }} />
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
                    <div onClick={v.chDlgClose} style={{ position: "absolute", inset: "0", zIndex: "20", background: "rgba(42,22,12,.32)" }}>
                    </div>
                    <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: "21", width: "440px", maxWidth: "calc(100% - 40px)", display: "flex", flexDirection: "column", gap: "14px", padding: "22px", boxSizing: "border-box", borderRadius: "18px", background: "#fff", boxShadow: "0 20px 50px rgba(42,22,12,.25)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <strong style={{ flex: "1", fontSize: "17px", fontWeight: "650" }}>{v.chDlg.title}</strong>
                        <button type="button" onClick={v.chDlgClose} title="Close" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink)", cursor: "pointer" }}>×</button>
                      </div>
                      {!!(v.chDlg.isUnlink) && (<>
                        <span style={{ fontSize: "13.5px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>{v.chDlg.body}</span>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                          <button type="button" onClick={v.chDlgClose} style={{ height: "38px", padding: "0 16px", borderRadius: "19px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "38px", padding: "0 18px", borderRadius: "19px", border: "0", background: "var(--crm-oxblood)", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Unlink</button>
                        </div>
                      </>)}
                      {!!(v.chDlg.isLink1) && (<>
                        <span style={{ fontSize: "13.5px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>Sign in with the Facebook account that manages it. Meta asks which ones the CRM may use.</span>
                        <button type="button" onClick={v.chDlg.next} style={{ height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-messenger)", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Continue with Facebook</button>
                      </>)}
                      {!!(v.chDlg.isLink2) && (<>
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                          {(v.chDlg.cands).map((c, c_i) => (<Fragment key={c_i}>
                            <button type="button" onClick={c.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: `1px solid ${c.bd}`, borderRadius: "12px", background: c.bg, font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }}>
                              <span style={{ flex: "0 0 18px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "5px", border: `1.5px solid ${c.bd}`, display: "grid", placeItems: "center" }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={c.chk} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m5 12 5 5 9-10">
                                  </path>
                                </svg>
                              </span>
                              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                                <strong style={{ fontSize: "13.5px", fontWeight: "650" }}>{c.n}</strong>
                                <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{c.sub}</span>
                              </span>
                            </button>
                          </Fragment>))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
                          <button type="button" onClick={v.chDlgClose} style={{ height: "38px", padding: "0 16px", borderRadius: "19px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "38px", padding: "0 18px", borderRadius: "19px", border: "0", background: v.chDlg.linkBg, font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Link</button>
                        </div>
                      </>)}
                      {!!(v.chDlg.isWa1) && (<>
                        <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>Phone number</span>
                          <input type="tel" value={v.chDlg.num} onChange={v.chDlg.setNum} placeholder="+60 12-345 6789" style={{ height: "40px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none" }} />
                        </label>
                        <span style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Send code by<span style={{ display: "flex", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
                            {(v.chDlg.vias).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 12px", borderRadius: "8px", background: o.bg, color: o.fg, boxShadow: o.sh, font: "inherit", fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{o.v}</button>
                            </Fragment>))}
                          </span></span>
                        <span style={{ fontSize: "12px", color: "var(--crm-faint)", textWrap: "pretty" }}>The number can't be in use on the WhatsApp app at the same time.</span>
                        <button type="button" onClick={v.chDlg.next} style={{ height: "42px", borderRadius: "21px", border: "0", background: v.chDlg.nextBg, font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Send code</button>
                      </>)}
                      {!!(v.chDlg.isWa2) && (<>
                        <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{v.chDlg.sentTo}</span>
                        <input type="text" inputMode="numeric" value={v.chDlg.code} onChange={v.chDlg.setCode} placeholder="••••••" style={{ height: "48px", boxSizing: "border-box", padding: "0 14px", border: "1px solid var(--crm-line)", borderRadius: "12px", font: "inherit", fontSize: "22px", letterSpacing: ".4em", textAlign: "center", color: "var(--crm-ink)", outline: "none", fontVariantNumeric: "tabular-nums" }} />
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <button type="button" onClick={v.chDlg.resend} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Send again</button>
                          <span style={{ flex: "1" }}>
                          </span>
                          <button type="button" onClick={v.chDlg.confirm} style={{ height: "40px", padding: "0 20px", borderRadius: "20px", border: "0", background: v.chDlg.nextBg, font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Verify and add</button>
                        </div>
                      </>)}
                    </div>
                  </>)}
                </div>
              </>)}
              {!!(v.kPeople) && (<DeskContacts4a v={v} pager={<DeskPager v={v.ppPager} />} />)}
              {!!(v.kAudit) && (<DeskAudit4a v={v} />)} {!!(v.kAdsPerf) && (<>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apStToggle} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }} className="crm4a-outline"><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.apStCur.dot }}></span>{v.apStCur.label}<span style={{ color: "var(--crm-faint)" }}>{v.apStCur.n}</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    {!!(v.apStOpen) && (<><div onClick={v.apStToggle} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}></div><div style={{ position: "absolute", top: "42px", zIndex: "8", minWidth: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", left: "0" }}>{(v.apStOpts).map((o, o_i) => (<button key={o_i} type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", border: "0", borderRadius: "7px", background: o.bg, font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: o.dot }}></span><span style={{ flex: "1" }}>{o.label}</span><span style={{ color: "var(--crm-faint)" }}>{o.n}</span></button>))}</div></>)}
                  </span>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.dpOpen} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }} className="crm4a-outline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"></path></svg>{v.apRangeLabel}{!!(v.apCmpOn) && (<span style={{ color: "var(--crm-rust)" }}>{v.apCmpLabel}</span>)}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    {!!(v.dp.open) && (<>
                      <div onClick={v.dpCancel} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                      </div>
                      <div style={{ position: "absolute", top: "44px", left: "0", zIndex: "8", width: "660px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "20px", boxShadow: "0 16px 40px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ display: "flex", minHeight: "0" }}>
                          <div style={{ flex: "0 0 230px", display: "flex", flexDirection: "column", borderRight: "1px solid var(--crm-field)", padding: "8px" }}>
                            {(v.dp.presets).map((o, o_i) => (<Fragment key={o_i}>
                              <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", height: "38px", padding: "0 12px", border: "0", borderRadius: "10px", background: o.bg, font: "inherit", fontSize: "14px", fontWeight: o.w, color: o.fg, cursor: "pointer", textAlign: "left" }} className={DH.h8}>{o.label}</button>
                            </Fragment>))}
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "12px 8px 4px", borderTop: "1px solid var(--crm-field)", fontSize: "13.5px", color: "var(--crm-ink)" }}><input type="number" min="1" max="365" value={v.dp.days} onChange={v.dpSetDays} style={{ width: "54px", height: "36px", padding: "0 8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "9px", font: "inherit", fontSize: "14px", fontWeight: "650", textAlign: "center", color: "var(--crm-ink)" }} />days up to today</div>
                            <button type="button" onClick={v.dpToggleCmp} style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "8px", padding: "12px 8px 4px", border: "0", borderTop: "1px solid var(--crm-field)", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left" }}>
                              <span style={{ flex: "1" }}>Compare</span>
                              <span style={{ width: "40px", height: "24px", borderRadius: "12px", background: v.dp.cmpTrack, position: "relative", display: "block" }}>
                                <span style={{ position: "absolute", top: "3px", left: `${v.dp.cmpKnob}px`, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
                                </span>
                              </span>
                            </button>
                            {!!(v.dp.cmp) && (<>
                              <span style={{ padding: "6px 8px 4px", fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.dp.cmpHint}</span>
                            </>)}
                          </div>
                          <div style={{ flex: "1", minWidth: "0", padding: "16px 18px", display: "flex", flexDirection: "column", gap: "14px" }}>
                            <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-rust)" }}>START</span>
                                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.fromV} onChange={v.dp.fromIn} onFocus={v.dp.fromFocus} onBlur={v.dp.fromBlur} onKeyDown={v.dp.fromKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.fromBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.fromErr}` }} />
                              </div>
                              <span style={{ paddingBottom: "10px", color: "var(--crm-muted)" }}>–</span>
                              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-rust)" }}>END</span>
                                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.toV} onChange={v.dp.toIn} onFocus={v.dp.toFocus} onBlur={v.dp.toBlur} onKeyDown={v.dp.toKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.toBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.toErr}` }} />
                              </div>
                            </div>
                            {!!(v.dp.cmp) && (<>
                              <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-ink-soft)" }}>COMPARE START</span>
                                  <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.cfV} onChange={v.dp.cfIn} onFocus={v.dp.cfFocus} onBlur={v.dp.cfBlur} onKeyDown={v.dp.cfKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.cfBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.cfErr}` }} />
                                </div>
                                <span style={{ paddingBottom: "10px", color: "var(--crm-muted)" }}>–</span>
                                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-ink-soft)" }}>COMPARE END</span>
                                  <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" value={v.dp.ctV} onChange={v.dp.ctIn} onFocus={v.dp.ctFocus} onBlur={v.dp.ctBlur} onKeyDown={v.dp.ctKey} style={{ width: "100%", height: "38px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${v.dp.ctBd}`, borderRadius: "10px", outline: "none", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", cursor: "text", boxShadow: `0 0 0 2px ${v.dp.ctErr}` }} />
                                </div>
                              </div>
                              <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{v.dp.tgtHint}</span>
                            </>)}
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                              <button type="button" onClick={v.dpPrev} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m15 6-6 6 6 6">
                                  </path>
                                </svg>
                              </button>
                              <strong style={{ flex: "1", textAlign: "center", fontSize: "15px", fontWeight: "700" }}>{v.dp.monthLabel}</strong>
                              <button type="button" onClick={v.dpNext} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="m9 6 6 6-6 6">
                                  </path>
                                </svg>
                              </button>
                            </div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px" }}>
                              {(v.dow).map((d, d_i) => (<Fragment key={d_i}>
                                <span style={{ height: "26px", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", color: "var(--crm-muted)" }}>{d.l}</span>
                              </Fragment>))}
                              {(v.dp.cells).map((c, c_i) => (<Fragment key={c_i}>
                                <button type="button" onClick={c.pick} disabled={c.off} style={{ height: "38px", border: "0", padding: "0", background: c.band, borderRadius: c.br, font: "inherit", cursor: "pointer", display: "grid", placeItems: "center" }}>
                                  <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: c.dotBg, color: c.fg, border: c.ring, boxSizing: "border-box", fontSize: "13.5px", fontWeight: c.w, display: "grid", placeItems: "center", fontVariantNumeric: "tabular-nums" }}>{c.num}</span>
                                </button>
                              </Fragment>))}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", padding: "12px 18px", borderTop: "1px solid var(--crm-field)" }}>
                          <button type="button" onClick={v.dpCancel} style={{ height: "40px", padding: "0 20px", borderRadius: "20px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>
                          <button type="button" onClick={v.dpApply} style={{ height: "40px", padding: "0 24px", borderRadius: "20px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "14px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Apply</button>
                        </div>
                      </div>
                    </>)}
                  </span>
                  <span style={{ flex: "1" }}></span>
                  <span style={{ position: "relative" }}>
                    <button type="button" onClick={v.apToggleDl} style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }} className="crm4a-outline"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"></path></svg>Export<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg></button>
                    {!!(v.apDlOpen) && (<><div onClick={v.apToggleDl} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}></div><div style={{ position: "absolute", top: "42px", zIndex: "8", minWidth: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", right: "0" }}>{(v.apDl).map((o, o_i) => (<button key={o_i} type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", border: "0", borderRadius: "7px", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", cursor: "pointer", textAlign: "left" }} className="crm4a-row"><span style={{ minWidth: "30px", height: "18px", padding: "0 5px", borderRadius: "4px", background: o.bg, color: o.fg, font: "600 10px Inter, sans-serif", display: "grid", placeItems: "center" }}>{o.tag}</span>{o.label}</button>))}</div></>)}
                  </span>
                </div>
                <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "8px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink-soft)" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4M12 8h.01"></path></svg>Ad names come from Ads Manager. Spend and cost per lead are not read from Meta yet.</div>
                {!!(v.apCmpOn) && (<>
                  <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "18px", fontSize: "13px", fontWeight: "650" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                      </span>{v.apMainShort}</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "7px", color: "var(--crm-ink-soft)" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: "var(--crm-ink-soft)" }}>
                      </span>{v.apCmpShort}</span>
                    <span style={{ color: "var(--crm-muted)", fontWeight: "500" }}>▲▼ change from blue to orange</span>
                  </div>
                </>)}
                <DeskAdsTable4a v={v} />
              </>)}
              {!!(v.kCal) && (<DeskCalendar4a v={v} />)}
            </div>
          </>)}
          {!!(v.showScrim) && (<>
            <div onClick={v.closePane} style={{ position: "absolute", inset: "0", background: "rgba(42,22,12,.18)", cursor: "pointer" }}>
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
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--crm-faint-2)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d={v.emptyIcon}>
                      </path>
                    </svg>
                    <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--crm-muted)" }}>{v.emptyText}</span>
                    <span style={{ fontSize: "12.5px", color: "var(--crm-faint)" }}>{v.emptyHint}</span>
                  </div>
                </div>
              </>)}
              {!!(v.paneFull) && (<>
                <div style={{ flex: "0 0 62px", height: "62px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "12px", padding: "0 22px", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
                  {!!(v.ph.avatar) && (<>
                    <span style={{ flex: "0 0 auto", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", font: "500 12px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", background: v.ph.avBg ?? "var(--crm-cream)", color: v.ph.avFg ?? "var(--crm-ink)" }}>{v.ph.avatar}</span>
                  </>)}
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ font: "500 15px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.title}</strong>
                    <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ph.sub}</span>
                  </span>
                  {!!(v.ph.status) && (<span style={{ flex: "0 0 auto", font: "600 12px Inter, sans-serif", color: v.ph.statusColor, whiteSpace: "nowrap" }}>{v.ph.status}</span>)}
                  {!!(v.ph.menu) && (<>
                    <span style={{ position: "relative", flex: "0 0 auto" }}>
                      <button type="button" onClick={v.toggleMenu} title="More" style={{ width: "34px", height: "34px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: v.menuBtnBg, display: "grid", placeItems: "center", boxSizing: "border-box", cursor: "pointer" }} className={DH.h8}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--crm-ink)">
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
                        <div style={{ position: "absolute", top: "40px", right: "0", zIndex: "8", width: "240px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", boxShadow: "0 10px 28px rgba(42,22,12,.16)", display: "flex", flexDirection: "column" }}>
                          {(v.chatMenuItems).map((o, o_i) => (<Fragment key={o_i}>
                            {!!(o.sep) && (<>
                              <span style={{ height: "1px", margin: "4px 10px", background: "var(--crm-field)" }}>
                              </span>
                            </>)}
                            <button type="button" onClick={o.run} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "42px", padding: "4px 12px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "14px", fontWeight: "550", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={o.c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 20px" }}>
                                <path d={o.d}>
                                </path>
                              </svg>
                              <span style={{ flex: "1", display: "flex", flexDirection: "column", gap: "1px" }}>{o.label}{!!(o.sub) && (<>
                                  <span style={{ fontSize: "12px", fontWeight: "500", color: "var(--crm-muted)" }}>{o.sub}</span>
                                </>)}</span>
                            </button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </span>
                  </>)}
                  {!!(!v.ibCols || !v.kChat) && (<button type="button" onClick={v.closePane} title="Close (Esc)" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", cursor: "pointer", color: "var(--crm-ink)" }} className={DH.h8}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6 6 18M6 6l12 12">
                      </path>
                    </svg>
                  </button>)}
                </div>
                {!!(v.kChat) && (<>
                  {!!(v.chatFromList) && (<>
                    <button type="button" onClick={v.backToStatus} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.backStatusLabel}</button>
                  </>)}
                  {!!(v.chatFromTeam) && (<>
                    <button type="button" onClick={v.backToPerson} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.backPersonLabel}</button>
                  </>)}
                  <p style={{ flex: "0 0 auto", margin: "0", padding: "8px 20px", fontSize: "12px", color: "var(--crm-muted)", background: "#fff" }}>{v.chatOwner}</p>
                  <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px", padding: "20px 24px 104px", backgroundColor: "var(--crm-cream)" }}>
                    {!!(v.firstDay) && (<><span style={{ alignSelf: "center", padding: "0 0 6px", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{v.firstDay}</span></>)}{!!(v.pinShown) && (<>
                      <div style={{ position: "sticky", top: "-10px", zIndex: "3", margin: "-10px -20px 0", display: "flex", alignItems: "center", gap: "10px", padding: "8px 20px", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z">
                          </path>
                        </svg>
                        <span style={{ flex: "1", minWidth: "0", fontSize: "12.5px", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.pinText}</span>
                        <button type="button" onClick={v.unpinMsg} style={{ border: "0", background: "transparent", padding: "0", font: "inherit", fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Unpin</button>
                      </div>
                    </>)}{(v.sysLines).map((x, x_i) => (<Fragment key={x_i}>
                      <span style={{ alignSelf: "center", maxWidth: "86%", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "var(--crm-ink-soft)", fontSize: "12px", fontWeight: "600", textAlign: "center" }}>{x.text} · {x.at}</span>
                    </Fragment>))}
                    {(v.msgs).map((m, m_i) => (<Fragment key={m.key}>{!!(m.day) && (<><span style={{ alignSelf: "center", padding: "0 0 6px", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{m.day}</span></>)}{!!(m.sys) && (<><span style={{ alignSelf: "center", maxWidth: "86%", padding: "6px 12px", borderRadius: "10px", background: "rgba(107,100,90,.12)", color: "var(--crm-ink-soft)", fontSize: "12px", fontWeight: "600", textAlign: "center" }}>{m.sys}</span></>)}{!!(m.inn) && (<>
                        <div onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ position: "relative", alignSelf: "flex-start", maxWidth: "80%", marginBottom: m.rxGap }}>
                          <div data-msg={m.id} style={{ display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: "14px 14px 14px 4px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}>
                            {!!(m.quote) && (<span style={{ display: "flex", flexDirection: "column", gap: "1px", margin: m.quoteMargin, padding: "6px 10px", borderRadius: "10px", borderLeft: "3px solid var(--crm-rust)", background: "rgba(42,22,12,.06)" }}><strong style={{ fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.quote.text}</span></span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(42,22,12,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "var(--crm-page)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "var(--crm-ink)", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.docType}</small></span></span>)}{!!(m.text) && (<p style={{ display: m.pShow, padding: m.inPad, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>)}
                            <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: "var(--crm-muted)" }}>{!!(m.starred) && (<>
                                <span style={{ color: "var(--crm-brown)", fontSize: "12px" }}>★</span>
                              </>)}{m.time}</span>
                          </div>
                          {!!(m.hasReaction) && (<>
                            <span style={{ position: "absolute", bottom: "-14px", left: "10px", minWidth: "26px", height: "24px", padding: "0 5px", boxSizing: "border-box", borderRadius: "12px", background: "#fff", border: "1px solid var(--crm-rule)", fontSize: "14px", display: "grid", placeItems: "center" }}>{m.reaction}</span>
                          </>)}
                          {!!(m.hover) && (<>
                            <button type="button" onClick={m.menuToggle} title="Message options" style={{ position: "absolute", top: "4px", right: "-34px", width: "28px", height: "28px", border: "1px solid var(--crm-rule)", borderRadius: "50%", background: "#fff", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(42,22,12,.12)" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg>
                            </button>
                          </>)}
                          {!!(m.menuOpen) && (<>
                            <div onClick={m.menuClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                            </div>
                            <div style={{ position: "absolute", top: "36px", left: "0", zIndex: "8", width: "230px", padding: "6px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", boxShadow: "0 10px 28px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 4px 8px", borderBottom: "1px solid var(--crm-field)", marginBottom: "4px" }}>
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
                          <div data-msg={m.id} style={{ display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: "14px 14px 4px 14px", border: `1px solid ${m.outBg ?? "var(--crm-tint-attention)"}`, background: m.outBg ?? "var(--crm-tint-attention)", color: m.outFg ?? "var(--crm-ink)" }}>
                            {!!(m.quote) && (<span style={{ display: "flex", flexDirection: "column", gap: "1px", margin: m.quoteMargin, padding: "6px 10px", borderRadius: "10px", borderLeft: m.outBg ? "3px solid #fff" : "3px solid var(--crm-rust)", background: m.outBg ? "rgba(255,255,255,.18)" : "rgba(42,22,12,.06)" }}><strong style={{ fontSize: "12px", fontWeight: "650", color: m.outBg ? "#fff" : "var(--crm-rust)" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", color: m.outBg ? "rgba(255,255,255,.9)" : "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.quote.text}</span></span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(42,22,12,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "var(--crm-page)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "var(--crm-ink)", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.docType}</small></span></span>)}{!!(m.text) && (<p style={{ display: m.pShow, padding: m.inPad, margin: "0", whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>)}
                            <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "11px", color: m.outTime ?? "var(--crm-muted)" }}>{!!(m.starred) && (<>
                                <span style={{ color: "var(--crm-brown)", fontSize: "12px" }}>★</span>
                              </>)}{m.time}{!!(m.hasTick) && (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={m.tick} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5">
                                </path>
                              </svg>)}{!!(m.failed) && (<span style={{ color: "var(--crm-oxblood)", fontWeight: "600" }}>Not sent</span>)}</span>
                          </div>
                          {!!(m.hasReaction) && (<>
                            <span style={{ position: "absolute", bottom: "-14px", right: "10px", minWidth: "26px", height: "24px", padding: "0 5px", boxSizing: "border-box", borderRadius: "12px", background: "#fff", border: "1px solid var(--crm-rule)", fontSize: "14px", display: "grid", placeItems: "center" }}>{m.reaction}</span>
                          </>)}
                          {!!(m.hover) && (<>
                            <button type="button" onClick={m.menuToggle} title="Message options" style={{ position: "absolute", top: "4px", left: "-34px", width: "28px", height: "28px", border: "1px solid var(--crm-rule)", borderRadius: "50%", background: "#fff", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 2px 6px rgba(42,22,12,.12)" }}>
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6">
                                </path>
                              </svg>
                            </button>
                          </>)}
                          {!!(m.menuOpen) && (<>
                            <div onClick={m.menuClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                            </div>
                            <div style={{ position: "absolute", top: "36px", right: "0", zIndex: "8", width: "230px", padding: "6px", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "16px", boxShadow: "0 10px 28px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 4px 8px", borderBottom: "1px solid var(--crm-field)", marginBottom: "4px" }}>
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
                      <div data-msg={m.id} onClick={m.appt.go} style={{ cursor: "pointer", alignSelf: "flex-end", maxWidth: "78%", padding: "10px 14px 8px", boxSizing: "border-box", borderRadius: "14px 14px 4px 14px", background: "var(--crm-rust)", border: "1px solid var(--crm-rust)", color: "#fff", display: "flex", flexDirection: "column", gap: "4px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "2px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--crm-rust-meta)" }}>Showroom visit · {m.appt.kind}</div>
                          <div style={{ font: "500 16px var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontVariantNumeric: "tabular-nums", textDecoration: m.appt.deco }}>{m.appt.dow} {m.appt.day} {m.appt.mon} · {m.appt.time}</div>
                          <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-delta-good)" }}>{m.appt.place}</div>
                        </div>
                        <span style={{ alignSelf: "flex-end", display: "flex", alignItems: "center", gap: "4px", font: "400 11px Inter, sans-serif", color: "var(--crm-rust-meta)" }}>{m.appt.sent}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={m.tick} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12.5 6.5 17 15 7.5M10 15.5l1.5 1.5L20 7.5"></path></svg></span>
                      </div>
                    </>)}</Fragment>))}<span data-chat-end="1" style={{ display: "none" }}></span>
                  </div>
                  {!!(v.replyOn) && (<>
                    <div style={{ position: "absolute", left: "24px", right: "24px", bottom: "82px", zIndex: "3", display: "flex", alignItems: "center", gap: "10px", padding: "8px 12px", background: "#fff", border: "1px solid var(--crm-line)", borderRadius: "12px", boxShadow: "0 6px 20px rgba(42,22,12,.08)" }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px", paddingLeft: "10px", borderLeft: "3px solid var(--crm-rust)" }}>
                        <strong style={{ fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)" }}>{v.replyWho}</strong>
                        <span style={{ fontSize: "13px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.replyText}</span>
                      </span>
                      <button type="button" onClick={v.cancelReply} title="Cancel reply" style={{ width: "32px", height: "32px", border: "0", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12">
                          </path>
                        </svg>
                      </button>
                    </div>
                  </>)}
                  <div style={{ position: "absolute", left: "24px", right: "24px", bottom: "22px", zIndex: "3", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ flex: "1", minWidth: "0", height: "50px", borderRadius: "25px", display: "flex", alignItems: "center", gap: "16px", padding: "0 18px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-line)", boxShadow: "0 6px 20px rgba(42,22,12,.08)", color: "var(--crm-muted)" }}>
                      <span title="Emoji" onClick={v.emojiToggle} style={{ position: "relative", flex: "0 0 auto", display: "grid", placeItems: "center", color: v.emojiFg, cursor: "pointer" }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M8 14s1.5 2 4 2 4-2 4-2"></path><line x1="9" x2="9.01" y1="9" y2="9"></line><line x1="15" x2="15.01" y1="9" y2="9"></line></svg>{!!(v.emojiOpen) && (<DeskEmoji v={v.emoji} />)}
                      </span>
                      <input data-draft="1" value={v.draft} onChange={v.setDraft} onKeyDown={v.draftKey} placeholder="Message" aria-label={v.chatReply} style={{ flex: "1", minWidth: "0", font: "400 14px Inter, sans-serif", color: "var(--crm-ink)", border: "0", outline: "none", background: "transparent", padding: "0", margin: "0" }} />
                      <span style={{ position: "relative", flex: "0 0 auto", display: "grid", placeItems: "center" }}>
                        <span title="Attach" onClick={v.attachToggle} style={{ display: "grid", placeItems: "center", cursor: "pointer" }}>
                          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        </span>
                        {!!(v.attachOpen) && (<>
                          <div onClick={v.attachClose} style={{ position: "fixed", inset: "-2000px", zIndex: "7" }}>
                          </div>
                          <div style={{ position: "absolute", bottom: "40px", right: "-40px", zIndex: "8", width: "220px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                            {(v.attachOpts).map((o, o_i) => (<Fragment key={o_i}>
                              {!!(o.sep) && (<span style={{ height: "1px", margin: "4px 10px", background: "var(--crm-rule-soft)" }}></span>)}
                              <button type="button" onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "38px", padding: "0 10px", border: "0", borderRadius: "7px", background: "transparent", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className="crm4a-row"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={o.d}></path></svg>{o.label}</button>
                            </Fragment>))}
                          </div>
                        </>)}
                      </span>
                      <span title="Send a photo" onClick={v.photo} style={{ flex: "0 0 auto", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"></path><circle cx="12" cy="13" r="3"></circle></svg>
                      </span>
                    </div>
                    <span title={v.sendTitle} onClick={v.send} style={{ flex: "0 0 auto", width: "50px", height: "50px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer", boxShadow: "0 6px 20px rgba(42,22,12,.15)" }} className="crm4a-primary">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={v.micD}></path></svg>
                    </span>
                  </div>
                </>)}
                {!!(v.kBook) && (<DeskBook v={v.book} />)}{!!(v.kNote) && (<DeskNote v={v.note} />)}{!!(v.kForm) && (<DeskCustomerForm v={v.cform} />)}{!!(v.kAlerts) && (<DeskAlerts v={v.alertsP} />)}
                {!!(v.kTopMove) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", padding: "48px 28px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center" }}>
                    <span style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", display: "grid", placeItems: "center" }}>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 20h20M4 20 7 8l5 5 5-5 3 12">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ fontSize: "16px", fontWeight: "650" }}>You're the top level</strong>
                    <span style={{ maxWidth: "300px", fontSize: "13.5px", lineHeight: "1.5", color: "var(--crm-muted)", textWrap: "pretty" }}>As Principal there's no one above you, so this chat can't be moved up. You can still invite people from your team into it.</span>
                    <button type="button" onClick={v.shareFromTop} style={{ marginTop: "8px", height: "38px", padding: "0 18px", borderRadius: "19px", border: "1px solid var(--crm-rust)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h11}>Invite your team</button>
                  </div>
                </>)}
                {!!(v.kPick) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {(v.pickGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                        </span>{g.label}</div>
                      {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.sub}</span>
                          </span>
                          <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: `1px solid ${m.bc}`, color: m.bc, fontSize: "12.5px", fontWeight: "650" }}>{m.btn}</span>
                        </button>
                      </Fragment>))}
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kAssign) && (<>
                  <button type="button" onClick={v.backToChat} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>Back to chat</button>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {(v.assignGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "14px 16px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }}>
                        </span>{g.label}</div>
                      {(g.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 36px", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "12px", fontWeight: "650", display: "grid", placeItems: "center" }}>{m.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.sub}</span>
                          </span>
                          <span style={{ height: "30px", lineHeight: "28px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: "1px solid var(--crm-rust)", color: "var(--crm-rust)", fontSize: "12.5px", fontWeight: "650" }}>Send</span>
                        </button>
                      </Fragment>))}
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kTeam) && (<>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", display: "flex", flexDirection: "column" }}>
                    {!!(v.teamPeople) && (<>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 54px 54px 64px", gap: "8px", padding: "10px 16px", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".08em", color: "var(--crm-muted)", borderBottom: "1px solid var(--crm-rule)", background: "#fff" }}>
                        <span>PERSON</span>
                        <span style={{ textAlign: "right" }}>LEADS</span>
                        <span style={{ textAlign: "right" }}>APPT</span>
                        <span style={{ textAlign: "right" }}>SHOW-UP</span>
                      </div>
                      {(v.people).map((m, m_i) => (<Fragment key={m_i}>
                        <button type="button" onClick={m.open} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 54px 54px 64px", gap: "8px", alignItems: "center", padding: "12px 16px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer", fontVariantNumeric: "tabular-nums" }} className={DH.h8}>
                          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "0" }}>
                            <span style={{ flex: "0 0 32px", width: "32px", height: "32px", borderRadius: "50%", background: "var(--crm-field)", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{m.ini}</span>
                            <span style={{ display: "flex", flexDirection: "column", minWidth: "0" }}>
                              <strong style={{ fontSize: "14px", fontWeight: "650" }}>{m.name}</strong>
                              <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{m.chats}</span>
                            </span>
                          </span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.leads}</span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.appt}</span>
                          <span style={{ textAlign: "right", fontSize: "14px" }}>{m.show}</span>
                        </button>
                      </Fragment>))}
                    </>)}
                    {!!(v.personChats) && (<>
                      <button type="button" onClick={v.backToTeam} style={{ display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 6-6 6 6 6">
                          </path>
                        </svg><span>{v.teamName}</span> · all people</button>
                      {(v.pChats).map((c, c_i) => (<Fragment key={c_i}>
                        <button type="button" onClick={c.open} style={{ display: "flex", gap: "12px", padding: "12px 16px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                          <span style={{ flex: "0 0 34px", width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-tint-cold)", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{c.ini}</span>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                              <strong style={{ fontSize: "14px", fontWeight: "650" }}>{c.name}</strong>
                              <span style={{ flex: "1" }}>
                              </span>
                              <small style={{ fontSize: "12px", color: "var(--crm-faint)" }}>{c.time}</small>
                            </span>
                            <span style={{ fontSize: "12.5px", color: "var(--crm-brown)", fontWeight: "600" }}>{c.ad}</span>
                            <span style={{ fontSize: "13px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.msg}</span>
                            <span style={{ alignSelf: "flex-start", marginTop: "3px", height: "20px", lineHeight: "20px", padding: "0 8px", borderRadius: "10px", background: c.stBg, color: c.stFg, fontSize: "11.5px", fontWeight: "700" }}>{c.status}</span>
                          </span>
                        </button>
                      </Fragment>))}
                      {!!(v.pNoChats) && (<>
                        <div style={{ padding: "32px 16px", textAlign: "center", fontSize: "13.5px", color: "var(--crm-muted)" }}>No open chats</div>
                      </>)}
                    </>)}
                  </div>
                </>)}
                {!!(v.kMetrics) && (<>
                  <div style={{ flex: "0 0 auto", padding: "14px 18px", background: "#fff", borderBottom: "1px solid var(--crm-field)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3">
                        </path>
                      </svg>
                      <input type="text" value={v.mq} onChange={v.setMq} placeholder="Search metrics" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", background: "transparent" }} />
                    </span>
                  </div>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", background: "#fff", padding: "6px 10px 12px" }}>
                    <button type="button" onClick={v.mOrdFold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${v.mOrdRot}deg)`, transition: "transform .15s" }}>
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg>
                      <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "var(--crm-ink)" }}>Column order</strong>
                      <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>Drag to reorder</span>
                    </button>
                    {!!(v.mOrdOpen) && (<>
                      <div style={{ display: "flex", flexDirection: "column", margin: "0 8px 8px", border: "1px solid var(--crm-rule)", borderRadius: "12px", padding: "4px" }}>
                        {(v.mOrder).map((o, o_i) => (<Fragment key={o_i}>
                          <div draggable="true" onDragStart={o.dStart} onDragOver={o.dOver} onDrop={o.dDrop} onDragEnd={o.dEnd} style={{ position: "relative", zIndex: o.z, display: "flex", alignItems: "center", gap: "12px", height: "44px", padding: "0 8px 0 10px", borderBottom: `1px solid ${o.bd}`, background: o.bg, boxShadow: o.sh, borderRadius: "6px", cursor: "grab" }} className={DH.h4}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="2.2" strokeLinecap="round">
                              <path d="M5 9h14M5 15h14">
                              </path>
                            </svg>
                            <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{o.label}</span>
                            <button type="button" onClick={o.rm} title="Remove" style={{ width: "30px", height: "30px", border: "0", borderRadius: "50%", background: "transparent", display: "grid", placeItems: "center", cursor: "pointer" }} className={DH.h3}>
                              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-ink-soft)" strokeWidth="1.8" strokeLinecap="round">
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
                      <button type="button" onClick={v.mFoldAll} style={{ height: "28px", padding: "0 8px", border: "0", borderRadius: "8px", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }} className={DH.h8}>{v.mFoldAllLabel}</button>
                    </div>
                    {(v.mGroups).map((g, g_i) => (<Fragment key={g_i}>
                      <button type="button" onClick={g.fold} style={{ width: "100%", display: "flex", alignItems: "center", gap: "8px", marginTop: "6px", padding: "10px 8px", border: "0", borderTop: "1px solid var(--crm-field)", background: "transparent", font: "inherit", textAlign: "left", cursor: "pointer" }} className={DH.h4}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "0 0 auto", transform: `rotate(${g.rot}deg)`, transition: "transform .15s" }}>
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                        <strong style={{ flex: "1", fontSize: "13px", fontWeight: "700", color: "var(--crm-ink)" }}>{g.label}</strong>
                        <span style={{ fontSize: "11.5px", fontWeight: "600", color: "var(--crm-muted)" }}>{g.nSel}</span>
                        <span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>· {g.src}</span>
                      </button>
                      {!!(g.open) && (<>
                        {(g.items).map((m, m_i) => (<Fragment key={m_i}>
                          <button type="button" onClick={m.toggle} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", minHeight: "40px", padding: "4px 8px", border: "0", borderRadius: "9px", background: "transparent", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
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
                              <span style={{ fontSize: "11.5px", color: "var(--crm-muted)" }}>{m.hint}</span>
                            </span>
                          </button>
                        </Fragment>))}
                      </>)}
                    </Fragment>))}
                  </div>
                  <div style={{ flex: "0 0 auto", display: "flex", gap: "10px", padding: "14px 18px", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}>
                    <button type="button" onClick={v.resetMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "15px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Reset</button>
                    <button type="button" onClick={v.saveMetrics} style={{ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}>Save</button>
                  </div>
                  {!!(v.mDirty) && (<>
                    <span style={{ flex: "0 0 auto", padding: "0 18px 12px", fontSize: "12.5px", color: "var(--crm-brown)", textAlign: "center", background: "#fff" }}>Unsaved changes · the table updates when you save</span>
                  </>)}
                </>)}
                {!!(v.kClist) && (<>
                  <div style={{ flex: "0 0 auto", position: "relative", zIndex: "5", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", padding: "10px 18px", borderBottom: "1px solid var(--crm-rule)", background: "var(--crm-cream-nav)" }}>
                    <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{v.clistN}</span>
                    <div style={{ position: "relative" }}>
                      <button type="button" onClick={v.clSortToggle} style={{ height: "32px", padding: "0 10px 0 12px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", color: "var(--crm-ink)", cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }} className={DH.h35}>
                        <span style={{ color: "var(--crm-muted)" }}>Sort by</span>
                        <strong style={{ fontWeight: "650" }}>{v.clSortLabel}</strong>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                      </button>
                      {!!(v.clSortOpen) && (<>
                        <div style={{ position: "absolute", top: "38px", right: "0", width: "180px", padding: "6px", boxSizing: "border-box", background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "12px", boxShadow: "0 10px 30px rgba(42,22,12,.14)", display: "flex", flexDirection: "column" }}>
                          {(v.clSorts).map((o, o_i) => (<Fragment key={o_i}>
                            <button type="button" onClick={o.pick} style={{ height: "36px", padding: "0 10px", border: "0", borderRadius: "8px", background: o.bg, color: o.fg, font: "inherit", fontSize: "13.5px", fontWeight: o.w, textAlign: "left", cursor: "pointer" }} className={DH.h4}>{o.label}</button>
                          </Fragment>))}
                        </div>
                      </>)}
                    </div>
                  </div>
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", background: "#fff", display: "flex", flexDirection: "column" }}>
                    {!!(v.clistEmpty) && (<>
                      <div style={{ padding: "40px 20px", textAlign: "center", fontSize: "14px", color: "var(--crm-muted)" }}>No chats in this status yet</div>
                    </>)}
                    {(v.clistRows).map((c, c_i) => (<Fragment key={c_i}>
                      <button type="button" onClick={c.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 18px", border: "0", borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", color: "var(--crm-ink)", textAlign: "left", cursor: "pointer" }} className={DH.h8}>
                        <span style={{ flex: "0 0 38px", width: "38px", height: "38px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{c.ini}</span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                          <strong style={{ fontSize: "14.5px", fontWeight: "650" }}>{c.name}</strong>
                          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</span>
                        </span>
                        <span style={{ height: "22px", lineHeight: "22px", padding: "0 9px", borderRadius: "11px", background: c.stBg, color: c.stFg, fontSize: "11.5px", fontWeight: "700", whiteSpace: "nowrap" }}>{c.status}</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </button>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.kInfo) && (<>
                  {!!(v.infoBack) && (<>
                    <button type="button" onClick={v.backToList} style={{ flex: "0 0 auto", display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>{v.infoBackLabel}</button>
                  </>)}
                  <div style={{ flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "14px", background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                      <span style={{ flex: "0 0 52px", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "17px", fontWeight: "700", display: "grid", placeItems: "center" }}>{v.ci.ini}</span>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "20px", fontWeight: "700" }}>{v.ci.name}</strong>
                      <span onClick={v.editInfo} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-rule)", color: "var(--crm-rust)", fontSize: "13.5px", fontWeight: "650", cursor: "pointer", whiteSpace: "nowrap"  }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z">
                          </path>
                        </svg>Edit</span>
                    </div>
                    <div style={{ border: "1px solid var(--crm-rule)", borderRadius: "16px", overflow: "hidden" }}>
                      {(v.ci.rows).map((r, r_i) => (<Fragment key={r_i}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "44px", padding: "0 14px", borderTop: r.bt, fontSize: "14px" }}>
                          <span style={{ flex: "0 0 auto", color: "var(--crm-muted)" }}>{r.k}</span>
                          <span style={{ flex: "1", minWidth: "0", textAlign: "right", fontWeight: r.w, color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><InfoValue v={r.v} href={r.href} /></span>
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                  {!!(v.infoChat) && (<>
                    <div style={{ flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}>
                      <button type="button" onClick={v.openInfoChat} style={{ width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "44px", borderRadius: "22px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "15px", fontWeight: "650", color: "#fff", cursor: "pointer" }} className={DH.h26}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                          </path>
                        </svg>Open chat</button>
                    </div>
                  </>)}
                </>)}
                {!!(v.kSection) && (<>
                  <div style={{ flex: "1", minHeight: "0", padding: "20px 24px", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                    <div style={{ background: "#fff", border: "1px solid var(--crm-rule)", borderRadius: "14px", overflow: "hidden" }}>
                      {(v.opRows).map((r, r_i) => (<Fragment key={r_i}>
                        <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 18px", borderBottom: "1px solid var(--crm-field)", background: r.bg, cursor: r.cur }}>
                          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                            <strong style={{ fontSize: "15px", fontWeight: "650" }}>{r.t}</strong>
                            <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{r.s}</span>
                            {!!(r.note) && (<>
                              <span style={{ fontSize: "12.5px", color: "var(--crm-brown)", fontWeight: "600" }}>{r.note}</span>
                            </>)}
                          </span>
                          {!!(r.right) && (<>
                            <span style={{ fontSize: "13.5px", fontWeight: "650", color: r.rc, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.right}</span>
                          </>)}
                          {!!(r.go) && (<>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="m9 6 6 6-6 6">
                              </path>
                            </svg>
                          </>)}
                          {!!(r.btn2) && (<>
                            <button type="button" onClick={r.act2} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }} className={DH.h8}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                                </path>
                              </svg>{r.btn2}</button>
                          </>)}
                          {!!(r.btn) && (<>
                            <button type="button" onClick={r.act} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-rust)", background: r.btnBg, color: "var(--crm-rust)", font: "inherit", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: "pointer" }} className={DH.h11}>{r.btn}</button>
                          </>)}
                        </div>
                      </Fragment>))}
                    </div>
                  </div>
                </>)}
              </>)}
            </aside>
          </>)}{!!(v.railOn) && (<DeskRail4a v={v.rail} extra={v.kPeople ? <DeskContactFigures4a v={v.ppStats} /> : <DeskCalFigures4a v={v} />} />)}
          {!!(v.ibCols) && (<DeskInboxSide4a v={v} value={(x, h) => <InfoValue v={x} href={h} />} />)}
          {!!(v.showToast) && (<>
            <div style={{ position: "absolute", left: "50%", bottom: "24px", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "16px", padding: "11px 14px 11px 18px", borderRadius: "12px", background: "var(--crm-ink)", color: "#fff", fontSize: "13.5px", fontWeight: "550", boxShadow: "0 8px 24px rgba(42,22,12,.28)", whiteSpace: "nowrap", zIndex: "5" }}>{v.toastText}{!!(v.canUndo) && (<>
                <button type="button" onClick={v.undoSend} style={{ border: "0", padding: "0", background: "transparent", font: "inherit", color: "var(--crm-peach)", fontWeight: "700", cursor: "pointer" }}>Undo</button>
              </>)}</div>
          </>)}
        </div>
      </div>
    </div>
  </>);
}
