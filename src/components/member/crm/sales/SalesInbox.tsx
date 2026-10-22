"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Revenue View.dc.html (3b) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/inbox.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import { Phone4aChip, Phone4aEmpty } from "../shared/phone4a";
import { Ic } from "../shared/icons4a";
import type { InboxVM } from "./vm/inbox";
import type { ShellExtras } from "./vm/header";

/** Inbox: search, filter chips, rows (swipe for More), the More / Label sheets and the ad filter. */
export default function SalesInbox({ v }: { v: InboxVM & ShellExtras }) {
  return (<>
            
    <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "-2px" }}>
        <h1 style={{ flex: "1 0 auto", margin: "0", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(32.61px * var(--rv-type, 1))", fontWeight: "500", letterSpacing: "-0.025em", lineHeight: "1.2" }}>Inbox</h1>
        
        {!!(v.tb) && (<>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", flex: "none" }}>
          {!!(v.tm.on) && (<>
            <span onClick={v.tm.swap} title={v.tm.title} aria-label={v.tm.title} style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", boxSizing: "border-box", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", cursor: "pointer" }}><Ic name={v.tm.label === "Team" ? "users" : "user-round"} size={18} /></span>
          </>)}
          <span onClick={v.exitCrm} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="house" size={18} /></span>
          <span onClick={v.tb.open} title="Notifications" aria-label={v.tb.has ? `Notifications · ${v.tb.n} new` : "Notifications"} style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)", cursor: "pointer" }}><Ic name="bell" size={18} />{!!(v.tb.has) && (<span style={{ position: "absolute", top: "8px", right: "9px", width: "8px", height: "8px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid #fff" }} />)}</span>
          </span>
        </>)}
      </div>
      <div style={{ flex: "none", display: "flex", gap: "8px" }}><span onClick={v.openAd} style={{ flex: "0 1 auto", minWidth: "0", maxWidth: "170px", height: "40px", padding: "0 12px", boxSizing: "border-box", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px", fontSize: "calc(14.13px * var(--rv-type, 1))", fontWeight: "500", whiteSpace: "nowrap", background: "var(--crm-cream)", color: "var(--crm-ink)", cursor: "pointer" }}><span style={{ minWidth: "0", overflow: "hidden", textOverflow: "ellipsis" }}>{v.adLabel}</span><Ic name="chevron-down" size={13} /></span><label style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px", boxSizing: "border-box", borderRadius: "20px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
          </path>
        </svg>
        <input value={v.q} onChange={v.setQ} placeholder="Search name or message" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "calc(16px * var(--rv-type, 1))", color: "var(--crm-ink)" }} />
        {!!(v.q) && (<>
          <span onClick={v.clearQ} title="Clear" style={{ width: "28px", height: "28px", display: "grid", placeItems: "center", cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </>)}
      </label></div>
      {!!(v.inboxToast) && (<>
        <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", zIndex: "6", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff", fontSize: "calc(14px * var(--rv-type, 1))", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.inboxToast}</div>
      </>)}
      <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", cursor: "grab", userSelect: "none" }}>
        {(v.chips3b).map((c, c_i) => (<Fragment key={c_i}>
          <Phone4aChip label={c.label} count={c.n} on={c.on} hot={c.label === "Attention"} onClick={c.pick} />
        </Fragment>))}
      </div>
      {!!(v.empty4) && (<Phone4aEmpty e={v.empty4} />)}<section style={{ flex: "none", margin: "-4px -20px 0" }}>
        {(v.leadsView).map((l, l_i) => (<Fragment key={l_i}>
          <div data-inbox-row="1" style={{ position: "relative", overflow: "hidden", borderTop: "1px solid var(--crm-rule-soft)" }}>
            {!!(l.canRead) && (<span onClick={l.read} style={{ position: "absolute", top: "0", bottom: "0", left: "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-ink-soft)", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7l9 6 9-6M3 7v10h18V7M3 7l9-4 9 4" /></svg>{l.readLabel}</span>)}
            <span onClick={l.pin} style={{ position: "absolute", top: "0", bottom: "0", left: l.canRead ? "84px" : "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-faint)", color: "#fff", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3-1-6Z" /></svg>{l.pinLabel}</span>
            {!!(l.canAssign) && (<span onClick={l.assign} style={{ position: "absolute", top: "0", bottom: "0", right: "84px", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-amber)", color: "var(--crm-deep)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" /></svg>Assign</span>)}
            <span onClick={l.more} style={{ opacity: l.moreOp, transition: "opacity 120ms", position: "absolute", top: "0", bottom: "0", right: "0", width: "84px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "4px", background: "var(--crm-ink)", color: "var(--crm-on-light)", fontSize: "calc(13px * var(--rv-type, 1))", fontWeight: "600", cursor: "pointer" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h.01M12 12h.01M19 12h.01">
                </path>
              </svg>More</span>
            <div onClick={l.open} onPointerDown={l.down} onPointerMove={l.move} onPointerUp={l.up} onPointerCancel={l.cancel} onContextMenu={l.noMenu} style={{ WebkitTouchCallout: "none", position: "relative", display: "flex", gap: "12px", padding: "13px 20px", background: "#fff", transform: `translateX(${l.tx})`, transition: "transform 220ms cubic-bezier(.2,.8,.2,1)", touchAction: "pan-y", userSelect: "none", cursor: "pointer" }}>
              <span style={{ position: "absolute", right: `calc(${l.iconRight} + 20px)`, top: "50%", transform: "translateY(-50%)", display: "flex", gap: "6px", color: "var(--crm-muted)" }}>
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
                <span style={{ position: "absolute", right: "20px", top: "50%", transform: "translateY(-50%)", minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--crm-rust)", color: "#fff", fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "600" }}>{l.unread}</span>
              </>)}
              <span style={{ flex: "none", position: "relative", width: "48px", height: "48px" }}>
                <span style={{ width: "48px", height: "48px", borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", background: l.avBg, color: l.avFg, fontFamily: "var(--font-display-rv), 'Inter Tight', Inter, sans-serif", fontSize: "calc(16.3px * var(--rv-type, 1))", fontWeight: "500" }}>{l.ini}</span>
                <span title={l.chanName} style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "18px", height: "18px", boxSizing: "border-box", borderRadius: "50%", border: "2px solid #fff", background: l.chanFg, color: "#fff", display: "grid", placeItems: "center" }}>
                  <Ic name={l.chanIc} size={10} sw={2.4} />
                </span>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0", flex: "1" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }}>
                    <strong style={{ fontSize: "calc(17.39px * var(--rv-type, 1))", fontWeight: l.nameW, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>
                    {!!(l.ownerTag) && (<>
                      <span style={{ flex: "none", padding: "1px 7px", borderRadius: "6px", background: l.ownerC, color: "#fff", fontSize: "max(10px, calc(10px * var(--rv-type, 1)))", fontWeight: "700" }}>{l.ownerTag}</span>
                    </>)}
                  </span>
                  <span style={{ flex: "none", fontVariantNumeric: "tabular-nums", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", color: l.whenC }}>{l.when}</span>
                </span>
                <span style={{ fontSize: "calc(13.04px * var(--rv-type, 1))", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.ad}</span>
                <span style={{ fontSize: "calc(15.22px * var(--rv-type, 1))", color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: l.padR }}>{l.preview}</span>
                <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "10px", marginTop: "1px" }}>
                  {!!(l.urgShow) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: l.urgW, color: l.urg3b }}><Ic name={l.urgIc} size={12} />{l.urg}</span>
                  </>)}
                  {!!(l.firstVisit) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-brown)" }}><Ic name="calendar-check" size={12} />1st visit {l.firstVisit}</span>
                  </>)}
                  {!!(l.cold) && (<>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", fontSize: "calc(13.04px * var(--rv-type, 1))", fontWeight: "500", color: "var(--crm-faint)", whiteSpace: "nowrap" }}><Ic name="lock" size={12} />Cold lead</span>
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
