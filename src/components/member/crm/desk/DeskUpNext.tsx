"use client";
/**
 * Insight › Up next on the desktop: docs/design_handoff_crm_up_next/CRM Up Next v3.dc.html's desktop frame, element for
 * element — every size, gap and colour as the prototype writes it (hex → the --crm-* token it equals). Behaviour:
 * shared/use-up-next.ts, shared/up-next.ts. The ad dropdown sits in the head's tab bar (Desk4aHead's slot).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useUpNext } from "../shared/use-up-next";
import type { UpNextAd, UpNextBook, UpNextFrame, LeaveForm } from "../shared/up-next";
import { UN_TIGHT as TIGHT, UN_RULE_2 } from "../shared/up-next-style";
import S from "../shared/up-next.module.css";

const LABEL: CSSProperties = { font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" };
const BTN: CSSProperties = { height: "34px", padding: "0 14px", boxSizing: "content-box", borderRadius: "7px", border: "1px solid var(--crm-line)", background: "#fff", display: "flex", alignItems: "center", font: "500 13px Inter, sans-serif", cursor: "pointer" };
const HEAD: CSSProperties = { font: `500 17px ${TIGHT}`, letterSpacing: "-0.01em" };
const CHIP: CSSProperties = { minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", display: "inline-grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-muted)", font: "600 11px Inter, sans-serif" };
const ROW: CSSProperties = { display: "grid", gridTemplateColumns: "44px 7px 150px minmax(0,1fr)", alignItems: "center", columnGap: "10px", height: "44px", borderTop: `1px solid ${UN_RULE_2}` };
const NUM: CSSProperties = { font: `600 12px ${TIGHT}`, color: "var(--crm-faint)" };
const DOT = (c: string): CSSProperties => ({ width: "7px", height: "7px", borderRadius: "50%", background: c });
const NAME: CSSProperties = { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const CLIP: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const ACTS: CSSProperties = { alignItems: "center", gap: "14px", font: "500 12px Inter, sans-serif" };
const LINK = (c: string): CSSProperties => ({ color: c, cursor: "pointer" });
const PAUSE_TIP = "Stop giving this person ad leads until you resume them";
const Chev = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const act = (fn: () => void, title?: string) => ({ role: "button", tabIndex: 0, title, onClick: fn, onKeyDown: (e: { key: string }) => { if (e.key === "Enter") fn(); } });

function AdDropdown({ d }: { d: UpNextFrame }) {
  return (
    <div data-un-menu="" onMouseEnter={d.tipOn} onMouseLeave={d.tipOff} style={{ position: "relative", zIndex: 6, marginLeft: "auto", marginBottom: "6px" }}>
      <span {...act(d.toggleAd)} style={{ height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", gap: "8px", font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", cursor: "pointer" }}>
        <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}>Ad</span>{d.adName}<Chev />
      </span>
      {d.tipShow && <span style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 6, width: "280px", padding: "10px 12px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", fontSize: "12.5px", lineHeight: 1.5, fontWeight: 400, textWrap: "pretty", boxShadow: "0 10px 30px rgba(42,22,12,.25)" } as CSSProperties}>{d.splitLine}</span>}
      {d.adOpen && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 7, width: "280px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "60vh", overflowY: "auto" }}>
          {d.ads.map(a => (
            <div key={a.id} {...act(a.pick)} className={S.menuRow} style={{ display: "flex", alignItems: "center", gap: "10px", height: "38px", flex: "none", padding: "0 10px", borderRadius: "7px", fontSize: "13px", background: a.rowBg, cursor: "pointer" }}>
              <span style={{ flex: 1, minWidth: 0, fontWeight: a.w, ...CLIP }}>{a.name}</span><span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>{a.sub}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const FIELD: CSSProperties = { height: "40px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", font: "500 13.5px Inter, sans-serif", color: "var(--crm-ink)", width: "100%" };
function LeaveWindow({ lv }: { lv: LeaveForm }) {
  const pair = (label: string, date: string, time: string, sd: (v: string) => void, st: (v: string) => void) => (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--crm-muted)" }}>{label}
      <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: "6px" }}>
        <input type="date" value={date} onChange={e => sd(e.target.value)} style={{ ...FIELD, minWidth: 0 }} />
        <select value={time} onChange={e => st(e.target.value)} style={FIELD}>{lv.times.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </span>
    </label>
  );
  return (
    <div onClick={lv.cancel} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(42,22,12,.32)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div role="dialog" aria-label={`${lv.name} on leave`} onClick={e => e.stopPropagation()} style={{ width: "400px", borderRadius: "12px", padding: "22px", boxShadow: "0 20px 50px rgba(42,22,12,.25)", background: "#fff", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "16px", color: "var(--crm-ink)" }}>
        <div style={{ font: `500 18px ${TIGHT}` }}>{lv.name} on leave</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--crm-muted)" }}>Reason
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {lv.reasons.map(r => <span key={r.label} {...act(r.pick)} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "flex", alignItems: "center", font: "500 13px Inter, sans-serif", cursor: "pointer" }}>{r.label}</span>)}
          </div>
          {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} maxLength={200} onChange={e => lv.setNote(e.target.value)} style={{ ...FIELD, marginTop: "4px" }} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {pair("From", lv.fromDate, lv.fromTime, lv.setFD, lv.setFT)}
          {pair("To", lv.toDate, lv.toTime, lv.setTD, lv.setTT)}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <span {...act(lv.cancel)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: "500 13px Inter, sans-serif", cursor: "pointer" }}>Cancel</span>
          <span {...act(lv.save)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", background: "var(--crm-rust)", color: "#fff", display: "flex", alignItems: "center", font: "500 13px Inter, sans-serif", cursor: "pointer" }}>Save</span>
        </div>
      </div>
    </div>
  );
}

/** The dropdown goes into the head's tab bar, which Desk4aHead draws. */
function InSlot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<Element | null>(null);
  useEffect(() => { setEl(document.querySelector("[data-up-next-slot]")); }, []);
  return el ? createPortal(children, el) : null;
}

