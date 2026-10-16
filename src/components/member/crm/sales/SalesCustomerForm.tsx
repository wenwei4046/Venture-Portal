"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/customer.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { CustomerFormVM } from "./vm/customer";

/** The customer form (name, phone, property, budget) — step 1 of a first booking, or Edit. */
export default function SalesCustomerForm({ v }: { v: CustomerFormVM }) {
  return (<>
              
    {!!(v.cfOpen) && (<>
      <div onClick={v.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
            <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>{v.cfStep}</span>
          </div>{!(v.cfPaged) && (<>
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
          </>)}{(v.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: ".04em", color: "#806B60", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "#A3371A" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "calc(15px * var(--rv-type, 1))", color: "#3F2B22", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
{!!(v.cfBack) && (<span onClick={v.cfBack} style={{ flex: "none", alignSelf: "center", padding: "6px 18px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>‹ Back</span>)}<span onClick={v.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cfSaveBg, color: "#fff", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", cursor: "pointer" }}>{v.cfSaveLabel}</span>
        </div>
      </div>
    </>)}
  </>);
}
