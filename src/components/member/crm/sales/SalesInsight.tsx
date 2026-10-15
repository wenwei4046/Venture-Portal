"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/insight.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { InfoValue } from "../shared/AdLink";
import type { InsightVM } from "./vm/insight";

/** Insight: Month / Week / Day / Range, the walnut hero and leads by status; Team | Me, the lists and Customer info. */
export default function SalesInsight({ v }: { v: InsightVM }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
          <h1 style={{ margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Insight</h1>
          <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "#806B60" }}>{v.pRange}</span>
        </div>
        <span onClick={v.openRange} style={{ flex: "0 0 auto", width: "max-content", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", border: `1px solid ${v.rgBd}`, background: v.rgBg, color: v.rgFg, fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
            </path>
          </svg>{v.rgLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6">
            </path>
          </svg></span>
      </div>
      <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
        {(v.pPeriods).map((vi, vi_i) => (<Fragment key={vi_i}>
          <span onClick={vi.pick} style={{ flex: "1", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: vi.weight, background: vi.bg, color: vi.fg, boxShadow: vi.shadow, cursor: "pointer" }}>{vi.label}</span>
        </Fragment>))}
      </div>
      <div style={{ padding: "18px", borderRadius: "20px", background: "#3F2B22", color: "#fff", display: "flex", flexDirection: "column", gap: "16px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#D9C7BA" }}>Appt rate</span>
            <strong style={{ fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" }}>{v.pHero.rate}</strong>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>{v.pHero.rateNote}</small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "14px", borderLeft: "1px solid rgba(255,255,255,.14)" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#D9C7BA" }}>Show-up rate</span>
            <strong style={{ fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" }}>{v.pHero.show}</strong>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>{v.pHero.showNote}</small>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: "14px", borderLeft: "1px solid rgba(255,255,255,.14)" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#D9C7BA" }}>Won rate</span>
            <strong style={{ fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.1", fontVariantNumeric: "tabular-nums" }}>{v.pHero.won}</strong>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>{v.pHero.wonNote}</small>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,.14)" }}>
          <div onClick={v.openLeads} title="See leads" style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
            <strong style={{ fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.pHero.leads}</strong>
            <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>Leads<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg></span>
          </div>
          <div onClick={v.openAppts} title="See appointments" style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
            <strong style={{ fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.pHero.appts}</strong>
            <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>Appointments<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg></span>
          </div>
          <div onClick={v.openUp} title="See upcoming" style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
            <strong style={{ fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", color: "#F6B48A", fontVariantNumeric: "tabular-nums" }}>{v.pHero.up}</strong>
            <span style={{ display: "flex", alignItems: "center", gap: "2px", fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>Upcoming<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg></span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", paddingTop: "14px", borderTop: "1px solid rgba(255,255,255,.14)" }}>
          <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#D9C7BA" }}>Avg. reply time</span>
            <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#D9C7BA" }}>{v.pHero.replyNote}</small>
          </span>
          <strong style={{ fontSize: "calc(24px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em", color: v.pHero.replyFg, fontVariantNumeric: "tabular-nums" }}>{v.pHero.reply}</strong>
        </div>
      </div>
      <section style={{ padding: "16px", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", display: "flex", flexDirection: "column", gap: "12px" }}>
        <h2 style={{ margin: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650", letterSpacing: "-.01em" }}>Leads by status</h2>
        {(v.pStatus).map((b, b_i) => (<Fragment key={b_i}>
          <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 24px", alignItems: "center", gap: "10px" }}>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "#3F2B22" }}>{b.label}</span>
            <span style={{ height: "8px", borderRadius: "4px", background: "#F5EBE3", overflow: "hidden" }}>
              <i style={{ display: "block", height: "100%", width: b.w, borderRadius: "4px", background: b.c }}>
              </i>
            </span>
            <strong style={{ textAlign: "right", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</strong>
          </div>
        </Fragment>))}
      </section>
    </main>
    {!!(v.irOpen) && (<>
      <div onClick={v.irClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", userSelect: "none" }}>
            {(v.irMonths).map((m, m_i) => (<Fragment key={m_i}>
              <span onClick={m.pick} style={{ flex: "none", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${m.border}`, background: m.bg, color: m.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{m.label}</span>
            </Fragment>))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span onClick={v.irPrev} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>
            </span>
            <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.irTitle}</strong>
            <span onClick={v.irNext} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: v.irNextFg, cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
            {(v.irWk).map((w, w_i) => (<Fragment key={w_i}>
              <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>{w}</span>
            </Fragment>))}
          </div>
          <div onPointerMove={v.irMove} onPointerUp={v.irUp} onPointerLeave={v.irUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px", touchAction: "none", userSelect: "none" }}>
            {(v.irCells).map((c, c_i) => (<Fragment key={c_i}>
              <span data-t={c.t} onPointerDown={c.down} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: c.cur }}>
                <span data-t={c.t} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.weight, background: c.bg, color: c.fg, boxShadow: c.ring, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              </span>
            </Fragment>))}
          </div>
          <p style={{ margin: "0", fontSize: "calc(12px * var(--rv-type, 1))", color: "#806B60", textAlign: "center" }}>{v.irHint}</p>
          <span onClick={v.irApply} style={{ height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: v.irApplyBg, color: "#fff", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.irApplyLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.lsOpen) && (<>
      <div onClick={v.lsClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", height: v.lsH, boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 0 0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "0 20px" }}>
            <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.lsTitle}</strong>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{v.lsCount}</span>
          </div>
          {!!(v.lsEmpty) && (<>
            <p style={{ margin: "0", flex: "1", display: "grid", placeItems: "center", padding: "24px 20px", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "#806B60" }}>{v.lsEmptyText}</p>
          </>)}
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", padding: "0 20px" }}>
            {(v.lsRows).map((r, r_i) => (<Fragment key={r_i}>
              <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: r.rule, cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{r.ini}</span>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.phone}</small>
                  {!!(r.owner) && (<>
                    <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "#A8968B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.owner}</small>
                  </>)}
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#3F2B22" }}>{r.date}</span>
                  <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#806B60" }}>{r.time}</span>
                </div>
                <svg style={{ flex: "none", marginLeft: "-4px", color: "#C9B5A8" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </Fragment>))}
            {!!(v.lsHasRows) && (<>
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "16px 0 28px", borderTop: "1px solid #EBDDD2", fontSize: "calc(12px * var(--rv-type, 1))", color: "#B5A398" }}><span style={{ flex: "1", height: "1px", background: "#EBDDD2" }}>
                </span>End of list<span style={{ flex: "1", height: "1px", background: "#EBDDD2" }}>
                </span></div>
            </>)}
          </div>
        </div>
      </div>
    </>)}
    {!!(v.ctOpen) && (<>
      <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span onClick={v.ctBack} title="Back to list" aria-label="Back to list" style={{ flex: "none", width: "36px", height: "36px", marginLeft: "-8px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov7}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6">
                </path>
              </svg>
            </span>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "650" }}>{v.ctIni}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700" }}>{v.ctName}</strong>
            </div>
            <span onClick={v.ctEdit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                </path>
              </svg>Edit</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
            {(v.ctRows).map((r, r_i) => (<Fragment key={r_i}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "calc(14px * var(--rv-type, 1))" }}>
                <span style={{ flex: "none", color: "#806B60" }}>{r.k}</span>
                <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}><InfoValue v={r.v} href={r.href} /></strong>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.ctChat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
        </div>
      </div>
    </>)}
    {!!(v.cfOpen) && (<>
      <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>{v.cfStep}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
            <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Customer</strong>
            </span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>NAME <b style={{ color: "#A3371A" }}>*</b></span>
            <input value={v.cfName} onChange={v.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PHONE</span>
            <input value={v.cfPhone} onChange={v.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />
          </label>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
            <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>Property</strong>
            </span>
          </div>
          {!!(v.cfHas.type) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PROPERTY TYPE</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {(v.cfType).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
              </Fragment>))}
            </div>
          </div></>)}
          {!!(v.cfHas.size) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT SIZE</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
              {(v.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
              </Fragment>))}
            </div>
          </div></>)}
          {!!(v.cfHas.loc) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT LOCATION</span>
            <input value={v.cfLoc} onChange={v.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />
          </label></>)}
          {!!(v.cfHas.req) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>REQUIREMENT</span>
            <textarea value={v.cfReq} onChange={v.cfSetReq} placeholder={v.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none", resize: "none" }}>
            </textarea>
          </label></>)}
          {!!(v.cfHas.budget) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>BUDGET</span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3" }}>
              <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>RM</span>
              <input value={v.cfBudget} onChange={v.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />
            </span>
          </label></>)}
          {(v.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "#A3371A" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
<span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
        </div>
      </div>
    </>)}
  </>);
}
