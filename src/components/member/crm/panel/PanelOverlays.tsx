"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/overlays.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { OverlaysVM } from "./vm/overlays";

/** Undo bar, Send-to and Move sheets, Awaiting reply, View as, everyone's Contacts, Notifications. */
export default function PanelOverlays({ v }: { v: OverlaysVM }) {
  return (<>
            
    {!!(v.undoOn) && (<>
      <div onClick={v.undoClose} style={{ position: "absolute", inset: "0", zIndex: "9" }}>
      </div>
      <div style={{ position: "absolute", left: "14px", right: "14px", bottom: "96px", zIndex: "10", borderRadius: "16px", background: "#3F2B22", color: "#fff", boxShadow: "0 10px 28px rgba(63,43,34,.30)", overflow: "hidden", animation: "sheetUp 260ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 8px 12px 14px" }}>
          <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", background: "#387557", display: "grid", placeItems: "center" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="m5 12 5 5 9-10">
              </path>
            </svg>
          </span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
            <strong style={{ fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.undoText}</strong>
            <small style={{ fontSize: "12px", color: "#D9C7BA" }}>You can undo for {v.undoLeft}</small>
          </span>
          <span onClick={v.undoDo} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>Undo</span>
          <span onClick={v.undoClose} title="Dismiss" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#D9C7BA", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </div>
        <span style={{ display: "block", height: "3px", background: "rgba(255,255,255,.15)" }}>
          <i style={{ display: "block", height: "100%", width: v.undoPct, background: "#E9A27A", transition: "width 1s linear" }}>
          </i>
        </span>
      </div>
    </>)}
    {!!(v.sdOpen) && (<>
      <div onClick={v.sdClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Send {v.sdName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.sdAd}</p>
          {(v.sdGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>{g.name} · {g.n}</span>
              {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #EBDDD2", cursor: "pointer" }} data-x="1" className={H.hov3}>
                  <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: "16px", fontWeight: "650" }}>{o.label}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{o.sub}</small>
                  </span>
                  <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${o.ring}`, display: "grid", placeItems: "center" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: o.dot }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          <span onClick={v.sdConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.sdBtnBg, color: "#fff", fontSize: "16px", fontWeight: "650", textAlign: "center", cursor: v.sdBtnCur }}>{v.sdBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.mvOpen) && (<>
      <div onClick={v.mvClose} style={{ position: "absolute", inset: "0", zIndex: "11", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Move {v.mvName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.mvAd}</p>
          {(v.mvGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>{g.name} · {g.n}</span>
              {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid #EBDDD2", cursor: "pointer" }} data-x="1" className={H.hov3}>
                  <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: o.c }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                    <strong style={{ fontSize: "16px", fontWeight: "650" }}>{o.label}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{o.sub}</small>
                  </span>
                  <span style={{ flex: "none", width: "22px", height: "22px", boxSizing: "border-box", borderRadius: "50%", border: `1.5px solid ${o.ring}`, display: "grid", placeItems: "center" }}>
                    <span style={{ width: "12px", height: "12px", borderRadius: "50%", background: o.dot }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          <span onClick={v.mvConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.mvBtnBg, color: "#fff", fontSize: "16px", fontWeight: "650", textAlign: "center", cursor: v.mvBtnCur }}>{v.mvBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.attOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.closeAtt} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Insight</span>
        <h1 style={{ flex: "none", margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Awaiting reply</h1>
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "8px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "2px 20px" }}>
          {(v.attTabs).map((vi, vi_i) => (<Fragment key={vi_i}>
            <span onClick={vi.pick} style={{ flex: "none", height: "38px", padding: "0 8px 0 14px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${vi.bd}`, display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: vi.w, background: vi.bg, color: vi.fg, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}<em style={{ minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "grid", placeItems: "center", fontStyle: "normal", fontSize: "12px", fontWeight: "700", background: vi.nBg, color: vi.nFg }}>{vi.n}</em></span>
          </Fragment>))}
        </div>
        {(v.attGroups).map((g, g_i) => (<Fragment key={g_i}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 0", fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
              </span>{g.name} · {g.n}</span>
            {(g.items).map((l, l_i) => (<Fragment key={l_i}>
              <div onClick={l.open} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto 34px", gap: "10px", alignItems: "center", padding: "10px 0", borderTop: "1px solid #EBDDD2", cursor: "pointer" }}>
                <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650" }}>{l.ini}</span>
                <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</strong>
                  {!!(l.movedTo) && (<>
                    <span style={{ fontSize: "12px", fontWeight: "650", color: "#2E6B4C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>⇄ {l.movedTo}</span>
                  </>)}
                  {!!(l.notMoved) && (<>
                    <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.owner}</span>
                  </>)}
                </span>
                <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "1px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "700", color: g.c, whiteSpace: "nowrap" }}>{l.wait}</span>
                </span>
                <span onClick={l.move} title="Move to someone else" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                    </path>
                  </svg>
                </span>
              </div>
            </Fragment>))}
          </div>
        </Fragment>))}
        {!!(v.attEmpty) && (<>
          <p style={{ margin: "0", fontSize: "14px", color: "#806B60" }}>Nobody is waiting.</p>
        </>)}
      </div>
    </>)}
    {!!(v.vaOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.closeViewAs} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Profile</span>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 style={{ margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>View as</h1>
          <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45", color: "#806B60", textWrap: "pretty" }}>See the CRM exactly as this person sees it.</p>
        </div>
        <label style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", height: "54px", padding: "0 18px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #E9D3C3", background: "#fff", boxShadow: "0 4px 14px rgba(63,43,34,.06)" }}>
          <svg style={{ flex: "none", color: "#BD4A19" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35">
            </path>
          </svg>
          <input value={v.vaQ} onChange={v.vaSetQ} placeholder="Search name or title" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "16px", color: "#3F2B22" }} />
        </label>
        {(v.vaGroups).map((g, g_i) => (<Fragment key={g_i}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <span style={{ padding: "8px 0 4px", fontSize: "12px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" }}>{g.name} · {g.n}</span>
            {(g.people).map((p, p_i) => (<Fragment key={p_i}>
              <div onClick={p.pick} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "12px 0", borderTop: p.rule, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "48px", height: "48px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650" }}>{p.ini}</span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700", textTransform: "uppercase", letterSpacing: ".01em" }}>{p.name}</strong>
                  <small style={{ fontSize: "13px", color: "#806B60" }}>{p.title}</small>
                </span>
                <span style={{ flex: "none", fontSize: "15px", fontWeight: "650", color: "#BD4A19" }}>View</span>
              </div>
            </Fragment>))}
          </div>
        </Fragment>))}
        {!!(v.vaNone) && (<>
          <p style={{ margin: "0", padding: "12px 0", fontSize: "14px", color: "#806B60" }}>Nobody matches.</p>
        </>)}
      </div>
    </>)}
    {!!(v.pcOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FFFFFF", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span onClick={v.closePc} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Inbox</span>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em" }}>Contacts</h1>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "14px", background: "#F5EEE9" }}>
            <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m21 21-4.3-4.3M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z">
              </path>
            </svg>
            <input value={v.pcQ} onChange={v.setPcQ} placeholder="Search name or member" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
          </label>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "0 20px 24px" }}>
          {(v.pcRows).map((c, c_i) => (<Fragment key={c_i}>
            <div>
              {!!(c.hasHead) && (<>
                <div style={{ padding: "14px 0 4px", fontSize: "13px", fontWeight: "700", color: "#BD4A19" }}>{c.head}</div>
              </>)}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: c.rule }}>
                <div onClick={c.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: c.ownBg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "700" }}>{c.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0" }}>
                      <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "4px", height: "20px", padding: "0 7px", borderRadius: "10px", background: c.ownBg, fontSize: "11px", fontWeight: "700" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: c.wc }}>
                        </span>{c.who}</span>
                      <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{c.status} · {c.phone}</small>
                    </span>
                  </span>
                </div>
                <a href={c.tel} title="Call" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#387557", textDecoration: "none" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z">
                    </path>
                  </svg>
                </a>
              </div>
            </div>
          </Fragment>))}
          {!!(v.pcEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "14px", color: "#A8968B" }}>No one matches.</p>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.notifOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px", background: "#FBF7F3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span onClick={v.closeNotifs} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>Back</span>
            <span onClick={v.readAll} style={{ fontSize: "13px", fontWeight: "650", color: v.readAllFg, cursor: "pointer" }}>Mark all read</span>
          </div>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em" }}>Notifications</h1>
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", userSelect: "none" }}>
            {(v.nfChips).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 13px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                </span>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
            </Fragment>))}
          </div>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {(v.nfGroups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>{g.day}</span>
              <div style={{ borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>
                {(g.items).map((n, n_i) => (<Fragment key={n_i}>
                  <div onClick={n.tap} style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", gap: "12px", alignItems: "flex-start", padding: "14px", borderTop: n.rule, background: n.rowBg, cursor: "pointer" }}>
                    <span style={{ width: "40px", height: "40px", borderRadius: "12px", background: n.iBg, color: n.iFg, display: "grid", placeItems: "center" }}>
                      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                        <path d={n.icon}>
                        </path>
                      </svg>
                    </span>
                    <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <span style={{ fontSize: "14px", lineHeight: "1.4", color: "#3F2B22", textWrap: "pretty" }}><strong style={{ fontWeight: "700" }}>{n.who}</strong> {n.text} <strong style={{ fontWeight: "700" }}>{n.lead}</strong>{n.tail}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        <span style={{ padding: "2px 8px", borderRadius: "6px", background: n.iBg, color: n.iFg, fontSize: "11px", fontWeight: "700" }}>{n.tag}</span>
                        {!!(n.extra) && (<>
                          <span style={{ fontSize: "12px", color: "#806B60" }}>{n.extra}</span>
                        </>)}
                      </span>
                    </span>
                    <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                      <small style={{ fontSize: "12px", color: "#A8968B", whiteSpace: "nowrap" }}>{n.at}</small>
                      <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: n.dot }}>
                      </span>
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </div>
          </Fragment>))}
          {!!(v.nfEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "14px", color: "#A8968B" }}>No notifications here.</p>
          </>)}
        </div>
      </div>
    </>)}
  </>);
}
