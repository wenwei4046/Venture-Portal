"use client";
/**
 * Calendar and Assignment › People on the phone (the Control panel) — the prototypes' 390 frames
 * (docs/design_handoff_crm/designs/CRM Calendar.dc.html, CRM Assignment People.dc.html) element for element, on
 * shared/leave-cal.ts, the desktop's own view model. Sheets fade their scrim in and slide up as every Control panel
 * sheet (the owner, 2026-11-08: keep the CRM's motion). Sizes are the Revenue app's (typePx).
 */
import type { CSSProperties, ReactNode } from "react";
import type { LeaveCalIn, LeaveCalVM } from "./leave-cal";
import { typePx as fs } from "./type";
import { useLeaveCal } from "./use-leave-cal";

type In = Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash">;
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Svg = ({ d, size, w = 2, style }: { d: string; size: number; w?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d} /></svg>
);
const SCRIM: CSSProperties = { position: "absolute", inset: 0, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out" };
const SHEET: CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "94%", overflow: "auto", boxSizing: "border-box", padding: "10px 20px calc(30px + var(--sheet-safe, 0px))",
  borderRadius: "26px 26px 0 0", background: "#fff", display: "flex", flexDirection: "column", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", color: "var(--crm-ink)", fontFamily: INTER };
const HANDLE = <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)", margin: "0 auto", flex: "none" }} />;
const IN: CSSProperties = { height: "44px", minWidth: 0, padding: "0 12px", boxSizing: "border-box", borderRadius: "10px", border: "1px solid var(--crm-line)", background: "#fff", font: `500 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" };

/** Calendar's phone frame: title + round +, the two layers, the month, the day's list, the leave sheet. */
export function PhoneCalendar({ input, top }: { input: In; top?: ReactNode }) {
  const v = useLeaveCal("calendar", input);
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", font: `400 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "6px 20px 24px" }}>
        {top}
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <h1 style={{ margin: 0, font: `500 ${fs(26)} ${TIGHT}`, letterSpacing: "-0.025em" }}>Calendar</h1>
          {v.showLeave && v.canAdd && <span {...press(v.pAdd)} aria-label="Add leave" style={{ marginLeft: "auto", width: "40px", height: "40px", borderRadius: "20px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", cursor: "pointer" }}><Svg d="M12 5v14M5 12h14" size={18} w={2.2} /></span>}
        </div>
        <div style={{ flex: "none", display: "flex", gap: "8px" }}>
          {v.layers.map(y => (
            <span key={y.key} {...press(y.go)} style={{ height: "36px", padding: "0 14px 0 10px", borderRadius: "18px", border: `1px solid ${y.bd}`, background: y.bg, color: y.fg, display: "flex", alignItems: "center", gap: "8px", font: `500 ${fs(13)} ${INTER}`, cursor: "pointer" }}>
              <span style={{ width: "16px", height: "16px", borderRadius: "5px", boxSizing: "border-box", border: `1.5px solid ${y.boxBd}`, background: y.boxBg, display: "grid", placeItems: "center", color: "#fff" }}><Svg d="M20 6 9 17l-5-5" size={11} w={3.2} /></span>{y.label}
            </span>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", paddingTop: "4px" }}>
          <span style={{ font: `500 ${fs(18)} ${TIGHT}`, whiteSpace: "nowrap" }}>{v.pMonthLabel}</span>
          {v.notThisWeek && <span {...press(v.thisWeek)} style={{ marginLeft: "8px", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>Today</span>}
          <span {...press(v.pPrev)} aria-label="Previous month" style={{ marginLeft: "auto", width: "40px", height: "40px", borderRadius: "20px", display: "grid", placeItems: "center", cursor: "pointer" }}><Svg d="m15 18-6-6 6-6" size={18} /></span>
          <span {...press(v.pNext)} aria-label="Next month" style={{ width: "40px", height: "40px", borderRadius: "20px", display: "grid", placeItems: "center", cursor: "pointer" }}><Svg d="m9 18 6-6-6-6" size={18} /></span>
        </div>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
          {v.pDow.map((d, i) => <span key={i} style={{ height: "24px", display: "grid", placeItems: "center", font: `500 ${fs(11)} ${INTER}`, color: "var(--crm-faint)" }}>{d}</span>)}
          {v.pCells.map(c => (
            <div key={c.day} onClick={c.pick} style={{ height: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "3px", paddingTop: "4px", boxSizing: "border-box", cursor: "pointer" }}>
              <span style={{ width: "32px", height: "32px", borderRadius: "16px", display: "grid", placeItems: "center", fontSize: fs(14), fontWeight: c.w, background: c.bg, color: c.fg, boxShadow: c.ring }}>{c.num}</span>
              <span style={{ display: "flex", gap: "3px", height: "5px" }}>{c.dots.map((o, i) => <span key={i} style={{ width: "5px", height: "5px", borderRadius: "50%", background: o }} />)}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-rule)", paddingTop: "12px" }}>
          <span style={{ font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-muted)", paddingBottom: "4px" }}>{v.pDayLabel}</span>
          {v.pItems.map(it => (
            <div key={it.key} {...press(it.go)} style={{ display: "grid", gridTemplateColumns: "48px minmax(0,1fr)", columnGap: "12px", alignItems: "center", minHeight: "52px", borderBottom: "1px solid var(--crm-rule-2)", cursor: "pointer" }}>
              <span style={{ font: `600 ${fs(13)} ${TIGHT}`, color: it.tFg }}>{it.t}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span style={{ width: "4px", alignSelf: "stretch", margin: "10px 0", borderRadius: "2px", flex: "none", background: it.bar }} />
                <span style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
                  <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</span>
                  <span style={{ fontSize: fs(12), color: "var(--crm-list-sub)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.sub}</span>
                </span>
              </span>
            </div>
          ))}
          {v.pEmpty && <span style={{ minHeight: "52px", display: "flex", alignItems: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>Nothing this day</span>}
        </div>
      </div>
      {v.pModalOn && <LeaveSheet v={v} withPerson />}
      <Toast v={v} />
    </div>
  );
}

/** Assignment › People's phone frame: the people by team, a person's sheet, the leave sheet. */
export function PhonePeople({ input, top, bare }: { input: In; top?: (add: ReactNode) => ReactNode; /** Inside a page that scrolls and pads itself (Assignment › Leave). */ bare?: boolean }) {
  const v = useLeaveCal("people", input);
  const add = v.canAdd ? (
    <span {...press(v.pAddLeave)} style={{ marginLeft: "auto", height: "40px", padding: "0 16px", borderRadius: "20px", display: "flex", alignItems: "center", gap: "6px", background: "var(--crm-rust)", color: "#fff", font: `500 ${fs(14)} ${INTER}`, cursor: "pointer" }}>
      <Svg d="M12 5v14M5 12h14" size={16} w={2.2} />Leave
    </span>
  ) : null;
  return (
    <div style={{ flex: bare ? "none" : 1, minHeight: 0, display: "flex", flexDirection: "column", font: `400 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" }}>
      <div style={bare ? { flex: "none", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "24px" } : { flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "6px 20px 24px" }}>
        {top ? top(add) : (
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ margin: 0, font: `500 ${fs(26)} ${TIGHT}`, letterSpacing: "-0.025em" }}>People</h1>{add}
          </div>
        )}
        {v.groups.map(t => (
          <div key={t.name} style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "34px", font: `500 ${fs(12)} ${INTER}`, color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot }} />{t.name}</div>
            {t.rows.map(r => (
              <div key={r.id} {...press(r.popen)} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", borderTop: "1px solid var(--crm-rule-2)", cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameFg }}>{r.name}</span>
                  <span style={{ fontSize: fs(12), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.stFg }}>{r.pLine}</span>
                </span>
                <Svg d="m9 18 6-6-6-6" size={16} style={{ flex: "none", color: "var(--crm-disabled)" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {v.pPanelOn && v.pn && (<>
        <div onClick={v.closePanel} style={{ ...SCRIM, zIndex: 40 }} />
        <div style={{ ...SHEET, zIndex: 41, maxHeight: "94%", gap: "18px" }}>
          {HANDLE}
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{ width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-sum)", font: `500 ${fs(15)} ${TIGHT}` }}>{v.pn.ini}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ font: `500 ${fs(20)} ${TIGHT}` }}>{v.pn.name}</span>
              <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: fs(12.5), color: "var(--crm-muted)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.pn.dot }} />{v.pn.team} · {v.pn.status}</span>
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}><span style={{ fontSize: fs(14), fontWeight: 600 }}>Every week</span><span style={{ fontSize: fs(12), color: "var(--crm-list-sub)" }}>Days they get ad leads</span></span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: "6px" }}>
              {v.pn.ft.map(f => <span key={f.dow} {...press(f.toggle)} style={{ height: "44px", borderRadius: "10px", border: `1px solid ${f.bd}`, display: "grid", placeItems: "center", font: `500 ${fs(13)} ${INTER}`, background: f.bg, color: f.fg, cursor: f.cursor }}>{f.dow}</span>)}
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderTop: "1px solid var(--crm-rule)", borderBottom: "1px solid var(--crm-rule)" }}>
              <span style={{ flex: 1, fontSize: fs(13.5), color: "var(--crm-ink-soft)" }}>{v.pn.pauseTxt}</span>
              {v.pn.may && <span {...press(() => { void v.pn!.togglePause(); })} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 ${fs(14)} ${INTER}`, color: v.pn.pauseFg, cursor: "pointer" }}>{v.pn.pauseBtn}</span>}
            </div>
            {v.pn.lockOn && (
              <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--crm-rule)" }}>
                <span style={{ flex: 1, fontSize: fs(13.5), color: "var(--crm-ink-soft)" }}>{v.pn.lockTxt}</span>
                <span {...press(() => { void v.pn!.toggleLock(); })} style={{ height: "40px", padding: "0 18px", borderRadius: "20px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 ${fs(14)} ${INTER}`, color: v.pn.lockFg, cursor: "pointer" }}>{v.pn.lockBtn}</span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}><span style={{ fontSize: fs(14), fontWeight: 600 }}>Time off</span><span style={{ fontSize: fs(12), color: "var(--crm-list-sub)" }}>No leads on these dates, even on their days</span></span>
            {v.pn.leaves.map(l => (
              <div key={l.id} {...press(l.edit)} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "52px", borderBottom: "1px solid var(--crm-rule-2)", opacity: l.op, cursor: "pointer" }}>
                <span style={{ width: "4px", alignSelf: "stretch", margin: "10px 0", borderRadius: "2px", background: l.bg }} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}><span style={{ fontWeight: 500 }}>{l.label}</span><span style={{ fontSize: fs(12), color: "var(--crm-list-sub)" }}>{l.range}</span></span>
                <span style={{ fontSize: fs(12), color: "var(--crm-faint)" }}>{l.when}</span>
              </div>
            ))}
            {v.pn.noLeave && <span style={{ minHeight: "40px", display: "flex", alignItems: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>None</span>}
          </div>
          {v.pn.may && <span {...press(v.pn.add)} style={{ flex: "none", height: "48px", borderRadius: "12px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", font: `500 ${fs(15)} ${INTER}`, cursor: "pointer" }}>Add time off</span>}
        </div>
      </>)}
      {v.pModalOn && <LeaveSheet v={v} />}
      <Toast v={v} />
    </div>
  );
}

/** The leave sheet: Calendar asks the person (a select); People's title names them ("Add leave · NAME"). */
function LeaveSheet({ v, withPerson }: { v: LeaveCalVM; withPerson?: boolean }) {
  const lv = v.lv!;
  return (<>
    <div onClick={v.cancelLeave} style={{ ...SCRIM, zIndex: 42 }} />
    <div style={{ ...SHEET, zIndex: 43, gap: "16px" }}>
      {HANDLE}
      <span style={{ font: `500 ${fs(20)} ${TIGHT}` }}>{withPerson ? lv.title : `${lv.title} · ${lv.whoName}`}</span>
      {withPerson && (
        <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>Person
          <select value={lv.who} onChange={lv.setWho} style={{ ...IN, appearance: "none", WebkitAppearance: "none" }}>
            {v.pPeople.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>Reason
        <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
          {lv.reasons.map(r => <span key={r.label} {...press(r.pick)} style={{ height: "40px", padding: "0 16px", boxSizing: "border-box", borderRadius: "20px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "flex", alignItems: "center", font: `500 ${fs(14)} ${INTER}`, cursor: "pointer" }}>{r.label}</span>)}
        </div>
        {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} onChange={lv.setNote} style={{ ...IN, marginTop: "4px" }} />}
      </div>
      {lv.ends.map(e => (
        <label key={e.key} style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>{e.label}
          <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 110px", gap: "8px" }}>
            <input type="date" value={e.date} onChange={e.setDate} style={IN} />
            <input type="time" step={1800} value={e.time} onChange={e.setTime} style={IN} />
          </span>
        </label>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", paddingTop: "4px" }}>
        <span {...press(v.cancelLeave)} style={{ height: "48px", borderRadius: "12px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", font: `500 ${fs(15)} ${INTER}`, cursor: "pointer" }}>Cancel</span>
        <span {...press(v.saveLeave)} style={{ height: "48px", borderRadius: "12px", background: "var(--crm-rust)", color: "#fff", display: "grid", placeItems: "center", font: `500 ${fs(15)} ${INTER}`, cursor: "pointer" }}>Save</span>
      </div>
    </div>
  </>);
}

function Toast({ v }: { v: LeaveCalVM }) {
  if (!v.toastOn) return null;
  return <div style={{ position: "absolute", left: "50%", bottom: "28px", zIndex: 50, transform: "translateX(-50%)", maxWidth: "calc(100% - 40px)", padding: "11px 18px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", font: `400 ${fs(13)} ${INTER}`, boxShadow: "0 10px 30px rgba(42,22,12,.25)" }}>{v.toast}</div>;
}
