"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/inbox.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { InboxVM } from "./vm/inbox";
import type { ShellExtras } from "./vm/header";

/** Inbox: search, filter chips, rows (swipe for More), the More / Label sheets and the ad filter. */
export default function SalesInbox({ v }: { v: InboxVM & ShellExtras }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
        <h1 style={{ flex: "1 0 auto", margin: "0", fontSize: "calc(28px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>
        <span onClick={v.openAd} style={{ flex: "0 1 auto", minWidth: "0", width: "max-content", maxWidth: "200px", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "650", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
          <svg style={{ flex: "none", color: "#BD4A19" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6">
            </path>
          </svg>
          <span style={{ flex: "0 1 auto", minWidth: "0", width: "max-content", maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.adLabel}</span>
          <svg style={{ flex: "none", color: "#806B60" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6">
            </path>
          </svg>
        </span>
        {!!(v.tb) && (<>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none" }}>
          {!!(v.tm.on) && (<>
            <span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={v.tm.icon}>
                </path>
              </svg>
            </span>
          </>)}
          <span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#BD4A19", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9">
              </path>
            </svg>
          </span>
          <span onClick={v.tb.open} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
              </path>
            </svg>
            {!!(v.tb.has) && (<>
              <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{v.tb.n}</span>
            </>)}
          </span>
          </span>
        </>)}
      </div>
      <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "22px", background: "#F5EBE3", color: "#806B60" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
          </path>
        </svg>
        <input value={v.q} onChange={v.setQ} placeholder="Search name or message" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "#3F2B22" }} />
        {!!(v.q) && (<>
          <span onClick={v.clearQ} title="Clear" style={{ width: "28px", height: "28px", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </>)}
      </label>
      {!!(v.inboxToast) && (<>
        <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.inboxToast}</div>
      </>)}
      <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -16px", padding: "0 16px", cursor: "grab", userSelect: "none" }}>
        {(v.chips3b).map((c, c_i) => (<Fragment key={c_i}>
          <span onClick={c.pick} style={{ flex: "none", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", boxSizing: "border-box", padding: "0 13px", borderRadius: "17px", border: `1px solid ${c.border}`, background: c.bg, color: c.fg, fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: c.weight }}>{!!(c.dot) && (<>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: c.dot }}>
              </span>
            </>)}{c.label} <small style={{ fontVariantNumeric: "tabular-nums", fontSize: "calc(11px * var(--rv-type, 1))", opacity: ".7" }}>{c.n}</small></span>
        </Fragment>))}
      </div>
      <section style={{ flex: "none", borderTop: "1px solid rgb(235 221 210)", paddingTop: "10px" }}>
        {(v.leadsView).map((l, l_i) => (<Fragment key={l_i}>
          <div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: l.rule }}>
            {!!(l.canRead) && (<span onClick={l.read} style={{ position: "absolute", top: "0", bottom: "0", left: "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#2F8FD8", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9 6 9-6M3 7v10h18V7M3 7l9-4 9 4" /></svg>{l.readLabel}</span>)}
            <span onClick={l.pin} style={{ position: "absolute", top: "0", bottom: "0", left: l.canRead ? "84px" : "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#A8968B", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></svg>{l.pinLabel}</span>
            {!!(l.canAssign) && (<span onClick={l.assign} style={{ position: "absolute", top: "0", bottom: "0", right: "84px", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#2F6FB5", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3" /></svg>Assign</span>)}
            <span onClick={l.more} style={{ opacity: l.moreOp, transition: "opacity 120ms", position: "absolute", top: "0", bottom: "0", right: "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "#806B60", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h.01M12 12h.01M19 12h.01">
                </path>
              </svg>More</span>
            <div onClick={l.open} onPointerDown={l.down} onPointerMove={l.move} onPointerUp={l.up} onPointerCancel={l.cancel} onContextMenu={l.noMenu} style={{ WebkitTouchCallout: "none", position: "relative", display: "flex", gap: "12px", padding: "14px 0", background: "#fff", transform: `translateX(${l.tx})`, transition: "transform 220ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y", userSelect: "none", cursor: "pointer" }}>
              <span style={{ position: "absolute", right: l.iconRight, top: "50%", transform: "translateY(-50%)", display: "flex", gap: "6px", color: "#806B60" }}>
                {!!(l.isMuted) && (<>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-label="Muted">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4M3 3l18 18">
                    </path>
                  </svg>
                </>)}
                {!!(l.isPinned) && (<>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-label="Pinned">
                    <path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z">
                    </path>
                  </svg>
                </>)}
              </span>
              {!!(l.unread) && (<>
                <span style={{ position: "absolute", right: "0", top: "50%", transform: "translateY(-50%)", minWidth: "20px", height: "20px", padding: "0 7px", boxSizing: "border-box", borderRadius: "10px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#BD4A19", color: "#fff", fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "600" }}>{l.unread}</span>
              </>)}
              <span style={{ flex: "none", position: "relative", width: "44px", height: "44px" }}>
                <span style={{ width: "44px", height: "44px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "#FFF0E4", color: "#BD4A19", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600" }}>{l.ini}</span>
                <span title={l.chanName} style={{ position: "absolute", right: "-3px", bottom: "-3px", width: "20px", height: "20px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: l.chanFg, color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                    <path d={l.chanIcon}>
                    </path>
                  </svg>
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: "0", flex: "1" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }}>
                    <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>
                    {!!(l.ownerTag) && (<>
                      <span style={{ flex: "none", padding: "1px 7px", borderRadius: "6px", background: l.ownerC, color: "#fff", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{l.ownerTag}</span>
                    </>)}
                  </span>
                  <span style={{ flex: "none", fontVariantNumeric: "tabular-nums", fontSize: "calc(11px * var(--rv-type, 1))", color: "rgb(128 107 96)" }}>{l.when}</span>
                </span>
                <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#387557" }}>{l.ad}</span>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", color: "rgb(128 107 96)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: l.padR }}>{l.preview}</span>
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "4px" }}>
                  {!!(l.urgShow) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "calc(12px * var(--rv-type, 1))", fontWeight: "600", color: l.urg3b }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: l.urg3b }}>
                      </span>{l.urg}</span>
                  </>)}
                  {!!(l.firstVisit) && (<>
                    <span style={{ fontSize: "calc(12px * var(--rv-type, 1))", color: "#A8968B" }}>1st visit {l.firstVisit}</span>
                  </>)}
                  {!!(l.cold) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", padding: "2px 6px", borderRadius: "4px", background: "#E3EAF1", color: "#3E5C7A", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 2v20M4.9 4.9l14.2 14.2M2 12h20M4.9 19.1 19.1 4.9">
                        </path>
                      </svg>Cold lead</span>
                  </>)}
                  {(l.tags).map((tg, tg_i) => (<Fragment key={tg_i}>
                    <span style={{ padding: "2px 6px", borderRadius: "4px", background: tg.c, color: "#fff", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700", letterSpacing: ".04em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{tg.t}</span>
                  </Fragment>))}
                </span>
              </span>
            </div>
          </div>
        </Fragment>))}
      </section>
      {!!(v.moreOpen) && (<>
        <div onClick={v.closeMore} style={{ position: "absolute", inset: "0", zIndex: "10", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#FBF6F2", borderRadius: "24px 24px 0 0", padding: "16px 16px 30px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#FFF0E4", color: "#BD4A19", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650" }}>{v.moreLead.ini}</span>
              <strong style={{ flex: "1", minWidth: "0", fontSize: "calc(17px * var(--rv-type, 1))", fontWeight: "700", color: "#3F2B22" }}>{v.moreLead.name}</strong>
              <span onClick={v.closeMore} title="Close" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 6 12 12M6 18 18 6">
                  </path>
                </svg>
              </span>
            </div>
            {!!(v.moreMain) && (<>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", padding: "0 16px" }}>
                {(v.moreItems).map((it, it_i) => (<Fragment key={it_i}>
                  <div onClick={it.go} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "52px", borderTop: it.rule, fontSize: "calc(16px * var(--rv-type, 1))", color: "#3F2B22", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                      <path d={it.icon}>
                      </path>
                    </svg>{it.label}</div>
                </Fragment>))}
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", padding: "0 16px" }}>
                <div onClick={v.moreBlock} style={{ display: "flex", alignItems: "center", gap: "14px", minHeight: "52px", fontSize: "calc(16px * var(--rv-type, 1))", color: "#A3371A", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.6 5.6l12.8 12.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                    </path>
                  </svg>{v.moreBlockLabel}</div>
              </div>
            </>)}
            {!!(v.moreLabels) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span onClick={v.moreBackMain} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "36px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "#BD4A19", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>Back</span>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "#3F2B22" }}>Label</strong>
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", padding: "0 16px" }}>
                {(v.labelItems).map((lb, lb_i) => (<Fragment key={lb_i}>
                  <div onClick={lb.go} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", borderTop: lb.rule, fontSize: "calc(16px * var(--rv-type, 1))", color: "#3F2B22", cursor: "pointer" }}>
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
                    <span onClick={lb.edit} title="Edit label" style={{ flex: "none", width: "36px", height: "36px", marginRight: "-8px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                        </path>
                      </svg>
                    </span>
                  </div>
                </Fragment>))}
              </div>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", padding: "0 16px" }}>
                <div onClick={v.labelNew} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "600", color: "#BD4A19", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14">
                    </path>
                  </svg>New label</div>
              </div>
            </>)}
            {!!(v.moreLabelEdit) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span onClick={v.labelFormBack} style={{ display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "36px", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "#BD4A19", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>Back</span>
                <strong style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "650", color: "#3F2B22" }}>{v.labelFormTitle}</strong>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>Name</span>
                <input value={v.labelFormName} onChange={v.labelSetName} placeholder="e.g. Hot lead" style={{ height: "48px", boxSizing: "border-box", padding: "0 16px", borderRadius: "24px", border: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "#3F2B22", outline: "none" }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", color: "#806B60" }}>Colour</span>
                <div style={{ display: "flex", gap: "10px" }}>
                  {(v.labelSwatches).map((sw, sw_i) => (<Fragment key={sw_i}>
                    <span onClick={sw.pick} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", background: sw.c, border: `3px solid ${sw.ring}`, boxShadow: `0 0 0 1px ${sw.c}`, cursor: "pointer" }}>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <span onClick={v.labelSave} style={{ minHeight: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: v.labelSaveBg, color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: v.labelSaveCur }}>Save</span>
              {!!(v.labelCanDelete) && (<>
                <span onClick={v.labelDelete} style={{ minHeight: "44px", display: "grid", placeItems: "center", color: "#A3371A", fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Delete label</span>
              </>)}
            </>)}
          </div>
        </div>
      </>)}
    </main>
    {!!(v.adOpen) && (<>
      <div onClick={v.closeAd} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px", maxHeight: "82%", boxSizing: "border-box" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
            <h2 style={{ margin: "0", fontSize: "calc(20px * var(--rv-type, 1))", fontWeight: "700", letterSpacing: "-.02em" }}>Choose an ad</h2>
            <span onClick={v.adClear} style={{ height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}>Clear</span>
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
                  <span style={{ fontSize: "calc(15px * var(--rv-type, 1))", fontWeight: "600", color: "#3F2B22" }}>{a.name}</span>
                  <span style={{ fontSize: "calc(11px * var(--rv-type, 1))", fontWeight: "700", color: a.chanFg }}>{a.chan}</span>
                </span>
                <span style={{ flex: "none", fontSize: "calc(13px * var(--rv-type, 1))", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{a.n} lead{a.s}{a.coldNote}</span>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.adSave} style={{ flex: "none", height: "48px", borderRadius: "24px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "calc(16px * var(--rv-type, 1))", fontWeight: "650", cursor: "pointer" }}>{v.adSaveLabel}</span>
        </div>
      </div>
    </>)}
  </>);
}
