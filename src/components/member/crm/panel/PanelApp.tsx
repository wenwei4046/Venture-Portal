"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design/rev1011/prototypes/Principal Panel.dc.html (rev 1011) by tools/crm-design/gen-panel-1011.cjs —
// markup and styles exactly as designed. Behaviour lives in ./vm/app.ts (and the vm/*.ts it groups). To change the look,
// change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { PickEditor } from "../shared/pick-editor";
import { InfoValue } from "../shared/AdLink";
import { ChatImg, ChatVideo, MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";
import ChatComposer from "../sales/ChatComposer";
import { Phone4aActive, Phone4aActiveSave, Phone4aAdCard, Phone4aAdjustSheet, Phone4aBar, Phone4aChip, Phone4aHero, Phone4aProfile, Phone4aRoom, Phone4aRoomRemarks, Phone4aSplitTeams, Phone4aStrip, Phone4aTeamHead } from "../shared/phone4a";
import { Ic } from "../shared/icons4a";
import type { PanelAppVM } from "./vm/app";

/** The whole Control panel: the top bar, every tab, every sheet and page, the toast and the bottom bar. */
export default function PanelApp({ v }: { v: PanelAppVM }) {
  return (<>
    {!!(v.topBar) && (<>
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "44px", padding: "4px 14px 0 20px" }}>
        {!!(v.hd.showHead) && (<>
          <span onClick={v.hd.back} style={{ display: "flex", alignItems: "center", gap: "4px", height: "44px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>{v.hd.backLabel}</span>
        </>)}
        <span style={{ flex: "1" }}>
        </span>
        {!!(v.bellTop) && (<>
          <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov5}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
              </path>
            </svg>
            {!!(v.bl.notifUnread) && (<>
              <span style={{ position: "absolute", top: "4px", right: "3px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", border: "2px solid var(--crm-page)", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{v.bl.notifUnread}</span>
            </>)}
          </span>
        </>)}
      </div>
    </>)}
    {!!(v.show.ov) && (<>
      {!!(v.ov.onOverview) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 36px", display: "flex", flexDirection: "column", gap: "22px" }}>
          <Phone4aTeamHead h={v.th} />
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div onClick={v.ov.ovOpenPeriod} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", cursor: "pointer" }}>
                <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5h14v15H5V5Zm3-3v5m8-5v5M5 10h14">
                  </path>
                </svg>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{v.ov.adPerT}</strong>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.adPerD}</span>
                </span>
                <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg><span onClick={e => { e.stopPropagation(); v.ov.cmpPick(); }} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: "500", cursor: "pointer" }}>{v.ov.vsLabel}</span>
              </div>
            </div>
          </div>
          <Phone4aHero items={v.ov.hero4} cols={2} compact />
          {!!(v.ov.cmpOn && v.ov.cmpHas) && (<>
            <section style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700" }}>Comparison</h2>
                {!!(v.ov.cmpHas) && (<>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                    <span onClick={v.ov.cmpOff} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Clear</span>
                    <span onClick={v.ov.cmpToggle} style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>{v.ov.cmpToggleLbl}<svg style={{ transform: `rotate(${v.ov.cmpRot})` }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></span>
                  </span>
                </>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-page)", fontSize: "calc(13px * var(--rv-type, 1))" }}>
                <span onClick={v.ov.ovOpenPeriod} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-ink)", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ov.cmpA}</span>
                  <span style={{ flex: "none", fontWeight: "650", color: "var(--crm-rust)" }}>Change</span>
                </span>
                {!!(v.ov.cmpHas) && (<>
                  <span onClick={v.ov.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-muted)", cursor: "pointer" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-st-won)" }}>
                    </span>
                    <span style={{ flex: "1", minWidth: "0" }}>vs {v.ov.cmpB}</span>
                    <span style={{ flex: "none", fontWeight: "650", color: "var(--crm-rust)" }}>Change</span>
                  </span>
                </>)}
                {!!(v.ov.cmpNone) && (<>
                  <span onClick={v.ov.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-rust)", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>Choose a period to compare</span>
                </>)}
              </div>
              {!!(v.ov.cmpOpen) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  {(v.ov.cmpRows).map((r, r_i) => (<Fragment key={r_i}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
                      <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{r.label}</span>
                      <strong style={{ fontSize: "calc(26px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{r.vA}</strong>
                      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>vs {r.vB}</span>
                        <span style={{ padding: "1px 6px", borderRadius: "6px", background: r.dBg, color: r.dFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", whiteSpace: "nowrap" }}>{r.delta}</span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
            </section>
          </>)}
          <div style={{ flex: "none", display: "flex", alignItems: "baseline", gap: "10px", margin: "4px 0 -14px" }}><h2 style={{ flex: "1", margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(20.65px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.01em" }}>Team performance</h2></div>
          <section style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            
            {(v.ov.teamRows).map((t, t_i) => (<Fragment key={t_i}>
              <div style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule)" }}>
                <div onClick={t.toggle} style={{ display: "flex", flexDirection: "column", gap: "5px", padding: "11px 0", cursor: t.cur }}><span style={{ display: "flex", alignItems: "center", gap: "9px", minWidth: "0" }}><span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: t.c }} /><strong style={{ flex: "none", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{t.name}</strong><span style={{ flex: "1", minWidth: "0" }} />{!!(t.canOpen) && (<span style={{ display: "flex", color: "var(--crm-faint)", transform: `rotate(${t.rot})`, transition: "transform 150ms" }}><Ic name="chevron-right" size={16} /></span>)}</span><span style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", columnGap: "8px", paddingLeft: "17px", fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap" }}><span>Leads <b style={{ fontWeight: "600", color: "var(--crm-ink)" }}>{t.leads}</b></span><span>Appt <b style={{ fontWeight: "600", color: "var(--crm-ink)" }}>{t.appt}</b></span><span>Show <b style={{ fontWeight: "600", color: "var(--crm-ink)" }}>{t.show}</b></span></span></div>
                {!!(t.open) && (<>
                  {(t.people).map((p, p_i) => (<Fragment key={p_i}>
                    <div onClick={p.open} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "center", padding: `10px 0 10px ${p.pad}`, borderTop: "1px dashed var(--crm-rule)", cursor: "pointer" }} className={H.hov3}>
                      <span style={{ minWidth: "0", display: "flex", alignItems: "center", gap: "10px" }}>
                        <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: p.aBg, color: p.aFg, display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650" }}>{p.ini}</span>
                        <span style={{ minWidth: "0", display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                          <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.tag}<b style={{ fontWeight: "650", color: "var(--crm-oxblood)" }}>{p.waiting}</b></small>
                        </span>
                      </span>
                      <span style={{ textAlign: "right", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{p.leads}</span>
                      <span style={{ textAlign: "right", fontSize: "calc(13px * var(--rv-type, 1))", fontVariantNumeric: "tabular-nums" }}>{p.appt}</span>
                      <span style={{ textAlign: "right", fontSize: "calc(13px * var(--rv-type, 1))", fontVariantNumeric: "tabular-nums" }}>{p.show}</span>
                    </div>
                  </Fragment>))}
                </>)}
              </div>
            </Fragment>))}
          </section>
        </main>
        {!!(v.ov.ovrOpen) && (<>
          <div onClick={v.ov.ovrClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.ov.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.ov.ovrClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              {!!(v.ov.ovrShowTabs) && (<>
                <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
                  {(v.ov.ovrTabs).map((t, t_i) => (<Fragment key={t_i}>
                    <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                      </span>{t.label}</span>
                  </Fragment>))}
                </div>
              </>)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.ov.ovrPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "var(--crm-page)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.ov.ovrPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>{v.ov.ovrTitle}</strong>
                  <span onClick={v.ov.ovrNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.ov.ovrWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-faint)" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.ov.ovrCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ov.ovrFromBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.ov.ovrFromLbl}</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ov.ovrFrom}</strong>
                </span>
                <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ov.ovrToBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.ov.ovrToLbl}</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ov.ovrTo}</strong>
                </span>
              </div>
              <span onClick={v.ov.ovrApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.ov.ovrApplyBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.ov.ovrApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.ib) && (<>
      {!!(v.ib.onInbox) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflow: "hidden", scrollbarWidth: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <h1 style={{ margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Inbox</h1>
            </div>
            <span onClick={v.ib.openPc} title="Contacts" aria-label="Contacts" style={{ order: "1", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="contact" size={18} /></span>
            {!!(v.bellIn) && (<>
              {!!(v.tm.on) && (<>
                <span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", cursor: "pointer" }}><Ic name={v.tm.label === "Team" ? "users" : "user-round"} size={18} /></span>
              </>)}
              
              <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="bell" size={18} />{!!(v.bl.notifUnread) && (<span style={{ position: "absolute", top: "8px", right: "9px", width: "8px", height: "8px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid #fff" }} />)}</span>
            </>)}
          </div>
          {!!(v.ib.inbHasChips) && (<>
            <div style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
              {(v.ib.inbChips).map((c, c_i) => (<Fragment key={c_i}>
                <Phone4aChip label={c.label} count={c.n} on={c.on} onClick={c.pick}>{c.dot && c.label !== "All" ? <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.on ? "#fff" : c.dot }} /> : null}</Phone4aChip>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.ib.inbHasWho) && (<>
            <div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -20px 0", padding: "0 20px", userSelect: "none" }}>
              {(v.ib.inbWhoChips).map((c, c_i) => (<Fragment key={c_i}>
                <Phone4aChip label={c.label} count={c.n} on={c.on} onClick={c.pick} />
              </Fragment>))}
            </div>
          </>)}
          <div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "20px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -20px 0", padding: "0 20px", borderBottom: "1px solid var(--crm-rule)", userSelect: "none" }}>
            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}><span onClick={g.jump} style={{ flex: "none", height: "36px", display: "inline-flex", alignItems: "center", gap: "6px", marginBottom: "-1px", borderBottom: g.on ? "2px solid var(--crm-rust)" : "2px solid transparent", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: g.on ? "500" : "400", color: g.on ? "var(--crm-ink)" : "var(--crm-muted)", whiteSpace: "nowrap", cursor: "pointer" }}>{g.title} <span style={{ fontVariantNumeric: "tabular-nums" }}>{g.n}</span></span></Fragment>))}
          </div>
          <div data-inb-board="1" data-drag-scroll="1" style={{ flex: "1 1 0", minHeight: "0", display: "flex", alignItems: "stretch", gap: "12px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", margin: "-14px -20px -14px", padding: "14px 16px 14px", background: "var(--crm-hover)", scrollSnapType: "x mandatory", scrollPadding: "0 20px", userSelect: "none" }}>
            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}>
              <div style={{ flex: "0 0 300px", height: "100%", scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: "10px", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "2px", background: g.c }}>
                  </span>
                  <strong style={{ fontSize: "calc(15.22px * var(--rv-type, 1))", fontWeight: "500", color: g.hot ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{g.title}</strong>
                  <small style={{ flex: "1", fontSize: "calc(15.22px * var(--rv-type, 1))", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{g.n}</small>
                </span>
                {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                  <div onClick={r.open} onClickCapture={r.guard} onPointerDown={r.down} onPointerMove={r.move} onPointerUp={r.up} onPointerCancel={r.cancel} onContextMenu={r.noMenu} style={{ WebkitTouchCallout: "none", userSelect: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "11px 12px", borderRadius: "14px", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", background: r.avBg, color: r.avFg, display: "grid", placeItems: "center", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(12.5px * var(--rv-type, 1))", fontWeight: "500" }}>{r.ini}</span>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(15.22px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                      <small style={{ flex: "none", fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{r.at}</small>{!!(r.unread) && (<span style={{ flex: "none", minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.unread}</span>)}
                    </span>
                    <span style={{ fontSize: "calc(14.13px * var(--rv-type, 1))", lineHeight: "18px", maxHeight: "36px", color: "var(--crm-ink-soft)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", fontSize: "calc(13.04px * var(--rv-type, 1))", lineHeight: "16px" }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", fontWeight: "400", color: r.toAssign ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>
                        <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: r.wc }}>
                        </span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</span>
                      </span>
                      {!!(r.needs) && (<>
                        <span style={{ flex: "none", fontWeight: "400", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>
                      </>)}
                    </span>
                  </div>
                </Fragment>))}
                {!!(g.empty) && (<>
                  <span style={{ padding: "18px 0", textAlign: "center", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>Nothing here</span>
                </>)}
              </div>
            </Fragment>))}
          </div>
        </main>
      </>)}
    </>)}
    {!!(v.show.ld) && (<>
      {!!(v.ld.onLead) && (<>
        <main data-chat-screen="" style={{ position: "relative", flex: "1 1 auto", minHeight: "0", background: v.chromeBg }}>
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid var(--crm-rule)" }}>
              <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ld.ld.ini}</span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ld.ld.name}</strong>
                <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-brown)" }}>{v.ld.ld.ad}</small>
              </span>
            </div>
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-field)", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-ink)" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                </path>
              </svg>
              <span style={{ flex: "1" }}>View only · {v.ld.ld.ownerFirst}'s customer. To reply, open this chat from Inbox.</span>
            </div>
          </>)}
          {!!(v.ld.lx.inbox) && (<>
            <div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>
              <span onClick={v.ld.back} title="Back to Inbox" style={{ flex: "none", width: "40px", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                <Ic name="chevron-left" size={24} />
              </span>
              <span title={v.ld.lx.chanName} style={{ flex: "none", position: "relative", width: "40px", height: "40px" }}>
                <span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: v.ld.ld.avBg, color: v.ld.ld.avFg, fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{v.ld.ld.ini}</span>
                
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: "calc(17.39px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>
                <small style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.sub}</small>
              </span>
              <span data-hm-toggle="1" onClick={v.ld.lx.toggleMenu} title="More" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: v.ld.lx.menuBg, display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8">
                  </circle>
                  <circle cx="12" cy="12" r="1.8">
                  </circle>
                  <circle cx="12" cy="19" r="1.8">
                  </circle>
                </svg>
              </span>
              {!!(v.ld.lx.menuOpen) && (<>
                <div data-hm-menu="1" style={{ position: "absolute", top: "50px", right: "16px", zIndex: "7", width: "240px", padding: "6px", boxSizing: "border-box", borderRadius: "20px", background: "#fff", border: "1px solid var(--crm-rule-soft)", boxShadow: "0 16px 36px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "2px", animation: "fadeIn 140ms ease-out" }}>
                  {(v.ld.lx.menu).map((it, it_i) => (<Fragment key={it_i}>
                    <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 10px", borderRadius: "14px", cursor: "pointer" }} className={H.hov2}>
                      <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "11px", background: it.bg, color: it.fg, display: "grid", placeItems: "center" }}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d={it.icon}>
                          </path>
                        </svg>
                      </span>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{it.label}</strong>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
            </div><Phone4aStrip s={v.ld.ld.strip} />
            <p style={{ flex: "none", margin: "0 16px 12px", fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.ld.ld.ownerName}'s customer{v.ld.ld.windowNote}</p>
            
            {!!(v.ld.ld.movedTo) && (<>
              <div style={{ flex: "none", margin: "0 16px 12px", padding: "8px 12px", borderRadius: "12px", background: "var(--crm-tint-follow)", color: "var(--crm-brown)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600" }}>{v.ld.ld.movedTo}</div>
            </>)}
            </div>
            {!!(v.ld.lx.infoOpen) && (<>
              <div onClick={v.ld.lx.closeInfo} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
                <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "90%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ld.ld.ini}</span>
                    <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.ld.ld.name}</strong>
                    <span onClick={v.ld.lx.editInfo} style={{ marginLeft: "auto", height: "36px", padding: "0 16px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Edit</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
                    {(v.ld.lx.info).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                        <span style={{ color: "var(--crm-muted)" }}>{r.k}</span>
                        <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
              </div>
            </>)}
            <div data-chat-list="1" onClick={v.ld.lx.dismiss} style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "calc(var(--chat-top, 55px) + 25px) 16px calc(var(--chat-foot, 64px) + 6px)", backgroundColor: "var(--crm-field)" }}><div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
              {(v.ld.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
                {!!(m.sep) && (<>
                  <span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "4px 10px", borderRadius: "12px", background: "rgba(255,255,255,.7)", color: "var(--crm-muted)", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.sep}</span>
                </>)}
                <div {...m.press} style={{ WebkitTouchCallout: "none", position: "relative", marginBottom: m.rxGap, display: m.vis, alignSelf: m.align, maxWidth: "80%", padding: m.pad, boxSizing: "border-box", borderRadius: m.radius, boxShadow: "0 1px 1px rgba(42,22,12,.10)", background: m.bg, border: `1px solid ${m.bd}`, color: m.fg }}>
                  {!!(m.ev) && (<><div onClick={m.ev.go} style={{ width: "248px", maxWidth: "100%", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden", textAlign: "left", cursor: "pointer" }}><div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px" }}><span style={{ flex: "none", width: "54px", padding: "6px 0", borderRadius: "12px", background: m.ev.bg, color: m.ev.fg, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.1" }}><small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.wk}</small><strong style={{ fontSize: "calc(24px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.ev.dn}</strong><small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.mon}</small></span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}><span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: m.ev.bg, color: m.ev.fg, fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase" }}>{m.ev.kind}</span><strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{m.ev.title}</strong><span style={{ fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", textDecoration: m.ev.deco, fontVariantNumeric: "tabular-nums" }}>{m.ev.time}</span></span></div><div style={{ display: "flex", gap: "10px", padding: "11px 12px", borderTop: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}><svg style={{ flex: "none", marginTop: "1px", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path></svg><span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}><strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{m.ev.room}</strong>{!!(m.ev.addr) && (<><span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", lineHeight: "1.35" }}>{m.ev.addr}</span></>)}</span></div></div></>)}{!!(m.quote) && (<div style={{ margin: "0 0 6px", padding: "6px 10px", borderRadius: "8px", borderLeft: "3px solid var(--crm-rust)", background: "rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>{m.quote.who}</strong><span style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.35", color: "var(--crm-muted)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.quote.text}</span></div>)}{!!(m.reaction) && (<span style={{ position: "absolute", bottom: "-14px", left: m.rxSide, right: m.rxRight, padding: "1px 5px", borderRadius: "12px", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.25)", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "22px" }}>{m.reaction}</span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(42,22,12,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "var(--crm-page)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", lineHeight: "1.3", color: "var(--crm-ink)", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{m.docType}</small></span></span>)}<p style={{ display: m.pDisp, margin: "0", padding: m.inPad, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "calc(16.3px * var(--rv-type, 1))", lineHeight: "1.45" }}>{m.text}</p>
                  <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "calc(11px * var(--rv-type, 1))", color: m.timeC }}>{!!(m.hasBy) && (<>
                      <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                    </>)}{m.time}{!!(m.mine) && (<>
                      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke={m.tickC} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={m.tickPath}>
                        </path>
                      </svg>
                    </>)}</span>{!!(m.failNote) && (<span style={{ display: "block", marginTop: "3px", fontSize: "calc(11px * var(--rv-type, 1))", lineHeight: "1.35", color: "var(--crm-page)" }}>{m.failNote}</span>)}
                </div>
              </Fragment>))}
            </div></div>
            {!!(v.ld.lx.pk) && (<PickEditor pk={v.ld.lx.pk} />)}
            <ChatComposer key={v.ld.lx.cmp.key} v={v.ld.lx.cmp} />
      
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div data-chat-list="1" style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {(v.ld.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
                <div style={{ alignSelf: m.align, maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius, background: m.bg, border: `1px solid ${m.bd}`, fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}<span style={{ display: "block", marginTop: "4px", fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-muted)", textAlign: "right" }}>{!!(m.hasBy) && (<>
                      <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                    </>)}{m.at}</span></div>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid var(--crm-rule)" }}>
              {!!(v.ld.ld.movedTo) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-tint-follow)", color: "var(--crm-brown)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600" }}>
                  <svg style={{ flex: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                    </path>
                  </svg>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ld.ld.movedTo}</span>
                </div>
              </>)}
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Reassign to</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <span onClick={v.ld.ld.openSheet} style={{ position: "relative", flex: "1", minWidth: "0", height: "46px", boxSizing: "border-box", padding: "0 36px 0 14px", border: "1px solid var(--crm-rule)", borderRadius: "23px", background: "#fff", display: "flex", alignItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.pickLabel}</span>
                  <svg style={{ position: "absolute", right: "14px", color: "var(--crm-muted)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6">
                    </path>
                  </svg>
                </span>
                <span onClick={v.ld.ld.move} style={{ flex: "none", height: "46px", padding: "0 18px", borderRadius: "23px", background: v.ld.ld.moveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Move</span>
              </div>
            </div>
          </>)}
          {!!(v.ld.lx.bookOpen) && (<>
            <div onClick={v.ld.lx.closeBook} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
              <div onClick={v.ld.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <span style={{ flex: "none", alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
                </span>
                <h2 style={{ flex: "none", margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Book a visit · {v.ld.ld.name}</h2>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Showroom</span>
                  {(v.ld.lx.rooms).map((r, r_i) => (<Fragment key={r_i}>
                    <div onClick={r.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1.5px solid ${r.bd}`, background: r.bg, cursor: "pointer" }}>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{r.label}</strong>
                      <span style={{ flex: "none", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${r.ring}`, display: "grid", placeItems: "center" }}>
                        <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.dot }}>
                        </span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Date</span>
                    <span style={{ display: "inline-flex", alignItems: "center", height: "32px", border: "1px solid var(--crm-rule)", borderRadius: "16px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650" }}><span onClick={v.ld.lx.mPrev} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 6-6 6 6 6">
                          </path>
                        </svg>
                      </span>{v.ld.lx.monthLbl}<span onClick={v.ld.lx.mNext} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </span></span>
                    <span style={{ marginLeft: "auto", display: "flex", padding: "3px", borderRadius: "16px", background: "var(--crm-field)" }}>
                      <span onClick={v.ld.lx.vWeek} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", background: v.ld.lx.vWeekBg, color: v.ld.lx.vWeekFg, cursor: "pointer" }}>Week</span>
                      <span onClick={v.ld.lx.vMonth} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", background: v.ld.lx.vMonthBg, color: v.ld.lx.vMonthFg, cursor: "pointer" }}>Month</span>
                    </span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)", textAlign: "center" }}>
                    <span>Mon</span>
                    <span>Tue</span>
                    <span>Wed</span>
                    <span>Thu</span>
                    <span>Fri</span>
                    <span>Sat</span>
                    <span>Sun</span>
                  </div>
                  {!!(v.ld.lx.isMonth) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                      {(v.ld.lx.cells).map((c, c_i) => (<Fragment key={c_i}>
                        <span onClick={c.pick} style={{ height: "36px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.ld.lx.isWeek) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                      {(v.ld.lx.wk).map((c, c_i) => (<Fragment key={c_i}>
                        <span onClick={c.pick} style={{ height: "40px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                      </Fragment>))}
                    </div>
                  </>)}
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Time</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                    {(v.ld.lx.slots).map((s, s_i) => (<Fragment key={s_i}>
                      <span onClick={s.pick} style={{ height: "46px", borderRadius: "12px", border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px", cursor: s.cur }}>
                        <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", textDecoration: s.deco }}>{s.t}</span>
                        {!!(s.hasLeft) && (<>
                          <small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "600", opacity: ".8" }}>{s.left}</small>
                        </>)}
                      </span>
                    </Fragment>))}
                  </div>
                </div>
                <Phone4aRoomRemarks text={v.ld.lx.bookRemarks} /><span onClick={v.ld.lx.confirm} style={{ flex: "none", height: "48px", borderRadius: "24px", background: v.ld.lx.bookBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.ld.lx.bookLabel}</span>
              </div>
            </div>
          </>)}
          {!!(v.ld.ld.sheetOpen) && (<>
            <div onClick={v.ld.ld.closeSheet} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={v.ld.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 -8px 24px rgba(42,22,12,.12)" }}>
                <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)", marginBottom: "8px" }}>
                </span>
                <h2 style={{ margin: "4px 0 0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Reassign {v.ld.ld.name} to</h2>
                <p style={{ margin: "0 0 6px", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.ld.ld.ad} · now with {v.ld.ld.ownerName}</p>
                {(v.ld.ld.groups).map((g, g_i) => (<Fragment key={g_i}>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                      </span>{g.name} · {g.n}</span>
                    {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                      <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-rule)", cursor: "pointer" }} className={H.hov3}>
                        <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                        </span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{o.label}</strong>
                          <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                        </span>
                        <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </div>
                    </Fragment>))}
                  </div>
                </Fragment>))}
              </div>
            </div>
          </>)}
          {!!(v.ld.lx.shareOpen) && (<>
            <div onClick={v.ld.lx.closeShare} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
              <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
                </span>
                <h2 style={{ margin: "6px 0 4px", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Share with your team</h2>
                {(v.ld.lx.shareList).map((p, p_i) => (<Fragment key={p_i}>
                  <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "56px", borderTop: "1px solid var(--crm-field)", cursor: "pointer" }}>
                    <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", background: "var(--crm-tint-new)", color: "var(--crm-ink-soft)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700" }}>{p.ini}</span>
                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                      <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{p.name}</strong>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.role}</small>
                    </span>
                    <span style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink-soft)" }}>Invite</span>
                  </div>
                </Fragment>))}
              </div>
            </div>
          </>)}
          {!!(v.ld.toast) && (<>
            <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.ld.toast}</div>
          </>)}
        </main>
      </>)}
      {!!(v.cf.cfOpen) && (<>
        <div onClick={v.cf.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.cf.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.cf.cfStep}</span>
            </div>{!(v.cf.cfPaged) && (<>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
              <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Customer</strong>
              </span>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>NAME <b style={{ color: "var(--crm-oxblood)" }}>*</b></span>
              <input value={v.cf.cfName} onChange={v.cf.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PHONE</span>
              <input value={v.cf.cfPhone} onChange={v.cf.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
              <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Property</strong>
              </span>
            </div>
            {!!(v.cf.cfHas.type) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PROPERTY TYPE</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {(v.cf.cfType).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cf.cfHas.size) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT SIZE</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                {(v.cf.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cf.cfHas.loc) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT LOCATION</span>
              <input value={v.cf.cfLoc} onChange={v.cf.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label></>)}
            {!!(v.cf.cfHas.req) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>REQUIREMENT</span>
              <textarea value={v.cf.cfReq} onChange={v.cf.cfSetReq} placeholder={v.cf.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}>
              </textarea>
            </label></>)}
            {!!(v.cf.cfHas.budget) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>BUDGET</span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
                <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>RM</span>
                <input value={v.cf.cfBudget} onChange={v.cf.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </span>
            </label></>)}
            </>)}{(v.cf.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "var(--crm-oxblood)" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
{!!(v.cf.cfBack) && (<span onClick={v.cf.cfBack} style={{ flex: "none", alignSelf: "center", padding: "6px 18px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>‹ Back</span>)}<span onClick={v.cf.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cf.cfSaveBg, color: "#fff", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>{v.cf.cfSaveLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
    {!!(v.show.ad) && (<>
      {!!(v.ad.onAds) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {v.ad.inIns ? (<Phone4aTeamHead h={v.th} />) : (<h1 style={{ flex: "none", margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Ads Performance</h1>)}
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div onClick={v.ad.ovOpenRange} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", cursor: "pointer" }}>
                <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5h14v15H5V5Zm3-3v5m8-5v5M5 10h14">
                  </path>
                </svg>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{v.ad.adPerT}</strong>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.adPerD}</span>
                </span>
                <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg>
              </div>
              {!!(v.ad.ovCanClear) && (<>
                <span onClick={v.ad.ovClear} style={{ flex: "none", height: "56px", padding: "0 16px", boxSizing: "border-box", borderRadius: "16px", background: "var(--crm-field)", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Clear</span>
              </>)}
            </div>
          </div>
          {!!(v.ad.cmpOn) && (<>
            <section style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700" }}>Comparison</h2>
                {!!(v.ad.cmpHas) && (<>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                    <span onClick={v.ad.cmpOff} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Clear</span>
                    <span onClick={v.ad.cmpToggle} style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>{v.ad.cmpToggleLbl}<svg style={{ transform: `rotate(${v.ad.cmpRot})` }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></span>
                  </span>
                </>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-page)", fontSize: "calc(13px * var(--rv-type, 1))" }}>
                <span onClick={v.ad.ovOpenPeriod} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-ink)", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-rust)" }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ad.cmpA}</span>
                  <span style={{ flex: "none", fontWeight: "650", color: "var(--crm-rust)" }}>Change</span>
                </span>
                {!!(v.ad.cmpHas) && (<>
                  <span onClick={v.ad.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-muted)", cursor: "pointer" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "var(--crm-st-won)" }}>
                    </span>
                    <span style={{ flex: "1", minWidth: "0" }}>vs {v.ad.cmpB}</span>
                    <span style={{ flex: "none", fontWeight: "650", color: "var(--crm-rust)" }}>Change</span>
                  </span>
                </>)}
                {!!(v.ad.cmpNone) && (<>
                  <span onClick={v.ad.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--crm-rust)", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>Choose a period to compare</span>
                </>)}
              </div>
              {!!(v.ad.cmpOpen) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  {(v.ad.adCmpRows).map((r, r_i) => (<Fragment key={r_i}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
                      <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{r.label}</span>
                      <strong style={{ fontSize: "calc(26px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{r.vA}</strong>
                      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>vs {r.vB}</span>
                        <span style={{ padding: "1px 6px", borderRadius: "6px", background: r.dBg, color: r.dFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", whiteSpace: "nowrap" }}>{r.delta}</span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
            </section>
          </>)}
          {(v.ad.adPerf).map((a, a_i) => (<Fragment key={a_i}>
            <section style={{ flex: "none", padding: "16px", borderRadius: "18px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 4px 14px rgba(42,22,12,.05)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{a.name}</strong>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{a.page}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                {(a.mets).map((m, m_i) => (<Fragment key={m_i}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingLeft: m.pl, borderLeft: m.bl }}>
                    <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{m.label}</span>
                    <strong style={{ fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{m.v}</strong>
                    {!!(a.hasCmp) && (<>
                      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>vs {m.b}</span>
                        <span style={{ padding: "1px 6px", borderRadius: "6px", background: m.dBg, color: m.dc, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", whiteSpace: "nowrap" }}>{m.d}</span>
                      </span>
                    </>)}
                  </div>
                </Fragment>))}
              </div>
            </section>
          </Fragment>))}
        </main>
        {!!(v.ad.ovrOpen) && (<>
          <div onClick={v.ad.ovrClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.ad.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.ad.ovrClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              {!!(v.ad.ovrShowTabs) && (<>
                <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
                  {(v.ad.ovrTabs).map((t, t_i) => (<Fragment key={t_i}>
                    <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                      </span>{t.label}</span>
                  </Fragment>))}
                </div>
              </>)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.ad.ovrPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "var(--crm-page)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.ad.ovrPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>{v.ad.ovrTitle}</strong>
                  <span onClick={v.ad.ovrNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.ad.ovrWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-faint)" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.ad.ovrCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ad.ovrFromBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.ad.ovrFromLbl}</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ad.ovrFrom}</strong>
                </span>
                <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ad.ovrToBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.ad.ovrToLbl}</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ad.ovrTo}</strong>
                </span>
              </div>
              <span onClick={v.ad.ovrApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.ad.ovrApplyBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.ad.ovrApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.as) && (<>
      {!!(v.as.onAssign) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px" }}><div style={{ display: "flex", alignItems: "center", gap: "10px" }}><h1 style={{ margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Assignment</h1>{!!(v.asx.onAct) && (<Phone4aActiveSave v={v.asx.act} />)}</div><div style={{ display: "flex", gap: "22px", borderBottom: "1px solid var(--crm-rule)" }}>{(v.asx.tabs4).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ height: "36px", display: "inline-flex", alignItems: "center", marginBottom: "-1px", borderBottom: t.on ? "2px solid var(--crm-rust)" : "2px solid transparent", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: t.on ? "500" : "400", color: t.on ? "var(--crm-ink)" : "var(--crm-faint)", whiteSpace: "nowrap", cursor: "pointer" }}>{t.label}</span>))}</div></div>
          {!!(v.asx.onHome) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(v.asx.cards).map((k, k_i) => (<Fragment key={k_i}>
                <div onClick={k.go} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", boxShadow: "0 1px 3px rgba(42,22,12,.05)", cursor: "pointer" }} className={H.hov11}>
                  <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: k.c, color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d={k.icon}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", lineHeight: "20px", fontWeight: "650", color: "var(--crm-ink)" }}>{k.title}</strong>
                    <small style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "17px", color: k.subFg }}>{k.sub}</small>
                  </span>
                  {!!(k.hasN) && (<>
                    <span style={{ flex: "none", minWidth: "24px", height: "24px", padding: "0 8px", boxSizing: "border-box", borderRadius: "12px", background: k.c, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{k.n}</span>
                  </>)}
                  <svg style={{ flex: "none", color: "var(--crm-faint-2)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </div>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.asx.onOrg) && (<>
            {!!(v.as.hasWaiting) && (<>
              <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "var(--crm-cream)", border: "1px solid var(--crm-tint-attention)", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "var(--crm-rust)" }}>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>Organic Leads</strong>
                  </span>
                  <span style={{ flex: "none", display: "grid", placeItems: "center", minWidth: "28px", height: "28px", padding: "0 9px", boxSizing: "border-box", borderRadius: "14px", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{v.as.waitingN}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-attention)", padding: "0 12px" }}>
                  {(v.as.waitList).map((w, w_i) => (<Fragment key={w_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: w.rule }}>
                      <span onClick={w.open} style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                        <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{w.name}</strong>
                        <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.ad} · {w.when}</small>
                      </span>
                      <span onClick={w.openSend} style={{ flex: "none", height: "36px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "18px", background: "var(--crm-rust)", color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Send to<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></span>
                    </div>
                  </Fragment>))}
                </div>
              </section>
            </>)}
          </>)}
          {!!(v.asx.onAds) && (<>
            {!!(v.as.notTL) && (<>
              <section style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                
                <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "999px", background: "var(--crm-tint-cold)" }}>{(v.as.adTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "30px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px", borderRadius: "999px", background: t.on ? "#fff" : "transparent", boxShadow: t.on ? "0 1px 2px rgba(0,0,0,.08)" : "none", fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: t.on ? "500" : "400", color: t.on ? "var(--crm-ink)" : "var(--crm-faint)", cursor: "pointer" }}>{t.label}<span style={{ color: "var(--crm-faint)", fontSize: "calc(13.04px * var(--rv-type, 1))" }}>{t.n}</span></span>))}</div>{!!(v.as.adsEmpty) && (<div style={{ padding: "18px 0", textAlign: "center", fontSize: "calc(14.13px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{v.as.adsEmpty}</div>)}
                {!!(v.asx.heldAny) && (<>
                  <div onClick={v.asx.openHeld} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-cream)", border: "1px solid var(--crm-tint-attention)", cursor: "pointer" }} className={H.hov12}>
                    <svg style={{ flex: "none", marginTop: "1px", color: "var(--crm-oxblood)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z">
                      </path>
                    </svg>
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-oxblood)" }}>{v.asx.heldTitle}</strong>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-muted)" }}>A By max team is full. Tap to see who is waiting.</small>
                    </span>
                    <svg style={{ flex: "none", marginLeft: "auto", color: "var(--crm-st-won)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </div>
                </>)}
                {(v.as.adRows).map((a, a_i) => (<Fragment key={a_i}>
                  <Phone4aAdCard a={a} />
                </Fragment>))}
              </section>
            </>)}
            {!!(v.as.isTL) && (<>
              <section style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                
                <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "999px", background: "var(--crm-tint-cold)" }}>{(v.as.adTabs).map((t, t_i) => (<span key={t_i} onClick={t.pick} style={{ flex: "1", height: "30px", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: "5px", borderRadius: "999px", background: t.on ? "#fff" : "transparent", boxShadow: t.on ? "0 1px 2px rgba(0,0,0,.08)" : "none", fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: t.on ? "500" : "400", color: t.on ? "var(--crm-ink)" : "var(--crm-faint)", cursor: "pointer" }}>{t.label}<span style={{ color: "var(--crm-faint)", fontSize: "calc(13.04px * var(--rv-type, 1))" }}>{t.n}</span></span>))}</div>{!!(v.as.adsEmpty) && (<div style={{ padding: "18px 0", textAlign: "center", fontSize: "calc(14.13px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{v.as.adsEmpty}</div>)}
                {(v.as.tlAds).map((a, a_i) => (<Fragment key={a_i}>
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-cold)", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{a.name}</strong>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{a.page}</small>
                    </span>
                    <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: "8px", background: a.stBg, color: a.stFg, fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700" }}>{a.state}</span>
                    {!!(a.hasLine) && (<>
                      <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", lineHeight: "1.45" }}>{a.line}</span>
                    </>)}
                    {!!(a.can) && (<>
                      <span onClick={a.edit} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-tint-cold)", background: "var(--crm-tint-cold)", color: "var(--crm-ink-soft)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 20h4L19 9l-4-4L4 16v4Z">
                          </path>
                        </svg>Split in my team</span>
                    </>)}
                  </div>
                </Fragment>))}
              </section>
            </>)}
          </>)}
          {!!(v.asx.onAw) && (<>
            <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "var(--crm-tint-new)", border: "1px solid var(--crm-tint-new)", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "var(--crm-ink-soft)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-ink-soft)", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>Awaiting reply</strong>
                </span>
                <span onClick={v.as.openAtt} style={{ flex: "none", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink-soft)", cursor: "pointer" }}>See all</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {(v.as.asgAttSum).map((g, g_i) => (<Fragment key={g_i}>
                  <span onClick={g.pick} style={{ flex: "1", minWidth: "0", padding: "8px 10px", borderRadius: "12px", background: g.bg, border: `1px solid ${g.bd}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", color: g.c, fontVariantNumeric: "tabular-nums" }}>{g.n}</strong>
                    <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: g.c, whiteSpace: "nowrap" }}>{g.name}</small>
                  </span>
                </Fragment>))}
              </div>
              <div style={{ padding: "2px 14px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-new)" }}>
                {(v.as.asgAtt).map((l, l_i) => (<Fragment key={l_i}>
                  <div onClick={l.open} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto 34px", gap: "10px", alignItems: "center", padding: "10px 0", borderTop: l.rule, cursor: "pointer" }}>
                    <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-new)", color: "var(--crm-ink-soft)", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650" }}>{l.ini}</span>
                    <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                      <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>
                      {!!(l.movedTo) && (<>
                        <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-brown)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>⇄ {l.movedTo}</span>
                      </>)}
                      {!!(l.notMoved) && (<>
                        <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.owner}</span>
                      </>)}
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                      <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: l.c, whiteSpace: "nowrap" }}>{l.lv}</span>
                      <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.wait}</small>
                    </span>
                    <span onClick={l.move} title="Assign to someone else" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink-soft)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                        </path>
                      </svg>
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </section>
          </>)}
          {!!(v.asx.onAct) && (<Phone4aActive v={v.asx.act} />)}{!!(v.asx.onFt) && (<>
            <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "var(--crm-tint-follow)", border: "1px solid var(--crm-tint-follow)", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "var(--crm-brown)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "var(--crm-brown)", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4m8-4v4M3 10h18M5 4h14v17H5V4Zm4 11 2 2 4-4">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>Full time lead allocation</strong>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(v.ftx.sum).map((t, t_i) => (<Fragment key={t_i}>
                  <div onClick={t.open} style={{ display: "flex", flexDirection: "column", padding: "4px 12px 8px", borderRadius: "14px", background: "#fff", border: "1px solid var(--crm-tint-follow)", cursor: "pointer" }} className={H.hov4}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0 4px" }}>
                      <span style={{ flex: "1", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-brown)" }}>{t.name}</span>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{t.mode}</small>
                      <svg style={{ color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </div>
                    {(t.rs).map((p, p_i) => (<Fragment key={p_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "10px", padding: "9px 0", borderTop: "1px solid var(--crm-tint-follow)" }}>
                        <span style={{ minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "3px" }}>
                          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{p.name}</strong>
                          <span style={{ padding: "2px 8px", borderRadius: "6px", background: p.tagBg, color: p.tagFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{p.label}</span>
                        </span>
                        <span style={{ display: "flex", gap: "3px" }}>
                          {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                            <span style={{ width: "20px", height: "22px", borderRadius: "6px", background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{d.t}</span>
                          </Fragment>))}
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </Fragment>))}
              </div>
            </section>
          </>)}
        </main>
        {!!(v.as.adEdOpen) && (<>
          <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "#fff", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "12px", borderBottom: "1px solid var(--crm-rule)", background: "#fff", position: "relative", zIndex: "1" }}>
                <span onClick={v.as.ae.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "8px", marginLeft: "-4px", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="chevron-left" size={26} /><span style={{ fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em" }}>Split leads</span></span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    {v.as.ae.canName ? (<input aria-label="Ad name" value={v.as.ae.nameDraft} onChange={v.as.ae.onName} onBlur={v.as.ae.saveName} onKeyDown={v.as.ae.nameKey} placeholder={v.as.ae.headline} maxLength={120} style={{ width: "100%", boxSizing: "border-box", margin: "0", padding: "0 44px 0 14px", height: "50px", border: "1px solid var(--crm-ink)", borderRadius: "12px", background: "#fff", font: "inherit", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(21.74px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.01em", color: "var(--crm-ink)", outline: "none" }} />) : (<h2 style={{ margin: "0", fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.as.ae.name}</h2>)}
                    
                  </span>
                </div>
              </div>
              <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 0", display: "flex", flexDirection: "column", gap: "14px" }} data-scroll-keep="">
                <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>
                  {(v.as.ae.modes).map((m, m_i) => (<Fragment key={m_i}>
                    <span onClick={m.pick} style={{ flex: "1", height: "36px", borderRadius: "18px", display: "grid", placeItems: "center", fontSize: "calc(15.22px * var(--rv-type, 1))", fontWeight: m.w, background: m.bg, color: m.fg, boxShadow: m.sh, cursor: "pointer" }}>{m.label}</span>
                  </Fragment>))}
                </div>
                {!!(v.as.ae.isEven) && (<>
                  <div style={{ display: "flex", flexDirection: "column", borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-tint-cold)", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "18px", background: "var(--crm-tint-cold)" }}>
                      <strong style={{ flex: "none", fontSize: "calc(44px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.04em", lineHeight: "1", color: "var(--crm-ink-soft)", fontVariantNumeric: "tabular-nums" }}>{v.as.ae.evenN}</strong>
                      <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>people share equally</strong>
                      </span>
                    </div>
                    {(v.as.ae.evenTeams).map((t, t_i) => (<Fragment key={t_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderTop: "1px solid var(--crm-tint-cold)" }}>
                        <span style={{ flex: "none", display: "flex" }}>
                          {(t.av).map((a, a_i) => (<Fragment key={a_i}>
                            <span style={{ width: "32px", height: "32px", marginLeft: a.ml, borderRadius: "50%", background: t.c, border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{a.ini}</span>
                          </Fragment>))}
                        </span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{t.team}</strong>
                          <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.names}</small>
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.as.ae.isSplit) && (<><Phone4aSplitTeams s={v.as.ae} inner={v.bp.inner} enterNext={v.enterNext} />
                </>)}
              </div>
              {!!(v.bp.sheet) && (<Phone4aAdjustSheet s={v.bp.sheet} />)}<div style={{ flex: "none", padding: "12px 20px 26px", borderTop: "1px solid var(--crm-rule)", background: "#fff", display: "flex", flexDirection: "column-reverse", gap: "8px" }}>
                <span onClick={v.as.ae.applyAll} style={{ gridColumn: "1 / -1", height: "44px", boxSizing: "border-box", borderRadius: "22px", border: `1px solid ${v.as.ae.applyBd}`, background: "#fff", color: v.as.ae.applyFg, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: v.as.ae.applyCur }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3">
                    </path>
                  </svg>{v.as.ae.applyLabel}</span>
                
                <span onClick={v.as.ae.save} style={{ height: "50px", borderRadius: "25px", background: v.as.ae.save ? "var(--crm-rust)" : "var(--crm-faint-2)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save</span>{!!(v.as.ae.why) && (<span role="status" style={{ fontSize: "calc(14.13px * var(--rv-type, 1))", lineHeight: "1.4", color: "var(--crm-oxblood)", textAlign: "center" }}>{v.as.ae.why}</span>)}
              </div>
            </div>
          </div>
        </>)}
        {!!(v.ftx.open) && (<>
          <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ flex: "none", padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: "6px", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
              <span onClick={v.ftx.close} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "4px", height: "36px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6">
                  </path>
                </svg>Full time lead allocation</span>
              <strong style={{ fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.ftx.name}</strong>
            </div>
            <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 16px 0", display: "flex", flexDirection: "column", gap: "14px" }} data-scroll-keep="">
              <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(7, 30px)", alignItems: "center", gap: "4px", padding: "10px 12px 6px" }}>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-faint)" }}>PERSON</span>
                  {(v.ftx.heads).map((h, h_i) => (<Fragment key={h_i}>
                    <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-faint)" }}>{h}</span>
                  </Fragment>))}
                </div>
                {(v.ftx.people).map((p, p_i) => (<Fragment key={p_i}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(7, 30px)", alignItems: "center", gap: "4px", padding: "10px 12px", borderTop: "1px solid var(--crm-rule-soft)" }}>
                    <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                      <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "18px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                      <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", lineHeight: "14px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</small>
                    </span>
                    {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                      <span onClick={d.toggle} title={d.title} style={{ width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "9px", border: `1.5px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d={d.icon}>
                          </path>
                        </svg>
                      </span>
                    </Fragment>))}
                  </div>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".05em", color: "var(--crm-muted)" }}>WHO GETS THE ENQUIRIES</span>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", padding: "0 14px" }}>
                  {(v.ftx.week).map((w, w_i) => (<Fragment key={w_i}>
                    <div style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: "10px", alignItems: "baseline", padding: "10px 0", borderTop: w.rule, fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "18px" }}>
                      <strong style={{ fontWeight: "700", color: "var(--crm-ink)" }}>{w.day}</strong>
                      <span style={{ color: w.fg, fontWeight: w.weight }}>{w.text}</span>
                    </div>
                  </Fragment>))}
                </div>
              </div>
            </div>
            <div style={{ flex: "none", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", padding: "12px 16px 16px", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>
              <span onClick={v.ftx.applyAll} style={{ gridColumn: "1 / -1", height: "44px", boxSizing: "border-box", borderRadius: "22px", border: `1px solid ${v.ftx.applyBd}`, background: "#fff", color: v.ftx.applyFg, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: v.ftx.applyCur }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3">
                  </path>
                </svg>{v.ftx.applyLabel}</span>
              <span onClick={v.ftx.clear} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>Clear all</span>
              <span onClick={v.ftx.save} style={{ height: "48px", borderRadius: "24px", background: "var(--crm-brown)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.cal) && (<>
      {!!(v.cal.onCal) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ flex: "1", minWidth: "0" }}>
              <h1 style={{ margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Calendar</h1>
            </div>
            <span onClick={v.cal.cOpenRange} style={{ flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid var(--crm-rule)", background: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", boxShadow: "0 2px 8px rgba(42,22,12,.06)", cursor: "pointer" }}><svg style={{ color: "var(--crm-rust)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                </path>
              </svg>{v.cal.cRangeBtn}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6">
                </path>
              </svg></span>
            {!!(v.bellIn) && (<>
              <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", boxShadow: "0 2px 8px rgba(42,22,12,.06)", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                  </path>
                </svg>
                {!!(v.bl.notifUnread) && (<>
                  <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "var(--crm-rust)", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                </>)}
              </span>
            </>)}
          </div>
          <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
            {(v.cal.cTeams).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{!!(c.dot) && (<>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                  </span>
                </>)}{c.label}</span>
            </Fragment>))}
          </div>
          <div style={{ flex: "none", display: "flex", gap: "8px", alignItems: "center" }}>
            <span onClick={v.cal.cpOpen} style={{ position: "relative", flex: "1", minWidth: "0", height: "40px", boxSizing: "border-box", padding: "0 34px 0 14px", border: "1px solid var(--crm-rule)", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cal.cPersonLabel}</span>
              <span style={{ position: "absolute", right: "12px", top: "13px", color: "var(--crm-muted)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg>
              </span>
            </span>
            <div style={{ flex: "none", display: "flex", gap: "2px", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>
              {(v.cal.cViews).map((vi, vi_i) => (<Fragment key={vi_i}>
                <span onClick={vi.pick} style={{ flex: "none", height: "32px", padding: "0 14px", borderRadius: "16px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: vi.w, background: vi.bg, color: vi.fg, boxShadow: vi.sh, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}</span>
              </Fragment>))}
            </div>
          </div>
          <div style={{ flex: "none", padding: "16px", borderRadius: "16px", background: "var(--crm-ink)", color: "#fff", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
              {(v.cal.cStats).map((s, s_i) => (<Fragment key={s_i}>
                <div onClick={s.open} style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: s.cur }}>
                  <strong style={{ fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(23.91px * var(--rv-type, 1))", fontWeight: "500", fontVariantNumeric: "tabular-nums", color: s.fg }}>{s.v}</strong>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-line)", textDecoration: s.deco, textUnderlineOffset: "3px" }}>{s.label}</span>
                </div>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,.14)" }}>
              {(v.cal.cByTeam).map((b, b_i) => (<Fragment key={b_i}>
                <div style={{ display: "grid", gridTemplateColumns: "118px minmax(0, 1fr) 54px", alignItems: "center", gap: "10px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}><span style={{ flex: "none", width: "9px", height: "9px", boxSizing: "border-box", borderRadius: "50%", border: `2px solid ${b.c}` }} />{b.name}</span>
                  <span style={{ height: "6px", borderRadius: "3px", background: "rgba(255,255,255,.14)", overflow: "hidden" }}>
                    <i style={{ display: "block", height: "100%", width: b.w, borderRadius: "3px", background: "var(--crm-peach)" }}>
                    </i>
                  </span>
                  <span style={{ textAlign: "right", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n} · {b.rate}</span>
                </div>
              </Fragment>))}
            </div>
          </div>
          {!!(v.cal.cIsGrid) && (<>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span onClick={v.cal.cPrevM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.cal.cGridTitle}</strong>
                <span onClick={v.cal.cNextM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {(v.cal.cWk).map((w, w_i) => (<Fragment key={w_i}>
                  <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{w}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: "1px solid var(--crm-rule)" }}>
                {(v.cal.cCells).map((c, c_i) => (<Fragment key={c_i}>
                  <div onClick={c.pick} style={{ height: "54px", boxSizing: "border-box", padding: "4px 2px", borderBottom: "1px solid var(--crm-rule-soft)", borderLeft: c.edge, background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", opacity: c.op, cursor: "pointer" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: c.w, background: c.dotBg, color: c.fg }}>{c.n}</span>
                    <span style={{ display: "flex", gap: "2px", flexWrap: "wrap", justifyContent: "center" }}>
                      {(c.dots).map((d, d_i) => (<Fragment key={d_i}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: d.c }}>
                        </span>
                      </Fragment>))}
                    </span>
                  </div>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "6px" }}>
                <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.cal.cDayTitle}</span>
                {!!(v.cal.cShowAll) && (<>
                  <span onClick={v.cal.cAll} style={{ flex: "none", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Show all</span>
                </>)}
              </div>
            </div>
          </>)}
          {(v.cal.cDays).map((d, d_i) => (<Fragment key={d_i}>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "8px 2px 0" }}><span style={{ fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(18.48px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-ink)" }}>{d.head}</span><span style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{d.sub}</span></span>
              {(d.items).map((a, a_i) => (<Fragment key={a_i}>
                <div onClick={a.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 16px", borderRadius: "14px", border: "1px solid var(--crm-rule)", background: "#fff", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "3px", height: "34px", borderRadius: "2px", background: a.tc }}>
                  </span>
                  <span style={{ flex: "none", order: "-1", minWidth: "70px", whiteSpace: "nowrap", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(18.48px * var(--rv-type, 1))", fontWeight: "500", fontVariantNumeric: "tabular-nums" }}>{a.time}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{a.name}</strong>
                    <small style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.who} · {a.room}</small>
                  </span>
                  <span style={{ flex: "none", color: a.sFg, fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: "500" }}>{a.status}</span>
                  
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          {!!(v.cal.cEmpty) && (<>
            <p style={{ margin: "0", padding: "16px 0", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>No visits for this filter.</p>
          </>)}
        </main>
        {!!(v.cal.cpIsOpen) && (<>
          <div onClick={v.cal.cpClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.cal.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)", marginBottom: "4px" }}>
              </span>
              <h2 style={{ margin: "4px 0 0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Show visits for</h2>
              <p style={{ margin: "0 0 6px", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.cal.cpSub}</p>
              <div onClick={v.cal.cpAll.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", margin: "0 -10px", borderRadius: "12px", background: v.cal.cpAll.bg, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "var(--crm-ink)" }}>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>Everyone</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.cal.cpAll.sub}</small>
                </span>
                <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              {(v.cal.cpGroups).map((g, g_i) => (<Fragment key={g_i}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                    </span>{g.name} · {g.n}</span>
                  {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                    <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", margin: "0 -10px", borderTop: "1px solid var(--crm-rule)", borderRadius: o.r, background: o.bg, cursor: "pointer" }} className={H.hov3}>
                      <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                        <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{o.label}</strong>
                        <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                      </span>
                      <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </div>
                  </Fragment>))}
                </div>
              </Fragment>))}
            </div>
          </div>
        </>)}
        {!!(v.cal.crOpen) && (<>
          <div onClick={v.cal.crClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.cal.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.cal.crClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.cal.crPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "var(--crm-page)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.cal.crPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>{v.cal.crTitle}</strong>
                  <span onClick={v.cal.crNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(42,22,12,.10)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.cal.cWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-faint)" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.cal.crCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.cal.crFromBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>From</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.cal.crFrom}</strong>
                </span>
                <svg style={{ color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.cal.crToBd}` }}>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>To</small>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.cal.crTo}</strong>
                </span>
              </div>
              <span onClick={v.cal.crApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.cal.crApplyBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.cal.crApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.cl.open) && (<>
      <div onClick={v.cl.close} style={{ position: "absolute", inset: "0", zIndex: "24", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.cl.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", height: "72%", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 0 0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px 0 12px" }}>
            <span onClick={v.cl.close} title="Back to Calendar" aria-label="Back to Calendar" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov7}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cl.title}</strong>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{v.cl.count}</span>
          </div>
          {!!(v.cl.empty) && (<>
            <p style={{ margin: "0", flex: "1", display: "grid", placeItems: "center", padding: "24px 20px", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.cl.emptyText}</p>
          </>)}
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", padding: "0 20px" }}>
            {(v.cl.rows).map((r, r_i) => (<Fragment key={r_i}>
              <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: r.rule, cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{r.ini}</span>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.phone}</small>
                  <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.owner}</small>
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-ink)" }}>{r.date}</span>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{r.time}</span>
                </div>
                <svg style={{ flex: "none", marginLeft: "-4px", color: "var(--crm-faint-2)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </Fragment>))}
            {!!(v.cl.hasRows) && (<>
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "16px 0 28px", borderTop: "1px solid var(--crm-rule)", fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)" }}><span style={{ flex: "1", height: "1px", background: "var(--crm-rule)" }}>
                </span>End of list<span style={{ flex: "1", height: "1px", background: "var(--crm-rule)" }}>
                </span></div>
            </>)}
          </div>
        </div>
      </div>
    </>)}
    {!!(v.ci.Open) && (<>
      <div onClick={v.ci.Close} style={{ position: "absolute", inset: "0", zIndex: "25", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.ci.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {!!(v.ci.hasBack) && (<>
              <span onClick={v.ci.Back} title="Back to list" aria-label="Back to list" style={{ flex: "none", width: "36px", height: "36px", marginLeft: "-8px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov7}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6">
                  </path>
                </svg>
              </span>
            </>)}
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ci.Ini}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.ci.Name}</strong>
            </div>
            <span onClick={v.ci.Edit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                </path>
              </svg>Edit</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
            {(v.ci.Rows).map((r, r_i) => (<Fragment key={r_i}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                <span style={{ flex: "none", color: "var(--crm-muted)" }}>{r.k}</span>
                <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.ci.Chat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
        </div>
      </div>
    </>)}
    {!!(v.show.pf) && (<>
      {!!(v.pf.onProfile) && (<>
        {!!(v.pf6) && (<Phone4aProfile p={v.pf6} />)}
      </>)}
    </>)}
    {!!(v.rm.rmDelOpen) && (<>
      <div onClick={v.rm.rmDelNo} style={{ position: "absolute", inset: "0", zIndex: "12", background: "rgba(42,22,12,.40)", display: "grid", placeItems: "center", padding: "28px", boxSizing: "border-box", animation: "fadeIn 160ms ease-out" }}>
        <div onClick={v.rm.stop} style={{ width: "100%", maxWidth: "300px", padding: "22px 20px 16px", boxSizing: "border-box", borderRadius: "22px", background: "#fff", boxShadow: "0 16px 40px rgba(42,22,12,.25)", display: "flex", flexDirection: "column", gap: "8px", textAlign: "center" }}>
          <span style={{ alignSelf: "center", width: "48px", height: "48px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", marginBottom: "4px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "calc(18px * var(--rv-type, 1))", fontWeight: "700" }}>Delete {v.rm.rmDelName}?</strong>
          <p style={{ margin: "0 0 8px", fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-muted)", textWrap: "pretty" }}>It will no longer appear in Book visit. This can't be undone.</p>
          <span onClick={v.rm.rmDelYes} style={{ height: "46px", borderRadius: "23px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Delete</span>
          <span onClick={v.rm.rmDelNo} style={{ height: "44px", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</span>
        </div>
      </div>
    </>)}
    {!!(v.rm.rmOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "var(--crm-page)", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><h1 style={{ flex: "1", minWidth: "0", margin: "0", display: "flex", alignItems: "center", gap: "8px", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(23.91px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.02em", lineHeight: "1.15" }}><span onClick={v.rm.closeRooms} role="button" aria-label="Back to Profile" style={{ flex: "none", display: "flex", marginLeft: "-4px", cursor: "pointer" }}><Ic name="chevron-left" size={22} /></span><span style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Showrooms</span></h1>{!!(v.rm.rmPager) && (<span style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px" }}><span onClick={v.rm.rmPrev} role="button" aria-label="Previous showroom" style={{ flex: "none", width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer", opacity: v.rm.rmPrevOp }}><Ic name="chevron-left" size={16} /></span><span style={{ minWidth: "34px", textAlign: "center", fontSize: "calc(16.3px * var(--rv-type, 1))", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{v.rm.rmPos}</span><span onClick={v.rm.rmNext} role="button" aria-label="Next showroom" style={{ flex: "none", width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer", opacity: v.rm.rmNextOp }}><Ic name="chevron-right" size={16} /></span></span>)}{!!(v.rm.rmCanDel) && (<span onClick={v.rm.rmDelCur} role="button" aria-label="Delete showroom" title="Delete showroom" style={{ flex: "none", width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-oxblood)", cursor: "pointer" }}><Ic name="trash-2" size={16} /></span>)}<span onClick={v.rm.rmAdd} role="button" aria-label="Add showroom" title="Add showroom" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><Ic name="plus" size={20} /></span></div>
        </div>
        {(v.rm.rmList).map((r, r_i) => (<Fragment key={r_i}>
          <section style={{ flex: "none", borderRadius: r.view ? "0" : "18px", border: r.view ? "0" : "1px solid var(--crm-rule)", background: "#fff", overflow: r.view ? "visible" : "hidden", boxShadow: r.view ? "none" : "0 2px 8px rgba(42,22,12,.04)" }}>
            {!!(r.view) && (<Phone4aRoom r={r} />)}
            {!!(r.editing) && (<>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "#fff" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Showroom name</span>
                  <input value={r.dName} onChange={r.setName} placeholder="e.g. Puchong showroom" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", background: "var(--crm-page)", fontWeight: "650" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Full address</span>
                  <textarea rows={3} value={r.dAddr} onChange={r.setAddr} placeholder="Street, postcode, city, state" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid var(--crm-rule)", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-ink)", resize: "none", background: "var(--crm-page)" }}>
                  </textarea>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid var(--crm-rule)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>Time slots</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                      <span>
                      </span>
                      {(r.dGridHead).map((w, w_i) => (<Fragment key={w_i}>
                        <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-faint)" }}>{w}</span>
                      </Fragment>))}
                      <span>
                      </span>
                    </div>
                    {(r.dGrid).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{g.t}</strong>
                          <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{g.cnt}</small>
                        </span>
                        {(g.cells).map((c, c_i) => (<Fragment key={c_i}>
                          <span onClick={c.pick} style={{ height: "34px", borderRadius: "9px", background: c.bg, color: c.fg, display: "grid", placeItems: "center", cursor: "pointer" }}>
                            {!!(c.on) && (<>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </>)}
                          </span>
                        </Fragment>))}
                        <span onClick={g.rm} title="Delete this time" style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-faint)", cursor: "pointer" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="m6 6 12 12M6 18 18 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                    </Fragment>))}
                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>Tap a box to open or close that time on that day.</span>
                  </div>
                  {!!(r.dNoSlots) && (<>
                    <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>No time slots yet</span>
                  </>)}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "14px", background: "var(--crm-page)" }}>
                    <span style={{ display: "flex", justifyContent: "space-between", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>
                      <span>Days</span>
                      <span style={{ color: "var(--crm-ink)" }}>{r.dNewDaysTxt}</span>
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                      {(r.dNewDays).map((d, d_i) => (<Fragment key={d_i}>
                        <span onClick={d.pick} style={{ height: "36px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{d.label}</span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span onClick={r.openTP} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                          </path>
                        </svg>
                        <span style={{ flex: "1", minWidth: "0", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: r.newTFg }}>{r.newTLbl}</span>
                        <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                      </span>
                      <span onClick={r.addSlot} title="Add time slot" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.addBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "14px", borderTop: "1px solid var(--crm-rule)" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>Booking limit</strong>
                  </span>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", height: "40px", border: "1px solid var(--crm-rule)", borderRadius: "12px", background: "#fff" }}>
                    <span onClick={r.capMinus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capMinusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M5 12h14">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ minWidth: "28px", textAlign: "center", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{r.dCap}</strong>
                    <span onClick={r.capPlus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capPlusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px", padding: "14px", borderRadius: "16px", border: "1px solid var(--crm-tint-attention)", background: "var(--crm-tint-attention)" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "8px", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", display: "grid", placeItems: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>Blocked time slots</strong>
                  </span>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Every week</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                    {(r.dWeek).map((w, w_i) => (<Fragment key={w_i}>
                      <span onClick={w.pick} style={{ height: "36px", borderRadius: "10px", border: `1px solid ${w.bd}`, background: w.bg, color: w.fg, display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{w.label}</span>
                    </Fragment>))}
                  </div>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Dates</span>
                  {(r.dBlocks).map((b, b_i) => (<Fragment key={b_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "40px", padding: "0 4px 0 12px", borderRadius: "12px", background: "var(--crm-field)" }}>
                      <span style={{ flex: "1", minWidth: "0", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.t}</span>
                      <span onClick={b.rm} title="Remove" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="m6 6 12 12M6 18 18 6">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </Fragment>))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <span onClick={r.openA} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBAbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>From</small>
                        <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: r.dBAfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBAtxt}</strong>
                      </span>
                    </span>
                    <span onClick={r.openB} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBBbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>To</small>
                        <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: r.dBBfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBBtxt}</strong>
                      </span>
                    </span>
                  </div>
                  {!!(r.calOpen) && (<>
                    <div style={{ padding: "12px", borderRadius: "16px", border: "1px solid var(--crm-rule)", background: "#fff", boxShadow: "0 8px 20px rgba(42,22,12,.10)", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span onClick={r.calPrev} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 6-6 6 6 6">
                            </path>
                          </svg>
                        </span>
                        <strong style={{ flex: "1", textAlign: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700" }}>{r.calTitle}</strong>
                        <span onClick={r.calNext} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px", textAlign: "center" }}>
                        {(r.calWk).map((w, w_i) => (<Fragment key={w_i}>
                          <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-faint)", padding: "4px 0" }}>{w}</span>
                        </Fragment>))}
                        {(r.calDays).map((d, d_i) => (<Fragment key={d_i}>
                          <span onClick={d.pick} style={{ height: "38px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: d.fw, background: d.bg, color: d.fg, cursor: d.cur }}>{d.n}</span>
                        </Fragment>))}
                      </div>
                    </div>
                  </>)}
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Time</span>
                  <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>
                    {(r.dBMode).map((m, m_i) => (<Fragment key={m_i}>
                      <span onClick={m.pick} style={{ flex: "1", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: m.w, background: m.bg, color: m.fg, boxShadow: m.sh, cursor: "pointer" }}>{m.label}</span>
                    </Fragment>))}
                  </div>
                  {!!(r.dBHours) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span onClick={r.openT1} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBT1bd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                          </path>
                        </svg>
                        <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: r.dBT1fg, whiteSpace: "nowrap" }}>{r.dBT1txt}</strong>
                      </span>
                      <span style={{ flex: "none", color: "var(--crm-faint)" }}>–</span>
                      <span onClick={r.openT2} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBT2bd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                          </path>
                        </svg>
                        <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: r.dBT2fg, whiteSpace: "nowrap" }}>{r.dBT2txt}</strong>
                      </span>
                    </div>
                    {!!(r.dBTOpen) && (<>
                      <div style={{ padding: "12px", borderRadius: "16px", border: "1px solid var(--crm-rule)", background: "#fff", boxShadow: "0 8px 20px rgba(42,22,12,.10)", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <strong style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{r.dBTTitle}</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
                          {(r.dBTimes).map((o, o_i) => (<Fragment key={o_i}>
                            <span onClick={o.pick} style={{ height: "36px", borderRadius: "10px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", cursor: o.cur, fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                          </Fragment>))}
                        </div>
                      </div>
                    </>)}
                    {!!(r.dBTimeErr) && (<>
                      <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-oxblood)" }}>End time must be after the start time.</span>
                    </>)}
                  </>)}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input value={r.dBWhy} onChange={r.setBWhy} placeholder="Reason, e.g. Training" style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "12px", outline: "none", font: "inherit", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-ink)", background: "#fff" }} />
                    <span onClick={r.addBlock} title="Add closed dates" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.blockBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "4px" }}>
                  <span onClick={r.remove} style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove</span>
                  <span style={{ display: "flex", gap: "8px" }}>
                    <span onClick={r.cancel} style={{ height: "40px", padding: "0 16px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Cancel</span>
                    <span onClick={r.save} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save</span>
                  </span>
                </div>
              </div>
            </>)}
          </section>
        </Fragment>))}
      </div>
      {!!(v.rm.tpOpen) && (<>
        <div onClick={v.rm.tpClose} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.rm.tpStop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Add time slot</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpH).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpM).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpA).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
            </div>
            <span onClick={v.rm.tpDone} style={{ height: "48px", borderRadius: "24px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Done · {v.rm.tpLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
    {!!(v.ol.undoOn) && (<>
      <div onClick={v.ol.undoClose} style={{ position: "absolute", inset: "0", zIndex: "9" }}>
      </div>
      <div style={{ position: "absolute", left: "14px", right: "14px", bottom: "96px", zIndex: "10", borderRadius: "16px", background: "var(--crm-ink)", color: "#fff", boxShadow: "0 10px 28px rgba(42,22,12,.30)", overflow: "hidden", animation: "sheetUp 260ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 8px 12px 14px" }}>
          <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", background: "var(--crm-brown)", display: "grid", placeItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10">
              </path>
            </svg>
          </span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
            <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ol.undoText}</strong>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-line)" }}>You can undo for {v.ol.undoLeft}</small>
          </span>
          <span onClick={v.ol.undoDo} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "#fff", color: "var(--crm-ink)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>Undo</span>
          <span onClick={v.ol.undoClose} title="Dismiss" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "var(--crm-line)", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </div>
        <span style={{ display: "block", height: "3px", background: "rgba(255,255,255,.15)" }}>
          <i style={{ display: "block", height: "100%", width: v.ol.undoPct, background: "var(--crm-st-won)", transition: "width 1s linear" }}>
          </i>
        </span>
      </div>
    </>)}
    {!!(v.ol.sdOpen) && (<>
      <div onClick={v.ol.sdClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.ol.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Send {v.ol.sdName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.ol.sdAd}</p>
          {(v.ol.sdGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>{g.name} · {g.n}</span>
              {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-rule)", cursor: "pointer" }} data-x="1" className={H.hov3}>
                  <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{o.label}</strong>
                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                  </span>
                  <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${o.ring}`, display: "grid", placeItems: "center" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: o.dot }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          <span onClick={v.ol.sdConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.ol.sdBtnBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", textAlign: "center", cursor: v.ol.sdBtnCur }}>{v.ol.sdBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.ol.mvOpen) && (<>
      <div onClick={v.ol.mvClose} style={{ position: "absolute", inset: "0", zIndex: "11", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.ol.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Assign {v.ol.mvName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.ol.mvAd}</p>
          {(v.ol.mvGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>{g.name} · {g.n}</span>
              {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-rule)", cursor: "pointer" }} data-x="1" className={H.hov3}>
                  <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{o.label}</strong>
                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                  </span>
                  <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${o.ring}`, display: "grid", placeItems: "center" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: o.dot }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          <span onClick={v.ol.mvConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.ol.mvBtnBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", textAlign: "center", cursor: v.ol.mvBtnCur }}>{v.ol.mvBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.ol.attOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.ol.closeAtt} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "var(--crm-rust)", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Insight</span>
        <h1 style={{ flex: "none", margin: "0", fontSize: "calc(30px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Awaiting reply</h1>
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "8px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "2px 20px" }}>
          {(v.ol.attTabs).map((vi, vi_i) => (<Fragment key={vi_i}>
            <span onClick={vi.pick} style={{ flex: "none", height: "38px", padding: "0 8px 0 14px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${vi.bd}`, display: "flex", alignItems: "center", gap: "8px", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: vi.w, background: vi.bg, color: vi.fg, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}<em style={{ minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "grid", placeItems: "center", fontStyle: "normal", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", background: vi.nBg, color: vi.nFg }}>{vi.n}</em></span>
          </Fragment>))}
        </div>
        {(v.ol.attGroups).map((g, g_i) => (<Fragment key={g_i}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
              </span>{g.name} · {g.n}</span>
            {(g.items).map((l, l_i) => (<Fragment key={l_i}>
              <div onClick={l.open} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto 34px", gap: "10px", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--crm-rule)", cursor: "pointer" }}>
                <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650" }}>{l.ini}</span>
                <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>
                  {!!(l.movedTo) && (<>
                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-brown)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>⇄ {l.movedTo}</span>
                  </>)}
                  {!!(l.notMoved) && (<>
                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.owner}</span>
                  </>)}
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c, whiteSpace: "nowrap" }}>{l.wait}</span>
                </span>
                <span onClick={l.move} title="Assign to someone else" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-rust)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                    </path>
                  </svg>
                </span>
              </div>
            </Fragment>))}
          </div>
        </Fragment>))}
        {!!(v.ol.attEmpty) && (<>
          <p style={{ margin: "0", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Nobody is waiting.</p>
        </>)}
      </div>
    </>)}
    {!!(v.ol.vaOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.ol.closeViewAs} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "var(--crm-rust)", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Profile</span>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 style={{ margin: "0", fontSize: "calc(30px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>View as</h1>
          <p style={{ margin: "0", fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-muted)", textWrap: "pretty" }}>See the CRM exactly as this person sees it.</p>
        </div>
        <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", height: "54px", padding: "0 18px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid var(--crm-tint-attention)", background: "#fff", boxShadow: "0 4px 14px rgba(42,22,12,.06)" }}>
          <svg style={{ flex: "none", color: "var(--crm-rust)" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
            </path>
          </svg>
          <input value={v.ol.vaQ} onChange={v.ol.vaSetQ} placeholder="Search name or title" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)" }} />
        </label>
        {(v.ol.vaGroups).map((g, g_i) => (<Fragment key={g_i}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <span style={{ padding: "8px 0 4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-muted)" }}>{g.name} · {g.n}</span>
            {(g.people).map((p, p_i) => (<Fragment key={p_i}>
              <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0", borderTop: p.rule, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", background: "var(--crm-ink)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{p.ini}</span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{p.name}</strong>
                  <small style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.title}</small>
                </span>
                <span style={{ flex: "none", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>View</span>
              </div>
            </Fragment>))}
          </div>
        </Fragment>))}
        {!!(v.ol.vaNone) && (<>
          <p style={{ margin: "0", padding: "12px 0", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Nobody matches.</p>
        </>)}
      </div>
    </>)}
    {!!(v.ol.pcOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span onClick={v.ol.closePc} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Inbox</span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em" }}>Contacts</h1>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "14px", background: "var(--crm-field)" }}>
            <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z">
              </path>
            </svg>
            <input value={v.ol.pcQ} onChange={v.ol.setPcQ} placeholder="Search name or member" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
          </label>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "0 20px 24px" }}>
          {(v.ol.pcRows).map((c, c_i) => (<Fragment key={c_i}>
            <div>
              {!!(c.hasHead) && (<>
                <div style={{ padding: "14px 0 4px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-rust)" }}>{c.head}</div>
              </>)}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: c.rule }}>
                <div onClick={c.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: c.ownBg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700" }}>{c.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "20px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                    <small style={{ display: "block", fontSize: "calc(12px * var(--rv-type, 1))", lineHeight: "16px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{c.phone}</small>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0", fontSize: "calc(12px * var(--rv-type, 1))", lineHeight: "16px", fontWeight: "600", color: "var(--crm-ink)" }}>
                      <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: c.wc }}>
                      </span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.who}</span>
                    </span>
                  </span>
                </div>
                <a href={c.tel} title="Call" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-brown)", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z">
                    </path>
                  </svg>
                </a>
              </div>
            </div>
          </Fragment>))}
          {!!(v.ol.pcEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>No one matches.</p>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.ol.notifOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px", background: "var(--crm-page)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span onClick={v.ol.closeNotifs} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>Back</span>
            {!!(v.ol.readAllShow) && (<>
              <span onClick={v.ol.readAll} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: v.ol.readAllFg, cursor: "pointer" }}>Mark all read</span>
            </>)}
          </div>
          <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em" }}>Notifications</h1>
          <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>
            {(v.ol.nfTabs).map((t, t_i) => (<Fragment key={t_i}>
              <span onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}>{t.label}{!!(t.n) && (<>
                  <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{t.n}</span>
                </>)}</span>
            </Fragment>))}
          </div>
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", userSelect: "none" }}>
            {(v.ol.nfChips).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 13px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                </span>{c.label}<small style={{ fontSize: "calc(11px * var(--rv-type, 1))", opacity: ".75" }}>{c.n}</small></span>
            </Fragment>))}
          </div>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {(v.ol.nfGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{g.day}</span>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
                {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                  <div onClick={n.tap} style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", gap: "12px", alignItems: "flex-start", padding: "14px", borderTop: n.rule, background: n.rowBg, cursor: "pointer" }}>
                    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: n.iBg, color: n.iFg, display: "grid", placeItems: "center" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d={n.icon}>
                        </path>
                      </svg>
                    </span>
                    <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.4", color: "var(--crm-ink)", textWrap: "pretty" }}><strong style={{ fontWeight: "700" }}>{n.who}</strong> {n.text} <strong style={{ fontWeight: "700" }}>{n.lead}</strong>{n.tail}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "6px", background: n.iBg, color: n.iFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{n.tag}</span>
                        {!!(n.extra) && (<>
                          <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{n.extra}</span>
                        </>)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{n.at}</small>
                      <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: n.dot }}>
                      </span>
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </div>
          </Fragment>))}
          {!!(v.ol.nfEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{v.ol.nfEmptyText}</p>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.hl.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "7", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "fadeIn 160ms ease-out" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "14px 12px 10px", borderBottom: "1px solid var(--crm-rule)", background: "#fff" }}>
          <span onClick={v.hl.back} title="Back" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov7}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6">
              </path>
            </svg>
          </span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
            <strong style={{ fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.01em" }}>Over the limit</strong>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.hl.sub}</small>
          </span>
          <span onClick={v.hl.close} title="Close" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }} className={H.hov7}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12">
              </path>
            </svg>
          </span>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!!(v.hl.empty) && (<>
            <div style={{ padding: "48px 16px", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>Nothing waiting. Every lead has someone.</div>
          </>)}
          {(v.hl.groups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "var(--crm-cream)", borderBottom: "1px solid var(--crm-tint-attention)" }}>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.ad}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-oxblood)", fontWeight: "600" }}>{g.full}</small>
                </span>
                <span onClick={g.edit} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid var(--crm-ink-soft)", color: "var(--crm-ink-soft)", display: "flex", alignItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }} className={H.hov9}>Edit limits</span>
              </div>
              {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderTop: r.rule }}>
                  <span onClick={r.chat} style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.meta}</small>
                  </span>
                  <span onClick={r.chat} title="Open chat" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov7}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                      </path>
                    </svg>
                  </span>
                  <span onClick={r.send} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "var(--crm-rust)", color: "#fff", display: "flex", alignItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }} className={H.hov8}>Send to</span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </div>
    </>)}
    {!!(v.fts.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span onClick={v.fts.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Profile</span>
          <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em" }}>Member work type</h1>
          <p style={{ margin: "0", fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.5", color: "var(--crm-muted)" }}>Turned on here, they appear in Assignment › Full time lead allocation, where you pick their days.</p>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {(v.fts.groups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
              <div onClick={g.fold} role="button" aria-expanded={g.open} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderBottom: g.headRule, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>
                <strong style={{ flex: "1", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{g.name}</strong>
                <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{g.count}</small><span style={{ display: "flex", color: "var(--crm-faint)", transform: `rotate(${g.chev})`, transition: "transform 160ms" }}><Ic name="chevron-down" size={15} /></span>
              </div>
              {(g.open ? g.people : []).map((p, p_i) => (<Fragment key={p_i}>
                <div onClick={p.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderTop: p.rule, cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650" }}>{p.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.title}</small>
                  </span>
                  <span style={{ flex: "none", position: "relative", width: "44px", height: "26px", borderRadius: "13px", background: p.swBg, transition: "background 160ms" }}>
                    <span style={{ position: "absolute", top: "3px", left: p.swX, width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left 160ms" }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>{!!(v.fts.dirty) && (<div style={{ flex: "none", display: "flex", gap: "10px", padding: "12px 20px calc(14px + var(--safe-bottom, 0px))", borderTop: "1px solid var(--crm-rule)", background: "#fff" }}><span onClick={v.fts.cancel} role="button" style={{ flex: "0 0 auto", height: "48px", padding: "0 20px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</span><span onClick={v.fts.save} role="button" style={{ flex: "1", height: "48px", borderRadius: "24px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{v.fts.saveLabel}</span></div>)}
      </div>
    </>)}
    {!!(v.tp.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "var(--crm-page)", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span onClick={v.tp.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "var(--crm-rust)", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Profile</span>
          <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em" }}>Cold lead templates</h1>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ flex: "none", margin: "0", fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.5", color: "var(--crm-muted)" }}>Switch a template on and salespeople can send it from a cold lead's chat. Only approved templates can be switched on.</p>
          <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px 0" }}>
            <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700" }}>Templates</strong>
            <span onClick={v.tp.add} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>+ New template</span>
          </div>
          {(v.tp.list).map((t, t_i) => (<Fragment key={t_i}>
            <div onClick={t.edit} style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", cursor: "pointer" }} className={H.hov11}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</strong>
                <span style={{ flex: "none", padding: "3px 8px", borderRadius: "10px", background: t.stBg, color: t.stFg, fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700" }}>{t.status}</span>
                <span onClick={t.toggle} title={t.swTitle} style={{ flex: "none", position: "relative", width: "40px", height: "24px", borderRadius: "12px", background: t.swBg, opacity: t.swOp, cursor: t.swCur, transition: "background 160ms" }}>
                  <span style={{ position: "absolute", top: "3px", left: t.swX, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left 160ms" }}>
                  </span>
                </span>
              </div>
              <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: t.chFg, fontWeight: "600" }}>{t.channel}</small>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.5", color: "var(--crm-ink)", display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.body}</span>
            </div>
          </Fragment>))}
        </div>
        {!!(v.tp.edOpen) && (<>
          <div onClick={v.tp.edClose} style={{ position: "absolute", inset: "0", zIndex: "2", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.tp.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ flex: "1", fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.tp.edTitle}</strong>
                {!!(v.tp.edCanDel) && (<>
                  <span onClick={v.tp.edDel} style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-oxblood)", cursor: "pointer" }}>Delete</span>
                </>)}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)" }}>Template name</span>
                <input value={v.tp.edName} onChange={v.tp.edSetName} placeholder="e.g. Follow up visit" style={{ width: "100%", boxSizing: "border-box", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", height: "46px", padding: "0 14px" }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)" }}>Channel</span>
                <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "var(--crm-field)" }}>
                  {(v.tp.edChs).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: c.w, background: c.bg, color: c.fg, boxShadow: c.sh, cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)" }}>Message</span>
                  <span onClick={v.tp.edInsName} style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>+ Customer name</span>
                </span>
                <textarea value={v.tp.edBody} onChange={v.tp.edSetBody} rows={5} placeholder={v.tp.edPh} style={{ width: "100%", boxSizing: "border-box", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", padding: "12px 14px", lineHeight: "1.5", resize: "none" }}>
                </textarea>
                <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-faint)" }}>{"{"}name{"}"} is replaced with the customer's first name.</small>
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <span onClick={v.tp.edDraft} style={{ flex: "1", height: "50px", borderRadius: "25px", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save draft</span>
                <span onClick={v.tp.edSubmit} style={{ flex: "1.4", height: "50px", borderRadius: "25px", background: v.tp.edOkBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>Submit for review</span>
              </div>
            </div>
          </div>
        </>)}
      </div>
    </>)}
    <Phone4aBar items={v.nv.nav} hidden={!v.navOn} />
    {!!(v.toast) && (<>
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: v.toastBottom, zIndex: "30", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.toast}</div>
    </>)}
  </>);
}
