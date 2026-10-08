"use client";

// GENERATED from docs/design_handoff_crm_roles/CRM Principal View.dc.html (1a) by the
// design converter — markup and styles exactly as designed. Behaviour lives in
// ./vm/ads.ts. To change the look, change the design and regenerate.
import { Fragment } from "react";
import type { AdsVM } from "./vm/ads";

/** Profile › Ads Performance: per-ad leads, appointment rate and show-up, with a comparison. */
export default function PanelAds({ v }: { v: AdsVM }) {
  return (<>
            
    {!!(v.onAds) && (<>
      <main style={{ flex: "1 1 auto", minHeight: "0", overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 28px", display: "flex", flexDirection: "column", gap: "16px" }}>
        <h1 style={{ flex: "none", margin: "0", fontSize: "28px", fontWeight: "700", letterSpacing: "-.03em", lineHeight: "1.2" }}>Ads Performance</h1>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", gap: "8px" }}>
            <div onClick={v.ovOpenRange} style={{ flex: "1", minWidth: "0", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", border: "1px solid #EBDDD2", cursor: "pointer" }}>
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
            {!!(v.ovCanClear) && (<>
              <span onClick={v.ovClear} style={{ flex: "none", height: "56px", padding: "0 16px", boxSizing: "border-box", borderRadius: "16px", background: "#F5EBE3", color: "#4E2F20", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "650", cursor: "pointer" }}>Clear</span>
            </>)}
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
                {(v.adCmpRows).map((r, r_i) => (<Fragment key={r_i}>
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
        {(v.adPerf).map((a, a_i) => (<Fragment key={a_i}>
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
