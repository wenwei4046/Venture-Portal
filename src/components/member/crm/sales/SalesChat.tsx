"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/chat.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import ChatComposer from "./ChatComposer";
import { PickEditor } from "../shared/pick-editor";
import { InfoValue } from "../shared/AdLink";
import { ChatImg, ChatVideo, MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";
import { Phone4aBookMode, Phone4aCustomBook, Phone4aRoomRemarks, Phone4aStrip } from "../shared/phone4a";
import { Ic } from "../shared/icons4a";
import type { ChatVM } from "./vm/chat";

/** A chat: header menu, messages, booking, quick replies, templates and every sheet. */
export default function SalesChat({ v }: { v: ChatVM }) {
  return (<>
            
    <main data-chat-screen="" style={{ position: "relative", flex: "1 1 auto", minHeight: "0" }}>
      <div data-chat-head="" style={{ position: "absolute", left: "0", right: "0", top: "0", zIndex: "4", background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "2px 16px 12px" }}>
        <span onClick={v.closeChat} style={{ flex: "none", width: "40px", height: "40px", display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
          <Ic name="chevron-left" size={24} />
        </span>
        <span title={v.cl.chanName} style={{ flex: "none", position: "relative", width: "40px", height: "40px" }}>
          <span style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: v.cl.avBg, color: v.cl.avFg, fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{v.cl.ini}</span>
          
        </span>
        <div style={{ display: "flex", flexDirection: "column", flex: "1", minWidth: "0" }}>
          <strong style={{ fontSize: "calc(17.39px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cl.name}</strong>
          <span style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{[v.cl.ad, v.cl.chanName].filter(Boolean).join(" · ")}</span>
        </div>
        <span style={{ flex: "none", position: "relative", display: "flex" }}>
          <span data-hm-toggle="1" onClick={v.hm.toggle} title="More" style={{ width: "40px", height: "40px", borderRadius: "50%", background: v.hm.btnBg, display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="1.8">
              </circle>
              <circle cx="12" cy="12" r="1.8">
              </circle>
              <circle cx="12" cy="19" r="1.8">
              </circle>
            </svg>
          </span>
          {!!(v.hm.open) && (<>
            <div data-hm-menu="1" style={{ position: "absolute", top: "48px", right: "0", zIndex: "7", width: "264px", padding: "6px", boxSizing: "border-box", borderRadius: "20px", background: "#fff", border: "1px solid var(--crm-rule-soft)", boxShadow: "0 16px 36px rgba(42,22,12,.16), 0 2px 6px rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "2px", animation: "fadeIn 140ms ease-out" }}>
              {(v.hm.items).map((it, it_i) => (<Fragment key={it_i}>
                <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 10px", borderRadius: "14px", cursor: "pointer" }} className={H.hov2}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "11px", background: it.bg, color: it.fg, display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={it.icon}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{it.label}</strong>
                    <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</small>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </>)}
        </span>
      </div><Phone4aStrip s={v.cl.strip} />
      {!!(v.pinText) && (<>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", margin: "0 16px 12px", padding: "8px 12px", borderRadius: "12px", background: "var(--crm-field)", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-ink)" }}>
          <svg style={{ flex: "none", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z">
            </path>
          </svg>
          <span style={{ flex: "1", minWidth: "0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.pinText}</span>
          <span onClick={v.unpin} title="Unpin" style={{ flex: "none", width: "28px", height: "28px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </div>
      </>)}
      {!!(v.chatCold && v.simReplyShow) && (<>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", margin: "0 16px 12px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-tint-cold)", color: "var(--crm-ink-soft)" }}>
          
          {!!v.simReplyShow && (<span onClick={v.simReply} style={{ alignSelf: "flex-start", height: "30px", padding: "0 12px", boxSizing: "border-box", borderRadius: "15px", border: "1px dashed var(--crm-muted)", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Demo: customer replies</span>)}
        </div>
      </>)}
      </div>
      <div data-chat-list="1" onClick={v.dismiss} style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "calc(0px - var(--safe-bottom, 0px))", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", boxSizing: "border-box", padding: "calc(var(--chat-top, 55px) + 25px) 16px calc(var(--chat-foot, 64px) + 6px)", backgroundColor: v.wallBg, backgroundImage: v.wallImg, backgroundSize: v.wallSize }}><div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px" }}>
        {(v.msgs3b).map((m, m_i) => (<Fragment key={m_i}>
          {!!(m.sep) && (<>
            <span style={{ alignSelf: "center", margin: "6px 0 2px", padding: "4px 10px", borderRadius: "12px", background: "rgba(255,255,255,.7)", color: "var(--crm-muted)", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "0.08em", textTransform: "uppercase" }}>{m.sep}</span>
          </>)}
          {!!(m.plain) && (<>
            <div {...m.press} onMouseEnter={m.enter} onMouseLeave={m.leave} style={{ WebkitTouchCallout: "none", position: "relative", alignSelf: m.align, maxWidth: m.max, display: "flex", flexDirection: m.rowDir, alignItems: "center", gap: "6px", marginBottom: m.rxGap }}>
              <div style={{ position: "relative", minWidth: "0", display: "flow-root", padding: m.pad, boxSizing: "border-box", borderRadius: m.radius, boxShadow: "0 1px 1px rgba(42,22,12,.10)", background: m.bg, border: `1px ${m.borderStyle} ${m.border}`, textAlign: m.textAlign, color: m.fg }}>
                {!!(m.quote) && (<>
                  <div style={{ margin: "-3px -6px 6px", padding: "6px 10px", borderRadius: "8px", borderLeft: "3px solid var(--crm-rust)", background: "rgba(42,22,12,.06)", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}>
                    <strong style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>{m.quote.who}</strong>
                    <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.35", color: "var(--crm-muted)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.quote.text}</span>
                  </div>
                </>)}
                {!!(m.ev) && (<>
                  <div onClick={m.ev.go} style={{ width: "248px", maxWidth: "100%", borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden", textAlign: "left", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px" }}>
                      <span style={{ flex: "none", width: "54px", padding: "6px 0", borderRadius: "12px", background: m.ev.bg, color: m.ev.fg, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.1" }}>
                        <small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.wk}</small>
                        <strong style={{ fontSize: "calc(24px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.ev.dn}</strong>
                        <small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.mon}</small>
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: m.ev.bg, color: m.ev.fg, fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase" }}>{m.ev.kind}</span>
                        <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{m.ev.title}</strong>
                        <span style={{ fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", textDecoration: m.ev.deco, fontVariantNumeric: "tabular-nums" }}>{m.ev.time}</span>
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "10px", padding: "11px 12px", borderTop: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
                      <svg style={{ flex: "none", marginTop: "1px", color: "var(--crm-muted)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z">
                        </path>
                      </svg>
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}>
                        <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{m.ev.room}</strong>
                        {!!(m.ev.addr) && (<>
                          <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", lineHeight: "1.35" }}>{m.ev.addr}</span>
                        </>)}
                      </span>
                    </div>
                  </div>
                </>)}
                {!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<ChatImg onClick={m.view} onLoad={m.shape} src={m.img} style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(42,22,12,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><ChatVideo src={m.vidSrc} base={m.vid} onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "var(--crm-page)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", lineHeight: "1.3", color: "var(--crm-ink)", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{m.docType}</small></span></span>)}
                <p style={{ display: m.pDisp, margin: "0", padding: m.inPad, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: m.size, lineHeight: "1.45", fontStyle: m.textStyle, color: m.textColor }}>
                  {(m.parts).map((pt, pt_i) => (<Fragment key={pt_i}>
                    <span style={{ fontWeight: pt.w }}>{pt.t}</span>
                  </Fragment>))}
                </p>
                <span style={{ display: m.tDisp, float: m.tFloat, marginLeft: m.tML, marginBottom: m.tMB, alignItems: "center", justifyContent: m.timeJustify, gap: "3px", marginTop: m.timeTop, padding: m.inPad, fontSize: "calc(11px * var(--rv-type, 1))", color: m.timeColor }}>{!!(m.by) && (<>
                    <span style={{ fontStyle: "italic", opacity: ".85" }}>Sent by {m.by} ·</span>
                  </>)}{m.at}{!!(m.tick) && (<>
                    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke={m.tickColor} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-label={m.tickLabel}>
                      <path d={m.tickPath}>
                      </path>
                    </svg>
                  </>)}</span>{!!(m.failNote) && (<span style={{ display: "block", marginTop: "3px", fontSize: "calc(11px * var(--rv-type, 1))", lineHeight: "1.35", color: "var(--crm-page)" }}>{m.failNote}</span>)}
                {!!(m.showTools) && (<>
                  <span onClick={m.openMenu} title="Message options" style={{ position: "absolute", top: "3px", right: "3px", width: "26px", height: "24px", borderRadius: "0 13px 0 12px", display: "grid", placeItems: "center", background: m.bg, boxShadow: `-6px 0 8px ${m.bg}`, color: "var(--crm-muted)", cursor: "pointer" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6">
                      </path>
                    </svg>
                  </span>
                </>)}
                {!!(m.reaction) && (<>
                  <span style={{ position: "absolute", bottom: "-15px", left: m.rxLeft, right: m.rxRight, height: "24px", padding: "0 6px", borderRadius: "12px", background: "#fff", border: "1px solid var(--crm-rule)", boxShadow: "0 2px 6px rgba(42,22,12,.10)", display: "inline-flex", alignItems: "center", fontSize: "calc(14px * var(--rv-type, 1))" }}>{m.reaction}</span>
                </>)}
              </div>
              {!!(m.showTools) && (<>
                <span onClick={m.openReact} title="React" style={{ position: "absolute", top: "50%", left: m.rbLeft, right: m.rbRight, transform: "translateY(-50%)", width: "38px", height: "38px", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <span style={{ width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "50%", background: "#fff", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z">
                      </path>
                    </svg>
                  </span>
                </span>
              </>)}
            </div>
          </>)}
        </Fragment>))}
      </div></div>
      <ChatComposer key={v.cmp.key} v={v.cmp} />
      {!!(v.hm.apptOpen) && (<>
        <div onClick={v.hm.close} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Appointment</h2>
            {!!(v.hm.apptHas) && (<>
              <div onClick={v.hm.apptCal} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", borderRadius: "16px", background: "var(--crm-tint-attention)", border: "1px solid var(--crm-rust)", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14m-9 4 2 2 4-4">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{v.hm.apptRoom}</strong>
                  <span style={{ fontSize: "calc(14px * var(--rv-type, 1))" }}>{v.hm.apptWhen}</span>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)" }}>View in Calendar ›</small>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                <span onClick={v.hm.apptChange} style={{ height: "46px", borderRadius: "23px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Change</span>
                <span onClick={v.hm.apptCancel} style={{ height: "46px", boxSizing: "border-box", borderRadius: "23px", border: "1px solid var(--crm-line)", color: "var(--crm-oxblood)", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Cancel visit</span>
              </div>
            </>)}
            {!!(v.hm.apptNone) && (<>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "22px 12px", borderRadius: "16px", background: "var(--crm-page)", textAlign: "center" }}>
                <span style={{ width: "48px", height: "48px", borderRadius: "50%", background: "var(--crm-field)", color: "var(--crm-muted)", display: "grid", placeItems: "center" }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>No appointment yet</strong>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>This customer hasn't booked a showroom visit.</span>
              </div>
              <span onClick={v.hm.apptBook} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Book visit</span>
            </>)}
          </div>
        </div>
      </>)}
      {!!(v.hm.infoOpen) && (<>
        <div onClick={v.hm.close} style={{ position: "absolute", inset: "0", zIndex: "6", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.cl.ini}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
                <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.cl.name}</strong>
              </div>
              <span onClick={v.hm.edit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                  </path>
                </svg>Edit</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
              {(v.hm.rows).map((r, r_i) => (<Fragment key={r_i}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                  <span style={{ color: "var(--crm-muted)" }}>{r.k}</span>
                  <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
                </div>
              </Fragment>))}
            </div>
          </div>
        </div>
      </>)}
      {!!(v.hm.shareOpen) && (<>
        <div onClick={v.hm.close} style={{ position: "absolute", inset: "0", zIndex: "6", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)", marginBottom: "8px" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700" }}>Invite to this chat</h2>
            {(v.hm.groups).map((g, g_i) => (<Fragment key={g_i}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                  </span>{g.name} · {g.n}</span>
                {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                  <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-rule)", cursor: o.cur, opacity: o.op }}>
                    <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: g.c }}>
                    </span>
                    <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                      <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650" }}>{o.label}</strong>
                      <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                    </span>
                    <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "6px", border: `1.5px solid ${o.ring}`, background: o.fill, display: "grid", placeItems: "center", color: "#fff" }}>
                      {!!(o.on) && (<>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12 5 5 9-10">
                          </path>
                        </svg>
                      </>)}
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </Fragment>))}
            <span onClick={v.hm.sConfirm} style={{ marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.hm.sBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", textAlign: "center", cursor: "pointer" }}>{v.hm.sLabel}</span>
          </div>
        </div>
      </>)}
      {!!(v.hm.moveOpen) && (<>
        <div onClick={v.hm.close} style={{ position: "absolute", inset: "0", zIndex: "6", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)", marginBottom: "8px" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700" }}>{v.hm.moveTitle}</h2>
            {(v.hm.people).map((p, p_i) => (<Fragment key={p_i}>
              {!!p.hasHead && (<span style={{ padding: "12px 0 4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{p.head}</span>)}
              <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: p.rule, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "650" }}>{p.ini}</span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{p.name}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{p.role}</small>
                </span>
                <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${p.ring}`, display: "grid", placeItems: "center" }}>
                  <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: p.dot }}>
                  </span>
                </span>
              </div>
            </Fragment>))}
            <span onClick={v.hm.confirm} style={{ position: "sticky", bottom: "0", flex: "none", boxShadow: "0 0 0 10px #fff", marginTop: "10px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.hm.cBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.hm.cLabel}</span>
          </div>
        </div>
      </>)}
      {!!(v.pk) && (<PickEditor pk={v.pk} />)}
      {!!(v.hm.toast) && (<>
        <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "74px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.hm.toast}</div>
      </>)}
      {!!(v.menuOpen) && (<>
        <div onClick={v.closeMenu} style={{ position: "absolute", inset: "0", zIndex: "5", boxSizing: "border-box", padding: "24px 20px", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: v.menuAlign, gap: "10px" }}>
          <div onClick={v.stop} style={{ display: "flex", alignItems: "center", gap: "2px", padding: "6px 8px", borderRadius: "28px", background: "#fff", boxShadow: "0 8px 24px rgba(42,22,12,.18)" }}>
            {(v.reactBar).map((r, r_i) => (<Fragment key={r_i}>
              <span onClick={r.pick} style={{ width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(24px * var(--rv-type, 1))", background: r.bg, cursor: "pointer" }}>{r.e}</span>
            </Fragment>))}
            <span style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M12 5v14M5 12h14">
                </path>
              </svg>
            </span>
          </div>
          <div style={{ maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: v.menuMsg.radius, background: v.menuMsg.bg, border: `1px solid ${v.menuMsg.border}`, color: "var(--crm-ink)", fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45" }}>{v.menuMsg.text}</div>
          {!!(v.menuFull) && (<>
            <div onClick={v.stop} style={{ width: "220px", padding: "6px 0", borderRadius: "16px", background: "#fff", boxShadow: "0 8px 24px rgba(42,22,12,.18)" }}>
              {(v.menuItems).map((it, it_i) => (<Fragment key={it_i}>
                <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "44px", padding: "0 18px", borderTop: it.rule, fontSize: "calc(15px * var(--rv-type, 1))", color: it.color, cursor: "pointer" }} className={H.hov3}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                    <path d={it.icon}>
                    </path>
                  </svg>{it.label}</div>
              </Fragment>))}
            </div>
          </>)}
        </div>
      </>)}
      {!!(v.tplOpen) && (<>
        <div onClick={v.closeTpl} style={{ position: "absolute", inset: "0", zIndex: "7", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "80%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div>
              <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Send a template</h2>
              <p style={{ margin: "4px 0 0", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", textWrap: "pretty" }}>WhatsApp-approved messages. Once the customer replies, you can type freely again.</p>
            </div>
            {(v.tplList).map((t, t_i) => (<Fragment key={t_i}>
              <div onClick={t.send} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--crm-rule)", cursor: "pointer" }} className={H.hov3}>
                <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{t.name}</strong>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", lineHeight: "1.45" }}>{t.text}</span>
              </div>
            </Fragment>))}
          </div>
        </div>
      </>)}
      {!!(v.cancelAskOpen) && (<>
        <div onClick={v.cancelAskNo} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(42,22,12,.40)", animation: "fadeIn 160ms ease-out", display: "grid", placeItems: "center", padding: "28px" }}>
          <div onClick={v.stop} style={{ width: "100%", boxSizing: "border-box", padding: "22px 20px 16px", borderRadius: "22px", background: "#fff", boxShadow: "0 12px 32px rgba(42,22,12,.25)", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", textAlign: "center" }}>
              <h2 style={{ margin: "0", fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Cancel this visit?</h2>
              <p style={{ margin: "0", fontSize: "calc(14px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-muted)", textWrap: "pretty" }}>{v.cancelAskText} The customer will be sent a cancellation.</p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span onClick={v.cancelAskYes} style={{ height: "46px", borderRadius: "23px", background: "var(--crm-oxblood)", color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Cancel visit</span>
              <span onClick={v.cancelAskNo} style={{ height: "46px", boxSizing: "border-box", borderRadius: "23px", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Keep visit</span>
            </div>
          </div>
        </div>
      </>)}
      {!!(v.cfOpen) && (<>
        <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{v.cfStep}</span>
            </div>{!(v.cfPaged) && (<>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
              <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Customer</strong>
              </span>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>NAME <b style={{ color: "var(--crm-oxblood)" }}>*</b></span>
              <input value={v.cfName} onChange={v.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PHONE</span>
              <input value={v.cfPhone} onChange={v.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
              <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Property</strong>
              </span>
            </div>
            {!!(v.cfHas.type) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>PROPERTY TYPE</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {(v.cfType).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cfHas.size) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT SIZE</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                {(v.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cfHas.loc) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>UNIT LOCATION</span>
              <input value={v.cfLoc} onChange={v.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
            </label></>)}
            {!!(v.cfHas.req) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>REQUIREMENT</span>
              <textarea value={v.cfReq} onChange={v.cfSetReq} placeholder={v.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}>
              </textarea>
            </label></>)}
            {!!(v.cfHas.budget) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)" }}>BUDGET</span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
                <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>RM</span>
                <input value={v.cfBudget} onChange={v.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </span>
            </label></>)}
            </>)}{(v.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-rust)" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "var(--crm-muted)", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "var(--crm-oxblood)" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid var(--crm-rule)", background: "var(--crm-page)", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
{!!(v.cfBack) && (<span onClick={v.cfBack} style={{ flex: "none", alignSelf: "center", padding: "6px 18px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>‹ Back</span>)}<span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
          </div>
        </div>
      </>)}
      {!!(v.bookOpen) && (<>
        <div onClick={v.closeBook} style={{ position: "absolute", inset: "0", zIndex: "6", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 24px rgba(42,22,12,.12)", padding: "10px 20px 20px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "94%", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)" }}>Book a visit</h2>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>for {v.cl.name}</span>
              </div>
              <span onClick={v.closeBook} title="Close" style={{ flex: "none", width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 6 12 12M6 18 18 6">
                  </path>
                </svg>
              </span>
            </div>
            <Phone4aBookMode m={v.bkm} />
{!v.bkm || v.bkm.showroom ? (<><div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Showroom</span>
              {(v.rooms).map((r, r_i) => (<Fragment key={r_i}>
                <div onClick={r.pick} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1.5px solid ${r.border}`, background: r.bg, cursor: "pointer" }}>
                  <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{r.name}</strong>
                  <span style={{ flex: "none", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${r.border}`, display: "grid", placeItems: "center" }}>
                    <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.dot }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Date</span>
                  <span onClick={v.toggleMonth} title="Choose month" style={{ flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "32px", padding: "0 10px 0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid var(--crm-rule)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>{v.monthLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6">
                      </path>
                    </svg></span>
                  {!!(v.monthOpen) && (<>
                    <div onClick={v.toggleMonth} style={{ position: "fixed", inset: "0", zIndex: "2" }}>
                    </div>
                    <div style={{ position: "absolute", top: "38px", left: "0", zIndex: "3", width: "268px", padding: "12px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", boxShadow: "0 8px 24px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span onClick={v.yPrev} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: v.yPrevFg, cursor: v.yPrevCur }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 6-6 6 6 6">
                            </path>
                          </svg>
                        </span>
                        <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{v.pickYear}</strong>
                        <span onClick={v.yNext} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: v.yNextFg, cursor: v.yNextCur }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                        {(v.ymonths).map((mo, mo_i) => (<Fragment key={mo_i}>
                          <span onClick={mo.pick} style={{ height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: mo.weight, background: mo.bg, color: mo.fg, cursor: mo.cursor }}>{mo.label}</span>
                        </Fragment>))}
                      </div>
                    </div>
                  </>)}
                </div>
                <span style={{ display: "flex", gap: "2px", padding: "2px", borderRadius: "16px", background: "var(--crm-field)" }}>
                  <span onClick={v.viewWeek} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", background: v.viewWeekBg, color: v.viewWeekFg, cursor: "pointer" }}>Week</span>
                  <span onClick={v.viewMonth} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", background: v.viewMonthBg, color: v.viewMonthFg, cursor: "pointer" }}>Month</span>
                </span>
              </div>
              {!!(v.isWeekView) && (<>
                <div data-date-strip="1" onWheel={v.dateWheel} onPointerDown={v.dateDown} onPointerMove={v.dateMove} onPointerUp={v.dateUp} onPointerLeave={v.dateUp} onClickCapture={v.dateClickGuard} style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", scrollSnapType: "x proximity", scrollPadding: "0 20px", scrollBehavior: "smooth", cursor: "grab", touchAction: "pan-x", userSelect: "none" }}>
                  {(v.days).map((d, d_i) => (<Fragment key={d_i}>
                    <div onClick={d.pick} style={{ flex: "0 0 46px", scrollSnapAlign: "start", padding: "8px 0", borderRadius: "14px", border: `1px solid ${d.border}`, background: d.bg, color: d.fg, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", cursor: "pointer" }}>
                      <span style={{ fontSize: "calc(11px * var(--rv-type, 1))" }}>{d.wk}</span>
                      <strong style={{ fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{d.n}</strong>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.isMonthView) && (<>
                <div onPointerDown={v.mDown} onPointerUp={v.mUp} onPointerCancel={v.mCancel} onClickCapture={v.mClickGuard} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", touchAction: "pan-y", userSelect: "none", cursor: "grab" }}>
                  {(v.wkHead).map((wh, wh_i) => (<Fragment key={wh_i}>
                    <span style={{ height: "24px", display: "grid", placeItems: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{wh}</span>
                  </Fragment>))}
                  {(v.monthCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: c.weight, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, border: `1px solid ${c.border}`, cursor: c.cursor, textDecoration: c.deco }}>{c.n}</span>
                  </Fragment>))}
                </div>
              </>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>Time</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.slots).map((s, s_i) => (<Fragment key={s_i}>
                  <span onClick={s.pick} style={{ height: "46px", borderRadius: "12px", border: `1px solid ${s.border}`, background: s.bg, color: s.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px", cursor: s.cursor }}><span style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: s.weight, textDecoration: s.deco }}>{s.t}</span><small style={{ fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "600", opacity: ".8" }}>{s.left}</small></span>
                </Fragment>))}
              </div>
            </div>
            <Phone4aRoomRemarks text={v.bookRemarks} /><span onClick={v.confirmBook} style={{ minHeight: "48px", borderRadius: "24px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px", background: v.confirmBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", textAlign: "center", cursor: "pointer" }}>{v.confirmLabel}</span></>) : (<Phone4aCustomBook m={v.bkm} />)}
          </div>
        </div>
      </>)}
      {!!(v.qrOpen) && (<>
        <div onClick={v.closeQR} style={{ position: "absolute", inset: "0", zIndex: "6", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", boxShadow: "0 -8px 24px rgba(42,22,12,.12)", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "12px", maxHeight: "80%", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
              <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)" }}>Quick replies</h2>
              <span onClick={v.qrEdit} style={{ minHeight: "36px", padding: "0 6px", display: "inline-flex", alignItems: "center", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>Edit</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {(v.qrList).map((q, q_i) => (<Fragment key={q_i}>
                <div onClick={q.pick} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "12px 0", borderTop: q.rule, cursor: "pointer" }} className={H.hov3}>
                  <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{q.title}</span>
                  <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.4", color: "var(--crm-ink)", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{q.text}</span>
                </div>
              </Fragment>))}
            </div>
          </div>
        </div>
      </>)}
      {!!(v.qrListPage) && (<>
        <div style={{ position: "absolute", inset: "0", zIndex: "7", background: "var(--crm-cream-nav)", display: "flex", flexDirection: "column", gap: "16px", padding: "12px 16px 24px", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none", animation: "fadeIn 160ms ease-out" }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center" }}>
            <span onClick={v.qrBack} title="Back" style={{ width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>
            </span>
            <h2 style={{ margin: "0", textAlign: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>Quick replies</h2>
            <span onClick={v.qrAdd} title="New quick reply" style={{ width: "44px", height: "44px", borderRadius: "50%", background: "var(--crm-rust)", display: "grid", placeItems: "center", color: "#fff", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14">
                </path>
              </svg>
            </span>
          </div>
          <div style={{ background: "#fff", borderRadius: "18px", border: "1px solid var(--crm-rule)", padding: "0 16px" }}>
            {(v.qrList).map((q, q_i) => (<Fragment key={q_i}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", padding: "14px 0", borderTop: q.rule }}>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "6px" }}>
                  <span style={{ padding: "3px 8px", borderRadius: "6px", background: "var(--crm-field)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>{q.title}</span>
                  <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", lineHeight: "1.4", color: "var(--crm-ink)" }}>{q.text}</span>
                </div>
                <span onClick={q.editIt} title="Edit" style={{ flex: "none", width: "36px", height: "36px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>
                </span>
                <span onClick={q.remove} title="Delete" style={{ flex: "none", width: "36px", height: "36px", display: "grid", placeItems: "center", color: "var(--crm-oxblood)", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>
                </span>
              </div>
            </Fragment>))}
          </div>
          <p style={{ margin: "0", padding: "0 4px", fontSize: "calc(13px * var(--rv-type, 1))", lineHeight: "1.45", color: "var(--crm-muted)", textWrap: "pretty" }}>Save messages you send often. In a chat, tap + › Quick replies to use one.</p>
        </div>
      </>)}
      {!!(v.qrNewPage) && (<>
        <div style={{ position: "absolute", inset: "0", zIndex: "8", background: "var(--crm-cream-nav)", display: "flex", flexDirection: "column", gap: "18px", padding: "12px 16px 24px", boxSizing: "border-box", overflowY: "auto", scrollbarWidth: "none", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center" }}>
            <span onClick={v.qrCancelNew} title="Cancel" style={{ width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 6 12 12M6 18 18 6">
                </path>
              </svg>
            </span>
            <h2 style={{ margin: "0", textAlign: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{v.qrNewTitle}</h2>
            <span onClick={v.qrSave} title="Save" style={{ width: "44px", height: "44px", borderRadius: "50%", background: v.qrSaveBg, display: "grid", placeItems: "center", color: "#fff", cursor: v.qrSaveCur }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 5 5 9-10">
                </path>
              </svg>
            </span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Shortcut</span>
            <input value={v.qrNewS} onChange={v.qrSetS} placeholder="e.g. Puchong" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", borderRadius: "24px", border: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
          </label>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Message</span>
            <div style={{ borderRadius: "18px", border: "1px solid var(--crm-rule)", background: "#fff", overflow: "hidden" }}>
              <textarea value={v.qrNewM} onChange={v.qrSetM} placeholder="Enter message" rows={5} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "14px 16px", border: "0", outline: "none", resize: "none", background: "transparent", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", lineHeight: "22px", color: "var(--crm-ink)" }}>
              </textarea>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "48px", padding: "0 16px", borderTop: "1px solid var(--crm-rule)", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z">
                  </path>
                </svg>Attach media</div>
            </div>
          </div>
        </div>
      </>)}
    </main>
  </>);
}
