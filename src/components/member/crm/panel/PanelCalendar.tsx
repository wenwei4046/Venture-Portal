"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/calendar.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import H from "../crm.module.css";
import type { CalendarVM } from "./vm/calendar";

/** Calendar: every visit as a list or a month, by team and person, with the stats and the range sheet. */
export default function PanelCalendar({ v }: { v: CalendarVM }) {
  return (<>
            
    {!!(v.onCal) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 24px", display: "flex", flexDirection: "column", gap: "14px" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "10px" }}>
          <div style={{ minWidth: "0" }}>
            <h1 style={{ margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Calendar</h1>
            <span style={{ fontSize: "13px", color: "#806B60" }}>{v.cRangeLabel}</span>
          </div>
          <span onClick={v.cOpenRange} style={{ flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", border: "1px solid #EBDDD2", background: "#fff", fontSize: "14px", fontWeight: "650", boxShadow: "0 2px 8px rgba(63,43,34,.06)", cursor: "pointer" }}><svg style={{ color: "#BD4A19" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14">
              </path>
            </svg>{v.cRangeBtn}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6">
              </path>
            </svg></span>
        </div>
        <div data-drag-scroll="1" style={{ flex: "none", display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
          {(v.cTeams).map((c, c_i) => (<Fragment key={c_i}>
            <span onClick={c.pick} style={{ flex: "none", height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{!!(c.dot) && (<>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: c.dot }}>
                </span>
              </>)}{c.label}</span>
          </Fragment>))}
        </div>
        <div style={{ flex: "none", display: "flex", gap: "8px", alignItems: "center" }}>
          <span onClick={v.cpOpen} style={{ position: "relative", flex: "1", minWidth: "0", height: "40px", boxSizing: "border-box", padding: "0 34px 0 14px", border: "1px solid #EBDDD2", borderRadius: "20px", background: "#fff", display: "flex", alignItems: "center", fontSize: "14px", fontWeight: "600", cursor: "pointer" }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.cPersonLabel}</span>
            <span style={{ position: "absolute", right: "12px", top: "13px", color: "#806B60" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6">
                </path>
              </svg>
            </span>
          </span>
          <div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "12px", background: "#F5EBE3" }}>
            {(v.cViews).map((vi, vi_i) => (<Fragment key={vi_i}>
              <span onClick={vi.pick} style={{ flex: "none", height: "32px", padding: "0 12px", borderRadius: "9px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: vi.w, background: vi.bg, color: vi.fg, boxShadow: vi.sh, whiteSpace: "nowrap", cursor: "pointer" }}>{vi.label}</span>
            </Fragment>))}
          </div>
        </div>
        <div style={{ flex: "none", padding: "18px", borderRadius: "22px", background: "linear-gradient(155deg, #5A3828 0%, #3F2B22 60%)", boxShadow: "0 10px 24px rgba(63,43,34,.22)", color: "#fff", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "6px" }}>
            {(v.cStats).map((s, s_i) => (<Fragment key={s_i}>
              <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                <strong style={{ fontSize: "22px", fontWeight: "700", fontVariantNumeric: "tabular-nums", color: s.fg }}>{s.v}</strong>
                <span style={{ fontSize: "11px", color: "#D9C7BA" }}>{s.label}</span>
              </div>
            </Fragment>))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,.14)" }}>
            {(v.cByTeam).map((b, b_i) => (<Fragment key={b_i}>
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
        {!!(v.cIsGrid) && (<>
          <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span onClick={v.cPrevM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 6-6 6 6 6">
                  </path>
                </svg>
              </span>
              <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.cGridTitle}</strong>
              <span onClick={v.cNextM} style={{ width: "36px", height: "36px", display: "grid", placeItems: "center", color: "#806B60", cursor: "pointer" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m9 6 6 6-6 6">
                  </path>
                </svg>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
              {(v.cWk).map((w, w_i) => (<Fragment key={w_i}>
                <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "600", color: "#806B60" }}>{w}</span>
              </Fragment>))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", borderTop: "1px solid #EBDDD2" }}>
              {(v.cCells).map((c, c_i) => (<Fragment key={c_i}>
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
              <span style={{ fontSize: "15px", fontWeight: "650" }}>{v.cDayTitle}</span>
              {!!(v.cShowAll) && (<>
                <span onClick={v.cAll} style={{ flex: "none", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>Show all</span>
              </>)}
            </div>
          </div>
        </>)}
        {(v.cDays).map((d, d_i) => (<Fragment key={d_i}>
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
        {!!(v.cEmpty) && (<>
          <p style={{ margin: "0", padding: "16px 0", fontSize: "14px", color: "#806B60" }}>No visits for this filter.</p>
        </>)}
      </main>
      {!!(v.cpIsOpen) && (<>
        <div onClick={v.cpClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "92%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "24px 24px 0 0", padding: "10px 20px 28px", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2", marginBottom: "4px" }}>
            </span>
            <h2 style={{ margin: "4px 0 0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Show visits for</h2>
            <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#806B60" }}>{v.cpSub}</p>
            <div onClick={v.cpAll.pick} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 10px", margin: "0 -10px", borderRadius: "12px", background: v.cpAll.bg, cursor: "pointer" }}>
              <span style={{ flex: "none", width: "10px", height: "10px", borderRadius: "50%", background: "#3F2B22" }}>
              </span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
                <strong style={{ fontSize: "16px", fontWeight: "650" }}>Everyone</strong>
                <small style={{ fontSize: "12px", color: "#806B60" }}>{v.cpAll.sub}</small>
              </span>
              <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6">
                </path>
              </svg>
            </div>
            {(v.cpGroups).map((g, g_i) => (<Fragment key={g_i}>
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
      {!!(v.crOpen) && (<>
        <div onClick={v.crClose} style={{ position: "absolute", inset: "0", zIndex: "8", background: "rgba(63,43,34,.32)", animation: "fadeIn 200ms ease-out", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
          <div onClick={v.stop} style={{ animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", boxSizing: "border-box", background: "#fff", borderRadius: "26px 26px 0 0", padding: "10px 20px 26px", display: "flex", flexDirection: "column", gap: "16px" }}>
            <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "#EBDDD2" }}>
            </span>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: "0", fontSize: "20px", fontWeight: "700", letterSpacing: "-.02em" }}>Choose dates</h2>
              <span onClick={v.crClose} title="Close" style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#F5EBE3", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="m6 6 12 12M6 18 18 6">
                  </path>
                </svg>
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
              {(v.crPresets).map((p, p_i) => (<Fragment key={p_i}>
                <span onClick={p.pick} style={{ height: "38px", boxSizing: "border-box", borderRadius: "12px", border: `1px solid ${p.bd}`, background: p.bg, color: p.fg, display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", cursor: "pointer" }}>{p.label}</span>
              </Fragment>))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px 10px 10px", borderRadius: "20px", background: "#FBF7F3" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 4px" }}>
                <span onClick={v.crPrev} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m15 6-6 6 6 6">
                    </path>
                  </svg>
                </span>
                <strong style={{ fontSize: "16px", fontWeight: "700", letterSpacing: "-.01em" }}>{v.crTitle}</strong>
                <span onClick={v.crNext} style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 3px rgba(63,43,34,.10)", display: "grid", placeItems: "center", color: "#3F2B22", cursor: "pointer" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m9 6 6 6-6 6">
                    </path>
                  </svg>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}>
                {(v.cWk).map((w, w_i) => (<Fragment key={w_i}>
                  <span style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", letterSpacing: ".04em", color: "#A8968B" }}>{w}</span>
                </Fragment>))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "2px" }}>
                {(v.crCells).map((c, c_i) => (<Fragment key={c_i}>
                  <span onClick={c.pick} style={{ height: "40px", display: "grid", placeItems: "center", background: c.band, borderRadius: c.bandR, cursor: "pointer" }}>
                    <span style={{ width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: c.w, fontVariantNumeric: "tabular-nums", background: c.bg, color: c.fg, boxShadow: c.sh }}>{c.n}</span>
                  </span>
                </Fragment>))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)", alignItems: "center", gap: "8px" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.crFromBd}` }}>
                <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>From</small>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.crFrom}</strong>
              </span>
              <svg style={{ color: "#B5A398" }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14m-5-5 5 5-5 5">
                </path>
              </svg>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 14px", borderRadius: "14px", border: `1.5px solid ${v.crToBd}` }}>
                <small style={{ fontSize: "11px", fontWeight: "600", color: "#806B60" }}>To</small>
                <strong style={{ fontSize: "15px", fontWeight: "650" }}>{v.crTo}</strong>
              </span>
            </div>
            <span onClick={v.crApply} style={{ height: "50px", borderRadius: "25px", display: "grid", placeItems: "center", background: v.crApplyBg, color: "#fff", fontSize: "16px", fontWeight: "650", cursor: "pointer" }}>{v.crApplyLabel}</span>
          </div>
        </div>
      </>)}
    </>)}
  </>);
}
