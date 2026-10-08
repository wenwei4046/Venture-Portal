"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/lead.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { LeadVM } from "./vm/lead";

/** One customer's chat from Calendar / Awaiting reply: view, reply, book, reassign. */
export default function PanelLead({ v }: { v: LeadVM }) {
  return (<>
            
    {!!(v.onLead) && (<>
      <main style={{ position: "relative", flex: "1 1 auto", minHeight: "0", padding: "6px 20px 16px", display: "flex", flexDirection: "column", gap: "12px" }}>
        {!!(v.lx.viewOnly) && (<>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid #EBDDD2" }}>
            <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650" }}>{v.ld.ini}</span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "16px", fontWeight: "650" }}>{v.ld.name}</strong>
              <small style={{ fontSize: "12px", color: "#387557" }}>{v.ld.ad}</small>
            </span>
          </div>
        </>)}
        {!!(v.lx.viewOnly) && (<>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", background: "#F5EBE3", fontSize: "13px", color: "#4E2F20" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
              </path>
            </svg>
            <span style={{ flex: "1" }}>View only · {v.ld.ownerFirst}'s customer. To reply, open this chat from Inbox.</span>
          </div>
        </>)}
        {!!(v.lx.inbox) && (<>
          <div style={{ position: "relative", flex: "none", display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px", borderBottom: "1px solid #EBDDD2" }}>
            <span onClick={v.back} title="Back to Inbox" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5m6-6-6 6 6 6">
                </path>
              </svg>
            </span>
            <span style={{ position: "relative", flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.ld.ini}<span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "16px", height: "16px", borderRadius: "50%", background: v.lx.chC, border: "2px solid #fff", display: "grid", placeItems: "center", color: "#fff" }}>
                <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z">
                  </path>
                </svg>
              </span></span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
              <strong style={{ fontSize: "16px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.name}</strong>
              <small style={{ fontSize: "12px", color: "#387557", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ad}</small>
            </span>
            <span onClick={v.lx.toggleMenu} title="More" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="1.7">
                </circle>
                <circle cx="12" cy="12" r="1.7">
                </circle>
                <circle cx="12" cy="19" r="1.7">
                </circle>
              </svg>
            </span>
            {!!(v.lx.menuOpen) && (<>
              <div style={{ position: "absolute", top: "48px", right: "0", zIndex: "7", width: "240px", padding: "6px", boxSizing: "border-box", borderRadius: "20px", background: "#fff", border: "1px solid #F0E4DA", boxShadow: "0 16px 36px rgba(63,43,34,.16)", display: "flex", flexDirection: "column", gap: "2px", animation: "fadeIn 140ms ease-out" }}>
                {(v.lx.menu).map((it, it_i) => (<Fragment key={it_i}>
                  <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 10px", borderRadius: "14px", cursor: "pointer" }} className={H.hov2}>
                    <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "11px", background: it.bg, color: it.fg, display: "grid", placeItems: "center" }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={it.icon}>
                        </path>
                      </svg>
                    </span>
                    <strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>{it.label}</strong>
                  </div>
                </Fragment>))}
              </div>
            </>)}
          </div>
          <p style={{ flex: "none", margin: "0", fontSize: "12px", color: "#806B60" }}>{v.ld.ownerName}'s customer{v.ld.windowNote}</p>
          {!!(v.lx.infoOpen) && (<>
            <div onClick={v.lx.closeInfo} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
              <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "90%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: "650" }}>{v.ld.ini}</span>
                  <strong style={{ fontSize: "19px", fontWeight: "700" }}>{v.ld.name}</strong>
                </div>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
                  {(v.lx.info).map((r, r_i) => (<Fragment key={r_i}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "14px" }}>
                      <span style={{ color: "#806B60" }}>{r.k}</span>
                      <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}>{r.v}</strong>
                    </div>
                  </Fragment>))}
                </div>
              </div>
            </div>
          </>)}
          {!!(v.ld.movedTo) && (<>
            <div style={{ flex: "none", padding: "8px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" }}>{v.ld.movedTo}</div>
          </>)}
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px", padding: "4px 0" }}>
            {(v.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
              {!!(m.sep) && (<>
                <span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#F5EBE3", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{m.sep}</span>
              </>)}
              <div style={{ alignSelf: m.align, maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius, background: m.bg, border: `1px solid ${m.bd}`, color: "#3F2B22" }}>
                <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "4px", fontSize: "11px", color: "#806B60" }}>{!!(m.hasBy) && (<>
                    <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                  </>)}{m.time}{!!(m.mine) && (<>
                    <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke="#2F8FD8" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 6l3 3 6-7M7 8.5l.5.5 6-7">
                      </path>
                    </svg>
                  </>)}</span>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.lx.openBook} style={{ flex: "none", height: "44px", borderRadius: "22px", background: "#BD4A19", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
              </path>
            </svg>Book visit</span>
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px" }}>
            <span style={{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 6px 0 16px", borderRadius: "22px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "4px" }}>
              <input value={v.lx.draft} onChange={v.lx.setDraft} placeholder={v.lx.ph} style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              <span style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">
                  </path>
                </svg>
              </span>
            </span>
            <span style={{ flex: "none", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z">
                </path>
              </svg>
            </span>
            <span onClick={v.lx.send} title={v.lx.sendTitle} style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={v.lx.sendIcon}>
                </path>
              </svg>
            </span>
          </div>
        </>)}
        {!!(v.lx.viewOnly) && (<>
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
            {(v.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
              <div style={{ alignSelf: m.align, maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius, background: m.bg, border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45" }}>{m.text}<span style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "#806B60", textAlign: "right" }}>{!!(m.hasBy) && (<>
                    <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                  </>)}{m.at}</span></div>
            </Fragment>))}
          </div>
        </>)}
        {!!(v.lx.viewOnly) && (<>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid #EBDDD2" }}>
            {!!(v.ld.movedTo) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" }}>
                <svg style={{ flex: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                  </path>
                </svg>
                <span style={{ flex: "1", minWidth: "0" }}>{v.ld.movedTo}</span>
              </div>
            </>)}
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Reassign to</span>
            <div style={{ display: "flex", gap: "8px" }}>
              <span onClick={v.ld.openSheet} style={{ position: "relative", flex: "1", minWidth: "0", height: "46px", boxSizing: "border-box", padding: "0 36px 0 14px", border: "1px solid #EBDDD2", borderRadius: "23px", background: "#fff", display: "flex", alignItems: "center", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.pickLabel}</span>
                <svg style={{ position: "absolute", right: "14px", color: "#806B60" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg>
              </span>
              <span onClick={v.ld.move} style={{ flex: "none", height: "46px", padding: "0 18px", borderRadius: "23px", background: v.ld.moveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Move</span>
            </div>
          </div>
        </>)}
        {!!(v.lx.bookOpen) && (<>
          <div onClick={v.lx.closeBook} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ flex: "none", alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <h2 style={{ flex: "none", margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Book a visit · {v.ld.name}</h2>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}>Showroom</span>
                {(v.lx.rooms).map((r, r_i) => (<Fragment key={r_i}>
                  <div onClick={r.pick} style={{ display: "flex", alignItems: "center", gap: "12px", height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1.5px solid ${r.bd}`, background: r.bg, cursor: "pointer" }}>
                    <strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650" }}>{r.label}</strong>
                    <span style={{ flex: "none", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${r.ring}`, display: "grid", placeItems: "center" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: r.dot }}>
                      </span>
                    </span>
                  </div>
                </Fragment>))}
              </div>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}>Date</span>
                  <span style={{ display: "inline-flex", alignItems: "center", height: "32px", border: "1px solid #EBDDD2", borderRadius: "16px", fontSize: "13px", fontWeight: "650" }}><span onClick={v.lx.mPrev} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m15 6-6 6 6 6">
                        </path>
                      </svg>
                    </span>{v.lx.monthLbl}<span onClick={v.lx.mNext} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </span></span>
                  <span style={{ marginLeft: "auto", display: "flex", padding: "3px", borderRadius: "16px", background: "#F5EBE3" }}>
                    <span onClick={v.lx.vWeek} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.lx.vWeekBg, color: v.lx.vWeekFg, cursor: "pointer" }}>Week</span>
                    <span onClick={v.lx.vMonth} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.lx.vMonthBg, color: v.lx.vMonthFg, cursor: "pointer" }}>Month</span>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px", fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "center" }}>
                  <span>Mon</span>
                  <span>Tue</span>
                  <span>Wed</span>
                  <span>Thu</span>
                  <span>Fri</span>
                  <span>Sat</span>
                  <span>Sun</span>
                </div>
                {!!(v.lx.isMonth) && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                    {(v.lx.cells).map((c, c_i) => (<Fragment key={c_i}>
                      <span onClick={c.pick} style={{ height: "36px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.lx.isWeek) && (<>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                    {(v.lx.wk).map((c, c_i) => (<Fragment key={c_i}>
                      <span onClick={c.pick} style={{ height: "40px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                    </Fragment>))}
                  </div>
                </>)}
              </div>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}>Time</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                  {(v.lx.slots).map((s, s_i) => (<Fragment key={s_i}>
                    <span onClick={s.pick} style={{ height: "46px", borderRadius: "12px", border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px", cursor: s.cur }}>
                      <span style={{ fontSize: "13px", fontWeight: "600", textDecoration: s.deco }}>{s.t}</span>
                      {!!(s.hasLeft) && (<>
                        <small style={{ fontSize: "10px", fontWeight: "600", opacity: ".8" }}>{s.left}</small>
                      </>)}
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <span onClick={v.lx.confirm} style={{ flex: "none", height: "48px", borderRadius: "24px", background: v.lx.bookBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>{v.lx.bookLabel}</span>
            </div>
          </div>
        </>)}
        {!!(v.ld.sheetOpen) && (<>
          <div onClick={v.ld.closeSheet} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 -8px 24px rgba(63,43,34,.12)" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "8px" }}>
              </span>
              <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Reassign {v.ld.name} to</h2>
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.ld.ad} · now with {v.ld.ownerName}</p>
              {(v.ld.groups).map((g, g_i) => (<Fragment key={g_i}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                    </span>{g.name} · {g.n}</span>
                  {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                    <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #EBDDD2", cursor: "pointer" }} className={H.hov3}>
                      <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                      </span>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                        <strong style={{ fontSize: "16px", fontWeight: "650" }}>{o.label}</strong>
                        <small style={{ fontSize: "12px", color: "#806B60" }}>{o.sub}</small>
                      </span>
                      <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
        {!!(v.lx.shareOpen) && (<>
          <div onClick={v.lx.closeShare} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <h2 style={{ margin: "6px 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Share with your team</h2>
              {(v.lx.shareList).map((p, p_i) => (<Fragment key={p_i}>
                <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "56px", borderTop: "1px solid #F5EEE9", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", background: "#F3E8EF", color: "#8E4B6E", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "700" }}>{p.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{p.name}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{p.role}</small>
                  </span>
                  <span style={{ fontSize: "14px", fontWeight: "650", color: "#8E4B6E" }}>Invite</span>
                </div>
              </Fragment>))}
            </div>
          </div>
        </>)}
        {!!(v.toast) && (<>
          <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.toast}</div>
        </>)}
      </main>
    </>)}
  </>);
}
