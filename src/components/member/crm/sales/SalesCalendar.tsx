"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/calendar.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { CalendarVM } from "./vm/calendar";
import type { ShellExtras } from "./vm/header";

/** Calendar: Month / Week / Day, Today with Show up / No show, upcoming, outcome and celebration; Customer info and its form. */
export default function SalesCalendar({ v }: { v: CalendarVM & ShellExtras }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 0 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", padding: "0 20px" }}>
        <h1 style={{ flex: "1", minWidth: "0", margin: "0", fontSize: "26px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>{v.calTitle}</h1>
        <span onClick={v.calToday} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>Today</span>
        {!!(v.tb) && (<>
          <span onClick={v.tb.open} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
              </path>
            </svg>
            {!!(v.tb.has) && (<>
              <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.tb.n}</span>
            </>)}
          </span>
        </>)}
      </div>
      <div style={{ display: "flex", gap: "4px", margin: "0 20px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
        {(v.calViews).map((vi, vi_i) => (<Fragment key={vi_i}>
          <span onClick={vi.pick} style={{ flex: "1", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: vi.weight, background: vi.bg, color: vi.fg, boxShadow: vi.shadow, cursor: "pointer" }}>{vi.label}</span>
        </Fragment>))}
      </div>
      {!!(v.calIsMonth) && (<>
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", padding: "0 20px", userSelect: "none" }}>
          {(v.calMonths).map((m, m_i) => (<Fragment key={m_i}>
            <span onClick={m.pick} style={{ flex: "none", height: "34px", padding: "0 16px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${m.border}`, background: m.bg, color: m.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: m.weight, cursor: "pointer" }}>{m.label}</span>
          </Fragment>))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "4px 6px 0", borderBottom: "1px solid #EBDDD2" }}>
          {(v.calWk).map((w, w_i) => (<Fragment key={w_i}>
            <span style={{ paddingBottom: "6px", textAlign: "center", fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{w}</span>
          </Fragment>))}
        </div>
        <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "0 6px", marginTop: "-10px", touchAction: "pan-y", userSelect: "none" }}>
          {(v.calCells).map((c, c_i) => (<Fragment key={c_i}>
            <div onClick={c.pick} style={{ minWidth: "0", height: "62px", boxSizing: "border-box", padding: "4px 2px", borderBottom: "1px solid #F3E9E1", borderLeft: c.edge, background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", cursor: "pointer" }}>
              <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: c.weight, background: c.dotBg, color: c.fg, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              {(c.ev).map((e, e_i) => (<Fragment key={e_i}>
                <span onClick={e.open} style={{ alignSelf: "stretch", height: "14px", padding: "0 3px", borderRadius: "3px", background: e.bg, color: "#fff", fontSize: "9px", fontWeight: "650", lineHeight: "14px", whiteSpace: "nowrap", overflow: "hidden" }}>{e.t}</span>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </>)}
      {!!(v.calIsWeek) && (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <span onClick={v.calPrev} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "14px", fontWeight: "650" }}>{v.weekLabel}</strong>
          <span onClick={v.calNext} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </span>
        </div>
        <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", padding: "0 6px", borderTop: "1px solid #EBDDD2", touchAction: "pan-y", userSelect: "none" }}>
          {(v.weekCols).map((c, c_i) => (<Fragment key={c_i}>
            <div onClick={c.pick} style={{ minWidth: "0", minHeight: "220px", padding: "6px 2px", boxSizing: "border-box", borderLeft: c.edge, background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", cursor: "pointer" }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{c.wk}</span>
              <span style={{ width: "26px", height: "26px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: c.weight, background: c.dotBg, color: c.fg }}>{c.n}</span>
              {(c.ev).map((e, e_i) => (<Fragment key={e_i}>
                <span onClick={e.open} style={{ alignSelf: "stretch", padding: "4px 3px", borderRadius: "4px", background: e.bg, color: "#fff", fontSize: "9px", fontWeight: "650", lineHeight: "1.25", overflow: "hidden", wordBreak: "break-word" }}>{e.time}<br />{e.name}</span>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </>)}
      {!!(v.calIsDay) && (<>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px" }}>
          <span onClick={v.calPrev} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "14px", fontWeight: "650" }}>{v.selLabel}</strong>
          <span onClick={v.calNext} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </span>
        </div>
        <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "flex", flexDirection: "column", padding: "0 20px", borderTop: "1px solid #EBDDD2", touchAction: "pan-y", userSelect: "none" }}>
          {(v.dayHours).map((r, r_i) => (<Fragment key={r_i}>
            <div style={{ display: "flex", gap: "10px", minHeight: "44px", borderBottom: "1px solid #F3E9E1" }}>
              <span style={{ flex: "none", width: "46px", paddingTop: "4px", fontSize: "11px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{r.label}</span>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", padding: "4px 0" }}>
                {(r.ev).map((e, e_i) => (<Fragment key={e_i}>
                  <div onClick={e.open} style={{ padding: "6px 10px", borderRadius: "8px", background: e.bg, color: "#fff", cursor: "pointer" }}>
                    <strong style={{ display: "block", fontSize: "13px", fontWeight: "650" }}>{e.time} · {e.name}</strong>
                    <span style={{ fontSize: "11px", opacity: ".9" }}>{e.room}</span>
                  </div>
                </Fragment>))}
              </div>
            </div>
          </Fragment>))}
        </div>
      </>)}
      {!!(v.hasToday) && (<>
        <section style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 20px 0" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em" }}>Today</h2>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#BD4A19" }}>{v.todayCount}</span>
          </div>
          {(v.todayList).map((a, a_i) => (<Fragment key={a_i}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", borderRadius: "16px", background: "#EEF5F0", border: "1px solid #CFE3D6" }}>
              <div onClick={a.open} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "4px", height: "40px", borderRadius: "2px", background: "#387557" }}>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{a.time} · {a.name}</strong>
                  <small style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.room}</small>
                </span>
                <svg style={{ flex: "none", color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                <span onClick={a.change} style={{ height: "40px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #CFE3D6", background: "#fff", color: "#3F2B22", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Change</span>
                <span onClick={a.noShow} style={{ height: "40px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #F0CFC7", background: "#fff", color: "#A3371A", display: "flex", alignItems: "center", justifyContent: "center", gap: "5px", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                    <path d="m6 6 12 12M18 6 6 18">
                    </path>
                  </svg>No show</span>
                <span onClick={a.came} style={{ height: "40px", borderRadius: "20px", background: "#387557", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12 5 5 9-10">
                    </path>
                  </svg>Show up</span>
              </div>
            </div>
          </Fragment>))}
        </section>
      </>)}
      <section style={{ display: "flex", flexDirection: "column", padding: "12px 20px 0" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: "6px" }}>
          <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "650", letterSpacing: "-.01em" }}>{v.upTitle}</h2>
          <span style={{ fontSize: "12px", fontWeight: "600", color: "#BD4A19" }}>{v.upCount}</span>
        </div>
        {!!(v.noUpcoming) && (<>
          <p style={{ margin: "0", padding: "10px 0", fontSize: "14px", color: "#806B60" }}>No upcoming appointments.</p>
        </>)}
        {(v.upList).map((a, a_i) => (<Fragment key={a_i}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #EBDDD2" }}>
            <div onClick={a.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
              <span style={{ flex: "none", width: "44px", display: "flex", flexDirection: "column", alignItems: "center", padding: "4px 0", borderRadius: "10px", background: "#FFF0E4", color: "#BD4A19" }}>
                <small style={{ fontSize: "10px", fontWeight: "650", textTransform: "uppercase" }}>{a.wk}</small>
                <strong style={{ fontSize: "17px", fontWeight: "700", lineHeight: "1.1" }}>{a.dn}</strong>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{a.name}</strong>
                <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.time} · {a.room}</small>
              </span>
            </div>
            {!!(a.isToday) && (<>
              <span onClick={a.came} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "#387557", color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 12 5 5 9-10">
                  </path>
                </svg>Show up</span>
            </>)}
            {!!(a.later) && (<>
              <span style={{ flex: "none", display: "flex", gap: "6px" }}>
                <span onClick={a.remind} style={{ height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${a.rBd}`, background: a.rBg, color: a.rFg, display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "13px", fontWeight: "650", whiteSpace: "nowrap", cursor: a.rCur }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={a.rIcon}>
                    </path>
                  </svg>{a.rLabel}</span>
              </span>
            </>)}
          </div>
        </Fragment>))}
      </section>
    </main>
    {!!(v.outcomeOpen) && (<>
      <div onClick={v.outcomeClose} style={{ position: "absolute", inset: "0", zIndex: "9", boxSizing: "border-box", padding: "24px", background: "rgba(63,43,34,.40)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 180ms ease-out" }}>
        <div onClick={v.stop} style={{ position: "relative", width: "100%", maxWidth: "330px", boxSizing: "border-box", animation: "popIn 220ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px", padding: "22px 18px 18px", boxShadow: "0 24px 48px rgba(63,43,34,.24)", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span onClick={v.outcomeClose} title="Close" style={{ position: "absolute", top: "12px", right: "12px", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em", color: "#3F2B22" }}>{v.outcomeTitle}</h2>
            <span style={{ fontSize: "13px", color: "#806B60" }}>{v.outcomeWhen}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {(v.outcomeOpts).map((o, o_i) => (<Fragment key={o_i}>
              <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: o.bg, color: o.fg, display: "grid", placeItems: "center" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d={o.icon}>
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "650", color: "#3F2B22" }}>{o.label}</strong>
                  <small style={{ fontSize: "12px", color: "#806B60" }}>{o.sub}</small>
                </span>
                <svg style={{ flex: "none", color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </Fragment>))}
          </div>
          {!!(v.isLost) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Why didn't it work out?</span>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {(v.lostReasons).map((r, r_i) => (<Fragment key={r_i}>
                  <span onClick={r.pick} style={{ height: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "grid", gridTemplateColumns: "18px minmax(0, 1fr) 20px", alignItems: "center", gap: "10px", fontSize: "15px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>
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
              <label style={{ display: "grid", gridTemplateColumns: "18px minmax(0, 1fr)", alignItems: "center", gap: "10px", height: "48px", boxSizing: "border-box", padding: "0 14px", borderRadius: "14px", border: `1px solid ${v.otherBd}`, background: "#FBF7F3" }}>
                <svg style={{ color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                  </path>
                </svg>
                <input value={v.otherText} onChange={v.otherSet} placeholder="Other reason…" style={{ flex: "1", minWidth: "0", height: "44px", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              </label>
              <span onClick={v.lostSave} style={{ height: "50px", borderRadius: "25px", background: v.lostSaveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Mark as Lost</span>
            </div>
          </>)}
          {!!(v.isWon) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "10px", height: "56px", boxSizing: "border-box", padding: "0 16px", borderRadius: "14px", border: "1.5px solid #387557", background: "#F4F9F5" }}>
                <span style={{ fontSize: "17px", fontWeight: "700", color: "#387557" }}>RM</span>
                <input value={v.wonAmount} onChange={v.wonSet} inputMode="decimal" placeholder="0" style={{ flex: "1", minWidth: "0", height: "50px", border: "0", background: "transparent", font: "inherit", fontSize: "22px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", outline: "none" }} />
              </label>
              <span onClick={v.wonSave} style={{ height: "50px", borderRadius: "25px", background: v.wonSaveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Save</span>
            </div>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.celebrateOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", boxSizing: "border-box", padding: "24px", background: "rgba(36,26,20,.62)", display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 180ms ease-out" }}> {v.fireworks} <div style={{ position: "relative", width: "100%", maxWidth: "320px", boxSizing: "border-box", padding: "28px 22px 24px", borderRadius: "26px", background: "#fff", boxShadow: "0 24px 48px rgba(0,0,0,.28)", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", textAlign: "center", animation: "fwPop 420ms cubic-bezier(.2,.8,.2,1)" }}>
          <span style={{ width: "64px", height: "64px", borderRadius: "50%", background: "#E4F1E8", color: "#387557", display: "grid", placeItems: "center" }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "22px", fontWeight: "800", letterSpacing: "-.02em", color: "#3F2B22", textWrap: "balance" }}>Congratulations on your sale!</strong>
          <span style={{ fontSize: "28px", fontWeight: "800", color: "#387557", fontVariantNumeric: "tabular-nums" }}>{v.celAmount}</span>
          <span style={{ fontSize: "13px", color: "#806B60" }}>{v.celName}</span>
        </div></div>
    </>)}
    {!!(v.ctOpen) && (<>
      <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: "650" }}>{v.ctIni}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              <strong style={{ fontSize: "19px", fontWeight: "700" }}>{v.ctName}</strong>
            </div>
            <span onClick={v.ctEdit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                </path>
              </svg>Edit</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
            {(v.ctRows).map((r, r_i) => (<Fragment key={r_i}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "14px" }}>
                <span style={{ flex: "none", color: "#806B60" }}>{r.k}</span>
                <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}>{r.v}</strong>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.ctChat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
        </div>
      </div>
    </>)}
    {!!(v.cfOpen) && (<>
      <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{v.cfStep}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
            <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <strong style={{ fontSize: "16px", fontWeight: "700" }}>Customer</strong>
            </span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>NAME <b style={{ color: "#A3371A" }}>*</b></span>
            <input value={v.cfName} onChange={v.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PHONE</span>
            <input value={v.cfPhone} onChange={v.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
            <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <strong style={{ fontSize: "16px", fontWeight: "700" }}>Property</strong>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PROPERTY TYPE</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(v.cfType).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
              </Fragment>))}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT SIZE</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
              {(v.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
              </Fragment>))}
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT LOCATION</span>
            <input value={v.cfLoc} onChange={v.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>REQUIREMENT</span>
            <textarea value={v.cfReq} onChange={v.cfSetReq} placeholder={v.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", resize: "none" }}>
            </textarea>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>BUDGET</span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3" }}>
              <span style={{ fontSize: "15px", fontWeight: "600", color: "#806B60" }}>RM</span>
              <input value={v.cfBudget} onChange={v.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
            </span>
          </label>
          <span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "17px", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
        </div>
      </div>
    </>)}
  </>);
}
