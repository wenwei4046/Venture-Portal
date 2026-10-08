"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/assign.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { AssignVM } from "./vm/assign";

/** Assignment: Organic Leads, Ads to teams (and its edit page), Awaiting reply, Full time lead allocation (and its page). */
export default function PanelAssign({ v }: { v: AssignVM }) {
  return (<>
            
    {!!(v.onAssign) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "2px" }}>
          <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Assignment</h1>
          <span style={{ fontSize: "13px", color: "#806B60" }}>Who gets each new enquiry</span>
        </div>
        {!!(v.hasWaiting) && (<>
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
              <span style={{ flex: "none", display: "grid", placeItems: "center", minWidth: "28px", height: "28px", padding: "0 9px", boxSizing: "border-box", borderRadius: "14px", background: "#BD4A19", color: "#fff", fontSize: "14px", fontWeight: "700" }}>{v.waitingN}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", background: "#fff", border: "1px solid #F3D9C4", padding: "0 12px" }}>
              {(v.waitList).map((w, w_i) => (<Fragment key={w_i}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: w.rule }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
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
        {!!(v.notTL) && (<>
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
            {(v.adRows).map((a, a_i) => (<Fragment key={a_i}>
              <div style={{ padding: "14px", borderRadius: "14px", background: "#fff", border: "1px solid #DCE6F2", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                    <strong style={{ fontSize: "15px", fontWeight: "650" }}>{a.name}</strong>
                    <small style={{ fontSize: "12px", color: "#806B60" }}>{a.page} · Total leads {a.leads}</small>
                  </span>
                  <span style={{ flex: "none", padding: "4px 8px", borderRadius: "6px", background: a.tagBg, color: a.tagFg, fontSize: "11px", fontWeight: "700", whiteSpace: "nowrap" }}>{a.tag}</span>
                </div>
                {!!(a.resNone) && (<>
                  <span style={{ fontSize: "13px", color: "#A8968B" }}>Not assigned yet. Leads wait in Organic Leads.</span>
                </>)}
                {!!(a.resLine) && (<>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", height: "8px", borderRadius: "4px", overflow: "hidden", background: "#EEF3F9", gap: "2px" }}>
                      {(a.bar).map((b, b_i) => (<Fragment key={b_i}>
                        <span style={{ width: b.w, background: b.c, opacity: b.op }}>
                        </span>
                      </Fragment>))}
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22", lineHeight: "1.45", textWrap: "pretty" }}>{a.resLine}</span>
                  </div>
                </>)}
                <span onClick={a.edit} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #DCE6F2", background: "#F4F8FC", color: "#2F6FB5", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16v4Z">
                    </path>
                  </svg>Edit assignment</span>
              </div>
            </Fragment>))}
          </section>
        </>)}
        {!!(v.isTL) && (<>
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
            {(v.tlAds).map((a, a_i) => (<Fragment key={a_i}>
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
            <span onClick={v.openAtt} style={{ flex: "none", fontSize: "13px", fontWeight: "650", color: "#8E4B6E", cursor: "pointer" }}>See all</span>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            {(v.asgAttSum).map((g, g_i) => (<Fragment key={g_i}>
              <span onClick={g.pick} style={{ flex: "1", minWidth: "0", padding: "8px 10px", borderRadius: "12px", background: g.bg, border: `1px solid ${g.bd}`, cursor: "pointer", display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: "20px", fontWeight: "700", color: g.c, fontVariantNumeric: "tabular-nums" }}>{g.n}</strong>
                <small style={{ fontSize: "11px", fontWeight: "600", color: g.c, whiteSpace: "nowrap" }}>{g.name}</small>
              </span>
            </Fragment>))}
          </div>
          <div style={{ padding: "2px 14px", borderRadius: "14px", background: "#fff", border: "1px solid #EEDCE6" }}>
            {(v.asgAtt).map((l, l_i) => (<Fragment key={l_i}>
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
            {(v.ftSum).map((t, t_i) => (<Fragment key={t_i}>
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
      </main>
      {!!(v.adEdOpen) && (<>
        <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "#fff", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ flex: "1 1 auto", minHeight: "0", display: "flex", flexDirection: "column" }}>
            <div style={{ flex: "none", padding: "10px 20px 14px", display: "flex", flexDirection: "column", gap: "10px", borderBottom: "1px solid #EEF3F9" }}>
              <span onClick={v.ae.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "32px", marginLeft: "-4px", color: "#2F6FB5", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 6-6 6 6 6">
                  </path>
                </svg>Assignment</span>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
                  <h2 style={{ margin: "0", fontSize: "22px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.ae.name}</h2>
                  <small style={{ fontSize: "12px", color: "#806B60" }}>{v.ae.page} · Total leads {v.ae.leads}</small>
                </span>
              </div>
            </div>
            <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
              <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#EEF3F9" }}>
                {(v.ae.modes).map((m, m_i) => (<Fragment key={m_i}>
                  <span onClick={m.pick} style={{ flex: "1", height: "34px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: m.w, background: m.bg, color: m.fg, boxShadow: m.sh, cursor: "pointer" }}>{m.label}</span>
                </Fragment>))}
              </div>
              {!!(v.ae.isEven) && (<>
                <div style={{ display: "flex", flexDirection: "column", borderRadius: "18px", background: "#fff", border: "1px solid #DCE6F2", overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", padding: "18px", background: "#F4F8FC" }}>
                    <strong style={{ flex: "none", fontSize: "44px", fontWeight: "700", letterSpacing: "-.04em", lineHeight: "1", color: "#2F6FB5", fontVariantNumeric: "tabular-nums" }}>{v.ae.evenN}</strong>
                    <span style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                      <strong style={{ fontSize: "16px", fontWeight: "700" }}>people share equally</strong>
                    </span>
                  </div>
                  {(v.ae.evenTeams).map((t, t_i) => (<Fragment key={t_i}>
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
              {!!(v.ae.isSplit) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px", borderRadius: "16px", background: "#FBF7F3", border: "1px solid #EBDDD2" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <strong style={{ flex: "1", fontSize: "14px", fontWeight: "700" }}>Split across teams</strong>
                    <span style={{ padding: "3px 10px", borderRadius: "10px", background: v.ae.sumBg, color: v.ae.sumFg, fontSize: "12px", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>{v.ae.sumTot}</span>
                    <span onClick={v.ae.splitReset} style={{ fontSize: "12px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Reset</span>
                  </div>
                  <div style={{ display: "flex", height: "10px", borderRadius: "5px", overflow: "hidden", gap: "2px", background: "#EEE6DF" }}>
                    {(v.ae.splits).map((b, b_i) => (<Fragment key={b_i}>
                      <span style={{ width: b.w, background: b.c, transition: "width 200ms" }}>
                      </span>
                    </Fragment>))}
                  </div>
                  {(v.ae.splits).map((r, r_i) => (<Fragment key={r_i}>
                    <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr) 58px", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "12px", background: "#fff" }}>
                      <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
                        <strong style={{ fontSize: "14px", fontWeight: "700", color: r.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</strong>
                        <span style={{ alignSelf: "flex-start", padding: "1px 6px", borderRadius: "5px", background: r.lockBg, color: r.lockFg, fontSize: "10px", fontWeight: "700" }}>{r.lockTxt}</span>
                      </span>
                      <input type="range" min="0" max="100" step="5" value={r.v} onChange={r.set} style={{ width: "100%", margin: "0", accentColor: r.c }} />
                      <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", height: "34px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", background: "#F4F8FC", border: "1px solid #DCE6F2" }}>
                        <input type="text" inputMode="numeric" pattern="[0-9]*" value={r.v} onChange={r.setN} onFocus={r.selAll} style={{ width: "30px", border: "0", background: "transparent", textAlign: "center", font: "inherit", fontSize: "15px", fontWeight: "700", color: r.c, outline: "none", padding: "0" }} />
                        <span style={{ fontSize: "13px", fontWeight: "700", color: r.c }}>%</span>
                      </span>
                    </div>
                  </Fragment>))}
                </div>
              </>)}
              {!!(v.ae.isPeople) && (<>
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
                    {(v.ae.pModes).map((m, m_i) => (<Fragment key={m_i}>
                      <span onClick={m.pick} style={{ height: "34px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${m.bd}`, background: m.bg, color: m.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>{m.label}</span>
                    </Fragment>))}
                  </div>
                  {(v.ae.pGroups).map((g, g_i) => (<Fragment key={g_i}>
                    <div style={{ display: "flex", flexDirection: "column", borderRadius: "12px", border: "1px solid #E6EDF5", overflow: "hidden" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 12px", background: "#F4F8FC", fontSize: "12px", fontWeight: "700", letterSpacing: ".03em", textTransform: "uppercase", color: "#3F2B22" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.c }}>
                        </span>{g.team}</span>
                      {(g.people).map((p, p_i) => (<Fragment key={p_i}>
                        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "center", gap: "10px", minHeight: "52px", padding: "6px 12px", boxSizing: "border-box", borderTop: "1px solid #EEF3F9" }}>
                          <span style={{ minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                            <strong style={{ fontSize: "14px", fontWeight: "650", color: p.nameFg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                            <small style={{ fontSize: "11px", color: "#806B60" }}>{p.role}</small>
                          </span>
                          {!!(v.ae.pIsPct) && (<>
                            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <input type="range" min="0" max="100" step="5" value={p.v} onChange={p.set} style={{ width: "96px", margin: "0", accentColor: g.c }} />
                              <span style={{ display: "inline-flex", alignItems: "center", gap: "1px", height: "36px", padding: "0 8px", boxSizing: "border-box", borderRadius: "10px", background: "#F4F8FC", border: "1px solid #DCE6F2" }}>
                                <input type="text" inputMode="numeric" pattern="[0-9]*" value={p.v} onChange={p.setN} onFocus={p.selAll} style={{ width: "28px", border: "0", background: "transparent", textAlign: "center", font: "inherit", fontSize: "14px", fontWeight: "700", color: g.c, fontVariantNumeric: "tabular-nums", outline: "none", padding: "0" }} />
                                <span style={{ fontSize: "14px", fontWeight: "700", color: g.c }}>%</span>
                              </span>
                            </span>
                          </>)}
                          {!!(v.ae.pIsCnt) && (<>
                            <span style={{ display: "flex", alignItems: "center", gap: "2px", padding: "2px", borderRadius: "12px", border: "1px solid #DCE6F2" }}>
                              <span onClick={p.minus} style={{ width: "32px", height: "32px", borderRadius: "10px", display: "grid", placeItems: "center", color: p.minusFg, fontSize: "18px", fontWeight: "600", cursor: "pointer" }}>−</span>
                              <input type="text" inputMode="numeric" pattern="[0-9]*" value={p.vTxt} onChange={p.setN} onFocus={p.selAll} style={{ width: "40px", height: "32px", boxSizing: "border-box", border: "0", borderRadius: "8px", background: "#F4F8FC", textAlign: "center", font: "inherit", fontSize: "15px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums", outline: "none" }} />
                              <span onClick={p.plus} style={{ width: "32px", height: "32px", borderRadius: "10px", display: "grid", placeItems: "center", color: g.c, fontSize: "18px", fontWeight: "600", cursor: "pointer" }}>+</span>
                            </span>
                          </>)}
                        </div>
                      </Fragment>))}
                    </div>
                  </Fragment>))}
                  <small style={{ fontSize: "12px", fontWeight: "600", color: v.ae.pSumFg }}>{v.ae.pSumNote}</small>
                </div>
              </>)}
            </div>
            <div style={{ flex: "none", padding: "12px 20px 26px", borderTop: "1px solid #EEF3F9", background: "#fff", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
              <span onClick={v.ae.close} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid #DCE6F2", color: "#3F2B22", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Cancel</span>
              <span onClick={v.ae.save} style={{ height: "48px", borderRadius: "24px", background: v.ae.saveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Save</span>
            </div>
          </div>
        </div>
      </>)}
      {!!(v.ftOpen) && (<>
        <div style={{ position: "absolute", inset: "0", zIndex: "9", background: "#FBF7F3", display: "flex", flexDirection: "column", animation: "slideIn 280ms cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ flex: "none", padding: "10px 16px 12px", display: "flex", flexDirection: "column", gap: "10px", background: "#fff", borderBottom: "1px solid #EEF3EF" }}>
            <span onClick={v.fe.close} style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: "4px", height: "32px", color: "#387557", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 6-6 6 6 6">
                </path>
              </svg>Assignment</span>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <h2 style={{ margin: "0", fontSize: "24px", fontWeight: "700", letterSpacing: "-.02em" }}>{v.fe.name}</h2>
            </span>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ display: "flex", justifyContent: "space-between", gap: "8px", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>
                <span>Full time days</span>
                <span style={{ color: "#3F2B22", textAlign: "right" }}>{v.fe.onLbl}</span>
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                {(v.fe.dayChips).map((d, d_i) => (<Fragment key={d_i}>
                  <span onClick={d.pick} style={{ height: "36px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, display: "grid", placeItems: "center", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{d.t}</span>
                </Fragment>))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px" }}>
              {(v.fe.modes).map((m, m_i) => (<Fragment key={m_i}>
                <span onClick={m.pick} style={{ height: "36px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${m.bd}`, background: m.bg, color: m.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "650", cursor: "pointer" }}>{m.label}</span>
              </Fragment>))}
            </div>
          </div>
          <div style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "14px 16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {(v.fe.people).map((p, p_i) => (<Fragment key={p_i}>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "16px", background: "#fff", border: `1.5px solid ${p.bd}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <strong style={{ flex: "1", minWidth: "0", fontSize: "15px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                  <span onClick={p.allDays} style={{ fontSize: "12px", fontWeight: "650", color: "#387557", cursor: "pointer" }}>{p.allLbl}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
                  {(v.fe.heads).map((w, w_i) => (<Fragment key={w_i}>
                    <span style={{ textAlign: "center", fontSize: "10px", fontWeight: "700", color: "#A8968B" }}>{w}</span>
                  </Fragment>))}
                  {(p.cells).map((c, c_i) => (<Fragment key={c_i}>
                    <span style={{ height: "40px", boxSizing: "border-box", padding: "0 3px", borderRadius: "10px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "flex", alignItems: "center", justifyContent: "center", gap: "1px", overflow: "hidden" }}>
                      <input type="text" inputMode="numeric" pattern="[0-9]*" value={c.num} readOnly={c.off} onFocus={c.focus} onChange={c.type} style={{ flex: "1", width: "0", minWidth: "0", border: "0", background: "transparent", padding: "0", textAlign: "right", font: "inherit", fontSize: "12px", fontWeight: "700", color: "inherit", fontVariantNumeric: "tabular-nums", letterSpacing: "-.02em", outline: "none", cursor: "text" }} />
                      <small style={{ flex: "none", width: c.pctW, fontSize: "9px", fontWeight: "700", textAlign: "left" }}>{c.pctMark}</small>
                    </span>
                  </Fragment>))}
                </div>
              </div>
            </Fragment>))}
            {!!(v.fe.noSel) && (<>
              <small style={{ fontSize: "12px", color: "#A8968B", textAlign: "center" }}>Grey days follow Ads to teams. Tap a day above to turn it on.</small>
            </>)}
          </div>
          {!!(v.fe.hasSel) && (<>
            <div style={{ flex: "none", padding: "12px 16px", background: "#fff", borderTop: "1px solid #D6E6DC", boxShadow: "0 -6px 16px rgba(63,43,34,.06)", display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <strong style={{ flex: "1", minWidth: "0", fontSize: "14px", fontWeight: "700", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.fe.selTitle}</strong>
                <span onClick={v.fe.done} style={{ fontSize: "13px", fontWeight: "650", color: "#387557", cursor: "pointer" }}>Done</span>
              </div>
              {!!(v.fe.selRest) && (<>
                <small style={{ marginTop: "-6px", fontSize: "12px", fontWeight: "600", color: "#806B60" }}>{v.fe.selRest}</small>
              </>)}
              {!!(v.fe.isPct) && (<>
                <span onClick={v.fe.giveAll} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "40px", borderRadius: "12px", border: "1.5px solid #387557", background: "#F2F8F4", color: "#2E6B4C", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v12m-5-5 5 5 5-5M5 21h14">
                    </path>
                  </svg>{v.fe.giveLbl}</span>
              </>)}
              {!!(v.fe.isPct) && (<>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <input type="range" min="0" max="100" step="5" value={v.fe.selV} onChange={v.fe.set} style={{ flex: "1", margin: "0", accentColor: "#387557" }} />
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "1px", height: "36px", padding: "0 8px", boxSizing: "border-box", borderRadius: "10px", background: "#F4F8FC", border: "1px solid #DCE6F2" }}>
                    <input type="text" inputMode="numeric" pattern="[0-9]*" value={v.fe.selV} onChange={v.fe.setN} onFocus={v.fe.selAllInput} style={{ width: "36px", border: "0", background: "transparent", textAlign: "center", font: "inherit", fontSize: "18px", fontWeight: "700", color: "#387557", fontVariantNumeric: "tabular-nums", outline: "none", padding: "0" }} />
                    <span style={{ fontSize: "18px", fontWeight: "700", color: "#387557" }}>%</span>
                  </span>
                </div>
              </>)}
              {!!(v.fe.isCnt) && (<>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "4px" }}>
                  <span onClick={v.fe.minus} style={{ width: "44px", height: "44px", borderRadius: "12px", border: "1px solid #D6E6DC", display: "grid", placeItems: "center", fontSize: "20px", fontWeight: "600", cursor: "pointer" }}>−</span>
                  <input type="text" inputMode="numeric" pattern="[0-9]*" value={v.fe.selTxt} onChange={v.fe.setN} onFocus={v.fe.selAllInput} style={{ width: "72px", height: "44px", boxSizing: "border-box", border: "0", borderRadius: "12px", background: "#F2F8F4", textAlign: "center", font: "inherit", fontSize: "18px", fontWeight: "700", color: "#3F2B22", outline: "none" }} />
                  <span onClick={v.fe.plus} style={{ width: "44px", height: "44px", borderRadius: "12px", border: "1px solid #D6E6DC", display: "grid", placeItems: "center", color: "#387557", fontSize: "20px", fontWeight: "600", cursor: "pointer" }}>+</span>
                </div>
              </>)}
            </div>
          </>)}
          <div style={{ flex: "none", padding: "12px 16px 26px", background: "#fff", borderTop: "1px solid #EEF3EF", display: "grid", gridTemplateColumns: "1fr 2fr", gap: "8px" }}>
            <span onClick={v.fe.close} style={{ height: "48px", boxSizing: "border-box", borderRadius: "24px", border: "1px solid #D6E6DC", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Cancel</span>
            <span onClick={v.fe.save} style={{ height: "48px", borderRadius: "24px", background: v.fe.saveBg, color: "#fff", display: "grid", placeItems: "center", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>Save</span>
          </div>
        </div>
      </>)}
    </>)}
  </>);
}
