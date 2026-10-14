"use client";
/* eslint-disable react/no-unescaped-entities -- generated from the design; its text keeps its own apostrophes */

// GENERATED from docs/design/rev1011/prototypes/Principal Panel.dc.html (rev 1011) by tools/crm-design/gen-panel-1011.cjs —
// markup and styles exactly as designed. Behaviour lives in ./vm/app.ts (and the vm/*.ts it groups). To change the look,
// change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import { PickEditor } from "../shared/pick-editor";
import { MediaAlbum, PdfCard, VoiceNote } from "../shared/chat-media-parts";
import type { PanelAppVM } from "./vm/app";

/** The whole Control panel: the top bar, every tab, every sheet and page, the toast and the bottom bar. */
export default function PanelApp({ v }: { v: PanelAppVM }) {
  return (<>
    {!!(v.topBar) && (<>
      <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", minHeight: "44px", padding: "4px 14px 0 20px" }}>
        {!!(v.hd.showHead) && (<>
          <span onClick={v.hd.back} style={{ display: "flex", alignItems: "center", gap: "4px", height: "44px", color: "#BD4A19", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>{v.hd.backLabel}</span>
        </>)}
        <span style={{ flex: "1" }}>
        </span>
        {!!(v.dirTop) && (<>
          <div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F0E6DE" }}>
            <span style={{ height: "28px", padding: "0 14px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", background: "#fff", color: "#3F2B22", boxShadow: "0 1px 3px rgba(63,43,34,.14)" }}>Team</span>
            <span onClick={v.dirMine} style={{ height: "28px", padding: "0 14px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>Mine</span>
          </div>
        </>)}
        {!!(v.bellTop) && (<>
          <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
              </path>
            </svg>
            {!!(v.bl.notifUnread) && (<>
              <span style={{ position: "absolute", top: "4px", right: "3px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", border: "2px solid #FBF7F3", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
            </>)}
          </span>
        </>)}
      </div>
    </>)}
    {!!(v.show.ov) && (<>
      {!!(v.ov.onOverview) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "10px 20px 36px", display: "flex", flexDirection: "column", gap: "22px" }}>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "0 4px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <h1 style={{ flex: "1", margin: "0", fontSize: "26px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Hello, {v.ov.meFirst}</h1>
              {!!(v.bellIn) && (<>
                <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                    </path>
                  </svg>
                  {!!(v.bl.notifUnread) && (<>
                    <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                  </>)}
                </span>
              </>)}
              <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.ov.meIni}</span>
            </div>
            <span style={{ fontSize: "13px", color: "#806B60" }}>{v.ov.todayLabel} · {v.ov.meTitle} · {v.accessLbl}</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div onClick={v.ov.ovOpenPeriod} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }}>
                <svg style={{ flex: "none", color: "#BD4A19" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5h14v15H5V5Zm3-3v5m8-5v5M5 10h14">
                  </path>
                </svg>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700", color: "#3F2B22", whiteSpace: "nowrap" }}>{v.ov.adPerT}</strong>
                  <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ov.adPerD}</span>
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
              <span style={{ fontSize: "14px", fontWeight: "500", color: "rgba(255,255,255,.88)" }}>{v.ov.heroLabel}</span>
            </div>
            <strong style={{ fontSize: "38px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.05", fontVariantNumeric: "tabular-nums" }}>{v.ov.all.rate} <span style={{ fontSize: "22px", fontWeight: "650", letterSpacing: "-.02em" }}>appt rate</span></strong>
            <span style={{ fontSize: "13px", color: "rgba(255,255,255,.88)" }}>{v.ov.all.booked} of {v.ov.all.leads} leads booked a visit</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "12px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,.25)" }}>
              {(v.ov.heroStats).map((s, s_i) => (<Fragment key={s_i}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 8px", borderLeft: s.bl }}>
                  <span style={{ fontSize: "13px", color: "rgba(255,255,255,.88)" }}>{s.label}</span>
                  <strong style={{ fontSize: "19px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{s.v}</strong>
                </div>
              </Fragment>))}
            </div>
          </div>
          {!!(v.ov.cmpOn) && (<>
            <section style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "700" }}>Comparison</h2>
                {!!(v.ov.cmpHas) && (<>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                    <span onClick={v.ov.cmpOff} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Clear</span>
                    <span onClick={v.ov.cmpToggle} style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>{v.ov.cmpToggleLbl}<svg style={{ transform: `rotate(${v.ov.cmpRot})` }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></span>
                  </span>
                </>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", borderRadius: "12px", background: "#FBF7F3", fontSize: "13px" }}>
                <span onClick={v.ov.ovOpenPeriod} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#3F2B22", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#BD4A19" }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ov.cmpA}</span>
                  <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
                </span>
                {!!(v.ov.cmpHas) && (<>
                  <span onClick={v.ov.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#806B60", cursor: "pointer" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#C9A48C" }}>
                    </span>
                    <span style={{ flex: "1", minWidth: "0" }}>vs {v.ov.cmpB}</span>
                    <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
                  </span>
                </>)}
                {!!(v.ov.cmpNone) && (<>
                  <span onClick={v.ov.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#BD4A19", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>Choose a period to compare</span>
                </>)}
              </div>
              {!!(v.ov.cmpOpen) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  {(v.ov.cmpRows).map((r, r_i) => (<Fragment key={r_i}>
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
          <h2 style={{ flex: "none", margin: "4px 4px -10px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Team performance</h2>
          <section style={{ flex: "none", padding: "20px 18px 16px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 46px 50px 54px", gap: "6px", alignItems: "baseline", paddingBottom: "6px" }}>
              <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "650" }}>Teams</h2>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Leads</span>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Appt</span>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60", textAlign: "right" }}>Show-up</span>
            </div>
            {(v.ov.teamRows).map((t, t_i) => (<Fragment key={t_i}>
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
        {!!(v.ov.ovrOpen) && (<>
          <div onClick={v.ov.ovrClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.ov.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.ov.ovrClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              {!!(v.ov.ovrShowTabs) && (<>
                <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "14px", background: "#F5EBE3" }}>
                  {(v.ov.ovrTabs).map((t, t_i) => (<Fragment key={t_i}>
                    <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", fontSize: "14px", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                      </span>{t.label}</span>
                  </Fragment>))}
                </div>
              </>)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.ov.ovrPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "#FBF7F3" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.ov.ovrPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-.01em" }}>{v.ov.ovrTitle}</strong>
                  <span onClick={v.ov.ovrNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.ov.ovrWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.ov.ovrCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ov.ovrFromBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ov.ovrFromLbl}</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ov.ovrFrom}</strong>
                </span>
                <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ov.ovrToBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ov.ovrToLbl}</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ov.ovrTo}</strong>
                </span>
              </div>
              <span onClick={v.ov.ovrApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.ov.ovrApplyBg, color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{v.ov.ovrApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.ib) && (<>
      {!!(v.ib.onInbox) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflow: "hidden", scrollbarWidth: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Inbox</h1>
              <span style={{ fontSize: "13px", color: "#806B60" }}>{v.ib.inbSummary}</span>
            </div>
            <span onClick={v.ib.openPc} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 14px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #3F2B22", background: "#3F2B22", color: "#fff", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8">
                </path>
              </svg>Contacts</span>
            {!!(v.bellIn) && (<>
              <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer", marginLeft: "-2px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                  </path>
                </svg>
                {!!(v.bl.notifUnread) && (<>
                  <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                </>)}
              </span>
            </>)}
          </div>
          {!!(v.ib.inbHasChips) && (<>
            <div style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
              {(v.ib.inbChips).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot, marginRight: "-2px" }}>
                  </span>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.ib.inbHasWho) && (<>
            <div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>
              {(v.ib.inbWhoChips).map((c, c_i) => (<Fragment key={c_i}>
                <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", height: "30px", padding: "0 12px", borderRadius: "15px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "12px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
              </Fragment>))}
            </div>
          </>)}
          <div data-drag-scroll="1" style={{ flex: "0 0 auto", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "-4px -16px 0", padding: "0 16px", userSelect: "none" }}>
            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}><span onClick={g.jump} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", color: "#3F2B22", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}></span>{g.title}<b style={{ fontWeight: "700", color: g.c }}>{g.n}</b></span></Fragment>))}
          </div>
          <div data-inb-board="1" data-drag-scroll="1" style={{ flex: "1 1 0", minHeight: "0", display: "flex", alignItems: "stretch", gap: "10px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px 4px", scrollSnapType: "x mandatory", scrollPadding: "0 20px", userSelect: "none" }}>
            {(v.ib.inbCols).map((g, g_i) => (<Fragment key={g_i}>
              <div style={{ flex: "0 0 264px", height: "100%", scrollSnapAlign: "start", display: "flex", flexDirection: "column", gap: "8px", padding: "10px", boxSizing: "border-box", borderRadius: "18px", background: g.bg, overflowY: "auto", scrollbarWidth: "none" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "2px 4px" }}>
                  <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: g.c }}>
                  </span>
                  <strong style={{ flex: "1", fontSize: "14px", fontWeight: "700", color: "#3F2B22" }}>{g.title}</strong>
                  <small style={{ minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#fff", color: g.c, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{g.n}</small>
                </span>
                {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                  <div onClick={r.open} onClickCapture={r.guard} onPointerDown={r.down} onPointerMove={r.move} onPointerUp={r.up} onPointerCancel={r.cancel} onContextMenu={r.noMenu} style={{ WebkitTouchCallout: "none", userSelect: "none", display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.06)", cursor: "pointer" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", background: r.ownBg, display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{r.ini}</span>
                      <strong style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                      <small style={{ flex: "none", fontSize: "11px", color: "#A8968B" }}>{r.at}</small>{!!(r.unread) && (<span style={{ flex: "none", minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: "#BD4A19", color: "#fff", fontSize: "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.unread}</span>)}
                    </span>
                    <span style={{ fontSize: "13px", lineHeight: "18px", maxHeight: "36px", color: "#806B60", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{r.preview}</span>
                    <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", paddingTop: "8px", borderTop: "1px solid #F3E9E1", fontSize: "12px", lineHeight: "16px" }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "6px", fontWeight: "600", color: "#3F2B22" }}>
                        <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: r.wc }}>
                        </span>
                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</span>
                      </span>
                      {!!(r.needs) && (<>
                        <span style={{ flex: "none", fontWeight: "700", color: r.uc, whiteSpace: "nowrap" }}>{r.state}</span>
                      </>)}
                    </span>
                  </div>
                </Fragment>))}
                {!!(g.empty) && (<>
                  <span style={{ padding: "18px 0", textAlign: "center", fontSize: "13px", color: "#A8968B" }}>Nothing here</span>
                </>)}
              </div>
            </Fragment>))}
          </div>
        </main>
      </>)}
    </>)}
    {!!(v.show.ld) && (<>
      {!!(v.ld.onLead) && (<>
        <main style={{ position: "relative", flex: "1 1 auto", minHeight: "0", padding: "16px 20px 16px", background: v.chromeBg, display: "flex", flexDirection: "column", gap: "12px" }}>
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingBottom: "12px", borderBottom: "1px solid #EBDDD2" }}>
              <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650" }}>{v.ld.ld.ini}</span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: "16px", fontWeight: "650" }}>{v.ld.ld.name}</strong>
                <small style={{ fontSize: "12px", color: "#387557" }}>{v.ld.ld.ad}</small>
              </span>
            </div>
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "12px", background: "#F5EBE3", fontSize: "13px", color: "#4E2F20" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                </path>
              </svg>
              <span style={{ flex: "1" }}>View only · {v.ld.ld.ownerFirst}'s customer. To reply, open this chat from Inbox.</span>
            </div>
          </>)}
          {!!(v.ld.lx.inbox) && (<>
            <div style={{ position: "relative", flex: "none", display: "flex", alignItems: "center", gap: "10px", paddingBottom: "10px", borderBottom: "1px solid #EBDDD2" }}>
              <span onClick={v.ld.back} title="Back to Inbox" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5m6-6-6 6 6 6">
                  </path>
                </svg>
              </span>
              <span style={{ position: "relative", flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{v.ld.ld.ini}<span style={{ position: "absolute", right: "-2px", bottom: "-2px", width: "16px", height: "16px", borderRadius: "50%", background: v.ld.lx.chC, border: "2px solid #fff", display: "grid", placeItems: "center", color: "#fff" }}>
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3Z">
                    </path>
                  </svg>
                </span></span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: "16px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.name}</strong>
                <small style={{ fontSize: "12px", color: "#387557", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.ad}</small>
              </span>
              <span onClick={v.ld.lx.toggleMenu} title="More" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.7">
                  </circle>
                  <circle cx="12" cy="12" r="1.7">
                  </circle>
                  <circle cx="12" cy="19" r="1.7">
                  </circle>
                </svg>
              </span>
              {!!(v.ld.lx.menuOpen) && (<>
                <div style={{ position: "absolute", top: "48px", right: "0", zIndex: "7", width: "240px", padding: "6px", boxSizing: "border-box", borderRadius: "20px", background: "#fff", border: "1px solid #F0E4DA", boxShadow: "0 16px 36px rgba(63,43,34,.16)", display: "flex", flexDirection: "column", gap: "2px", animation: "fadeIn 140ms ease-out" }}>
                  {(v.ld.lx.menu).map((it, it_i) => (<Fragment key={it_i}>
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
            <p style={{ flex: "none", margin: "0", fontSize: "12px", color: "#806B60" }}>{v.ld.ld.ownerName}'s customer{v.ld.ld.windowNote}</p>
            {!!(v.ld.lx.infoOpen) && (<>
              <div onClick={v.ld.lx.closeInfo} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
                <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "90%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                  <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
                  </span>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: "650" }}>{v.ld.ld.ini}</span>
                    <strong style={{ fontSize: "19px", fontWeight: "700" }}>{v.ld.ld.name}</strong>
                    <span onClick={v.ld.lx.editInfo} style={{ marginLeft: "auto", height: "36px", padding: "0 16px", boxSizing: "border-box", borderRadius: "18px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>Edit</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
                    {(v.ld.lx.info).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "14px" }}>
                        <span style={{ color: "#806B60" }}>{r.k}</span>
                        <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}>{r.v}</strong>
                      </div>
                    </Fragment>))}
                  </div>
                </div>
              </div>
            </>)}
            {!!(v.ld.ld.movedTo) && (<>
              <div style={{ flex: "none", padding: "8px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" }}>{v.ld.ld.movedTo}</div>
            </>)}
            <div data-chat-list="1" style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px", margin: "0 -20px", padding: "10px 20px", backgroundColor: "#EFE7DE", backgroundImage: "url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22240%22%20height%3D%22240%22%20viewBox%3D%220%200%20240%20240%22%3E%3Cg%20fill%3D%22none%22%20stroke%3D%22%237A6457%22%20stroke-opacity%3D%22.13%22%20stroke-width%3D%221.3%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20transform%3D%22translate%2814%2012%29%20rotate%28-12%2012%2012%29%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%2F%3E%3Cpath%20transform%3D%22translate%2892%208%29%20rotate%2810%2012%2012%29%22%20d%3D%22M20%209V6a2%202%200%200%200-2-2H6a2%202%200%200%200-2%202v3M2%2016a2%202%200%200%200%202%202h16a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v1.5a.5.5%200%200%201-.5.5h-11a.5.5%200%200%201-.5-.5V11a2%202%200%200%200-4%200zM4%2018v2M20%2018v2M12%204v9%22%2F%3E%3Cpath%20transform%3D%22translate%28176%2020%29%20rotate%28-6%2012%2012%29%22%20d%3D%22M2%204v16M2%208h18a2%202%200%200%201%202%202v10M2%2017h20M6%208v9%22%2F%3E%3Cpath%20transform%3D%22translate%2840%2074%29%20rotate%288%2012%2012%29%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%2F%3E%3Cpath%20transform%3D%22translate%28124%2066%29%20rotate%28-14%2012%2012%29%22%20d%3D%22M8%202h8l4%2010H4L8%202ZM12%2012v6M8%2022v-2c0-1.1.9-2%202-2h4a2%202%200%200%201%202%202v2H8Z%22%2F%3E%3Cpath%20transform%3D%22translate%28200%2092%29%20rotate%2812%2012%2012%29%22%20d%3D%22M19%2014c1.49-1.46%203-3.21%203-5.5A5.5%205.5%200%200%200%2016.5%203c-1.76%200-3%20.5-4.5%202-1.5-1.5-2.74-2-4.5-2A5.5%205.5%200%200%200%202%208.5c0%202.3%201.5%204.05%203%205.5l7%207Z%22%2F%3E%3Cpath%20transform%3D%22translate%2810%20140%29%20rotate%286%2012%2012%29%22%20d%3D%22M12%202l3.09%206.26L22%209.27l-5%204.87%201.18%206.88L12%2017.77l-6.18%203.25L7%2014.14%202%209.27l6.91-1.01L12%202z%22%2F%3E%3Cpath%20transform%3D%22translate%2878%20128%29%20rotate%28-8%2012%2012%29%22%20d%3D%22M8%202v4M16%202v4M3%2010h18M5%204h14a2%202%200%200%201%202%202v14a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2V6a2%202%200%200%201%202-2Z%22%2F%3E%3Cpath%20transform%3D%22translate%28160%20150%29%20rotate%2814%2012%2012%29%22%20d%3D%22M19%209V6a2%202%200%200%200-2-2H7a2%202%200%200%200-2%202v3M3%2016a2%202%200%200%200%202%202h14a2%202%200%200%200%202-2v-5a2%202%200%200%200-4%200v2H7v-2a2%202%200%200%200-4%200ZM5%2018v2M19%2018v2%22%2F%3E%3Cpath%20transform%3D%22translate%2834%20200%29%20rotate%28-10%2012%2012%29%22%20d%3D%22M22%2016.92v3a2%202%200%200%201-2.18%202%2019.79%2019.79%200%200%201-8.63-3.07%2019.5%2019.5%200%200%201-6-6%2019.79%2019.79%200%200%201-3.07-8.67A2%202%200%200%201%204.11%202h3a2%202%200%200%201%202%201.72%2012.84%2012.84%200%200%200%20.7%202.81%202%202%200%200%201-.45%202.11L8.09%209.91a16%2016%200%200%200%206%206l1.27-1.27a2%202%200%200%201%202.11-.45%2012.84%2012.84%200%200%200%202.81.7A2%202%200%200%201%2022%2016.92z%22%2F%3E%3Cpath%20transform%3D%22translate%28118%20196%29%20rotate%284%2012%2012%29%22%20d%3D%22M15%2021v-8a1%201%200%200%200-1-1h-4a1%201%200%200%200-1%201v8M3%2010a2%202%200%200%201%20.709-1.528l7-5.999a2%202%200%200%201%202.582%200l7%205.999A2%202%200%200%201%2021%2010v9a2%202%200%200%201-2%202H5a2%202%200%200%201-2-2z%22%2F%3E%3Cpath%20transform%3D%22translate%28196%20206%29%20rotate%28-12%2012%2012%29%22%20d%3D%22M7.9%2020A9%209%200%201%200%204%2016.1L2%2022Z%22%2F%3E%3C%2Fg%3E%3Cg%20fill%3D%22%237A6457%22%20fill-opacity%3D%22.12%22%3E%3Ccircle%20cx%3D%2266%22%20cy%3D%2240%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22150%22%20cy%3D%2240%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22100%22%20cy%3D%22104%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22230%22%20cy%3D%2260%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%2256%22%20cy%3D%22170%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22140%22%20cy%3D%22120%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22224%22%20cy%3D%22160%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%2290%22%20cy%3D%22230%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%22180%22%20cy%3D%22240%22%20r%3D%221.6%22%2F%3E%3Ccircle%20cx%3D%2220%22%20cy%3D%22100%22%20r%3D%221.6%22%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E')", backgroundSize: "240px 240px" }}>
              {(v.ld.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
                {!!(m.sep) && (<>
                  <span style={{ alignSelf: "center", margin: "4px 0 2px", padding: "5px 12px", borderRadius: "9px", background: "#FFFFFF", boxShadow: "0 1px 1px rgba(63,43,34,.10)", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{m.sep}</span>
                </>)}
                <div {...m.press} style={{ WebkitTouchCallout: "none", position: "relative", marginBottom: m.rxGap, display: m.vis, alignSelf: m.align, maxWidth: "80%", padding: m.pad, boxSizing: "border-box", borderRadius: m.radius, boxShadow: "0 1px 1px rgba(63,43,34,.10)", background: m.bg, border: `1px solid ${m.bd}`, color: "#3F2B22" }}>
                  {!!(m.ev) && (<><div onClick={m.ev.go} style={{ width: "248px", maxWidth: "100%", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden", textAlign: "left", cursor: "pointer" }}><div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px" }}><span style={{ flex: "none", width: "54px", padding: "6px 0", borderRadius: "12px", background: m.ev.bg, color: m.ev.fg, display: "flex", flexDirection: "column", alignItems: "center", lineHeight: "1.1" }}><small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.wk}</small><strong style={{ fontSize: "24px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{m.ev.dn}</strong><small style={{ fontSize: "10px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase" }}>{m.ev.mon}</small></span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}><span style={{ alignSelf: "flex-start", padding: "2px 7px", borderRadius: "5px", background: m.ev.bg, color: m.ev.fg, fontSize: "10px", fontWeight: "700", letterSpacing: ".05em", textTransform: "uppercase" }}>{m.ev.kind}</span><strong style={{ fontSize: "15px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.title}</strong><span style={{ fontSize: "17px", fontWeight: "700", color: "#3F2B22", textDecoration: m.ev.deco, fontVariantNumeric: "tabular-nums" }}>{m.ev.time}</span></span></div><div style={{ display: "flex", gap: "10px", padding: "11px 12px", borderTop: "1px solid #EBDDD2", background: "#FBF7F3" }}><svg style={{ flex: "none", marginTop: "1px", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"></path></svg><span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: "0" }}><strong style={{ fontSize: "14px", fontWeight: "650", color: "#3F2B22" }}>{m.ev.room}</strong>{!!(m.ev.addr) && (<><span style={{ fontSize: "13px", color: "#806B60", lineHeight: "1.35" }}>{m.ev.addr}</span></>)}</span></div></div></>)}{!!(m.quote) && (<div style={{ margin: "0 0 6px", padding: "6px 10px", borderRadius: "8px", borderLeft: "3px solid #BD4A19", background: "rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19" }}>{m.quote.who}</strong><span style={{ fontSize: "13px", lineHeight: "1.35", color: "#806B60", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.quote.text}</span></div>)}{!!(m.reaction) && (<span style={{ position: "absolute", bottom: "-14px", left: m.rxSide, right: m.rxRight, padding: "1px 5px", borderRadius: "12px", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.25)", fontSize: "15px", lineHeight: "22px" }}>{m.reaction}</span>)}{!!(m.album.length) && (<MediaAlbum items={m.album} more={m.albumMore} />)}{!!(m.img) && (<img onClick={m.view} onLoad={m.shape} src={m.img} alt="Photo" style={{ display: "block", width: "240px", maxWidth: "100%", height: m.mh, objectFit: "cover", borderRadius: "13px", background: "rgba(63,43,34,.08)", cursor: "zoom-in" }} />)}{!!(m.vid) && (<span onClick={m.view} style={{ position: "relative", display: "block", width: "240px", maxWidth: "100%", height: m.mh, borderRadius: "13px", overflow: "hidden", background: "#000", cursor: "pointer" }}><video src={m.vidSrc} muted playsInline preload="metadata" onLoadedMetadata={m.shape} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover", pointerEvents: "none" }} /><span style={{ position: "absolute", left: "50%", top: "50%", width: "52px", height: "52px", margin: "-26px 0 0 -26px", borderRadius: "26px", background: "rgba(0,0,0,.45)", display: "grid", placeItems: "center" }}><svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></span></span>)}{!!(m.aud) && (<VoiceNote src={m.aud} mine={m.voiceMine} />)}{!!(m.file && m.isPdf) && (<PdfCard src={m.file} name={m.docName} onOpen={m.view} />)}{!!(m.file && !m.isPdf) && (<span onClick={m.view} style={{ display: "flex", alignItems: "center", gap: "10px", width: "250px", maxWidth: "100%", padding: "10px", boxSizing: "border-box", borderRadius: "12px", background: "rgba(63,43,34,.06)", cursor: "pointer" }}><span style={{ flex: "none", width: "34px", height: "40px", borderRadius: "5px", background: "#C8402A", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700", letterSpacing: ".02em" }}>{m.docType}</span><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}><strong style={{ fontSize: "14px", fontWeight: "600", lineHeight: "1.3", color: "#3F2B22", overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: "2", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.docName}</strong><small style={{ fontSize: "12px", color: "#806B60" }}>{m.docType}</small></span></span>)}<p style={{ display: m.pDisp, margin: "0", padding: m.inPad, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: "14px", lineHeight: "1.45" }}>{m.text}</p>
                  <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", marginTop: "4px", padding: m.inPad, fontSize: "11px", color: "#806B60" }}>{!!(m.hasBy) && (<>
                      <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                    </>)}{m.time}{!!(m.mine) && (<>
                      <svg width="16" height="11" viewBox="0 0 16 11" fill="none" stroke={m.tickC} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={m.tickPath}>
                        </path>
                      </svg>
                    </>)}</span>
                </div>
              </Fragment>))}
            </div>
            {!!(v.ld.lx.pk) && (<PickEditor pk={v.ld.lx.pk} />)}
      {!!(v.ld.lx.rec) && (<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px" }}>
              <span onClick={v.ld.lx.rec?.cancel} title="Cancel" style={{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#A3371A", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"></path></svg></span>
              <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", borderRadius: "22px", background: "#FBF1EC", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", fontSize: "15px", fontWeight: "600", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}><span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "#D93025", animation: "fadeIn 700ms ease-in-out infinite alternate" }}></span>{v.ld.lx.rec?.time} · Recording…</span>
              <span onClick={v.ld.lx.rec?.send} title="Send voice note" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"></path></svg></span>
            </div>)}
            {!!(v.ld.lx.replying) && (<div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", marginBottom: "6px", borderRadius: "12px", borderLeft: "3px solid #BD4A19", background: "#F5EBE3" }}><span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19" }}>{v.ld.lx.replyWho}</strong><span style={{ fontSize: "13px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.lx.replyText}</span></span><span onClick={v.ld.lx.cancelReply} title="Cancel reply" style={{ flex: "none", width: "28px", height: "28px", display: "grid", placeItems: "center", color: "#806B60", fontSize: "20px", cursor: "pointer" }}>×</span></div>)}<div style={{ flex: "none", display: v.ld.lx.rec ? "none" : "flex", alignItems: "center", gap: "6px" }}>
              <span onClick={v.ld.lx.attach} title="Send a file" style={{ flex: "none", width: "44px", height: "44px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#806B60" }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14">
                  </path>
                </svg>
              </span>
              <span style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 6px 0 16px", borderRadius: "22px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "4px" }}>
                <input value={v.ld.lx.draft} onChange={v.ld.lx.setDraft} placeholder={v.ld.lx.ph} style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
                <span onClick={v.ld.lx.openEmoji} title="Emoji" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#806B60" , cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 13V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h6l7-7Zm0 0h-4a3 3 0 0 0-3 3v4">
                    </path>
                  </svg>
                </span>
              </span>
              <span onClick={v.ld.lx.photo} title="Send a photo" style={{ flex: "none", width: "38px", height: "44px", display: "grid", placeItems: "center", color: "#806B60" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z">
                  </path>
                </svg>
              </span>
              <span onClick={v.ld.lx.send} title={v.ld.lx.sendTitle} style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={v.ld.lx.sendIcon}>
                  </path>
                </svg>
              </span>
            </div>
            {!!(v.ld.lx.emojiOpen) && (<div style={{ flex: "none", padding: "8px 12px 6px", borderTop: "1px solid #EBDDD2", background: "#FBF7F3", display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", color: "#806B60" }}>EMOJI</span>
          <span onClick={v.ld.lx.closeEmoji} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Done</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(0, 1fr))", gap: "2px", maxHeight: "196px", overflowY: "auto", scrollbarWidth: "none" }}>
          {(v.ld.lx.emojis).map((e, e_i) => (<Fragment key={e_i}><span onClick={e.pick} style={{ height: "40px", display: "grid", placeItems: "center", fontSize: "26px", borderRadius: "10px", cursor: "pointer" }}>{e.e}</span></Fragment>))}
        </div>
      </div>)}
      
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div data-chat-list="1" style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "10px" }}>
              {(v.ld.ld.msgs).map((m, m_i) => (<Fragment key={m_i}>
                <div style={{ alignSelf: m.align, maxWidth: "80%", padding: "10px 13px", boxSizing: "border-box", borderRadius: m.radius, background: m.bg, border: `1px solid ${m.bd}`, fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{m.text}<span style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "#806B60", textAlign: "right" }}>{!!(m.hasBy) && (<>
                      <em style={{ fontStyle: "italic" }}>{m.by} · </em>
                    </>)}{m.at}</span></div>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.ld.lx.viewOnly) && (<>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid #EBDDD2" }}>
              {!!(v.ld.ld.movedTo) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#E4F1E8", color: "#2E6B4C", fontSize: "13px", fontWeight: "600" }}>
                  <svg style={{ flex: "none" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                    </path>
                  </svg>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ld.ld.movedTo}</span>
                </div>
              </>)}
              <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Reassign to</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <span onClick={v.ld.ld.openSheet} style={{ position: "relative", flex: "1", minWidth: "0", height: "46px", boxSizing: "border-box", padding: "0 36px 0 14px", border: "1px solid #EBDDD2", borderRadius: "23px", background: "#fff", display: "flex", alignItems: "center", fontSize: "15px", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ld.ld.pickLabel}</span>
                  <svg style={{ position: "absolute", right: "14px", color: "#806B60" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6">
                    </path>
                  </svg>
                </span>
                <span onClick={v.ld.ld.move} style={{ flex: "none", height: "46px", padding: "0 18px", borderRadius: "23px", background: v.ld.ld.moveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Move</span>
              </div>
            </div>
          </>)}
          {!!(v.ld.lx.bookOpen) && (<>
            <div onClick={v.ld.lx.closeBook} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
              <div onClick={v.ld.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <span style={{ flex: "none", alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
                </span>
                <h2 style={{ flex: "none", margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Book a visit · {v.ld.ld.name}</h2>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}>Showroom</span>
                  {(v.ld.lx.rooms).map((r, r_i) => (<Fragment key={r_i}>
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
                    <span style={{ display: "inline-flex", alignItems: "center", height: "32px", border: "1px solid #EBDDD2", borderRadius: "16px", fontSize: "13px", fontWeight: "650" }}><span onClick={v.ld.lx.mPrev} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m15 6-6 6 6 6">
                          </path>
                        </svg>
                      </span>{v.ld.lx.monthLbl}<span onClick={v.ld.lx.mNext} style={{ width: "28px", height: "32px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m9 6 6 6-6 6">
                          </path>
                        </svg>
                      </span></span>
                    <span style={{ marginLeft: "auto", display: "flex", padding: "3px", borderRadius: "16px", background: "#F5EBE3" }}>
                      <span onClick={v.ld.lx.vWeek} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.ld.lx.vWeekBg, color: v.ld.lx.vWeekFg, cursor: "pointer" }}>Week</span>
                      <span onClick={v.ld.lx.vMonth} style={{ height: "28px", padding: "0 12px", borderRadius: "13px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.ld.lx.vMonthBg, color: v.ld.lx.vMonthFg, cursor: "pointer" }}>Month</span>
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
                  {!!(v.ld.lx.isMonth) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                      {(v.ld.lx.cells).map((c, c_i) => (<Fragment key={c_i}>
                        <span onClick={c.pick} style={{ height: "36px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                      </Fragment>))}
                    </div>
                  </>)}
                  {!!(v.ld.lx.isWeek) && (<>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px" }}>
                      {(v.ld.lx.wk).map((c, c_i) => (<Fragment key={c_i}>
                        <span onClick={c.pick} style={{ height: "40px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur }}>{c.n}</span>
                      </Fragment>))}
                    </div>
                  </>)}
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22" }}>Time</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                    {(v.ld.lx.slots).map((s, s_i) => (<Fragment key={s_i}>
                      <span onClick={s.pick} style={{ height: "46px", borderRadius: "12px", border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "1px", cursor: s.cur }}>
                        <span style={{ fontSize: "13px", fontWeight: "600", textDecoration: s.deco }}>{s.t}</span>
                        {!!(s.hasLeft) && (<>
                          <small style={{ fontSize: "10px", fontWeight: "600", opacity: ".8" }}>{s.left}</small>
                        </>)}
                      </span>
                    </Fragment>))}
                  </div>
                </div>
                <span onClick={v.ld.lx.confirm} style={{ flex: "none", height: "48px", borderRadius: "24px", background: v.ld.lx.bookBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>{v.ld.lx.bookLabel}</span>
              </div>
            </div>
          </>)}
          {!!(v.ld.ld.sheetOpen) && (<>
            <div onClick={v.ld.ld.closeSheet} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
              <div onClick={v.ld.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px", boxShadow: "0 -8px 24px rgba(63,43,34,.12)" }}>
                <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "8px" }}>
                </span>
                <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Reassign {v.ld.ld.name} to</h2>
                <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.ld.ld.ad} · now with {v.ld.ld.ownerName}</p>
                {(v.ld.ld.groups).map((g, g_i) => (<Fragment key={g_i}>
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
          {!!(v.ld.lx.shareOpen) && (<>
            <div onClick={v.ld.lx.closeShare} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
              <div onClick={v.ld.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
                </span>
                <h2 style={{ margin: "6px 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Share with your team</h2>
                {(v.ld.lx.shareList).map((p, p_i) => (<Fragment key={p_i}>
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
          {!!(v.ld.toast) && (<>
            <div style={{ position: "absolute", left: "20px", right: "20px", bottom: "96px", padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.ld.toast}</div>
          </>)}
        </main>
      </>)}
      {!!(v.cf.cfOpen) && (<>
        <div onClick={v.cf.cfClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.cf.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 22px", display: "flex", flexDirection: "column", gap: "12px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Customer details</h2>
              <span style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{v.cf.cfStep}</span>
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
              <input value={v.cf.cfName} onChange={v.cf.cfSetName} placeholder="e.g. Mr. Lim" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PHONE</span>
              <input value={v.cf.cfPhone} onChange={v.cf.cfSetPhone} placeholder="e.g. 012-345 6789" inputMode="tel" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
            </label>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}>
              <span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}>
              </span>
              <span style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "16px", fontWeight: "700" }}>Property</strong>
              </span>
            </div>
            {!!(v.cf.cfHas.type) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>PROPERTY TYPE</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {(v.cf.cfType).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cf.cfHas.size) && (<><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT SIZE</span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "8px" }}>
                {(v.cf.cfSize).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{c.label}</span>
                </Fragment>))}
              </div>
            </div></>)}
            {!!(v.cf.cfHas.loc) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>UNIT LOCATION</span>
              <input value={v.cf.cfLoc} onChange={v.cf.cfSetLoc} placeholder="e.g. Mont Kiara / Cheras" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
            </label></>)}
            {!!(v.cf.cfHas.req) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>REQUIREMENT</span>
              <textarea value={v.cf.cfReq} onChange={v.cf.cfSetReq} placeholder={v.cf.cfReqPh} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", resize: "none" }}>
              </textarea>
            </label></>)}
            {!!(v.cf.cfHas.budget) && (<><label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60" }}>BUDGET</span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", height: "48px", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3" }}>
                <span style={{ fontSize: "15px", fontWeight: "600", color: "#806B60" }}>RM</span>
                <input value={v.cf.cfBudget} onChange={v.cf.cfSetBudget} inputMode="numeric" placeholder="" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
              </span>
            </label></>)}
            {(v.cf.cfExtra).map((fs, fs_i) => (<Fragment key={fs_i}>{!!(fs.title) && (<><div style={{ display: "flex", alignItems: "flex-start", gap: "10px", paddingTop: "6px" }}><span style={{ flex: "none", marginTop: "7px", width: "7px", height: "7px", borderRadius: "50%", background: "#BD4A19" }}></span><span style={{ display: "flex", flexDirection: "column", gap: "1px" }}><strong style={{ fontSize: "16px", fontWeight: "700" }}>{fs.title}</strong></span></div></>)}{(fs.fields).map((fq, fq_i) => (<Fragment key={fq_i}><div style={{ display: "flex", flexDirection: "column", gap: "6px" }}><span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", color: "#806B60", textTransform: "uppercase" }}>{fq.label}{!!(fq.req) && (<> <b style={{ color: "#A3371A" }}>*</b></>)}</span>{!!(fq.isInput) && (<input value={fq.value} onChange={fq.set} placeholder={fq.ph} type={fq.inputType} inputMode={fq.mode} style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />)}{!!(fq.isLong) && (<textarea value={fq.value} onChange={fq.set} placeholder={fq.ph} rows={2} style={{ boxSizing: "border-box", padding: "12px 14px", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", resize: "none" }}></textarea>)}{!!(fq.isChoice) && (<div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>{(fq.chips).map((fc, fc_i) => (<Fragment key={fc_i}><span onClick={fc.pick} style={{ height: "38px", padding: "0 16px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${fc.bd}`, background: fc.bg, color: fc.fg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>{fc.label}</span></Fragment>))}</div>)}</div></Fragment>))}</Fragment>))}
<span onClick={v.cf.cfSave} style={{ flex: "none", marginTop: "8px", height: "58px", borderRadius: "29px", display: "grid", placeItems: "center", background: v.cf.cfSaveBg, color: "#fff", fontSize: "17px", fontWeight: "700", cursor: "pointer" }}>{v.cf.cfSaveLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
    {!!(v.show.ad) && (<>
      {!!(v.ad.onAds) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <h1 style={{ flex: "none", margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Ads Performance</h1>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ display: "flex", gap: "8px" }}>
              <div onClick={v.ad.ovOpenRange} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }}>
                <svg style={{ flex: "none", color: "#BD4A19" }} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5h14v15H5V5Zm3-3v5m8-5v5M5 10h14">
                  </path>
                </svg>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "700", color: "#3F2B22", whiteSpace: "nowrap" }}>{v.ad.adPerT}</strong>
                  <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.adPerD}</span>
                </span>
                <svg style={{ flex: "none", color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg>
              </div>
              {!!(v.ad.ovCanClear) && (<>
                <span onClick={v.ad.ovClear} style={{ flex: "none", height: "56px", padding: "0 16px", boxSizing: "border-box", borderRadius: "16px", background: "#F5EBE3", color: "#4E2F20", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}>Clear</span>
              </>)}
            </div>
          </div>
          {!!(v.ad.cmpOn) && (<>
            <section style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                <h2 style={{ margin: "0", fontSize: "17px", fontWeight: "700" }}>Comparison</h2>
                {!!(v.ad.cmpHas) && (<>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px" }}>
                    <span onClick={v.ad.cmpOff} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Clear</span>
                    <span onClick={v.ad.cmpToggle} style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", fontSize: "13px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>{v.ad.cmpToggleLbl}<svg style={{ transform: `rotate(${v.ad.cmpRot})` }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m6 9 6 6 6-6">
                        </path>
                      </svg></span>
                  </span>
                </>)}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px 12px", borderRadius: "12px", background: "#FBF7F3", fontSize: "13px" }}>
                <span onClick={v.ad.ovOpenPeriod} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#3F2B22", fontWeight: "600", cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#BD4A19" }}>
                  </span>
                  <span style={{ flex: "1", minWidth: "0" }}>{v.ad.cmpA}</span>
                  <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
                </span>
                {!!(v.ad.cmpHas) && (<>
                  <span onClick={v.ad.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#806B60", cursor: "pointer" }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#C9A48C" }}>
                    </span>
                    <span style={{ flex: "1", minWidth: "0" }}>vs {v.ad.cmpB}</span>
                    <span style={{ flex: "none", fontWeight: "650", color: "#BD4A19" }}>Change</span>
                  </span>
                </>)}
                {!!(v.ad.cmpNone) && (<>
                  <span onClick={v.ad.cmpPick} style={{ display: "flex", alignItems: "center", gap: "8px", color: "#BD4A19", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 5v14M5 12h14">
                      </path>
                    </svg>Choose a period to compare</span>
                </>)}
              </div>
              {!!(v.ad.cmpOpen) && (<>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "10px" }}>
                  {(v.ad.adCmpRows).map((r, r_i) => (<Fragment key={r_i}>
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
          {(v.ad.adPerf).map((a, a_i) => (<Fragment key={a_i}>
            <section style={{ flex: "none", padding: "16px", borderRadius: "18px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 4px 14px rgba(63,43,34,.05)", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "16px", fontWeight: "650", color: "#3F2B22" }}>{a.name}</strong>
                <span style={{ fontSize: "12px", color: "#806B60" }}>{a.page}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
                {(a.mets).map((m, m_i) => (<Fragment key={m_i}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", paddingLeft: m.pl, borderLeft: m.bl }}>
                    <span style={{ fontSize: "11px", fontWeight: "600", letterSpacing: ".04em", textTransform: "uppercase", color: "#806B60" }}>{m.label}</span>
                    <strong style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{m.v}</strong>
                    {!!(a.hasCmp) && (<>
                      <span style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "6px" }}>
                        <span style={{ fontSize: "12px", color: "#A57F68", fontVariantNumeric: "tabular-nums" }}>vs {m.b}</span>
                        <span style={{ padding: "1px 6px", borderRadius: "6px", background: m.dBg, color: m.dc, fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{m.d}</span>
                      </span>
                    </>)}
                  </div>
                </Fragment>))}
              </div>
            </section>
          </Fragment>))}
        </main>
        {!!(v.ad.ovrOpen) && (<>
          <div onClick={v.ad.ovrClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.ad.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.ad.ovrClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              {!!(v.ad.ovrShowTabs) && (<>
                <div style={{ display: "flex", gap: "2px", padding: "4px", borderRadius: "14px", background: "#F5EBE3" }}>
                  {(v.ad.ovrTabs).map((t, t_i) => (<Fragment key={t_i}>
                    <span onClick={t.pick} style={{ flex: "1", minWidth: "0", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", fontSize: "14px", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}><span style={{ width: "9px", height: "9px", borderRadius: "50%", background: t.dot }}>
                      </span>{t.label}</span>
                  </Fragment>))}
                </div>
              </>)}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.ad.ovrPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "#FBF7F3" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.ad.ovrPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-.01em" }}>{v.ad.ovrTitle}</strong>
                  <span onClick={v.ad.ovrNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.ad.ovrWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.ad.ovrCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ad.ovrFromBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ad.ovrFromLbl}</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ad.ovrFrom}</strong>
                </span>
                <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.ad.ovrToBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{v.ad.ovrToLbl}</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.ad.ovrTo}</strong>
                </span>
              </div>
              <span onClick={v.ad.ovrApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.ad.ovrApplyBg, color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{v.ad.ovrApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.as) && (<>
      {!!(v.as.onAssign) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {!!(v.asx.onHome) && (<>
            <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Assignment</h1>
                <span style={{ fontSize: "13px", color: "#806B60" }}>Who gets each new enquiry</span>
              </div>
              {!!(v.bellIn) && (<>
                <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                    </path>
                  </svg>
                  {!!(v.bl.notifUnread) && (<>
                    <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                  </>)}
                </span>
              </>)}
            </div>
          </>)}
          {!!(v.asx.onHome) && (<>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {(v.asx.cards).map((k, k_i) => (<Fragment key={k_i}>
                <div onClick={k.go} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "18px", background: "#fff", border: "1px solid #EBDDD2", boxShadow: "0 1px 3px rgba(63,43,34,.05)", cursor: "pointer" }} className={H.hov11}>
                  <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "12px", background: k.c, color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d={k.icon}>
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "16px", lineHeight: "20px", fontWeight: "650", color: "#3F2B22" }}>{k.title}</strong>
                    <small style={{ fontSize: "13px", lineHeight: "17px", color: k.subFg }}>{k.sub}</small>
                  </span>
                  {!!(k.hasN) && (<>
                    <span style={{ flex: "none", minWidth: "24px", height: "24px", padding: "0 8px", boxSizing: "border-box", borderRadius: "12px", background: k.c, color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{k.n}</span>
                  </>)}
                  <svg style={{ flex: "none", color: "#C9B5A8" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </div>
              </Fragment>))}
            </div>
          </>)}
          {!!(v.asx.onOrg) && (<>
            {!!(v.as.hasWaiting) && (<>
              <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "#FFF6EE", border: "1px solid #F3D9C4", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "#BD4A19" }}>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M4 5h16v11H9l-5 4V5Zm4 4h8M8 12h5">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Organic Leads</strong>
                  </span>
                  <span style={{ flex: "none", display: "grid", placeItems: "center", minWidth: "28px", height: "28px", padding: "0 9px", boxSizing: "border-box", borderRadius: "14px", background: "#BD4A19", color: "#fff", fontSize: "14px", fontWeight: "700" }}>{v.as.waitingN}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", background: "#fff", border: "1px solid #F3D9C4", padding: "0 12px" }}>
                  {(v.as.waitList).map((w, w_i) => (<Fragment key={w_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: w.rule }}>
                      <span onClick={w.open} style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                        <strong style={{ fontSize: "15px", fontWeight: "650" }}>{w.name}</strong>
                        <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.ad} · {w.when}</small>
                      </span>
                      <span onClick={w.openSend} style={{ flex: "none", height: "36px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "18px", background: "#BD4A19", color: "#fff", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>Send to<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg></span>
                    </div>
                  </Fragment>))}
                </div>
              </section>
            </>)}
          </>)}
          {!!(v.asx.onAds) && (<>
            {!!(v.as.notTL) && (<>
              <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "#F4F8FC", border: "1px solid #DCE6F2", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "#2F6FB5" }}>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "#2F6FB5", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Ads to teams</strong>
                  </span>
                </div>
                {!!(v.asx.heldAny) && (<>
                  <div onClick={v.asx.openHeld} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderRadius: "14px", background: "#FFF6EE", border: "1px solid #F3D9C4", cursor: "pointer" }} className={H.hov12}>
                    <svg style={{ flex: "none", marginTop: "1px", color: "#A3371A" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z">
                      </path>
                    </svg>
                    <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                      <strong style={{ fontSize: "14px", fontWeight: "700", color: "#A3371A" }}>{v.asx.heldTitle}</strong>
                      <small style={{ fontSize: "12px", lineHeight: "1.45", color: "#806B60" }}>A By max team is full. Tap to see who is waiting.</small>
                    </span>
                    <svg style={{ flex: "none", marginLeft: "auto", color: "#C98F6E" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </div>
                </>)}
                {(v.as.adRows).map((a, a_i) => (<Fragment key={a_i}>
                  <div onClick={a.edit} style={{ padding: "12px 14px", borderRadius: "14px", background: "#fff", border: "1px solid #DCE6F2", display: "flex", flexDirection: "column", gap: "10px", cursor: "pointer" }} className={H.hov10}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                        <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</strong>
                        <small style={{ fontSize: "12px", color: "#806B60" }}>{a.page} · {a.leads} leads · {a.tag}</small>
                      </span>
                      {!!(a.held) && (<>
                        <span style={{ flex: "none", padding: "3px 8px", borderRadius: "10px", background: "#A3371A", color: "#fff", fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{a.heldTxt}</span>
                      </>)}
                      <svg style={{ flex: "none", color: "#9DB3CC" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </div>
                    {!!(a.resNone) && (<>
                      <span style={{ fontSize: "12px", color: "#A8968B" }}>Not assigned yet · dealt evenly across teams</span>
                    </>)}
                    {!!(a.hasLeg) && (<>
                      <div style={{ display: "flex", height: "6px", borderRadius: "3px", overflow: "hidden", background: "#EEF3F9", gap: "2px" }}>
                        {(a.bar).map((b, b_i) => (<Fragment key={b_i}>
                          <span style={{ width: b.w, background: b.c, opacity: b.op }}>
                          </span>
                        </Fragment>))}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
                        {(a.leg).map((l, l_i) => (<Fragment key={l_i}>
                          <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: "0" }}>
                              <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: l.c }}>
                              </span>
                              <span style={{ fontSize: "12px", fontWeight: "600", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
                            </span>
                            <span style={{ paddingLeft: "12px", fontSize: "13px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{l.pct}<span style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{l.mode}</span></span>
                          </span>
                        </Fragment>))}
                      </div>
                    </>)}
                  </div>
                </Fragment>))}
              </section>
            </>)}
            {!!(v.as.isTL) && (<>
              <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "#F4F8FC", border: "1px solid #DCE6F2", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "#2F6FB5" }}>
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "#2F6FB5", color: "#fff", display: "grid", placeItems: "center" }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6">
                      </path>
                    </svg>
                  </span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Ads to my team</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>Team Aina · set by Principal</small>
                  </span>
                </div>
                {(v.as.tlAds).map((a, a_i) => (<Fragment key={a_i}>
                  <div style={{ padding: "14px", borderRadius: "14px", background: "#fff", border: "1px solid #DCE6F2", display: "flex", flexDirection: "column", gap: "10px" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <strong style={{ fontSize: "15px", fontWeight: "650" }}>{a.name}</strong>
                      <small style={{ fontSize: "12px", color: "#806B60" }}>{a.page}</small>
                    </span>
                    <span style={{ alignSelf: "flex-start", padding: "4px 10px", borderRadius: "8px", background: a.stBg, color: a.stFg, fontSize: "12px", fontWeight: "700" }}>{a.state}</span>
                    {!!(a.hasLine) && (<>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22", lineHeight: "1.45" }}>{a.line}</span>
                    </>)}
                    {!!(a.can) && (<>
                      <span onClick={a.edit} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #DCE6F2", background: "#F4F8FC", color: "#2F6FB5", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4 20h4L19 9l-4-4L4 16v4Z">
                          </path>
                        </svg>Split in my team</span>
                    </>)}
                  </div>
                </Fragment>))}
              </section>
            </>)}
          </>)}
          {!!(v.asx.onAw) && (<>
            <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "#FAF3F7", border: "1px solid #EEDCE6", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "#8E4B6E" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "#8E4B6E", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Awaiting reply</strong>
                </span>
                <span onClick={v.as.openAtt} style={{ flex: "none", fontSize: "13px", fontWeight: "650", color: "#8E4B6E", cursor: "pointer" }}>See all</span>
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                {(v.as.asgAttSum).map((g, g_i) => (<Fragment key={g_i}>
                  <span onClick={g.pick} style={{ flex: "1", minWidth: "0", padding: "8px 10px", borderRadius: "12px", background: g.bg, border: `1px solid ${g.bd}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "20px", fontWeight: "700", color: g.c, fontVariantNumeric: "tabular-nums" }}>{g.n}</strong>
                    <small style={{ fontSize: "11px", fontWeight: "600", color: g.c, whiteSpace: "nowrap" }}>{g.name}</small>
                  </span>
                </Fragment>))}
              </div>
              <div style={{ padding: "2px 14px", borderRadius: "14px", background: "#fff", border: "1px solid #EEDCE6" }}>
                {(v.as.asgAtt).map((l, l_i) => (<Fragment key={l_i}>
                  <div onClick={l.open} style={{ display: "grid", gridTemplateColumns: "36px minmax(0, 1fr) auto 34px", gap: "10px", alignItems: "center", padding: "10px 0", borderTop: l.rule, cursor: "pointer" }}>
                    <span style={{ width: "36px", height: "36px", borderRadius: "50%", background: "#FAF3F7", color: "#8E4B6E", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650" }}>{l.ini}</span>
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
                      <span style={{ fontSize: "12px", fontWeight: "700", color: l.c, whiteSpace: "nowrap" }}>{l.lv}</span>
                      <small style={{ fontSize: "11px", color: "#806B60", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{l.wait}</small>
                    </span>
                    <span onClick={l.move} title="Move to someone else" style={{ width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#8E4B6E", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3">
                        </path>
                      </svg>
                    </span>
                  </div>
                </Fragment>))}
              </div>
            </section>
          </>)}
          {!!(v.asx.onFt) && (<>
            <section style={{ flex: "none", position: "relative", padding: "16px 16px 16px 20px", borderRadius: "20px", background: "#F2F8F4", border: "1px solid #D6E6DC", display: "flex", flexDirection: "column", gap: "12px", overflow: "hidden" }}>
              <span style={{ position: "absolute", left: "0", top: "0", bottom: "0", width: "5px", background: "#387557" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "12px", background: "#387557", color: "#fff", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4m8-4v4M3 10h18M5 4h14v17H5V4Zm4 11 2 2 4-4">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                  <strong style={{ fontSize: "18px", fontWeight: "700", letterSpacing: "-.01em" }}>Full time lead allocation</strong>
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {(v.ftx.sum).map((t, t_i) => (<Fragment key={t_i}>
                  <div onClick={t.open} style={{ display: "flex", flexDirection: "column", padding: "4px 12px 8px", borderRadius: "14px", background: "#fff", border: "1px solid #D6E6DC", cursor: "pointer" }} className={H.hov4}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 0 4px" }}>
                      <span style={{ flex: "1", fontSize: "12px", fontWeight: "700", letterSpacing: ".04em", textTransform: "uppercase", color: "#387557" }}>{t.name}</span>
                      <small style={{ fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{t.mode}</small>
                      <svg style={{ color: "#806B60" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m9 6 6 6-6 6">
                        </path>
                      </svg>
                    </div>
                    {(t.rs).map((p, p_i) => (<Fragment key={p_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "10px", padding: "9px 0", borderTop: "1px solid #EEF3EF" }}>
                        <span style={{ minWidth: "0", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "3px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{p.name}</strong>
                          <span style={{ padding: "2px 8px", borderRadius: "6px", background: p.tagBg, color: p.tagFg, fontSize: "11px", fontWeight: "700" }}>{p.label}</span>
                        </span>
                        <span style={{ display: "flex", gap: "3px" }}>
                          {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                            <span style={{ width: "20px", height: "22px", borderRadius: "6px", background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{d.t}</span>
                          </Fragment>))}
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </Fragment>))}
              </div>
            </section>
          </>)}
        </main>
        {!!(v.as.adEdOpen) && (<>
          <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "#fff", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" }}>
              <div style={{ flex: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid #EEF3F9" }}>
                <span onClick={v.as.ae.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "32px", marginLeft: "-4px", color: "#2F6FB5", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>Assignment</span>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <h2 style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.as.ae.name}</h2>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{v.as.ae.page} · Total leads {v.as.ae.leads}</small>
                  </span>
                </div>
              </div>
              <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#EEF3F9" }}>
                  {(v.as.ae.modes).map((m, m_i) => (<Fragment key={m_i}>
                    <span onClick={m.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: m.w, background: m.bg, color: m.fg, boxShadow: m.sh, cursor: "pointer" }}>{m.label}</span>
                  </Fragment>))}
                </div>
                {!!(v.as.ae.isEven) && (<>
                  <div style={{ display: "flex", flexDirection: "column", borderRadius: "18px", background: "#fff", border: "1px solid #DCE6F2", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "18px", background: "#F4F8FC" }}>
                      <strong style={{ flex: "none", fontSize: "44px", fontWeight: "700", letterSpacing: "-.04em", lineHeight: "1", color: "#2F6FB5", fontVariantNumeric: "tabular-nums" }}>{v.as.ae.evenN}</strong>
                      <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "16px", fontWeight: "700" }}>people share equally</strong>
                      </span>
                    </div>
                    {(v.as.ae.evenTeams).map((t, t_i) => (<Fragment key={t_i}>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", borderTop: "1px solid #EEF3F9" }}>
                        <span style={{ flex: "none", display: "flex" }}>
                          {(t.av).map((a, a_i) => (<Fragment key={a_i}>
                            <span style={{ width: "32px", height: "32px", marginLeft: a.ml, borderRadius: "50%", background: t.c, border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700" }}>{a.ini}</span>
                          </Fragment>))}
                        </span>
                        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "700" }}>{t.team}</strong>
                          <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.names}</small>
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                </>)}
                {!!(v.as.ae.isSplit) && (<>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "16px", background: "#FBF7F3", border: "1px solid #EBDDD2" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <strong style={{ flex: "1", fontSize: "14px", fontWeight: "700" }}>Split across teams</strong>
                      <span style={{ padding: "3px 10px", borderRadius: "10px", background: v.as.ae.sumBg, color: v.as.ae.sumFg, fontSize: "12px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.as.ae.sumTot}</span>
                      <span onClick={v.as.ae.splitReset} style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Reset</span>
                    </div>
                    <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", gap: "2px", background: "#EEE6DF" }}>
                      {(v.as.ae.splits).map((b, b_i) => (<Fragment key={b_i}>
                        <span style={{ width: b.w, background: b.c, transition: "width 200ms" }}>
                        </span>
                      </Fragment>))}
                    </div>
                    {(v.as.ae.splits).map((r, r_i) => (<Fragment key={r_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 58px", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff" }}>
                        <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "700", color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</strong>
                        </span>
                        <input type="range" min="0" max="100" step="5" value={r.v} onChange={r.set} style={{ width: "100%", margin: "0", accentColor: r.c }} />
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "34px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", background: "#F4F8FC", border: "1px solid #DCE6F2" }}>
                          <input type="text" inputMode="numeric" pattern="[0-9]*" value={r.v} onChange={r.setN} onFocus={r.selAll} data-num-step="1" enterKeyHint="next" onKeyDown={v.enterNext} style={{ width: "30px", border: "0", background: "transparent", textAlign: "center", font: "inherit", fontSize: "15px", fontWeight: "700", color: r.c, outline: "none", padding: "0" }} />
                          <span style={{ fontSize: "13px", fontWeight: "700", color: r.c }}>%</span>
                        </span>
                      </div>
                    </Fragment>))}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "6px 2px 0" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700" }}>Inside each team</strong>
                  </div>
                  {(v.bp.inner).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "16px", background: "#fff", border: "1px solid #DCE6F2" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                        </span>
                        <strong style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "700", color: g.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</strong>
                        <span style={{ flex: "none", fontSize: "13px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{g.pct}</span>
                      </div>
                      <div style={{ display: "flex", gap: "2px", padding: "2px", borderRadius: "9px", background: "#EEF3F9" }}>
                        {(g.modes).map((m, m_i) => (<Fragment key={m_i}>
                          <span onClick={m.pick} style={{ flex: "1", textAlign: "center", padding: "6px 9px", borderRadius: "7px", background: m.bg, color: m.fg, fontSize: "12px", fontWeight: m.w, boxShadow: m.sh, cursor: "pointer", whiteSpace: "nowrap" }}>{m.label}</span>
                        </Fragment>))}
                      </div>
                      {!!(g.isEven) && (<>
                        <span style={{ paddingTop: "8px", borderTop: "1px solid #EEF3F9", fontSize: "12px", lineHeight: "1.45", color: "#806B60" }}>{g.evenLine}</span>
                      </>)}
                      {!!(g.custom) && (<>
                        {(g.people).map((p, p_i) => (<Fragment key={p_i}>
                          <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "center", gap: "8px", paddingTop: "8px", borderTop: "1px solid #EEF3F9" }}>
                            <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                              <strong style={{ fontSize: "14px", lineHeight: "18px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                              <small style={{ fontSize: "11px", lineHeight: "14px", color: p.noteFg, fontVariantNumeric: "tabular-nums" }}>{p.note}</small>
                            </span>
                            <input value={p.v} onChange={p.set} onFocus={v.bp.selAll} inputMode="numeric" data-num-step="1" enterKeyHint="next" onKeyDown={v.enterNext} style={{ width: "46px", height: "34px", boxSizing: "border-box", borderRadius: "10px", border: "1px solid #DCE6F2", background: "#F4F8FC", textAlign: "center", font: "inherit", fontSize: "15px", fontWeight: "700", color: "#3F2B22", outline: "none", padding: "0" }} />
                            <span style={{ width: "30px", fontSize: "12px", fontWeight: "700", color: "#806B60" }}>{g.unit}</span>
                          </div>
                        </Fragment>))}
                        <span style={{ fontSize: "12px", fontWeight: "600", color: g.sumFg }}>{g.sum}</span>
                      </>)}
                    </div>
                  </Fragment>))}
                </>)}
              </div>
              <div style={{ flex: "none", padding: "12px 20px 26px", borderTop: "1px solid #EEF3F9", background: "#fff", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
                <span onClick={v.as.ae.applyAll} style={{ gridColumn: "1 / -1", height: "44px", boxSizing: "border-box", borderRadius: "22px", border: `1px solid ${v.as.ae.applyBd}`, background: "#fff", color: v.as.ae.applyFg, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "14px", fontWeight: "650", cursor: v.as.ae.applyCur }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3">
                    </path>
                  </svg>{v.as.ae.applyLabel}</span>
                <span onClick={v.as.ae.close} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid #DCE6F2", color: "#3F2B22", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Cancel</span>
                <span onClick={v.as.ae.save} style={{ height: "48px", borderRadius: "24px", background: v.as.ae.saveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Save</span>
              </div>
            </div>
          </div>
        </>)}
        {!!(v.ftx.open) && (<>
          <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
            <div style={{ flex: "none", padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: "6px", background: "#fff", borderBottom: "1px solid #EBDDD2" }}>
              <span onClick={v.ftx.close} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "4px", height: "36px", color: "#BD4A19", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6">
                  </path>
                </svg>Full time lead allocation</span>
              <strong style={{ fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.ftx.name}</strong>
            </div>
            <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(7, 30px)", alignItems: "center", gap: "4px", padding: "10px 12px 6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>PERSON</span>
                  {(v.ftx.heads).map((h, h_i) => (<Fragment key={h_i}>
                    <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", color: "#A8968B" }}>{h}</span>
                  </Fragment>))}
                </div>
                {(v.ftx.people).map((p, p_i) => (<Fragment key={p_i}>
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) repeat(7, 30px)", alignItems: "center", gap: "4px", padding: "10px 12px", borderTop: "1px solid #F3E9E1" }}>
                    <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                      <strong style={{ fontSize: "14px", lineHeight: "18px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                      <small style={{ fontSize: "11px", lineHeight: "14px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</small>
                    </span>
                    {(p.days).map((d, d_i) => (<Fragment key={d_i}>
                      <span onClick={d.toggle} title={d.title} style={{ width: "30px", height: "30px", boxSizing: "border-box", borderRadius: "9px", border: `1.5px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d={d.icon}>
                          </path>
                        </svg>
                      </span>
                    </Fragment>))}
                  </div>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "12px", fontWeight: "700", letterSpacing: ".05em", color: "#806B60" }}>WHO GETS THE ENQUIRIES</span>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", padding: "0 14px" }}>
                  {(v.ftx.week).map((w, w_i) => (<Fragment key={w_i}>
                    <div style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr)", gap: "10px", alignItems: "baseline", padding: "10px 0", borderTop: w.rule, fontSize: "13px", lineHeight: "18px" }}>
                      <strong style={{ fontWeight: "700", color: "#3F2B22" }}>{w.day}</strong>
                      <span style={{ color: w.fg, fontWeight: w.weight }}>{w.text}</span>
                    </div>
                  </Fragment>))}
                </div>
              </div>
            </div>
            <div style={{ flex: "none", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "10px", padding: "12px 16px 16px", background: "#fff", borderTop: "1px solid #EBDDD2" }}>
              <span onClick={v.ftx.applyAll} style={{ gridColumn: "1 / -1", height: "44px", boxSizing: "border-box", borderRadius: "22px", border: `1px solid ${v.ftx.applyBd}`, background: "#fff", color: v.ftx.applyFg, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "14px", fontWeight: "650", cursor: v.ftx.applyCur }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 8h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2zM16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3">
                  </path>
                </svg>{v.ftx.applyLabel}</span>
              <span onClick={v.ftx.clear} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid #E2CFC1", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>Clear all</span>
              <span onClick={v.ftx.save} style={{ height: "48px", borderRadius: "24px", background: "#387557", color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Save</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.show.cal) && (<>
      {!!(v.cal.onCal) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
            <div style={{ flex: "1", minWidth: "0" }}>
              <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Calendar</h1>
              <span style={{ fontSize: "13px", color: "#806B60" }}>{v.cal.cRangeLabel}</span>
            </div>
            <span onClick={v.cal.cOpenRange} style={{ flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", background: "#fff", fontSize: "14px", fontWeight: "650", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}><svg style={{ color: "#BD4A19" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                </path>
              </svg>{v.cal.cRangeBtn}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6">
                </path>
              </svg></span>
            {!!(v.bellIn) && (<>
              <span onClick={v.bl.openNotifs} title="Notifications" style={{ position: "relative", flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                  </path>
                </svg>
                {!!(v.bl.notifUnread) && (<>
                  <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                </>)}
              </span>
            </>)}
          </div>
          <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
            {(v.cal.cTeams).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{!!(c.dot) && (<>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                  </span>
                </>)}{c.label}</span>
            </Fragment>))}
          </div>
          <div style={{ flex: "none", display: "flex", gap: "8px", alignItems: "center" }}>
            <span onClick={v.cal.cpOpen} style={{ position: "relative", flex: "1", minWidth: "0", height: "40px", boxSizing: "border-box", padding: "0 34px 0 14px", border: "1px solid #EBDDD2", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cal.cPersonLabel}</span>
              <span style={{ position: "absolute", right: "12px", top: "13px", color: "#806B60" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m6 9 6 6 6-6">
                  </path>
                </svg>
              </span>
            </span>
            <div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
              {(v.cal.cViews).map((vi, vi_i) => (<Fragment key={vi_i}>
                <span onClick={vi.pick} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: vi.w, background: vi.bg, color: vi.fg, boxShadow: vi.sh, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}</span>
              </Fragment>))}
            </div>
          </div>
          <div style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "linear-gradient(155deg, #5A3828 0%, #3F2B22 60%)", boxShadow: "0 10px 24px rgba(63,43,34,.22)", color: "#fff", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
              {(v.cal.cStats).map((s, s_i) => (<Fragment key={s_i}>
                <div onClick={s.open} style={{ display: "flex", flexDirection: "column", gap: "2px", cursor: s.cur }}>
                  <strong style={{ fontSize: "22px", fontWeight: "700", fontVariantNumeric: "tabular-nums", color: s.fg }}>{s.v}</strong>
                  <span style={{ fontSize: "11px", color: "#D9C7BA", textDecoration: s.deco, textUnderlineOffset: "3px" }}>{s.label}</span>
                </div>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,.14)" }}>
              {(v.cal.cByTeam).map((b, b_i) => (<Fragment key={b_i}>
                <div style={{ display: "grid", gridTemplateColumns: "92px minmax(0, 1fr) 54px", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "#F3E9E1" }}>{b.name}</span>
                  <span style={{ height: "8px", borderRadius: "4px", background: "rgba(255,255,255,.12)", overflow: "hidden" }}>
                    <i style={{ display: "block", height: "100%", width: b.w, borderRadius: "4px", background: b.c }}>
                    </i>
                  </span>
                  <span style={{ textAlign: "right", fontSize: "12px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n} · {b.rate}</span>
                </div>
              </Fragment>))}
            </div>
          </div>
          {!!(v.cal.cIsGrid) && (<>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span onClick={v.cal.cPrevM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cal.cGridTitle}</strong>
                <span onClick={v.cal.cNextM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {(v.cal.cWk).map((w, w_i) => (<Fragment key={w_i}>
                  <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{w}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: "1px solid #EBDDD2" }}>
                {(v.cal.cCells).map((c, c_i) => (<Fragment key={c_i}>
                  <div onClick={c.pick} style={{ height: "54px", boxSizing: "border-box", padding: "4px 2px", borderBottom: "1px solid #F3E9E1", borderLeft: c.edge, background: c.bg, display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", opacity: c.op, cursor: "pointer" }}>
                    <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: c.w, background: c.dotBg, color: c.fg }}>{c.n}</span>
                    <span style={{ display: "flex", gap: "2px", flexWrap: "wrap", justifyContent: "center" }}>
                      {(c.dots).map((d, d_i) => (<Fragment key={d_i}>
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: d.c }}>
                        </span>
                      </Fragment>))}
                    </span>
                  </div>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "6px" }}>
                <span style={{ fontSize: "15px", fontWeight: "650" }}>{v.cal.cDayTitle}</span>
                {!!(v.cal.cShowAll) && (<>
                  <span onClick={v.cal.cAll} style={{ flex: "none", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Show all</span>
                </>)}
              </div>
            </div>
          </>)}
          {(v.cal.cDays).map((d, d_i) => (<Fragment key={d_i}>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", padding: "4px 14px", borderRadius: "18px", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.04), 0 6px 18px rgba(63,43,34,.06)" }}>
              <span style={{ padding: "10px 0 8px", fontSize: "13px", fontWeight: "700", color: d.color }}>{d.day}</span>
              {(d.items).map((a, a_i) => (<Fragment key={a_i}>
                <div onClick={a.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: a.rule, cursor: "pointer" }} className={H.hov3}>
                  <span style={{ flex: "none", width: "4px", alignSelf: "stretch", borderRadius: "2px", background: a.tc }}>
                  </span>
                  <span style={{ flex: "none", minWidth: "64px", whiteSpace: "nowrap", fontSize: "14px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{a.time}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{a.name}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.who} · {a.room}</small>
                  </span>
                  <span style={{ flex: "none", padding: "3px 8px", borderRadius: "6px", background: a.sBg, color: a.sFg, fontSize: "11px", fontWeight: "700" }}>{a.status}</span>
                  <svg style={{ flex: "none", color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
          {!!(v.cal.cEmpty) && (<>
            <p style={{ margin: "0", padding: "16px 0", fontSize: "14px", color: "#806B60" }}>No visits for this filter.</p>
          </>)}
        </main>
        {!!(v.cal.cpIsOpen) && (<>
          <div onClick={v.cal.cpClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.cal.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "4px" }}>
              </span>
              <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Show visits for</h2>
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.cal.cpSub}</p>
              <div onClick={v.cal.cpAll.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", margin: "0 -10px", borderRadius: "12px", background: v.cal.cpAll.bg, cursor: "pointer" }}>
                <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "#3F2B22" }}>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                  <strong style={{ fontSize: "16px", fontWeight: "650" }}>Everyone</strong>
                  <small style={{ fontSize: "12px", color: "#806B60" }}>{v.cal.cpAll.sub}</small>
                </span>
                <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              {(v.cal.cpGroups).map((g, g_i) => (<Fragment key={g_i}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 0 6px", fontSize: "12px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: g.c }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                    </span>{g.name} · {g.n}</span>
                  {(g.people).map((o, o_i) => (<Fragment key={o_i}>
                    <div onClick={o.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", margin: "0 -10px", borderTop: "1px solid #EBDDD2", borderRadius: o.r, background: o.bg, cursor: "pointer" }} className={H.hov3}>
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
        {!!(v.cal.crOpen) && (<>
          <div onClick={v.cal.crClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
            <div onClick={v.cal.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
                <span onClick={v.cal.crClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <path d="m6 6 12 12M6 18 18 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
                {(v.cal.crPresets).map((p, p_i) => (<Fragment key={p_i}>
                  <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "#FBF7F3" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                  <span onClick={v.cal.crPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m15 6-6 6 6 6">
                      </path>
                    </svg>
                  </span>
                  <strong style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-.01em" }}>{v.cal.crTitle}</strong>
                  <span onClick={v.cal.crNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m9 6 6 6-6 6">
                      </path>
                    </svg>
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                  {(v.cal.cWk).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>{w}</span>
                  </Fragment>))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                  {(v.cal.crCells).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                      <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                    </span>
                  </Fragment>))}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.cal.crFromBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>From</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cal.crFrom}</strong>
                </span>
                <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14m-5-5 5 5-5 5">
                  </path>
                </svg>
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.cal.crToBd}` }}>
                  <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>To</small>
                  <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cal.crTo}</strong>
                </span>
              </div>
              <span onClick={v.cal.crApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.cal.crApplyBg, color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{v.cal.crApplyLabel}</span>
            </div>
          </div>
        </>)}
      </>)}
    </>)}
    {!!(v.cl.open) && (<>
      <div onClick={v.cl.close} style={{ position: "absolute", inset: "0", zIndex: "24", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.cl.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", height: "72%", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 0 0", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 20px 0 12px" }}>
            <span onClick={v.cl.close} title="Back to Calendar" aria-label="Back to Calendar" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov7}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6">
                </path>
              </svg>
            </span>
            <strong style={{ flex: "1", minWidth: "0", fontSize: "19px", fontWeight: "700", letterSpacing: "-.02em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cl.title}</strong>
            <span style={{ fontSize: "13px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{v.cl.count}</span>
          </div>
          {!!(v.cl.empty) && (<>
            <p style={{ margin: "0", flex: "1", display: "grid", placeItems: "center", padding: "24px 20px", textAlign: "center", fontSize: "14px", color: "#806B60" }}>{v.cl.emptyText}</p>
          </>)}
          <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", padding: "0 20px" }}>
            {(v.cl.rows).map((r, r_i) => (<Fragment key={r_i}>
              <div onClick={r.open} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: r.rule, cursor: "pointer" }} className={H.hov1}>
                <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650" }}>{r.ini}</span>
                <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "15px", fontWeight: "650", color: "#3F2B22", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                  <small style={{ fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.phone}</small>
                  <small style={{ fontSize: "11px", color: "#A8968B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.owner}</small>
                </div>
                <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ fontSize: "12px", color: "#3F2B22" }}>{r.date}</span>
                  <span style={{ fontSize: "12px", color: "#806B60" }}>{r.time}</span>
                </div>
                <svg style={{ flex: "none", marginLeft: "-4px", color: "#C9B5A8" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </Fragment>))}
            {!!(v.cl.hasRows) && (<>
              <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "16px 0 28px", borderTop: "1px solid #EBDDD2", fontSize: "12px", color: "#B5A398" }}><span style={{ flex: "1", height: "1px", background: "#EBDDD2" }}>
                </span>End of list<span style={{ flex: "1", height: "1px", background: "#EBDDD2" }}>
                </span></div>
            </>)}
          </div>
        </div>
      </div>
    </>)}
    {!!(v.ci.Open) && (<>
      <div onClick={v.ci.Close} style={{ position: "absolute", inset: "0", zIndex: "25", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
        <div onClick={v.ci.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {!!(v.ci.hasBack) && (<>
              <span onClick={v.ci.Back} title="Back to list" aria-label="Back to list" style={{ flex: "none", width: "36px", height: "36px", marginLeft: "-8px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov7}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6">
                  </path>
                </svg>
              </span>
            </>)}
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: "650" }}>{v.ci.Ini}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
              <strong style={{ fontSize: "19px", fontWeight: "700" }}>{v.ci.Name}</strong>
            </div>
            <span onClick={v.ci.Edit} style={{ flex: "none", marginLeft: "auto", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #EBDDD2", display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                </path>
              </svg>Edit</span>
          </div>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "14px", border: "1px solid #EBDDD2" }}>
            {(v.ci.Rows).map((r, r_i) => (<Fragment key={r_i}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", padding: "12px 14px", borderTop: r.rule, fontSize: "14px" }}>
                <span style={{ flex: "none", color: "#806B60" }}>{r.k}</span>
                <strong style={{ fontWeight: "600", textAlign: "right", minWidth: "0", color: r.vFg }}>{r.v}</strong>
              </div>
            </Fragment>))}
          </div>
          <span onClick={v.ci.Chat} style={{ flex: "none", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: "#BD4A19", color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Open chat</span>
        </div>
      </div>
    </>)}
    {!!(v.show.pf) && (<>
      {!!(v.pf.onProfile) && (<>
        <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ position: "relative", borderRadius: "24px", background: "linear-gradient(180deg, #F9D9BF 0, #fff 96px)", border: "1px solid #EBDDD2", padding: "18px 16px 16px", display: "flex", flexDirection: "column", gap: "16px" }}>
            {!!(v.bellIn) && (<>
              <span onClick={v.bl.openNotifs} title="Notifications" style={{ flex: "none", width: "40px", height: "40px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", display: "grid", placeItems: "center", color: "#3F2B22", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer", position: "absolute", top: "14px", right: "14px" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Zm4 11a2 2 0 0 0 4 0">
                  </path>
                </svg>
                {!!(v.bl.notifUnread) && (<>
                  <span style={{ position: "absolute", top: "-4px", right: "-4px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", border: "2px solid #fff", color: "#fff", display: "grid", placeItems: "center", fontSize: "10px", fontWeight: "700" }}>{v.bl.notifUnread}</span>
                </>)}
              </span>
            </>)}
            <div style={{ display: "flex", alignItems: "center", gap: "14px", paddingRight: "48px" }}>
              <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", background: "#4E2F20", color: "#fff", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "650" }}>{v.pf.meIni}</span>
              <div style={{ minWidth: "0" }}>
                <h1 style={{ margin: "0", fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.pf.meName}</h1>
                <p style={{ margin: "2px 0 0", fontSize: "14px", color: "#806B60" }}>HOUZS Venture · CRM</p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", border: "1px solid #EBDDD2", borderRadius: "16px", background: "#fff" }}>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "13px", color: "#806B60" }}>Title</span>
                <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.pf.meTitle}</strong>
              </div>
              <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "2px", borderLeft: "1px solid #EBDDD2" }}>
                <span style={{ fontSize: "13px", color: "#806B60" }}>Access</span>
                <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.pf.meAccess}</strong>
              </div>
            </div>
          </div>
          {!!(v.pf.isFull) && (<>
            <div onClick={v.pf.openViewAs} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#3F2B22", color: "#fff", cursor: "pointer" }}>
              <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "rgba(255,255,255,.12)", color: "#F6B48A", display: "grid", placeItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z">
                  </path>
                </svg>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "17px", fontWeight: "700" }}>View as a team member</strong>
              </span>
              <svg style={{ flex: "none", color: "#D9C7BA" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </div>
          </>)}
          <div onClick={v.exitCrm} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "16px", borderRadius: "22px", background: "#F5EBE3", color: "#3F2B22", cursor: "pointer" }} className={H.hov13}>
            <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "14px", background: "#F6D9C4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 17l-5-5 5-5M5 12h11a4 4 0 0 1 4 4v3">
                </path>
              </svg>
            </span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
              <strong style={{ fontSize: "17px", fontWeight: "700" }}>Back to Revenue app</strong>
            </span>
            <svg style={{ flex: "none", color: "#A8968B" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m9 6 6 6-6 6">
              </path>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <h2 style={{ margin: "0 0 4px", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Your workspace</h2>
            <div onClick={v.pf.openNotifs} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", borderBottom: "1px solid #EBDDD2", cursor: "pointer" }}>
              <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E4EDF8", color: "#2F6FB5", display: "grid", placeItems: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4">
                  </path>
                </svg>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "17px", fontWeight: "700" }}>Notifications</strong>
              </span>
              {!!(v.pf.notifUnread) && (<>
                <span style={{ flex: "none", minWidth: "22px", height: "22px", padding: "0 7px", boxSizing: "border-box", borderRadius: "11px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700" }}>{v.pf.notifUnread}</span>
              </>)}
              <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </div>
            {!!(v.pfAdmin) && (<>
              <div onClick={v.fts.openPage} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer", borderBottom: "1px solid #EBDDD2" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#F3E8EF", color: "#8E4B6E", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 10 2 2 4-4">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "17px", fontWeight: "700" }}>Member work type</strong>
                </span>
                <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              <div onClick={v.pf.openRooms} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer", borderBottom: "1px solid #EBDDD2" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF3D6", color: "#A46312", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "17px", fontWeight: "700" }}>Showrooms</strong>
                </span>
                <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              <div onClick={v.tp.openPage} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer", borderBottom: "1px solid #EBDDD2" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2zM8 8h8M8 12h5">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "17px", fontWeight: "700" }}>Cold lead templates</strong>
                </span>
                <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
              <div onClick={v.pf.openAdsPerf} style={{ display: "flex", alignItems: "center", gap: "14px", padding: "14px 0", cursor: "pointer" }}>
                <span style={{ flex: "none", width: "52px", height: "52px", borderRadius: "50%", background: "#E4F1E8", color: "#387557", display: "grid", placeItems: "center" }}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1Zm14-2a4 4 0 0 1 0 6m2-9a8 8 0 0 1 0 12">
                    </path>
                  </svg>
                </span>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "17px", fontWeight: "700" }}>Ads Performance</strong>
                </span>
                <svg style={{ flex: "none", color: "#806B60" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </div>
            </>)}
          </div>
        </main>
      </>)}
    </>)}
    {!!(v.rm.rmDelOpen) && (<>
      <div onClick={v.rm.rmDelNo} style={{ position: "absolute", inset: "0", zIndex: "12", background: "rgba(63,43,34,.40)", display: "grid", placeItems: "center", padding: "28px", boxSizing: "border-box", animation: "fadeIn 160ms ease-out" }}>
        <div onClick={v.rm.stop} style={{ width: "100%", maxWidth: "300px", padding: "22px 20px 16px", boxSizing: "border-box", borderRadius: "22px", background: "#fff", boxShadow: "0 16px 40px rgba(63,43,34,.25)", display: "flex", flexDirection: "column", gap: "8px", textAlign: "center" }}>
          <span style={{ alignSelf: "center", width: "48px", height: "48px", borderRadius: "50%", background: "#FBE4DE", color: "#A3371A", display: "grid", placeItems: "center", marginBottom: "4px" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
              </path>
            </svg>
          </span>
          <strong style={{ fontSize: "18px", fontWeight: "700" }}>Delete {v.rm.rmDelName}?</strong>
          <p style={{ margin: "0 0 8px", fontSize: "14px", lineHeight: "1.45", color: "#806B60", textWrap: "pretty" }}>It will no longer appear in Book visit. This can't be undone.</p>
          <span onClick={v.rm.rmDelYes} style={{ height: "46px", borderRadius: "23px", background: "#A3371A", color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Delete</span>
          <span onClick={v.rm.rmDelNo} style={{ height: "44px", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>Cancel</span>
        </div>
      </div>
    </>)}
    {!!(v.rm.rmOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#FBF7F3", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.rm.closeRooms} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Profile</span>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1 style={{ margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Showrooms</h1>
        </div>
        {(v.rm.rmList).map((r, r_i) => (<Fragment key={r_i}>
          <section style={{ flex: "none", borderRadius: "18px", border: "1px solid #EBDDD2", background: "#fff", overflow: "hidden", boxShadow: "0 2px 8px rgba(63,43,34,.04)" }}>
            {!!(r.view) && (<>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "14px 12px 12px 16px", borderBottom: "1px solid #F0E6DE" }}>
                <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "10px", background: "#FFF3D6", color: "#A46312", display: "grid", placeItems: "center" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6">
                    </path>
                  </svg>
                </span>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "17px", fontWeight: "700" }}>{r.name}</strong>
                <span onClick={r.edit} title="Edit" style={{ flex: "none", height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "17px", border: "1px solid #EBDDD2", display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4">
                    </path>
                  </svg>Edit</span>
                <span onClick={r.del} title="Delete" style={{ flex: "none", width: "34px", height: "34px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#A3371A", cursor: "pointer" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ padding: "4px 16px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "14px 0", borderBottom: "1px solid #F5EEE9" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z">
                      </path>
                    </svg>Address</span>
                  <span style={{ fontSize: "14px", lineHeight: "1.45", color: r.addrFg }}>{r.addrShow}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "14px 0", borderBottom: "1px solid #F5EEE9" }}>
                  <span style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", alignItems: "center", gap: "10px" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2">
                        </path>
                      </svg>Slots</span>
                    <span style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", textAlign: "center", fontSize: "10px", fontWeight: "700", color: "#A8968B" }}>
                      <span>M</span>
                      <span>T</span>
                      <span>W</span>
                      <span>T</span>
                      <span>F</span>
                      <span>S</span>
                      <span>S</span>
                    </span>
                  </span>
                  {(r.slotChips).map((c, c_i) => (<Fragment key={c_i}>
                    <span style={{ display: "grid", gridTemplateColumns: "76px minmax(0, 1fr)", alignItems: "center", gap: "10px" }}>
                      <strong style={{ fontSize: "14px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{c.t}</strong>
                      <span style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                        {(c.days).map((d, d_i) => (<Fragment key={d_i}>
                          <span style={{ height: "24px", boxSizing: "border-box", borderRadius: "7px", background: d.cBg, border: `1px solid ${d.cBd}`, color: d.cFg, display: "grid", placeItems: "center" }}>
                            {!!(d.open) && (<>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </>)}
                            {!!(d.closed) && (<>
                              <span style={{ width: "6px", height: "2px", borderRadius: "1px", background: "currentColor" }}>
                              </span>
                            </>)}
                          </span>
                        </Fragment>))}
                      </span>
                    </span>
                  </Fragment>))}
                  {!!(r.noSlots) && (<>
                    <span style={{ fontSize: "13px", color: "#B5A398" }}>No time slots yet</span>
                  </>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", padding: "14px 0" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm14 10v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8">
                        </path>
                      </svg>Booking limit</span>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>{r.capShort}</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM5 5l14 14">
                        </path>
                      </svg>Blocked</span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {(r.blockChips).map((c, c_i) => (<Fragment key={c_i}>
                        <span style={{ padding: "2px 8px", borderRadius: "7px", background: "#fff", border: "1px solid #EBDDD2", color: "#4E2F20", fontSize: "12px", fontWeight: "600" }}>{c.t}</span>
                      </Fragment>))}
                      {!!(r.noBlock) && (<>
                        <strong style={{ fontSize: "15px", fontWeight: "700", color: "#B5A398" }}>None</strong>
                      </>)}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "1px solid #F0E6DE" }}>
                <a href={r.waze} target="_blank" rel="noopener" style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", opacity: r.navOp }}><span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#33CCFF", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "800" }}>W</span>Waze</a>
                <a href={r.gmaps} target="_blank" rel="noopener" style={{ height: "46px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", borderLeft: "1px solid #F0E6DE", fontSize: "14px", fontWeight: "650", color: "#3F2B22", textDecoration: "none", opacity: r.navOp }}><span style={{ width: "22px", height: "22px", borderRadius: "6px", background: "#34A853", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "800" }}>G</span>Google Maps</a>
              </div>
            </>)}
            {!!(r.editing) && (<>
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "12px", background: "#fff" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Showroom name</span>
                  <input value={r.dName} onChange={r.setName} placeholder="e.g. Puchong showroom" style={{ height: "46px", boxSizing: "border-box", padding: "0 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", color: "#3F2B22", background: "#FBF7F3", fontWeight: "650" }} />
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  <span style={{ fontSize: "13px", fontWeight: "600", color: "#806B60" }}>Full address</span>
                  <textarea rows={3} value={r.dAddr} onChange={r.setAddr} placeholder="Street, postcode, city, state" style={{ display: "block", width: "100%", boxSizing: "border-box", padding: "12px 14px", border: "1px solid #EBDDD2", borderRadius: "14px", outline: "none", font: "inherit", fontSize: "15px", lineHeight: "1.45", color: "#3F2B22", resize: "none", background: "#FBF7F3" }}>
                  </textarea>
                </label>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "14px", borderTop: "1px solid #EBDDD2" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Time slots</strong>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                      <span>
                      </span>
                      {(r.dGridHead).map((w, w_i) => (<Fragment key={w_i}>
                        <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", color: "#A8968B" }}>{w}</span>
                      </Fragment>))}
                      <span>
                      </span>
                    </div>
                    {(r.dGrid).map((g, g_i) => (<Fragment key={g_i}>
                      <div style={{ display: "grid", gridTemplateColumns: "76px repeat(7, minmax(0, 1fr)) 24px", alignItems: "center", gap: "4px" }}>
                        <span style={{ display: "flex", flexDirection: "column" }}>
                          <strong style={{ fontSize: "14px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{g.t}</strong>
                          <small style={{ fontSize: "11px", color: "#806B60" }}>{g.cnt}</small>
                        </span>
                        {(g.cells).map((c, c_i) => (<Fragment key={c_i}>
                          <span onClick={c.pick} style={{ height: "34px", borderRadius: "9px", background: c.bg, color: c.fg, display: "grid", placeItems: "center", cursor: "pointer" }}>
                            {!!(c.on) && (<>
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m5 12 5 5 9-10">
                                </path>
                              </svg>
                            </>)}
                          </span>
                        </Fragment>))}
                        <span onClick={g.rm} title="Delete this time" style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#A8968B", cursor: "pointer" }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="m6 6 12 12M6 18 18 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                    </Fragment>))}
                    <span style={{ fontSize: "12px", color: "#A8968B" }}>Tap a box to open or close that time on that day.</span>
                  </div>
                  {!!(r.dNoSlots) && (<>
                    <span style={{ fontSize: "13px", color: "#B5A398" }}>No time slots yet</span>
                  </>)}
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "10px", borderRadius: "14px", background: "#FBF7F3" }}>
                    <span style={{ display: "flex", justifyContent: "space-between", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>
                      <span>Days</span>
                      <span style={{ color: "#3F2B22" }}>{r.dNewDaysTxt}</span>
                    </span>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                      {(r.dNewDays).map((d, d_i) => (<Fragment key={d_i}>
                        <span onClick={d.pick} style={{ height: "36px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>{d.label}</span>
                      </Fragment>))}
                    </div>
                    <div style={{ display: "flex", gap: "6px" }}>
                      <span onClick={r.openTP} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3 2">
                          </path>
                        </svg>
                        <span style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "600", color: r.newTFg }}>{r.newTLbl}</span>
                        <svg style={{ flex: "none", color: "#806B60" }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="m6 9 6 6 6-6">
                          </path>
                        </svg>
                      </span>
                      <span onClick={r.addSlot} title="Add time slot" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.addBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                          <path d="M12 5v14M5 12h14">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "14px", borderTop: "1px solid #EBDDD2" }}>
                  <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Booking limit</strong>
                  </span>
                  <span style={{ flex: "none", display: "flex", alignItems: "center", height: "40px", border: "1px solid #EBDDD2", borderRadius: "12px", background: "#fff" }}>
                    <span onClick={r.capMinus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capMinusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M5 12h14">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ minWidth: "28px", textAlign: "center", fontSize: "16px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{r.dCap}</strong>
                    <span onClick={r.capPlus} style={{ width: "40px", height: "40px", display: "grid", placeItems: "center", color: r.capPlusFg, cursor: "pointer" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "6px", padding: "14px", borderRadius: "16px", border: "1px solid #F3D9CE", background: "#FDF3EF" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "8px", background: "#FBEAE6", color: "#A3371A", display: "grid", placeItems: "center" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM4.9 4.9l14.2 14.2">
                        </path>
                      </svg>
                    </span>
                    <strong style={{ fontSize: "15px", fontWeight: "700", color: "#3F2B22" }}>Blocked time slots</strong>
                  </span>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>Every week</span>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                    {(r.dWeek).map((w, w_i) => (<Fragment key={w_i}>
                      <span onClick={w.pick} style={{ height: "36px", borderRadius: "10px", border: `1px solid ${w.bd}`, background: w.bg, color: w.fg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", cursor: "pointer" }}>{w.label}</span>
                    </Fragment>))}
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>Dates</span>
                  {(r.dBlocks).map((b, b_i) => (<Fragment key={b_i}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", height: "40px", padding: "0 4px 0 12px", borderRadius: "12px", background: "#F5EEE9" }}>
                      <span style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.t}</span>
                      <span onClick={b.rm} title="Remove" style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                          <path d="m6 6 12 12M6 18 18 6">
                          </path>
                        </svg>
                      </span>
                    </div>
                  </Fragment>))}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    <span onClick={r.openA} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBAbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>From</small>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBAfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBAtxt}</strong>
                      </span>
                    </span>
                    <span onClick={r.openB} style={{ minWidth: "0", height: "52px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBBbd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }}>
                      <svg style={{ flex: "none", color: "#BD4A19" }} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
                        </path>
                      </svg>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                        <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>To</small>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBBfg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.dBBtxt}</strong>
                      </span>
                    </span>
                  </div>
                  {!!(r.calOpen) && (<>
                    <div style={{ padding: "12px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", boxShadow: "0 8px 20px rgba(63,43,34,.10)", display: "flex", flexDirection: "column", gap: "8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span onClick={r.calPrev} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m15 6-6 6 6 6">
                            </path>
                          </svg>
                        </span>
                        <strong style={{ flex: "1", textAlign: "center", fontSize: "15px", fontWeight: "700" }}>{r.calTitle}</strong>
                        <span onClick={r.calNext} style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov5}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="m9 6 6 6-6 6">
                            </path>
                          </svg>
                        </span>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "2px", textAlign: "center" }}>
                        {(r.calWk).map((w, w_i) => (<Fragment key={w_i}>
                          <span style={{ fontSize: "11px", fontWeight: "700", color: "#A8968B", padding: "4px 0" }}>{w}</span>
                        </Fragment>))}
                        {(r.calDays).map((d, d_i) => (<Fragment key={d_i}>
                          <span onClick={d.pick} style={{ height: "38px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: d.fw, background: d.bg, color: d.fg, cursor: d.cur }}>{d.n}</span>
                        </Fragment>))}
                      </div>
                    </div>
                  </>)}
                  <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".06em", textTransform: "uppercase", color: "#A8968B" }}>Time</span>
                  <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
                    {(r.dBMode).map((m, m_i) => (<Fragment key={m_i}>
                      <span onClick={m.pick} style={{ flex: "1", height: "32px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: m.w, background: m.bg, color: m.fg, boxShadow: m.sh, cursor: "pointer" }}>{m.label}</span>
                    </Fragment>))}
                  </div>
                  {!!(r.dBHours) && (<>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span onClick={r.openT1} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBT1bd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "#BD4A19" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                          </path>
                        </svg>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBT1fg, whiteSpace: "nowrap" }}>{r.dBT1txt}</strong>
                      </span>
                      <span style={{ flex: "none", color: "#A8968B" }}>–</span>
                      <span onClick={r.openT2} style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: `1.5px solid ${r.dBT2bd}`, borderRadius: "12px", background: "#fff", display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                        <svg style={{ flex: "none", color: "#BD4A19" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z">
                          </path>
                        </svg>
                        <strong style={{ fontSize: "14px", fontWeight: "650", color: r.dBT2fg, whiteSpace: "nowrap" }}>{r.dBT2txt}</strong>
                      </span>
                    </div>
                    {!!(r.dBTOpen) && (<>
                      <div style={{ padding: "12px", borderRadius: "16px", border: "1px solid #EBDDD2", background: "#fff", boxShadow: "0 8px 20px rgba(63,43,34,.10)", display: "flex", flexDirection: "column", gap: "10px" }}>
                        <strong style={{ fontSize: "13px", fontWeight: "700", color: "#3F2B22" }}>{r.dBTTitle}</strong>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
                          {(r.dBTimes).map((o, o_i) => (<Fragment key={o_i}>
                            <span onClick={o.pick} style={{ height: "36px", borderRadius: "10px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "650", whiteSpace: "nowrap", cursor: o.cur, fontVariantNumeric: "tabular-nums" }}>{o.t}</span>
                          </Fragment>))}
                        </div>
                      </div>
                    </>)}
                    {!!(r.dBTimeErr) && (<>
                      <span style={{ fontSize: "12px", color: "#A3371A" }}>End time must be after the start time.</span>
                    </>)}
                  </>)}
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input value={r.dBWhy} onChange={r.setBWhy} placeholder="Reason, e.g. Training" style={{ flex: "1", minWidth: "0", height: "44px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "12px", outline: "none", font: "inherit", fontSize: "14px", color: "#3F2B22", background: "#fff" }} />
                    <span onClick={r.addBlock} title="Add closed dates" style={{ flex: "none", width: "44px", height: "44px", borderRadius: "12px", background: r.blockBg, color: "#fff", display: "grid", placeItems: "center", cursor: "pointer" }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                        <path d="M12 5v14M5 12h14">
                        </path>
                      </svg>
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", paddingTop: "4px" }}>
                  <span onClick={r.remove} style={{ fontSize: "14px", fontWeight: "600", color: "#A3371A", cursor: "pointer" }}>Remove</span>
                  <span style={{ display: "flex", gap: "8px" }}>
                    <span onClick={r.cancel} style={{ height: "40px", padding: "0 16px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>Cancel</span>
                    <span onClick={r.save} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}>Save</span>
                  </span>
                </div>
              </div>
            </>)}
          </section>
        </Fragment>))}
        <span onClick={v.rm.rmAdd} style={{ flex: "none", height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px dashed #D9C7BA", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "15px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14">
            </path>
          </svg>Add showroom</span>
      </div>
      {!!(v.rm.tpOpen) && (<>
        <div onClick={v.rm.tpClose} style={{ position: "absolute", inset: "0", zIndex: "9", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
          <div onClick={v.rm.tpStop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "14px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Add time slot</h2>
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpH).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpM).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
              <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "4px", maxHeight: "220px", overflowY: "auto", scrollbarWidth: "none" }}>
                {(v.rm.tpA).map((o, o_i) => (<Fragment key={o_i}>
                  <span onClick={o.pick} style={{ flex: "none", height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "17px", fontWeight: o.w, background: o.bg, color: o.fg, fontVariantNumeric: "tabular-nums", cursor: "pointer" }}>{o.t}</span>
                </Fragment>))}
              </div>
            </div>
            <span onClick={v.rm.tpDone} style={{ height: "48px", borderRadius: "24px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>Done · {v.rm.tpLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
    {!!(v.ol.undoOn) && (<>
      <div onClick={v.ol.undoClose} style={{ position: "absolute", inset: "0", zIndex: "9" }}>
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
            <strong style={{ fontSize: "14px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ol.undoText}</strong>
            <small style={{ fontSize: "12px", color: "#D9C7BA" }}>You can undo for {v.ol.undoLeft}</small>
          </span>
          <span onClick={v.ol.undoDo} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "#fff", color: "#3F2B22", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>Undo</span>
          <span onClick={v.ol.undoClose} title="Dismiss" style={{ flex: "none", width: "32px", height: "32px", display: "grid", placeItems: "center", color: "#D9C7BA", cursor: "pointer" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="m6 6 12 12M6 18 18 6">
              </path>
            </svg>
          </span>
        </div>
        <span style={{ display: "block", height: "3px", background: "rgba(255,255,255,.15)" }}>
          <i style={{ display: "block", height: "100%", width: v.ol.undoPct, background: "#E9A27A", transition: "width 1s linear" }}>
          </i>
        </span>
      </div>
    </>)}
    {!!(v.ol.sdOpen) && (<>
      <div onClick={v.ol.sdClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.ol.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Send {v.ol.sdName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.ol.sdAd}</p>
          {(v.ol.sdGroups).map((g, g_i) => (<Fragment key={g_i}>
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
          <span onClick={v.ol.sdConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.ol.sdBtnBg, color: "#fff", fontSize: "16px", fontWeight: "650", textAlign: "center", cursor: v.ol.sdBtnCur }}>{v.ol.sdBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.ol.mvOpen) && (<>
      <div onClick={v.ol.mvClose} style={{ position: "absolute", inset: "0", zIndex: "11", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div onClick={v.ol.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
          </span>
          <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Move {v.ol.mvName} to</h2>
          <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.ol.mvAd}</p>
          {(v.ol.mvGroups).map((g, g_i) => (<Fragment key={g_i}>
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
          <span onClick={v.ol.mvConfirm} style={{ flex: "none", marginTop: "12px", height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", padding: "0 16px", background: v.ol.mvBtnBg, color: "#fff", fontSize: "16px", fontWeight: "650", textAlign: "center", cursor: v.ol.mvBtnCur }}>{v.ol.mvBtnLabel}</span>
        </div>
      </div>
    </>)}
    {!!(v.ol.attOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.ol.closeAtt} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 6-6 6 6 6">
            </path>
          </svg>Insight</span>
        <h1 style={{ flex: "none", margin: "0", fontSize: "30px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.15" }}>Awaiting reply</h1>
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "8px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "2px 20px" }}>
          {(v.ol.attTabs).map((vi, vi_i) => (<Fragment key={vi_i}>
            <span onClick={vi.pick} style={{ flex: "none", height: "38px", padding: "0 8px 0 14px", boxSizing: "border-box", borderRadius: "19px", border: `1px solid ${vi.bd}`, display: "flex", alignItems: "center", gap: "8px", fontSize: "14px", fontWeight: vi.w, background: vi.bg, color: vi.fg, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}<em style={{ minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "grid", placeItems: "center", fontStyle: "normal", fontSize: "12px", fontWeight: "700", background: vi.nBg, color: vi.nFg }}>{vi.n}</em></span>
          </Fragment>))}
        </div>
        {(v.ol.attGroups).map((g, g_i) => (<Fragment key={g_i}>
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
        {!!(v.ol.attEmpty) && (<>
          <p style={{ margin: "0", fontSize: "14px", color: "#806B60" }}>Nobody is waiting.</p>
        </>)}
      </div>
    </>)}
    {!!(v.ol.vaOpen) && (<>
      <div style={{ position: "absolute", left: "0", right: "0", top: "0", bottom: "0", zIndex: "8", background: "#fff", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", animation: "fadeIn 160ms ease-out" }}>
        <span onClick={v.ol.closeViewAs} style={{ flex: "none", alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "6px", height: "44px", color: "#BD4A19", fontSize: "17px", fontWeight: "600", cursor: "pointer" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
          <input value={v.ol.vaQ} onChange={v.ol.vaSetQ} placeholder="Search name or title" style={{ flex: "1", minWidth: "0", border: "0", outline: "none", background: "transparent", font: "inherit", fontSize: "16px", color: "#3F2B22" }} />
        </label>
        {(v.ol.vaGroups).map((g, g_i) => (<Fragment key={g_i}>
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
        {!!(v.ol.vaNone) && (<>
          <p style={{ margin: "0", padding: "12px 0", fontSize: "14px", color: "#806B60" }}>Nobody matches.</p>
        </>)}
      </div>
    </>)}
    {!!(v.ol.pcOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FFFFFF", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <span onClick={v.ol.closePc} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
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
            <input value={v.ol.pcQ} onChange={v.ol.setPcQ} placeholder="Search name or member" style={{ flex: "1", minWidth: "0", border: "0", background: "transparent", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none" }} />
          </label>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "0 20px 24px" }}>
          {(v.ol.pcRows).map((c, c_i) => (<Fragment key={c_i}>
            <div>
              {!!(c.hasHead) && (<>
                <div style={{ padding: "14px 0 4px", fontSize: "13px", fontWeight: "700", color: "#BD4A19" }}>{c.head}</div>
              </>)}
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 0", borderTop: c.rule }}>
                <div onClick={c.open} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", background: c.ownBg, display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "700" }}>{c.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                    <strong style={{ fontSize: "15px", lineHeight: "20px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</strong>
                    <small style={{ display: "block", fontSize: "12px", lineHeight: "16px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{c.phone}</small>
                    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: "0", fontSize: "12px", lineHeight: "16px", fontWeight: "600", color: "#3F2B22" }}>
                      <span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: c.wc }}>
                      </span>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.who}</span>
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
          {!!(v.ol.pcEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "14px", color: "#A8968B" }}>No one matches.</p>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.ol.notifOpen) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "12px", background: "#FBF7F3" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span onClick={v.ol.closeNotifs} style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>Back</span>
            {!!(v.ol.readAllShow) && (<>
              <span onClick={v.ol.readAll} style={{ fontSize: "13px", fontWeight: "650", color: v.ol.readAllFg, cursor: "pointer" }}>Mark all read</span>
            </>)}
          </div>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em" }}>Notifications</h1>
          <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
            {(v.ol.nfTabs).map((t, t_i) => (<Fragment key={t_i}>
              <span onClick={t.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "13px", fontWeight: t.w, background: t.bg, color: t.fg, boxShadow: t.sh, cursor: "pointer" }}>{t.label}{!!(t.n) && (<>
                  <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", background: "#BD4A19", color: "#fff", display: "grid", placeItems: "center", fontSize: "11px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{t.n}</span>
                </>)}</span>
            </Fragment>))}
          </div>
          <div data-drag-scroll="1" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px", userSelect: "none" }}>
            {(v.ol.nfChips).map((c, c_i) => (<Fragment key={c_i}>
              <span onClick={c.pick} style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 13px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                </span>{c.label}<small style={{ fontSize: "11px", opacity: ".75" }}>{c.n}</small></span>
            </Fragment>))}
          </div>
        </div>
        <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 28px", display: "flex", flexDirection: "column", gap: "18px" }}>
          {(v.ol.nfGroups).map((g, g_i) => (<Fragment key={g_i}>
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
          {!!(v.ol.nfEmpty) && (<>
            <p style={{ margin: "24px 0 0", textAlign: "center", fontSize: "14px", color: "#A8968B" }}>{v.ol.nfEmptyText}</p>
          </>)}
        </div>
      </div>
    </>)}
    {!!(v.hl.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "7", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "fadeIn 160ms ease-out" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "14px 12px 10px", borderBottom: "1px solid #EBDDD2", background: "#fff" }}>
          <span onClick={v.hl.back} title="Back" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov7}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6">
              </path>
            </svg>
          </span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
            <strong style={{ fontSize: "17px", fontWeight: "700", letterSpacing: "-.01em" }}>Over the limit</strong>
            <small style={{ fontSize: "12px", color: "#806B60" }}>{v.hl.sub}</small>
          </span>
          <span onClick={v.hl.close} title="Close" style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }} className={H.hov7}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12">
              </path>
            </svg>
          </span>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "16px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {!!(v.hl.empty) && (<>
            <div style={{ padding: "48px 16px", textAlign: "center", fontSize: "14px", color: "#806B60" }}>Nothing waiting. Every lead has someone.</div>
          </>)}
          {(v.hl.groups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", background: "#FFF6EE", borderBottom: "1px solid #F3D9C4" }}>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <strong style={{ fontSize: "15px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.ad}</strong>
                  <small style={{ fontSize: "12px", color: "#A3371A", fontWeight: "600" }}>{g.full}</small>
                </span>
                <span onClick={g.edit} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", border: "1px solid #2F6FB5", color: "#2F6FB5", display: "flex", alignItems: "center", fontSize: "12px", fontWeight: "650", cursor: "pointer" }} className={H.hov9}>Edit limits</span>
              </div>
              {(g.rows).map((r, r_i) => (<Fragment key={r_i}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px", borderTop: r.rule }}>
                  <span onClick={r.chat} style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px", cursor: "pointer" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.meta}</small>
                  </span>
                  <span onClick={r.chat} title="Open chat" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }} className={H.hov7}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z">
                      </path>
                    </svg>
                  </span>
                  <span onClick={r.send} style={{ flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", background: "#BD4A19", color: "#fff", display: "flex", alignItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }} className={H.hov8}>Send to</span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </div>
    </>)}
    {!!(v.fts.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 12px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span onClick={v.fts.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Profile</span>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em" }}>Member work type</h1>
          <p style={{ margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#806B60" }}>Turned on here, they appear in Assignment › Full time lead allocation, where you pick their days.</p>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {(v.fts.groups).map((g, g_i) => (<Fragment key={g_i}>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 14px", borderBottom: "1px solid #F3E9E1" }}>
                <span style={{ flex: "none", width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                </span>
                <strong style={{ flex: "1", fontSize: "14px", fontWeight: "700", color: g.c }}>{g.name}</strong>
                <small style={{ fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{g.count}</small>
              </div>
              {(g.people).map((p, p_i) => (<Fragment key={p_i}>
                <div onClick={p.toggle} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderTop: p.rule, cursor: "pointer" }}>
                  <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650" }}>{p.ini}</span>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{p.title}</small>
                  </span>
                  <span style={{ flex: "none", position: "relative", width: "44px", height: "26px", borderRadius: "13px", background: p.swBg, transition: "background 160ms" }}>
                    <span style={{ position: "absolute", top: "3px", left: p.swX, width: "20px", height: "20px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.25)", transition: "left 160ms" }}>
                    </span>
                  </span>
                </div>
              </Fragment>))}
            </div>
          </Fragment>))}
        </div>
      </div>
    </>)}
    {!!(v.tp.open) && (<>
      <div style={{ position: "absolute", inset: "0", zIndex: "10", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", padding: "10px 20px 8px", display: "flex", flexDirection: "column", gap: "8px" }}>
          <span onClick={v.tp.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "36px", marginLeft: "-4px", color: "#BD4A19", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 6-6 6 6 6">
              </path>
            </svg>Profile</span>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em" }}>Cold lead templates</h1>
        </div>
        <div style={{ flex: "1", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "4px 20px 32px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <p style={{ flex: "none", margin: "0", fontSize: "13px", lineHeight: "1.5", color: "#806B60" }}>Switch a template on and salespeople can send it from a cold lead's chat. Only approved templates can be switched on.</p>
          <div style={{ flex: "none", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px 0" }}>
            <strong style={{ fontSize: "15px", fontWeight: "700" }}>Templates</strong>
            <span onClick={v.tp.add} style={{ fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>+ New template</span>
          </div>
          {(v.tp.list).map((t, t_i) => (<Fragment key={t_i}>
            <div onClick={t.edit} style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "14px", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }} className={H.hov11}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</strong>
                <span style={{ flex: "none", padding: "3px 8px", borderRadius: "10px", background: t.stBg, color: t.stFg, fontSize: "11px", fontWeight: "700" }}>{t.status}</span>
                <span onClick={t.toggle} title={t.swTitle} style={{ flex: "none", position: "relative", width: "40px", height: "24px", borderRadius: "12px", background: t.swBg, opacity: t.swOp, cursor: t.swCur, transition: "background 160ms" }}>
                  <span style={{ position: "absolute", top: "3px", left: t.swX, width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(63,43,34,.25)", transition: "left 160ms" }}>
                  </span>
                </span>
              </div>
              <small style={{ fontSize: "12px", color: t.chFg, fontWeight: "600" }}>{t.channel}</small>
              <span style={{ fontSize: "13px", lineHeight: "1.5", color: "#3F2B22", display: "-webkit-box", WebkitLineClamp: "3", WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.body}</span>
            </div>
          </Fragment>))}
        </div>
        {!!(v.tp.edOpen) && (<>
          <div onClick={v.tp.edClose} style={{ position: "absolute", inset: "0", zIndex: "2", background: "rgba(63,43,34,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" }}>
            <div onClick={v.tp.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ flex: "1", fontSize: "19px", fontWeight: "700" }}>{v.tp.edTitle}</strong>
                {!!(v.tp.edCanDel) && (<>
                  <span onClick={v.tp.edDel} style={{ fontSize: "13px", fontWeight: "650", color: "#A3371A", cursor: "pointer" }}>Delete</span>
                </>)}
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "650", color: "#806B60" }}>Template name</span>
                <input value={v.tp.edName} onChange={v.tp.edSetName} placeholder="e.g. Follow up visit" style={{ width: "100%", boxSizing: "border-box", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", height: "46px", padding: "0 14px" }} />
              </label>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ fontSize: "12px", fontWeight: "650", color: "#806B60" }}>Channel</span>
                <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
                  {(v.tp.edChs).map((c, c_i) => (<Fragment key={c_i}>
                    <span onClick={c.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: c.w, background: c.bg, color: c.fg, boxShadow: c.sh, cursor: "pointer" }}>{c.label}</span>
                  </Fragment>))}
                </div>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                <span style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "12px", fontWeight: "650", color: "#806B60" }}>Message</span>
                  <span onClick={v.tp.edInsName} style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>+ Customer name</span>
                </span>
                <textarea value={v.tp.edBody} onChange={v.tp.edSetBody} rows={5} placeholder={v.tp.edPh} style={{ width: "100%", boxSizing: "border-box", borderRadius: "12px", border: "1px solid #EBDDD2", background: "#FBF7F3", font: "inherit", fontSize: "15px", color: "#3F2B22", outline: "none", padding: "12px 14px", lineHeight: "1.5", resize: "none" }}>
                </textarea>
                <small style={{ fontSize: "11px", color: "#A8968B" }}>{"{"}name{"}"} is replaced with the customer's first name.</small>
              </label>
              <div style={{ display: "flex", gap: "10px" }}>
                <span onClick={v.tp.edDraft} style={{ flex: "1", height: "50px", borderRadius: "25px", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Save draft</span>
                <span onClick={v.tp.edSubmit} style={{ flex: "1.4", height: "50px", borderRadius: "25px", background: v.tp.edOkBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "700", cursor: "pointer" }}>Submit for review</span>
              </div>
            </div>
          </div>
        </>)}
      </div>
    </>)}
    <nav style={{ flex: "none", display: v.navOn ? "flex" : "none", alignItems: "flex-end", height: "62px", padding: "0 4px", background: "#fff", borderTop: "1px solid #EBDDD2" }}>
      {(v.nv.nav).map((t, t_i) => (<Fragment key={t_i}>
        <span onClick={t.go} style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", padding: "6px 0 8px", fontSize: "11px", fontWeight: t.w, color: t.color, cursor: "pointer" }}>
          <span style={{ position: "relative", display: "grid", placeItems: "center", width: "56px", height: "30px" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
              <path d={t.icon}>
              </path>
            </svg>
            {!!(t.badge) && (<>
              <b style={{ position: "absolute", top: "0", right: "8px", minWidth: "16px", height: "16px", padding: "0 4px", boxSizing: "border-box", borderRadius: "8px", background: "#BD4A19", color: "#fff", fontSize: "10px", fontWeight: "700", lineHeight: "16px", textAlign: "center", boxShadow: "0 0 0 2px #fff" }}>{t.badge}</b>
            </>)}
          </span>
          <span>{t.label}</span>
        </span>
      </Fragment>))}
    </nav>
    {!!(v.toast) && (<>
      <div style={{ position: "absolute", left: "20px", right: "20px", bottom: v.toastBottom, zIndex: "30", padding: "12px 14px", borderRadius: "14px", background: "#3F2B22", color: "#fff", fontSize: "14px", fontWeight: "600", animation: "fadeIn 160ms ease-out" }}>{v.toast}</div>
    </>)}
  </>);
}
