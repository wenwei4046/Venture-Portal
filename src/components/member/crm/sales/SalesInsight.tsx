"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/insight.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { InfoValue } from "../shared/AdLink";
import { Phone4aInsightMine } from "../shared/phone4a";
import type { InsightVM } from "./vm/insight";

/** Insight: Month / Week / Day / Range, the walnut hero and leads by status; Team | Me, the lists and Customer info. */
export default function SalesInsight({ v }: { v: InsightVM }) {
  return (<>
            
    <Phone4aInsightMine v={v} />
    {!!(v.irOpen) && (<>
      <div onClick={v.irClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", userSelect: "none" }}>
            {(v.irMonths).map((m, m_i) => (<Fragment key={m_i}>
              <span onClick={m.pick} style={{ flex: "none", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${m.border}`, background: m.bg, color: m.fg, display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{m.label}</span>
            </Fragment>))}
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span onClick={v.irPrev} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
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
              <span style={{ textAlign: "center", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>{w}</span>
            </Fragment>))}
          </div>
          <div onPointerMove={v.irMove} onPointerUp={v.irUp} onPointerLeave={v.irUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px", touchAction: "none", userSelect: "none" }}>
            {(v.irCells).map((c, c_i) => (<Fragment key={c_i}>
              <span data-t={c.t} onPointerDown={c.down} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: c.cur }}>
                <span data-t={c.t} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: c.weight, background: c.bg, color: c.fg, boxShadow: c.ring, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              </span>
            </Fragment>))}
          </div>
          <p style={{ margin: "0", fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", textAlign: "center" }}>{v.irHint}</p>
          <span onClick={v.irApply} style={{ height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: v.irApplyBg, color: "#fff", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.irApplyLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.lsOpen) && (<>
      <div onClick={v.lsClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", height: v.lsH, boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 0 0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "12px", padding: "0 20px" }}>
            <strong style={{ fontSize: "calc(19px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>{v.lsTitle}</strong>
            <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{v.lsCount}</span>
          </div>
          {!!(v.lsEmpty) && (<>
            <p style={{ margin: "0", flex: "1", display: "grid", placeItems: "center", padding: "24px 20px", textAlign: "center", fontSize: "calc(14px * var(--rv-type, 1))", color: "var(--crm-muted)" }}>{v.lsEmptyText}</p>
          </>)}
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", padding: "0 20px" }}>
            {(v.lsRows).map((r, r_i) => (<Fragment key={r_i}>
              <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: r.rule, cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650" }}>{r.ini}</span>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                  <small style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.phone}</small>
                  {!!(r.owner) && (<>
                    <small style={{ fontSize: "calc(11px * var(--rv-type, 1))", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.owner}</small>
                  </>)}
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
            {!!(v.lsHasRows) && (<>
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "16px 0 28px", borderTop: "1px solid var(--crm-rule)", fontSize: "calc(12px * var(--rv-type, 1))", color: "var(--crm-faint)" }}><span style={{ flex: "1", height: "1px", background: "var(--crm-rule)" }}>
                </span>End of list<span style={{ flex: "1", height: "1px", background: "var(--crm-rule)" }}>
                </span></div>
            </>)}
          </div>
        </div>
      </div>
    </>)}
    {!!(v.ctOpen) && (<>
      <div onClick={v.ctClose} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span onClick={v.ctBack} title="Back to list" aria-label="Back to list" style={{ flex: "none", width: "36px", height: "36px", marginLeft: "-8px", borderRadius: "50%", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }} className={H.hov7}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6">
                </path>
              </svg>
            </span>
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
