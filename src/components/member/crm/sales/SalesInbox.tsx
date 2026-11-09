"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/inbox.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import { Phone4aEmpty, Phone4aInboxHead, Phone4aInboxRows } from "../shared/phone4a";
import type { InboxVM } from "./vm/inbox";
import type { ShellExtras } from "./vm/header";

/** Inbox: search, filter chips, rows (swipe for More), the More / Label sheets and the ad filter. */
export default function SalesInbox({ v }: { v: InboxVM & ShellExtras }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 0", display: "flex", flexDirection: "column", gap: "14px" }}>
      <Phone4aInboxHead v={v} />
      
      {!!(v.inboxToast) && (<>
        <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.inboxToast}</div>
      </>)}
      
      {!!(v.empty4) && (<Phone4aEmpty e={v.empty4} />)}<Phone4aInboxRows v={v} />
      {!!(v.moreOpen) && (<>
        <div onClick={v.closeMore} style={{ position: "absolute", inset: "0", zIndex: "10", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "var(--crm-cream-nav)", borderRadius: "24px 24px 0 0", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.moreLead.ini}</span>
              <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "var(--crm-ink)" }}>{v.moreLead.name}</strong>
              <span onClick={v.closeMore} title="Close" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 6 12 12M6 18 18 6">
                  </path>
                </svg>
              </span>
            </div>
            {!!(v.moreMain) && (<>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", padding: "0 16px" }}>
                {(v.moreItems).map((it, it_i) => (<Fragment key={it_i}>
                  <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "52px", borderTop: it.rule, fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d={it.icon}>
                      </path>
                    </svg>{it.label}</div>
                </Fragment>))}
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", padding: "0 16px" }}>
                <div onClick={v.moreBlock} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "52px", fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-oxblood)", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.6 5.6l12.8 12.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                    </path>
                  </svg>{v.moreBlockLabel}</div>
              </div>
            </>)}
            {!!(v.moreLabels) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span onClick={v.moreBackMain} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "36px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>Back</span>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>Label</strong>
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", padding: "0 16px" }}>
                {(v.labelItems).map((lb, lb_i) => (<Fragment key={lb_i}>
                  <div onClick={lb.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", borderTop: lb.rule, fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <span style={{ flex: "none", width: "12px", height: "12px", borderRadius: "50%", background: lb.dot }}>
                    </span>
                    <span style={{ flex: "1" }}>{lb.label}</span>
                    <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${lb.ring}`, background: lb.fill, display: "grid", placeItems: "center", color: "#fff" }}>
                      {!!(lb.on) && (<>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m5 12 5 5 9-10">
                          </path>
                        </svg>
                      </>)}
                    </span>
                    <span onClick={lb.edit} title="Edit label" style={{ flex: "none", width: "36px", height: "36px", marginRight: "-8px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                        </path>
                      </svg>
                    </span>
                  </div>
                </Fragment>))}
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid var(--crm-rule)", padding: "0 16px" }}>
                <div onClick={v.labelNew} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14">
                    </path>
                  </svg>New label</div>
              </div>
            </>)}
            {!!(v.moreLabelEdit) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span onClick={v.labelFormBack} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "36px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-rust)", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>Back</span>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "var(--crm-ink)" }}>{v.labelFormTitle}</strong>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Name</span>
                <input value={v.labelFormName} onChange={v.labelSetName} placeholder="e.g. Hot lead" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", borderRadius: "24px", border: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)", outline: "none" }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-muted)" }}>Colour</span>
                <div style={{ display: "flex", gap: "10px" }}>
                  {(v.labelSwatches).map((sw, sw_i) => (<Fragment key={sw_i}>
                    <span onClick={sw.pick} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", background: sw.c, border: `3px solid ${sw.ring}`, boxShadow: `0 0 0 1px ${sw.c}`, cursor: "pointer" }}>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <span onClick={v.labelSave} style={{ minHeight: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: v.labelSaveBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: v.labelSaveCur }}>Save</span>
              {!!(v.labelCanDelete) && (<>
                <span onClick={v.labelDelete} style={{ minHeight: "44px", display: "grid", placeItems: "center", color: "var(--crm-oxblood)", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Delete label</span>
              </>)}
            </>)}
          </div>
        </div>
      </>)}
    </main>
    {!!(v.adOpen) && (<>
      <div onClick={v.closeAd} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "82%", boxSizing: "border-box" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose an ad</h2>
            <span onClick={v.adClear} style={{ height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Clear</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", overflowY: "auto", scrollbarWidth: "none", minHeight: "0" }}>
            {(v.adList).map((a, a_i) => (<Fragment key={a_i}>
              <div onClick={a.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: a.rule, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${a.ring}`, background: a.fill, display: "grid", placeItems: "center", color: "#fff" }}>
                  {!!(a.on) && (<>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m5 12 5 5 9-10">
                      </path>
                    </svg>
                  </>)}
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "var(--crm-ink)" }}>{a.name}</span>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", color: a.chanFg }}>{a.chan}</span>
                </span>
                <span style={{ flex: "none", fontSize: "calc(13px * var(--rv-type, 1))", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{a.n} lead{a.s}{a.coldNote}</span>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.adSave} style={{ flex: "none", height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.adSaveLabel}</span>
        </div>
      </div>
    </>)}
  </>);
}
