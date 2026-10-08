"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/overview.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { OverviewVM } from "./vm/overview";

/** Insight: greeting, Control panel | My CRM, period, the hero, Comparison, Needs your action, Team performance — and the date sheet. */
export default function PanelOverview({ v }: { v: OverviewVM }) {
  return (<>
            
    {!!(v.onOverview) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 36px", display: "flex", flexDirection: "column", gap: "22px" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px", padding: "0 4px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span onClick={v.exitApp} title="Back to Revenue app" style={{ flex: "none", width: "38px", height: "38px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>
            </span>
            <span style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "13px", fontWeight: "700", letterSpacing: ".16em", color: "#3F2B22" }}>HOUZS VENTURE</span>
              <span style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19", marginTop: "2px" }}>CRM</span>
            </span>
          </span>
          <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "38px", height: "38px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.meIni}</span>
          </span>
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "4px 4px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
            <h1 style={{ margin: "0", fontSize: "26px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Hello, {v.meFirst}</h1>
            {!!(v.rdToggle) && (<>
              <div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F0E6DE" }}>
                <span onClick={v.toPanel} style={{ height: "28px", padding: "0 10px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", background: v.rdPanelBg, color: v.rdPanelFg, boxShadow: v.rdPanelSh, cursor: "pointer" }}>Control panel</span>
                <span onClick={v.toCrm} style={{ height: "28px", padding: "0 10px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", background: v.rdCrmBg, color: v.rdCrmFg, boxShadow: v.rdCrmSh, cursor: "pointer" }}>My CRM</span>
              </div>
            </>)}
          </div>
          <span style={{ fontSize: "13px", color: "#806B60" }}>{v.todayLabel} · {v.meTitle} · All access</span>
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <div onClick={v.ovOpenPeriod} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }}>
              <svg style={{ flex: "none", color: "#BD4A19" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5h14v15H5V5Zm3-3v5m8-5v5M5 10h14">
                </path>
              </svg>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "16px", fontWeight: "700", color: "#3F2B22", whiteSpace: "nowrap" }}>{v.adPerT}</strong>
                <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.adPerD}</span>
              </span>
              <svg style={{ flex: "none", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6">
                </path>
              </svg>
            </div>
          </div>
        </div>
        <div style={{ flex: "none", padding: "24px 22px", borderRadius: "26px", background: "linear-gradient(150deg, #EE9A63 0%, #D9672F 45%, #B9461A 100%)", boxShadow: "0 12px 28px rgba(189,74,25,.30)", color: "#fff", display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,.88)" }}>{v.heroLabel}</span>
          </div>
          <strong style={{ fontSize: "38px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.05", fontVariantNumeric: "tabular-nums" }}>{v.all.rate} <span style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.02em" }}>appt rate</span></strong>
          <span style={{ fontSize: "13px", color: "rgba(255,255,255,.88)" }}>{v.all.booked} of {v.all.leads} leads booked a visit</span>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,.25)" }}>
            {(v.heroStats).map((s, s_i) => (<Fragment key={s_i}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px", borderLeft: s.bl }}>
                <span style={{ fontSize: "13px", color: "rgba(255,255,255,.88)" }}>{s.label}</span>
                <strong style={{ fontSize: "19px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{s.v}</strong>
              </div>
            </Fragment>))}
          </div>
        </div>
        {!!(v.cmpOn) && (<>
          <section style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "700" }}>Comparison</h2>
              {!!(v.cmpHas) && (<>
                <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                  <span onClick={v.cmpOff} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Clear</span>
                  <span onClick={v.cmpToggle} style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>{v.cmpToggleLbl}<svg style={{ transform: `rotate(${v.cmpRot})` }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6">
                      </path>
                    </svg></span>
                </span>
              </>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", borderRadius: "12px", background: "#FBF7F3", fontSize: "13px" }}>
              <span onClick={v.ovOpenPeriod} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#3F2B22", fontWeight: "600", cursor: "pointer" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#BD4A19" }}>
                </span>
                <span style={{ flex: "1", minWidth: "0" }}>{v.cmpA}</span>
                <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
              </span>
              {!!(v.cmpHas) && (<>
                <span onClick={v.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#806B60", cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#C9A48C" }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0" }}>vs {v.cmpB}</span>
                  <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
                </span>
              </>)}
              {!!(v.cmpNone) && (<>
                <span onClick={v.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#BD4A19", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="M12 5v14M5 12h14">
                    </path>
                  </svg>Choose a period to compare</span>
              </>)}
            </div>
            {!!(v.cmpOpen) && (<>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                {(v.cmpRows).map((r, r_i) => (<Fragment key={r_i}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "14px", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
                    <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase", color: "#806B60" }}>{r.label}</span>
                    <strong style={{ fontSize: "26px", fontWeight: "700", letterSpacing: "-.02em", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{r.vA}</strong>
                    <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                      <span style={{ fontSize: "12px", color: "#A57F68", fontVariantNumeric: "tabular-nums" }}>vs {r.vB}</span>
                      <span style={{ padding: "1px 6px", borderRadius: "6px", background: r.dBg, color: r.dFg, fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{r.delta}</span>
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </>)}
          </section>
        </>)}
        <h2 style={{ flex: "none", margin: "4px 4px -10px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Needs your action</h2>
        <section style={{ flex: "none", padding: "4px 16px", borderRadius: "20px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column" }}>
          <div onClick={v.goAssign} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 0", borderBottom: "1px solid #EBDDD2", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "12px", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "15px", fontWeight: "650" }}>Organic Leads</strong>
              <small style={{ fontSize: "12px", color: "#806B60" }}>You assign these</small>
            </span>
            <em style={{ fontStyle: "normal", minWidth: "26px", height: "26px", padding: "0 8px", boxSizing: "border-box", borderRadius: "13px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "700" }}>{v.waitingN}</em>
            <svg style={{ color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
          <div onClick={v.openAtt} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 0", cursor: "pointer" }}>
            <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "12px", background: "#FBE7E2", color: "#A3371A", display: "grid", placeItems: "center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "15px", fontWeight: "650" }}>Awaiting reply</strong>
              <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ display: "flex" }}>
                  {(v.attOwners).map((o, o_i) => (<Fragment key={o_i}>
                    <span title={o.name} style={{ width: "22px", height: "22px", marginLeft: o.ml, borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "9px", fontWeight: "700", boxShadow: "0 0 0 2px #fff" }}>{o.ini}</span>
                  </Fragment>))}
                </span>
                <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.attOwnersText}</small>
              </span>
            </span>
            <em style={{ fontStyle: "normal", minWidth: "26px", height: "26px", padding: "0 8px", boxSizing: "border-box", borderRadius: "13px", background: "#A3371A", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "700" }}>{v.awaitN}</em>
            <svg style={{ color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
        </section>
        <h2 style={{ flex: "none", margin: "4px 4px -10px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Team performance</h2>
        <section style={{ flex: "none", padding: "20px 18px 16px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "6px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "baseline", paddingBottom: "6px" }}>
            <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "650" }}>Teams</h2>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Leads</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Appt</span>
            <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Show-up</span>
          </div>
          {(v.teamRows).map((t, t_i) => (<Fragment key={t_i}>
            <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid #EBDDD2" }}>
              <div onClick={t.toggle} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "center", padding: "12px 0", cursor: t.cur }}>
                <span style={{ minWidth: "0", display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "50%", background: t.c, color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{t.lead}</span>
                  <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "15px", fontWeight: "650" }}>{t.name}{!!(t.canOpen) && (<>
                        <svg style={{ color: "#806B60", transform: `rotate(${t.rot})`, transition: "transform 150ms" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </>)}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.who}</small>
                  </span>
                </span>
                <span style={{ textAlign: "right", fontSize: "15px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{t.leads}</span>
                <span style={{ textAlign: "right", fontSize: "14px", fontVariantNumeric: "tabular-nums" }}>{t.appt}</span>
                <span style={{ textAlign: "right", fontSize: "14px", fontVariantNumeric: "tabular-nums" }}>{t.show}</span>
              </div>
              {!!(t.open) && (<>
                {(t.people).map((p, p_i) => (<Fragment key={p_i}>
                  <div onClick={p.open} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "center", padding: `10px 0 10px ${p.pad}`, borderTop: "1px dashed #EBDDD2", cursor: "pointer" }} className={H.hov3}>
                    <span style={{ minWidth: "0", display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", background: p.aBg, color: p.aFg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650" }}>{p.ini}</span>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column" }}>
                        <strong style={{ fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                        <small style={{ fontSize: "11px", color: "#806B60" }}>{p.tag}<b style={{ fontWeight: "650", color: "#A3371A" }}>{p.waiting}</b></small>
                      </span>
                    </span>
                    <span style={{ textAlign: "right", fontSize: "14px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{p.leads}</span>
                    <span style={{ textAlign: "right", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{p.appt}</span>
                    <span style={{ textAlign: "right", fontSize: "13px", fontVariantNumeric: "tabular-nums" }}>{p.show}</span>
                  </div>
                </Fragment>))}
              </>)}
            </div>
          </Fragment>))}
        </section>
      </main>
      {!!(v.ovrOpen) && (<>
        <div onClick={v.ovrClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
              <span onClick={v.ovrClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="m6 6 12 12M6 18 18 6">
                  </path>
                </svg>
              </span>
            </div>
            {!!(v.ovrShowTabs) && (<>
              <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "14px", background: "#F5EBE3" }}>
                {(v.ovrTabs).map((t, t_i) => (<Fragment key={t_i}>
                  <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", fontSize: "14px", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                    </span>{t.label}</span>
                </Fragment>))}
              </div>
            </>)}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
              {(v.ovrPresets).map((p, p_i) => (<Fragment key={p_i}>
                <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "#FBF7F3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                <span onClick={v.ovrPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-.01em" }}>{v.ovrTitle}</strong>
                <span onClick={v.ovrNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {(v.ovrWk).map((w, w_i) => (<Fragment key={w_i}>
                  <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>{w}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                {(v.ovrCells).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                    <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                  </span>
                </Fragment>))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ovrFromBd}` }}>
                <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ovrFromLbl}</small>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ovrFrom}</strong>
              </span>
              <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14m-5-5 5 5-5 5">
                </path>
              </svg>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ovrToBd}` }}>
                <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ovrToLbl}</small>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ovrTo}</strong>
              </span>
            </div>
            <span onClick={v.ovrApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.ovrApplyBg, color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{v.ovrApplyLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
  </>);
}
