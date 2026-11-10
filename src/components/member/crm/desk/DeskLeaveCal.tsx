"use client";
/**
 * Calendar (appointments + leave) and Assignment › People (leave only) on the desktop — the prototypes' markup
 * (docs/design_handoff_crm/designs/CRM Calendar.dc.html, CRM Assignment People.dc.html) element for element, on
 * shared/leave-cal.ts. The person panel slides in and its scrim fades, as every CRM side panel (the owner, 2026-11-08).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { LeaveCalIn, LeaveCalVM } from "../shared/leave-cal";
import { useLeaveCal } from "../shared/use-leave-cal";
import s from "./leave-cal.module.css";
import { CAL } from "../shared/cal-look";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Svg = ({ d, size, w = 2, style }: { d: string; size: number; w?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d} /></svg>
);
const LABEL: CSSProperties = { font: `500 11px ${INTER}`, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" };
const FIELD: CSSProperties = { height: "40px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", font: `500 13.5px ${INTER}`, color: "var(--crm-ink)", background: "#fff" };

/** The page: title row (Calendar's layer toggles), the toolbar, Month or Week, the panel, the modal, the toast. */
export function DeskLeaveCalPage({ mode, input, title, bare }: { mode: "calendar" | "people"; input: Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash">; title: string; bare?: boolean }) {
  const v = useLeaveCal(mode, input, { desk: true });
  return <DeskLeaveCal v={v} title={title} bare={bare} />;
}

/** People inside Assignment is `bare`: Assignment's head (its title and four tabs) is the page's. */
export function DeskLeaveCal({ v, title, tabs, bare }: { v: LeaveCalVM; title: string; tabs?: ReactNode; bare?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(305);
  useLayoutEffect(() => {
    const el = root.current; if (!el) return;
    const fit = () => setLeft(Math.round(el.getBoundingClientRect().left));
    fit(); window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div ref={root} style={{ flex: "1 1 auto", minHeight: 0, height: "100%", display: "flex", flexDirection: "column", font: `400 14px ${INTER}`, color: "var(--crm-ink)", background: "#fff" }}>
      {v.isCal ? (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "16px", padding: "26px 36px 4px" }}>
          <span style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.025em" }}>{title}</span>
          <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
            {v.layers.map(y => (
              <span key={y.key} {...press(y.go)} style={{ height: "34px", padding: "0 14px 0 10px", borderRadius: "17px", border: `1px solid ${y.bd}`, background: y.bg, color: y.fg, display: "flex", alignItems: "center", gap: "8px", font: `500 13px ${INTER}`, cursor: "pointer" }}>
                <span style={{ width: "16px", height: "16px", borderRadius: "5px", boxSizing: "border-box", border: `1.5px solid ${y.boxBd}`, background: y.boxBg, display: "grid", placeItems: "center", color: "#fff" }}><Svg d="M20 6 9 17l-5-5" size={11} w={3.2} /></span>
                {y.label}<span style={{ fontSize: "12px", color: "var(--crm-faint)" }}>{y.n}</span>
              </span>
            ))}
          </div>
        </div>
      ) : bare ? null : (<>
        <div style={{ flex: "none", padding: "26px 36px 12px", font: `500 30px ${TIGHT}`, letterSpacing: "-0.025em" }}>{title}</div>
        {tabs}
      </>)}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", padding: "18px 36px 14px" }}>
        <div style={{ display: "flex", padding: "3px", borderRadius: "9px", background: "var(--crm-field)" }}>
          {v.views.map(w => <span key={w.key} {...press(w.go)} style={{ height: "28px", padding: "0 14px", borderRadius: "7px", display: "flex", alignItems: "center", font: `500 12.5px ${INTER}`, background: w.bg, color: w.fg, boxShadow: w.sh, cursor: "pointer" }}>{w.label}</span>)}
        </div>
        <span {...press(v.prevWeek)} aria-label="Previous" style={{ width: "34px", height: "34px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", cursor: "pointer" }}><Svg d="m15 18-6-6 6-6" size={15} /></span>
        <span {...press(v.nextWeek)} aria-label="Next" style={{ width: "34px", height: "34px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", cursor: "pointer" }}><Svg d="m9 18 6-6-6-6" size={15} /></span>
        <span style={{ font: `500 18px ${TIGHT}`, whiteSpace: "nowrap" }}>{v.weekLabel}</span>
        {v.notThisWeek && <span {...press(v.thisWeek)} style={{ font: `500 12.5px ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>{v.todayLabel}</span>}
        <div style={{ marginLeft: "auto", minWidth: 0, overflow: "hidden", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "var(--crm-muted)" }}>
          {v.showAppt && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: CAL.apptDot }} />Appt</span>}
          {v.showLeave && <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "var(--crm-full-time)" }} />Full time</span>}
          {v.legend.map(l => <span key={l.label} style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: l.bg }} />{l.label}</span>)}
        </div>
        {v.showLeave && v.canAdd && (
          <span {...press(v.addLeave)} className={s.cta} style={{ flex: "none", whiteSpace: "nowrap", height: "34px", padding: "0 14px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "6px", font: `500 13px ${INTER}`, background: "var(--crm-rust)", color: "#fff", cursor: "pointer" }}>
            <Svg d="M12 5v14M5 12h14" size={14} w={2.2} />Add leave
          </span>
        )}
      </div>

      {v.isMonth && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "0 36px 28px" }}>
          <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: "1px solid var(--crm-rule)" }}>
            {v.dowHead.map(d => <span key={d} style={{ height: "36px", display: "flex", alignItems: "center", paddingLeft: "10px", ...LABEL }}>{d}</span>)}
          </div>
          {/* Each week a row: a leave ONE bar laid across its days in its lane (never cut by a cell, never over another), the
              appointments under the lanes, "+N more" past the room — the phone's rule (v4 notes/19 §3), at the desktop's size. */}
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", borderLeft: `1px solid ${CAL.grid}` }}>
            {v.weeks.map(w => (
            <div key={w.key} data-cal-week="" style={{ flex: "1 1 0", minHeight: 0, position: "relative", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {w.dDays.map(c => (
              <div key={c.day} onClick={c.add} data-day={c.day} className={s.cell} style={{ minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: "3px", padding: "6px 6px 4px", boxSizing: "border-box", borderRight: `1px solid ${CAL.grid}`, borderBottom: `1px solid ${CAL.grid}`, background: c.bg, overflow: "hidden", cursor: "pointer" }}>
                <span style={{ flex: "none", alignSelf: "flex-start", minWidth: "22px", height: "22px", padding: "0 5px", boxSizing: "border-box", borderRadius: "11px", display: "grid", placeItems: "center", font: `500 12px ${INTER}`, background: c.numBg, color: c.numFg }}>{c.num}</span>
                {c.dLanes > 0 && <span aria-hidden style={{ flex: "none", height: `${c.dLanes * 23 - 3}px` }} />}
                {c.appts.map(a => (
                  <span key={a.key} title={a.title} onClick={a.open} className={s.name} style={{ flex: "none", display: "flex", alignItems: "center", gap: "5px", height: "18px", padding: "0 4px", minWidth: 0, fontSize: "11px", color: "var(--crm-ink)", cursor: "pointer" }}>
                    <span style={{ width: "6px", height: "6px", borderRadius: "50%", flex: "none", background: a.dot }} /><b style={{ fontWeight: 600, flex: "none" }}>{a.t}</b>
                    <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--crm-muted)" }}>{a.who}</span>
                  </span>
                ))}
                {c.more && <span data-more="" style={{ flex: "none", fontSize: "11px", fontWeight: 600, color: "var(--crm-muted)", paddingLeft: "4px" }}>{c.more}</span>}
              </div>
            ))}
            {w.bars.map(b => (
              <span key={b.key} onClick={b.editD} title={b.title} data-leave-bar="" style={{ position: "absolute", top: `${31 + b.lane * 23}px`, height: "20px", lineHeight: "20px",
                left: `calc(${b.c0} * 100% / 7 + ${b.roundL ? 4 : 0}px)`, width: `calc(${b.span} * 100% / 7 - ${(b.roundL ? 4 : 0) + (b.roundR ? 5 : 0)}px)`, boxSizing: "border-box", padding: "0 6px",
                borderRadius: `${b.roundL ? 4 : 0}px ${b.roundR ? 4 : 0}px ${b.roundR ? 4 : 0}px ${b.roundL ? 4 : 0}px`, background: b.bg, color: b.fg, fontSize: "11px", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "pointer" }}>{b.label}</span>
            ))}
            </div>
            ))}
          </div>
        </div>
      )}

      {v.isWeek && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 36px 32px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "220px repeat(7,minmax(0,1fr))", position: "sticky", top: 0, zIndex: 2, background: "#fff", borderBottom: "1px solid var(--crm-rule)" }}>
            <span style={{ height: "44px", display: "flex", alignItems: "center", ...LABEL }}>Person</span>
            {v.days.map(d => (
              <span key={d.day} style={{ height: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: "12.5px", color: d.fg, fontWeight: d.w }}>{d.dow}
                <span style={{ minWidth: "24px", height: "24px", padding: "0 4px", boxSizing: "border-box", borderRadius: "12px", display: "grid", placeItems: "center", background: d.numBg, color: d.numFg }}>{d.num}</span>
              </span>
            ))}
          </div>
          {v.groups.map(t => (
            <div key={t.name} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "38px", paddingTop: "6px", font: `500 12px ${INTER}`, color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot }} />{t.name}</div>
              {t.rows.map(r => (
                <div key={r.id} style={{ display: "grid", gridTemplateColumns: "220px repeat(7,minmax(0,1fr))", height: "48px", borderTop: "1px solid var(--crm-rule-2)", background: r.rowBg }}>
                  <span {...press(r.open)} style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: "2px", minWidth: 0, paddingRight: "12px", cursor: "pointer" }}>
                    <span className={s.name} style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameFg }}>{r.name}</span>
                    <span style={{ fontSize: "11.5px", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{r.status}</span>
                  </span>
                  {r.cells.map((c, i) => (
                    <span key={i} onClick={c.click} title={c.title} style={{ position: "relative", display: "flex", alignItems: "center", padding: "7px 0", boxSizing: "border-box", background: c.colBg, cursor: "pointer" }}>
                      <span style={{ flex: 1, height: "100%", margin: `0 ${c.mr} 0 ${c.ml}`, borderRadius: c.rad, background: c.bg, display: "flex", alignItems: "center", padding: "0 8px", minWidth: 0, overflow: "hidden", fontSize: "11.5px", fontWeight: 600, color: c.fg }}>
                        <span style={{ display: "block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                        {c.appt && (
                          <span style={{ display: "flex", alignItems: "center", gap: "5px", minWidth: 0, fontSize: "11.5px", fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", flex: "none", background: CAL.apptDot }} />{c.appt}
                          </span>
                        )}
                      </span>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {v.panelOn && v.pn && (<>
        <div onClick={v.closePanel} className={s.fadeIn} style={{ position: "fixed", top: "56px", right: 0, bottom: 0, left: `${left}px`, zIndex: 37, background: "rgba(42,22,12,.12)" }} />
        <div className={s.slideIn} style={{ position: "fixed", top: "56px", right: 0, bottom: 0, zIndex: 38, width: "380px", boxSizing: "border-box", background: "#fff", boxShadow: "-16px 0 40px rgba(42,22,12,.14)", display: "flex", flexDirection: "column", overflow: "auto", font: `400 14px ${INTER}`, color: "var(--crm-ink)" }}>
          <PersonPanel v={v} />
        </div>
      </>)}

      {v.modalOn && v.lv && (
        <div onClick={v.cancelLeave} className={s.fadeIn} style={{ position: "fixed", inset: 0, zIndex: 39, background: "rgba(42,22,12,.32)", display: "flex", alignItems: "center", justifyContent: "center", font: `400 14px ${INTER}`, color: "var(--crm-ink)" }}>
          <LeaveModal v={v} />
        </div>
      )}
      {v.toastOn && <div style={{ position: "fixed", left: "50%", bottom: "28px", zIndex: 40, transform: "translateX(-50%)", padding: "11px 18px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", font: `400 13px ${INTER}`, boxShadow: "0 10px 30px rgba(42,22,12,.25)", whiteSpace: "nowrap" }}>{v.toast}</div>}
    </div>
  );
}

function PersonPanel({ v }: { v: LeaveCalVM }) {
  const pn = v.pn!;
  return (<>
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "22px 24px 18px", borderBottom: "1px solid var(--crm-rule)" }}>
      <span style={{ width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-sum)", font: `500 15px ${TIGHT}` }}>{pn.ini}</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
        <span style={{ font: `500 20px ${TIGHT}`, letterSpacing: "-0.015em" }}>{pn.name}</span>
        <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--crm-muted)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: pn.dot }} />{pn.team} · {pn.status}</span>
      </span>
      <span {...press(v.closePanel)} aria-label="Close" className={s.soft} style={{ width: "32px", height: "32px", borderRadius: "7px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}><Svg d="M18 6 6 18M6 6l12 12" size={16} /></span>
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "20px 24px", borderBottom: "1px solid var(--crm-rule)" }}>
      <span style={LABEL}>Full time days</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: "6px" }}>
        {pn.ft.map(f => <span key={f.dow} {...press(f.toggle)} style={{ height: "36px", borderRadius: "8px", display: "grid", placeItems: "center", font: `500 12.5px ${INTER}`, background: f.bg, color: f.fg, border: `1px solid ${f.bd}`, boxSizing: "border-box", cursor: f.cursor }}>{f.dow}</span>)}
      </div>
    </div>
    <div style={{ display: "flex", flexDirection: "column", padding: "20px 24px", borderBottom: "1px solid var(--crm-rule)" }}>
      <div style={{ display: "flex", alignItems: "center", paddingBottom: "8px" }}>
        <span style={{ flex: 1, ...LABEL }}>Leave</span>
        {pn.may && <span {...press(pn.add)} style={{ font: `500 12.5px ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>+ Add</span>}
      </div>
      {pn.leaves.map(l => (
        <div key={l.id} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", borderTop: "1px solid var(--crm-rule-2)", opacity: l.op }}>
          <span style={{ width: "10px", height: "10px", borderRadius: "3px", flex: "none", background: l.bg }} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontSize: "13.5px", fontWeight: 500 }}>{l.label}<span style={{ fontWeight: 400, color: "var(--crm-faint)" }}> · {l.when}</span></span>
            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{l.range}</span>
          </span>
          {l.editable && (<>
            <span {...press(l.edit)} style={{ font: `500 12px ${INTER}`, color: "var(--crm-muted)", cursor: "pointer" }}>Edit</span>
            <span {...press(() => { void l.del(); })} style={{ font: `500 12px ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>Remove</span>
          </>)}
        </div>
      ))}
      {pn.noLeave && <div style={{ minHeight: "44px", display: "flex", alignItems: "center", borderTop: "1px solid var(--crm-rule-2)", fontSize: "12.5px", color: "var(--crm-faint)" }}>No leave</div>}
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "20px 24px" }}>
      <span style={LABEL}>Ad leads</span>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span style={{ flex: 1, fontSize: "13px", color: "var(--crm-ink-soft)" }}>{pn.pauseTxt}</span>
        {pn.may && <span {...press(() => { void pn.togglePause(); })} style={{ height: "34px", padding: "0 14px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, color: pn.pauseFg, cursor: "pointer" }}>{pn.pauseBtn}</span>}
      </div>
      {pn.lockOn && (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ flex: 1, fontSize: "13px", color: "var(--crm-ink-soft)" }}>{pn.lockTxt}</span>
          <span {...press(() => { void pn.toggleLock(); })} style={{ height: "34px", padding: "0 14px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, color: pn.lockFg, cursor: "pointer" }}>{pn.lockBtn}</span>
        </div>
      )}
    </div>
  </>);
}

function LeaveModal({ v }: { v: LeaveCalVM }) {
  const lv = v.lv!;
  return (
    <div onClick={e => e.stopPropagation()} style={{ width: "420px", borderRadius: "12px", padding: "22px", boxSizing: "border-box", background: "#fff", boxShadow: "0 20px 50px rgba(42,22,12,.25)", display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ font: `500 18px ${TIGHT}` }}>{lv.title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--crm-muted)" }}>Person
        <div style={{ position: "relative" }}>
          <span {...press(lv.toggleWho)} style={{ height: "40px", padding: "0 12px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", gap: "8px", font: `500 13.5px ${INTER}`, color: "var(--crm-ink)", cursor: "pointer" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: lv.whoDot }} /><span style={{ flex: 1 }}>{lv.whoName}</span>
            <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--crm-faint)" }}>{lv.whoTeam}</span><Svg d="m6 9 6 6 6-6" size={14} w={2.2} />
          </span>
          {lv.whoOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 3, maxHeight: "240px", overflow: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)" }}>
              {lv.people.map(o => (
                <div key={o.id} {...press(o.pick)} className={s.opt} style={{ display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 8px", borderRadius: "7px", fontSize: "13px", color: "var(--crm-ink)", fontWeight: o.w, background: o.bg, cursor: "pointer" }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: o.dot }} /><span style={{ flex: 1 }}>{o.name}</span><span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>{o.team}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--crm-muted)" }}>Reason
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {lv.reasons.map(r => <span key={r.label} {...press(r.pick)} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>{r.label}</span>)}
        </div>
        {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} onChange={lv.setNote} style={{ ...FIELD, marginTop: "4px" }} />}
      </div>
      {lv.ends.map(e => (
        <label key={e.key} style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--crm-muted)" }}>{e.label}
          <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: "6px" }}>
            <input type="date" value={e.date} onChange={e.setDate} style={{ ...FIELD, minWidth: 0 }} />
            <select value={e.time} onChange={e.setTime} style={FIELD}>{v.times.map(t => <option key={t.v} value={t.v}>{t.v}</option>)}</select>
          </span>
        </label>
      ))}
      <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
        <span {...press(v.cancelLeave)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>Cancel</span>
        <span {...press(v.saveLeave)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", background: "var(--crm-rust)", color: "#fff", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>Save</span>
      </div>
    </div>
  );
}
