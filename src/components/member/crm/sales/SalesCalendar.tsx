"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/calendar.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { InfoValue } from "../shared/AdLink";
import { Phone4aCalHead, Phone4aCalLists, Phone4aCalMonth } from "../shared/phone4a";
import type { CalendarVM } from "./vm/calendar";

/** Calendar: Month / Week / Day, Today with Show up / No show, upcoming, outcome and celebration; Customer info and its form. */
export default function SalesCalendar({ v }: { v: CalendarVM }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 0 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <Phone4aCalHead v={v} />
      
      {!!(v.calIsMonth) && (<>
        <Phone4aCalMonth v={v} />
        
        
      </>)}
      {!!(v.calIsWeek) && (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <span onClick={v.calPrev} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{v.weekLabel}</strong>
          <span onClick={v.calNext} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </span>
        </div>
        <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "0 6px", borderTop: "1px solid var(--crm-rule)", touchAction: "pan-y", userSelect: "none" }}>
          {(v.weekCols).map((c, c_i) => (<Fragment key={c_i}>
            <div onClick={c.pick} style={{ minWidth: "0", minHeight: "220px", padding: "6px 2px", boxSizing: "border-box", borderLeft: c.edge, background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "pointer" }}>
              <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{c.wk}</span>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: c.weight, background: c.dotBg, color: c.fg }}>{c.n}</span>
              {(c.ev).map((e, e_i) => (<Fragment key={e_i}>
                <span onClick={e.open} style={{ alignSelf: "stretch", padding: "4px 3px", borderRadius: "4px", background: e.bg, color: "#fff", fontSize: "9px", fontWeight: "650", lineHeight: "1.25", overflow: "hidden", wordBreak: "break-word" }}>{e.time}<br />{e.name}</span>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </>)}
      {!!(v.calIsDay) && (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <span onClick={v.calPrev} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{v.selLabel}</strong>
          <span onClick={v.calNext} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </span>
        </div>
        <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "flex", flexDirection: "column", padding: "0 20px", borderTop: "1px solid var(--crm-rule)", touchAction: "pan-y", userSelect: "none" }}>
          {(v.dayHours).map((r, r_i) => (<Fragment key={r_i}>
            <div style={{ display: "flex", gap: "10px", minHeight: "44px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <span style={{ flex: "none", width: "46px", paddingTop: "4px", fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{r.label}</span>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", padding: "4px 0" }}>
                {(r.ev).map((e, e_i) => (<Fragment key={e_i}>
                  <div onClick={e.open} style={{ padding: "6px 10px", borderRadius: "8px", background: e.bg, color: "#fff", cursor: "pointer" }}>
                    <strong style={{ display: "block", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650" }}>{e.time} · {e.name}</strong>
                    <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", opacity: ".9" }}>{e.room}</span>
                  </div>
                </Fragment>))}
              </div>
            </div>
          </Fragment>))}
        </div>
      </>)}
      <Phone4aCalLists v={v} />
    </main>
    {!!(v.outcomeOpen) && (<>
      <div onClick={v.outcomeClose} style={{ position: "absolute", inset: "0", zIndex: "9", boxSizing: "border-box", padding: "24px", background: "rgba(42,22,12,.40)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 180ms ease-out" }}>
        <div onClick={v.stop} style={{ position: "relative", width: "100%", maxWidth: "330px", boxSizing: "border-box", animation: "popIn 220ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px", padding: "22px 18px 18px", boxShadow: "0 24px 48px rgba(42,22,12,.24)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span onClick={v.outcomeClose} title="Close" style={{ position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: "var(--crm-ink)" }}>{v.outcomeTitle}</h2>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.outcomeWhen}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(v.outcomeOpts).map((o, o_i) => (<Fragment key={o_i}>
              <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "16px", border: "1px solid var(--crm-rule)", background: "#fff", cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: o.bg, color: o.fg, display: "grid", placeItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={o.icon}>
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{o.label}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{o.sub}</small>
                </span>
                <svg style={{ flex: "none", color: "var(--crm-faint)" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </Fragment>))}
          </div>
          {!!(v.isLost) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Why didn't it work out?</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(v.lostReasons).map((r, r_i) => (<Fragment key={r_i}>
                  <span onClick={r.pick} style={{ height: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 20px", alignItems: "center", gap: "10px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>
                    <svg style={{ color: r.ic }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d={r.icon}>
                      </path>
                    </svg>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                    <span style={{ width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${r.ring}`, display: "grid", placeItems: "center" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.dot }}>
                      </span>
                    </span>
                  </span>
                </Fragment>))}
              </div>
              <label style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", alignItems: "center", gap: "10px", height: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1px solid ${v.otherBd}`, background: "var(--crm-page)" }}>
                <svg style={{ color: "var(--crm-muted)" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                  </path>
                </svg>
                <input value={v.otherText} onChange={v.otherSet} placeholder="Other reason…" style={{ flex: "1", minWidth: "0", height: "44px", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </label>
              <span onClick={v.lostSave} style={{ height: "50px", borderRadius: "25px", background: v.lostSaveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Mark as Lost</span>
            </div>
          </>)}
          {!!(v.isWon) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", height: "56px", boxSizing: "border-box", padding: "0 16px", borderRadius: "14px", border: "1.5px solid var(--crm-brown)", background: "var(--crm-tint-follow)" }}>
                <span style={{ fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-brown)" }}>RM</span>
                <input value={v.wonAmount} onChange={v.wonSet} inputMode="decimal" placeholder="0" style={{ flex: "1", minWidth: "0", height: "50px", border: "0", background: "transparent", font: "inherit", fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", outline: "none" }} />
              </label>
              <span onClick={v.wonSave} style={{ height: "50px", borderRadius: "25px", background: v.wonSaveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Save</span>
            </div>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.celebrateOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", boxSizing: "border-box", padding: "24px", background: "rgba(36,26,20,.62)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 180ms ease-out" }}> {v.fireworks} <div style={{ position: "relative", width: "100%", maxWidth: "320px", boxSizing: "border-box", padding: "28px 22px 24px", borderRadius: "26px", background: "#fff", boxShadow: "0 24px 48px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center", animation: "fwPop 420ms cubic-bezier(.2,.8,.2,1)" }}>
          <span style={{ width: "64px", height: "64px", borderRadius: "50%", background: "var(--crm-tint-follow)", color: "var(--crm-brown)", display: "grid", placeItems: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "calc(22px * var(--rv-type, 1))", fontWeight: "800", letterSpacing: "-.02em", color: "var(--crm-ink)", textWrap: "balance" }}>Congratulations on your sale!</strong>
          <span style={{ fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "800", color: "var(--crm-brown)", fontVariantNumeric: "tabular-nums" }}>{v.celAmount}</span>
          <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.celName}</span>
        </div></div>
    </>)}
    {!!(v.ctOpen) && (<>
      <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ctIni}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.ctName}</strong>
            </div>
            <span onClick={v.ctEdit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-rule)", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                </path>
              </svg>Edit</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid var(--crm-rule)" }}>
            {(v.ctRows).map((r, r_i) => (<Fragment key={r_i}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                <span style={{ flex: "none", color: "var(--crm-muted)" }}>{r.k}</span>
                <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.ctChat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
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
  </>);
}
