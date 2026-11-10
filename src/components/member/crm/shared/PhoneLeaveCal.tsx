"use client";
/**
 * Calendar and Assignment › Leave on the phone (the Control panel), on shared/leave-cal.ts — the desktop's own view model.
 *   - Calendar: the v4 tweaks (docs/design_handoff_crm_redesign_v4/notes/19): one header row, smaller layer chips, each
 *     leave ONE bar per week row laid across its days (never cut, never over another), 72 px cells, white days outside the
 *     month, lighter grid lines, appointments as a dot + time + first name; the look every CRM calendar shares (cal-look.ts).
 *   - Assignment › Leave: the people by team; a name opens Add leave with them set (Edit leave when they have one) —
 *     frames 13d / 13e, one sheet for both ways in, drawn ABOVE the CRM's tab bar (portalled into the CRM's shell).
 * Sheets fade their scrim in and slide up as every Control panel sheet. Sizes are the frames' on-screen px (fs below).
 */
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { CAL } from "./cal-look";
import { InShell } from "./shell-portal";
import type { LeaveCalIn, LeaveCalVM } from "./leave-cal";
import { typePx } from "./type";
import { fs as frameFs } from "./phone4a";
import { V4 } from "./up-next-style";
import { openLeaveSheetFor, useLeaveCal, useLeaveSheetReady } from "./use-leave-cal";

type In = Omit<LeaveCalIn, "mode" | "ui" | "set" | "flash">;
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
/** A v4 frame's on-screen px (13d / 13e, notes/19), as every v4 phone screen (phone4a › fs); under 10 px as drawn. */
const fs = (px: number) => (px < 10 ? typePx(px) : frameFs(px));
const INTER = "Inter, sans-serif";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Svg = ({ d, size, w = 2, style }: { d: string; size: number; w?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d} /></svg>
);
const PLUS = "M12 5v14M5 12h14";

/* ── Calendar ─────────────────────────────────────────────────────────────────────────────────────────────────────── */

/** A cell's top: 3 px, the 20 px number, 2 px — where the leave lanes start. */
const LANE_TOP = 25;
const laneH = (tall: boolean) => (tall ? 26 : 16);