export function DeskUpNext({ live, book, ads, canAct, line }: { live: boolean; book: UpNextBook; ads: UpNextAd[]; canAct: boolean; line: string | null }) {
  const { d, lv, toast, failed, close } = useUpNext({ live, book, ads, canAct, line });
  // Clicking any blank area closes open menus.
  useEffect(() => {
    if (!d?.anyOpen) return;
    const on = (e: MouseEvent) => { if (!(e.target as Element).closest?.("[data-un-menu]")) close(); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [d?.anyOpen, close]);
  if (!d) return failed ? <div style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{failed}</div> : null;
  const f = d.first;
  return (<>
    <InSlot><AdDropdown d={d} /></InSlot>
    <div style={{ flex: "none", position: "relative", zIndex: d.cardZ, display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: "48px", padding: "24px", borderRadius: "12px", background: "var(--crm-sum)", color: "var(--crm-ink)", fontSize: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", paddingRight: "24px", marginRight: "-24px", borderRight: "1px solid var(--crm-sum-line)" }}>
        <span style={LABEL}>Next lead</span>
        <div onMouseEnter={d.whyOn} onMouseLeave={d.whyOff} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "12px", cursor: "help" }}>
          <span style={{ width: "48px", height: "48px", borderRadius: "50%", display: "grid", placeItems: "center", background: "#fff", font: `500 16px ${TIGHT}` }}>{f?.ini ?? "—"}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ font: `500 26px ${TIGHT}`, letterSpacing: "-0.02em", lineHeight: 1 }}>{f?.name ?? "Nobody in turn"}</span>
              {f?.pinned && <span style={{ height: "20px", lineHeight: "20px", padding: "0 8px", borderRadius: "10px", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: "11px", fontWeight: 600 }}>{f.why.endsWith("set by you") ? "Set by you" : `Set by ${f.why.split("set by ")[1]}`}</span>}
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--crm-muted)" }}>{f && <span style={DOT(f.dot)} />}{d.firstLine}</span>
          </span>
        </div>
        {d.canAct && f && (
          <div style={{ display: "flex", gap: "8px" }}>
            {f.notPinned && (<>
              <span {...act(f.skip, "Give this one lead to the next person. They keep their place after that.")} style={BTN}>Skip</span>
              <span {...act(f.pause, PAUSE_TIP)} style={BTN}>Pause</span>
            </>)}
            {f.pinned && <span {...act(d.unpin)} style={BTN}>Undo</span>}
            <span data-un-menu="" style={{ position: "relative" }}>
              <span {...act(d.togglePick)} className={S.give} style={{ height: "34px", padding: "0 14px", borderRadius: "7px", display: "flex", alignItems: "center", font: "500 13px Inter, sans-serif", color: "#fff", cursor: "pointer" }}>Give to…</span>
              {d.pickOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 5, width: "260px", maxHeight: "50vh", overflowY: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                  {d.pickList.map(p => (
                    <div key={p.id} style={{ display: "contents" }}>
                      {p.head && <div style={{ padding: "8px 8px 4px", font: "500 10.5px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{p.head}</div>}
                      <div {...act(p.give)} className={S.menuRow} style={{ display: "flex", alignItems: "center", gap: "10px", height: "36px", flex: "none", padding: "0 8px", borderRadius: "7px", fontSize: "13px", cursor: "pointer" }}>
                        <span style={DOT(p.dot)} /><span style={{ flex: 1 }}>{p.name}</span><span style={{ fontSize: "11px", color: "var(--crm-faint)" }}>{p.team}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </span>
          </div>
        )}
        <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid var(--crm-sum-line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span>Last lead</span><span style={{ fontWeight: 500, color: "var(--crm-muted)" }}>{d.last.name}</span>{d.last.meta && <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>· {d.last.meta}</span>}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ ...LABEL, paddingBottom: "8px" }}>After that</div>
        {d.chain.map(s => (
          <div key={s.k} onMouseEnter={s.hovOn} onMouseLeave={s.hovOff} title={s.why} style={{ display: "grid", gridTemplateColumns: "44px 7px 150px minmax(0,1fr) auto", alignItems: "center", columnGap: "10px", height: "44px", borderTop: "1px solid var(--crm-sum-line)" }}>
            <span style={NUM}>#{s.k}</span><span style={DOT(s.dot)} /><span style={NAME}>{s.name}</span><span style={{ fontSize: "12px", color: "var(--crm-faint)", ...CLIP }}>{s.team}</span>
            {d.canAct && <span style={{ display: "flex", gap: "14px", font: "500 12px Inter, sans-serif", opacity: s.actOp }}>
              <span {...act(s.give)} style={LINK("var(--crm-rust)")}>Make next</span><span {...act(s.skip)} style={LINK("var(--crm-muted)")}>Skip</span><span {...act(s.pause, PAUSE_TIP)} style={LINK("var(--crm-muted)")}>Pause</span>
            </span>}
          </div>
        ))}
        <span {...act(d.toggleMore)} style={{ alignSelf: "stretch", display: "flex", alignItems: "center", gap: "6px", padding: "10px 0 0 61px", borderTop: "1px solid var(--crm-sum-line)", font: "500 12.5px Inter, sans-serif", color: "var(--crm-rust)", cursor: "pointer" }}>
          {d.moreLabel}<Chev />
        </span>
      </div>
    </div>
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: "48px", padding: "0 24px", color: "var(--crm-ink)", fontSize: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "10px" }}><span style={HEAD}>In today&apos;s turn</span><span style={CHIP}>{d.inCount}</span></div>
        {d.inTurn.map(m => (
          <div key={m.id} onMouseEnter={m.hovOn} onMouseLeave={m.hovOff} style={ROW}>
            <span style={NUM}>{m.nextTxt}</span><span style={DOT(m.dot)} /><span style={NAME}>{m.name}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: m.txtDisp, fontSize: "12px", color: "var(--crm-faint)", ...CLIP }}>{m.team} · {m.last}</span>
              <span style={{ display: m.actDisp, ...ACTS }}><span {...act(m.skip)} style={LINK("var(--crm-muted)")}>Skip</span><span {...act(m.pause, PAUSE_TIP)} style={LINK("var(--crm-muted)")}>Pause</span><span {...act(m.leave)} style={LINK("var(--crm-muted)")}>Leave</span></span>
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "10px" }}><span style={HEAD}>Not in turn</span><span style={CHIP}>{d.offCount}</span></div>
        {d.greyed.map(g => (
          <div key={g.id} onMouseEnter={g.hovOn} onMouseLeave={g.hovOff} style={{ ...ROW, color: "var(--crm-faint)" }}>
            <span style={{ font: `600 12px ${TIGHT}` }}>—</span><span style={{ width: "7px", height: "7px", borderRadius: "50%", boxSizing: "border-box", border: `1.5px solid ${g.dot}` }} /><span style={NAME}>{g.name}</span>
            <span style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ display: g.txtDisp, flex: 1, minWidth: 0, fontSize: "12px", ...CLIP }}>{g.whyShort}</span>
              {g.canEnd && <span style={{ display: g.actDisp, ...ACTS }}><span {...act(g.editLeave)} style={LINK("var(--crm-muted)")}>Edit</span><span {...act(g.endLeave)} style={LINK("var(--crm-rust)")}>End leave</span></span>}
              {g.canResume && <span {...act(g.resume)} style={{ marginLeft: "auto", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)", cursor: "pointer" }}>Resume</span>}
            </span>
          </div>
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "28px 0 10px" }}><span style={HEAD}>Upcoming leave</span><span style={CHIP}>{d.upCount}</span></div>
        {d.upcoming.map(u => (
          <div key={u.id} onMouseEnter={u.hovOn} onMouseLeave={u.hovOff} style={ROW}>
            <span style={NUM}>{u.day}</span><span style={DOT(u.dot)} /><span style={NAME}>{u.name}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: u.txtDisp, fontSize: "12px", color: "var(--crm-muted)", ...CLIP }}>{u.label} · {u.range}</span>
              <span style={{ display: u.actDisp, ...ACTS }}><span {...act(u.edit)} style={LINK("var(--crm-muted)")}>Edit</span><span {...act(u.cancel)} style={LINK("var(--crm-rust)")}>Cancel leave</span></span>
            </span>
          </div>
        ))}
        {d.upNone && <div style={{ height: "44px", display: "flex", alignItems: "center", borderTop: `1px solid ${UN_RULE_2}`, fontSize: "12.5px", color: "var(--crm-faint)" }}>No leave coming up</div>}
      </div>
    </div>
    {lv && <LeaveWindow lv={lv} />}
    {toast && <div style={{ position: "fixed", left: "50%", bottom: "28px", zIndex: 70, transform: "translateX(-50%)", padding: "11px 18px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", fontSize: "13px", boxShadow: "0 10px 30px rgba(42,22,12,.25)" }}>{toast}</div>}
  </>);
}