/** Calendar's phone frame: one header row (month · ‹ › · +), the two layers, the month by weeks, the day's list. */
export function PhoneCalendar({ input, top }: { input: In; top?: ReactNode }) {
  const v = useLeaveCal("calendar", input);
  const round: CSSProperties = { flex: "none", width: "40px", height: "40px", borderRadius: "20px", display: "grid", placeItems: "center", cursor: "pointer" };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", font: `400 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "6px 20px 24px" }}>
        {top}
        {/* notes/19 §1: one row — the month (a tap goes back to this month), ‹ ›, + Leave. */}
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px" }}>
          <h1 {...(v.notThisWeek ? press(v.thisWeek) : {})} title={v.notThisWeek ? "Back to this month" : undefined}
            style={{ flex: "1 1 auto", minWidth: 0, margin: 0, font: `500 ${fs(26)} ${TIGHT}`, letterSpacing: "-0.025em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: v.notThisWeek ? "pointer" : "default" }}>{v.pMonthLabel}</h1>
          <span {...press(v.pPrev)} aria-label="Previous month" style={round}><Svg d="m15 18-6-6 6-6" size={18} /></span>
          <span {...press(v.pNext)} aria-label="Next month" style={round}><Svg d="m9 18 6-6-6-6" size={18} /></span>
          {v.showLeave && v.canAdd && <span {...press(v.pAdd)} aria-label="Add leave" style={{ ...round, marginLeft: "4px", background: "var(--crm-rust)", color: "#fff" }}><Svg d={PLUS} size={18} w={2.2} /></span>}
        </div>
        {/* notes/19 §2: the layer chips 32 px, 12.5 px words, a 14 px tick box. */}
        <div style={{ flex: "none", display: "flex", gap: "8px" }}>
          {v.layers.map(y => (
            <span key={y.key} {...press(y.go)} aria-pressed={y.boxBg !== "#fff"} style={{ height: "32px", padding: "0 12px 0 9px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${y.bd}`, background: y.bg, color: y.fg, display: "flex", alignItems: "center", gap: "7px", font: `500 ${fs(12.5)} ${INTER}`, cursor: "pointer" }}>
              <span style={{ width: "14px", height: "14px", borderRadius: "4px", boxSizing: "border-box", border: `1.5px solid ${y.boxBd}`, background: y.boxBg, display: "grid", placeItems: "center", color: "#fff" }}><Svg d="M20 6 9 17l-5-5" size={10} w={3.2} /></span>{y.label}
            </span>
          ))}
        </div>
        <div data-cal-month="" style={{ flex: "none", display: "flex", flexDirection: "column", margin: "0 -20px", borderTop: `1px solid ${CAL.grid}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {v.pDow.map((d, i) => <span key={i} style={{ height: "24px", display: "grid", placeItems: "center", font: `500 ${fs(11)} ${INTER}`, color: "var(--crm-faint)", borderBottom: `1px solid ${CAL.grid}` }}>{d}</span>)}
          </div>
          {v.weeks.map(w => <PhoneWeek key={w.key} w={w} />)}
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
      {v.pModalOn && <LeaveSheet v={v} />}
      <Toast v={v} />
    </div>
  );
}

/** One week row: seven 72 px cells, the leave bars laid over them (each across its own days), then appointments. */
function PhoneWeek({ w }: { w: LeaveCalVM["weeks"][number] }) {
  const used = w.lanes.reduce((a, t) => a + laneH(t) + 2, 0);
  const topOf = (k: number) => LANE_TOP + w.lanes.slice(0, k).reduce((a, t) => a + laneH(t) + 2, 0);
  return (
    <div data-cal-week="" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
      {w.days.map((c, i) => (
        <div key={c.day} {...press(c.pick)} data-day={c.day} aria-pressed={c.sel} style={{ minWidth: 0, minHeight: "72px", display: "flex", flexDirection: "column", gap: "2px", padding: "3px 2px 4px", boxSizing: "border-box",
          borderRight: i < 6 ? `1px solid ${CAL.grid}` : undefined, borderBottom: `1px solid ${CAL.grid}`, background: c.bg, cursor: "pointer" }}>
          <span style={{ flex: "none", alignSelf: "center", minWidth: "20px", height: "20px", padding: "0 4px", boxSizing: "border-box", borderRadius: "10px", display: "grid", placeItems: "center", font: `${c.numW} ${fs(11.5)} ${INTER}`, background: c.numBg, color: c.numFg }}>{c.num}</span>
          {used > 0 && <span aria-hidden style={{ flex: "none", height: `${used - 2}px` }} />}
          {c.appts.map(a => (
            <span key={a.key} title={a.title} onClick={a.open} data-appt="" style={{ flex: "none", display: "flex", alignItems: "center", gap: "3px", minWidth: 0, height: "12px", lineHeight: "12px", whiteSpace: "nowrap", overflow: "hidden", cursor: "pointer" }}>
              <span style={{ flex: "none", width: "5px", height: "5px", borderRadius: "50%", background: CAL.apptDot }} />
              <b style={{ flex: "none", font: `650 ${fs(10)} ${INTER}`, color: "var(--crm-ink)" }}>{a.t}</b>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", font: `500 ${fs(10)} ${INTER}`, color: "var(--crm-muted)" }}>{a.who}</span>
            </span>
          ))}
          {c.more && <span data-more="" style={{ flex: "none", height: "12px", lineHeight: "12px", font: `600 ${fs(10)} ${INTER}`, color: "var(--crm-muted)", paddingLeft: "1px" }}>{c.more}</span>}
        </div>
      ))}
      {w.bars.map(b => (
        <span key={b.key} {...press(() => b.edit({ stopPropagation() {} }))} title={b.title} data-leave-bar="" style={{ position: "absolute", top: `${topOf(b.lane)}px`, height: `${laneH(w.lanes[b.lane])}px`,
          left: `calc(${b.c0} * 100% / 7 + ${b.roundL ? 2 : 0}px)`, width: `calc(${b.span} * 100% / 7 - ${(b.roundL ? 2 : 0) + (b.roundR ? 3 : 0)}px)`,
          boxSizing: "border-box", padding: "0 4px", borderRadius: `${b.roundL ? 4 : 0}px ${b.roundR ? 4 : 0}px ${b.roundR ? 4 : 0}px ${b.roundL ? 4 : 0}px`,
          background: b.bg, color: b.fg, display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, overflow: "hidden", cursor: "pointer" }}>
          {b.single && b.span === 1 ? (<>
            <span style={{ font: `600 ${fs(9.5)} ${INTER}`, lineHeight: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.who}</span>
            <span style={{ font: `600 ${fs(9.5)} ${INTER}`, lineHeight: "11px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.word}</span>
          </>) : <span style={{ font: `600 ${fs(10)} ${INTER}`, lineHeight: "16px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.label}</span>}
        </span>
      ))}
    </div>
  );
}

/* ── Assignment › Leave ───────────────────────────────────────────────────────────────────────────────────────────── */

/** Assignment › Leave (13d / 13e): the people by team; a name opens the leave sheet on them. + Leave is the page's
 *  (PhoneLeaveAdd, in Assignment's title row); without one (`top` given) it is drawn here. */
export function PhonePeople({ input, top, bare }: { input: In; top?: (add: ReactNode) => ReactNode; /** Inside a page that scrolls and pads itself (Assignment › Leave). */ bare?: boolean }) {
  const v = useLeaveCal("people", input);
  const add = v.canAdd ? <AddLeavePill go={v.pAddLeave} /> : null;
  return (
    <div style={{ flex: bare ? "none" : 1, minHeight: 0, display: "flex", flexDirection: "column", font: `400 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" }}>
      <div style={bare ? { flex: "none", display: "flex", flexDirection: "column", gap: "12px", paddingBottom: "24px" } : { flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "12px", padding: "6px 20px 24px" }}>
        {top ? top(add) : (
          <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px" }}>
            <h1 style={{ flex: 1, margin: 0, font: `500 ${fs(26)} ${TIGHT}`, letterSpacing: "-0.025em" }}>People</h1>{add}
          </div>
        )}
        {v.groups.map(t => (
          <div key={t.name} style={{ flex: "none", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "34px", font: `500 ${fs(12)} ${INTER}`, color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot }} />{t.name}</div>
            {t.rows.map(r => (
              <div key={r.id} {...press(() => v.pOpenFor(r.id))} data-person={r.id} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "56px", borderTop: "1px solid var(--crm-rule-soft)", cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameFg }}>{r.name}</span>
                  <span style={{ fontSize: fs(12), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.stFg }}>{r.pLine}</span>
                </span>
                <Svg d="m9 18 6-6-6-6" size={16} style={{ flex: "none", color: "var(--crm-faint-2)" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      {v.pModalOn && <LeaveSheet v={v} />}
      <Toast v={v} />
    </div>
  );
}

/** + Leave: the 36 px rust pill (13d / 13e). */
function AddLeavePill({ go }: { go: () => void }) {
  return (
    <span {...press(go)} aria-label="Add leave" style={{ flex: "none", height: "36px", padding: "0 14px 0 11px", boxSizing: "border-box", borderRadius: "18px", display: "flex", alignItems: "center", gap: "5px", background: "var(--crm-rust)", color: "#fff", font: `500 ${fs(14)} ${INTER}`, cursor: "pointer", whiteSpace: "nowrap" }}>
      <Svg d={PLUS} size={15} w={2.2} />Leave
    </span>
  );
}
/** Assignment's title row's + Leave (generated by phone-4a.cjs): opens the Leave tab's sheet on the first person. */
export function PhoneLeaveAdd() {
  const ready = useLeaveSheetReady();
  return ready ? <AddLeavePill go={() => { openLeaveSheetFor(null); }} /> : null;
}

/* ── The leave sheet (13e) ────────────────────────────────────────────────────────────────────────────────────────── */


const FIELDBOX: CSSProperties = { position: "relative", height: "38px", borderRadius: "10px", background: "#fff", display: "flex", alignItems: "center", font: `500 ${fs(15)} ${INTER}`, color: "var(--crm-ink)", boxSizing: "border-box" };
/** A native picker laid invisibly over the drawn field: the phone's own date / time wheel, the design's look. */
const OVER: CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0, border: 0, margin: 0, padding: 0, cursor: "pointer", fontSize: fs(16), appearance: "none", WebkitAppearance: "none" };

/** Add / Edit leave — the same sheet whichever way it opened (13e): the person (Change), Reason, When, Cancel · Save leave. */
export function LeaveSheet({ v }: { v: LeaveCalVM }) {
  const lv = v.lv!;
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") v.cancelLeave(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [v]);
  const times = (cur: string) => (v.times.some(t => t.v === cur) ? v.times : [...v.times, { v: cur }].sort((a, b) => (a.v < b.v ? -1 : 1)));
  return (
    <InShell>
      <div onClick={v.cancelLeave} data-leave-scrim="" style={{ position: "absolute", inset: 0, zIndex: 60, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out" }} />
      <div role="dialog" aria-label={lv.title} data-leave-sheet="" onClick={e => e.stopPropagation()} style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 61, maxHeight: "88%", display: "flex", flexDirection: "column",
        background: "#fff", borderRadius: "26px 26px 0 0", boxSizing: "border-box", color: "var(--crm-ink)", font: `400 ${fs(14)} ${INTER}`, animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "18px", padding: "10px 20px 0" }}>
          <span style={{ alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {lv.whoOpen && <span {...press(lv.toggleWho)} aria-label="Back" style={{ flex: "none", display: "flex", marginLeft: "-4px", cursor: "pointer" }}><Svg d="m15 18-6-6 6-6" size={22} /></span>}
            <span style={{ flex: 1, font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.01em" }}>{lv.whoOpen ? "Choose person" : lv.title}</span>
            <span {...press(v.cancelLeave)} aria-label="Close" style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-muted)", cursor: "pointer" }}><Svg d="m6 6 12 12M6 18 18 6" size={15} /></span>
          </div>
        </div>
        {lv.whoOpen ? (
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "10px", padding: "18px 20px calc(24px + var(--sheet-safe, 0px))" }}>
            <input type="search" value={lv.whoQ} onChange={lv.setWhoQ} placeholder="Search people" aria-label="Search people" autoFocus
              style={{ flex: "none", height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "12px", border: 0, background: "var(--crm-field)", font: `400 ${fs(16)} ${INTER}`, color: "var(--crm-ink)", outline: "none" }} />
            {lv.whoGroups.map(g => (
              <div key={g.name} style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", height: "34px", font: `500 ${fs(12)} ${INTER}`, color: "var(--crm-muted)" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.dot }} />{g.name}</div>
                {g.rows.map(p => (
                  <div key={p.id} {...press(p.pick)} aria-pressed={p.sel} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "52px", borderTop: "1px solid var(--crm-rule-soft)", cursor: "pointer" }}>
                    <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 ${fs(12)} ${TIGHT}` }}>{p.ini}</span>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: p.sel ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    {p.sel && <Svg d="M20 6 9 17l-5-5" size={16} w={2.4} style={{ flex: "none", color: "var(--crm-rust)" }} />}
                  </div>
                ))}
              </div>
            ))}
            {!lv.whoGroups.length && <span style={{ minHeight: "44px", display: "flex", alignItems: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>Nobody found</span>}
          </div>
        ) : (<>
          <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px 4px" }}>
            <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 14px", borderRadius: "14px", boxSizing: "border-box", border: "1px solid var(--crm-line)" }}>
              <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 ${fs(13)} ${TIGHT}`, background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{lv.whoIni}</span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ font: `500 ${fs(16)} ${INTER}`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lv.whoName}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "6px", font: `400 ${fs(12.5)} ${INTER}`, color: "var(--crm-muted)", minWidth: 0 }}><span style={{ flex: "none", width: "7px", height: "7px", borderRadius: "50%", background: lv.whoDot }} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lv.whoTeam}</span></span>
              </span>
              {!lv.canRemove && <span {...press(lv.toggleWho)} style={{ flex: "none", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>Change</span>}
            </div>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-muted)" }}>Reason</span>
              <div role="radiogroup" aria-label="Reason" style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "4px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
                {lv.reasons.map(r => { const on = r.bg !== "#fff";
                  return <span key={r.label} {...press(r.pick)} role="radio" aria-checked={on} style={{ height: "40px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", font: `${on ? 600 : 500} ${fs(14)} ${INTER}`, background: on ? "#fff" : "transparent", boxShadow: on ? V4.segShadow : "none", color: on ? "var(--crm-ink)" : "var(--crm-muted)", cursor: "pointer", whiteSpace: "nowrap" }}>{r.label}</span>; })}
              </div>
              {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} onChange={lv.setNote} maxLength={200} style={{ height: "44px", padding: "0 12px", boxSizing: "border-box", borderRadius: "10px", border: "1px solid var(--crm-line)", background: "#fff", font: `500 ${fs(16)} ${INTER}`, color: "var(--crm-ink)" }} />}
            </div>
            <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px" }}>
              <span style={{ font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-muted)" }}>When</span>
              <div style={{ display: "flex", flexDirection: "column", borderRadius: "14px", background: "var(--crm-field)" }}>
                {lv.ends.map((e, i) => (
                  <div key={e.key} style={{ display: "flex", alignItems: "center", gap: "10px", height: "52px", padding: "0 6px 0 14px", borderTop: i ? "1px solid var(--crm-audit-rail)" : 0 }}>
                    <span style={{ flex: "none", width: "40px", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-muted)" }}>{e.label}</span>
                    <span style={{ ...FIELDBOX, flex: 1, minWidth: 0, padding: "0 12px" }}>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{lv.dayWords(e.key)}</span>
                      <input type="date" aria-label={`${e.label} date`} value={e.date} onChange={e.setDate} style={OVER} />
                    </span>
                    <span style={{ ...FIELDBOX, flex: "none", width: "76px", justifyContent: "center", fontVariantNumeric: "tabular-nums" }}>
                      {e.time}
                      <select aria-label={`${e.label} time`} value={e.time} onChange={e.setTime} style={OVER}>{times(e.time).map(t => <option key={t.v} value={t.v}>{t.v}</option>)}</select>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {lv.canRemove && <span {...press(() => { void lv.remove(); })} style={{ flex: "none", alignSelf: "flex-start", height: "36px", display: "flex", alignItems: "center", font: `500 ${fs(14)} ${INTER}`, color: "var(--crm-oxblood)", cursor: "pointer" }}>Remove leave</span>}
          </div>
          <div style={{ flex: "none", display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "8px", padding: "12px 20px calc(34px + var(--sheet-safe, 0px))" }}>
            <span {...press(v.cancelLeave)} style={{ height: "50px", borderRadius: "25px", boxSizing: "border-box", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", justifyContent: "center", font: `500 ${fs(15)} ${INTER}`, cursor: "pointer" }}>Cancel</span>
            <span {...press(v.saveLeave)} style={{ height: "50px", borderRadius: "25px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 ${fs(15)} ${INTER}`, background: "var(--crm-rust)", color: "#fff", cursor: "pointer" }}>Save leave</span>
          </div>
        </>)}
      </div>
    </InShell>
  );
}

function Toast({ v }: { v: LeaveCalVM }) {
  if (!v.toastOn) return null;
  return <InShell><div role="status" style={{ position: "absolute", left: "50%", bottom: "calc(96px + var(--safe-bottom, 0px))", zIndex: 62, transform: "translateX(-50%)", maxWidth: "calc(100% - 40px)", padding: "11px 18px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", font: `400 ${fs(13)} ${INTER}`, boxShadow: "0 10px 30px rgba(42,22,12,.25)" }}>{v.toast}</div></InShell>;
}
