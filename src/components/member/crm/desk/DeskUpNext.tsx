"use client";
/**
 * Insight › Up next on the desktop — v4 frame D3a (docs/design_handoff_crm_redesign_v4, notes/23), built on the phone's
 * 9g: a 420 px left column (All ads ▾ · "14 in turn", the espresso #1 card, Not in turn N › · On leave N ›) and the
 * queue as a table on the right. Skip · Pause · Leave show only on a row's hover, in a 196 px column kept for them, so
 * nothing moves. Same data and actions as before: shared/use-up-next.ts, shared/up-next.ts. The In turn / Off / Leave
 * tabs went; their lists open under the two buttons. Leave opens Up next's own leave window with the person set (it
 * writes the one leave record, crm_up_next_save_leave — Calendar's and Assignment's too); saved, they move to On leave.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useUpNext } from "../shared/use-up-next";
import type { UpNextAd, UpNextBook, LeaveForm } from "../shared/up-next";
import { UN_TIGHT as TIGHT } from "../shared/up-next-style";
import { Ic } from "../shared/icons4a";
import S from "../shared/up-next.module.css";

const INTER = "Inter, sans-serif";
const CLIP: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const PAUSE_TIP = "Stop giving this person ad leads until you resume them";
const act = (fn: () => void, title?: string) => ({ role: "button", tabIndex: 0, title, onClick: fn, onKeyDown: (e: { key: string }) => { if (e.key === "Enter") fn(); } });
/** D3a's queue: # · Next in turn · Team · Leads today · Last lead · the actions' reserved column. */
export const UN_COLS = "44px minmax(0,1fr) 140px 96px 96px 196px";
/** The #1 card's buttons (42 px, radius 21, 14 px 600, icons 15 px). */
const CARD_BTN: CSSProperties = { flex: 1, height: "42px", borderRadius: "21px", display: "flex", alignItems: "center", justifyContent: "center", gap: "7px", font: `600 14px ${INTER}`, background: "#FFFFFF1F", color: "#fff", cursor: "pointer", whiteSpace: "nowrap" };
/** A row's hover action (30 px, radius 15, 1 px #E2D8D0, 12.5 px). */
const ROW_BTN: CSSProperties = { height: "30px", padding: "0 12px", borderRadius: "15px", boxSizing: "border-box", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 12.5px ${INTER}`, color: "var(--crm-ink)", background: "#fff", cursor: "pointer" };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** Words on espresso (D3a). */
const ON_DARK = "var(--crm-on-dark-meta)";
const office = (t: number) => new Date(t + 8 * 3_600_000);

/** A last lead as D3a writes it: today "9:02", yesterday "Yesterday", this week its weekday "Mon", else "8 Nov" (the office's clock). */
export function lastLeadWords(iso: string | null | undefined, now: Date): string {
  if (!iso) return "—";
  const t = office(new Date(iso).getTime()), n = office(now.getTime());
  const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const ago = Math.round((day(n) - day(t)) / 86_400_000);
  if (ago <= 0) return `${t.getUTCHours()}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
  if (ago === 1) return "Yesterday";
  if (ago < 7) return DOW[t.getUTCDay()];
  return `${t.getUTCDate()} ${MON[t.getUTCMonth()]}`;
}

const FIELD: CSSProperties = { height: "40px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", font: `500 13.5px ${INTER}`, color: "var(--crm-ink)", width: "100%" };
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
            {lv.reasons.map(r => <span key={r.label} {...act(r.pick)} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>{r.label}</span>)}
          </div>
          {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} maxLength={200} onChange={e => lv.setNote(e.target.value)} style={{ ...FIELD, marginTop: "4px" }} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {pair("From", lv.fromDate, lv.fromTime, lv.setFD, lv.setFT)}
          {pair("To", lv.toDate, lv.toTime, lv.setTD, lv.setTT)}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <span {...act(lv.cancel)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>Cancel</span>
          <span {...act(lv.save)} style={{ height: "36px", padding: "0 16px", borderRadius: "7px", background: "var(--crm-rust)", color: "#fff", display: "flex", alignItems: "center", font: `500 13px ${INTER}`, cursor: "pointer" }}>Save</span>
        </div>
      </div>
    </div>
  );
}

export interface DeskUpNextIn {
  live: boolean; book: UpNextBook; ads: UpNextAd[]; canAct: boolean; line: string | null;
  /** Each person's leads today (insight.ts › leadsToday). */
  today?: Record<string, number>;
  /** Each person's newest lead (lastLeadAt), for Last lead. */
  lastAt?: Record<string, string>;
  now?: Date;
}

export function DeskUpNext({ live, book, ads, canAct, line, today = {}, lastAt = {}, now: now0 }: DeskUpNextIn) {
  const { d, lv, toast, failed, close } = useUpNext({ live, book, ads, canAct, line });
  const [list, setList] = useState<"off" | "leave" | null>(null);
  const [hov, setHov] = useState<string | null>(null);
  const now = now0 ?? new Date();
  // Clicking any blank area closes open menus.
  useEffect(() => {
    if (!d?.anyOpen) return;
    const on = (e: MouseEvent) => { if (!(e.target as Element).closest?.("[data-un-menu]")) close(); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [d?.anyOpen, close]);
  if (!d) return failed ? <div style={{ fontSize: "13px", color: "var(--crm-muted)" }}>{failed}</div> : null;
  const f = d.first;
  const n = (id: string) => today[id] ?? 0;
  const fN = f ? n(f.id) : 0;
  const queue = d.inTurn.filter(m => !f || m.id !== f.id);
  const lastWho = d.last.name !== "—" ? d.last.name : "";
  const lastWhoId = lastWho ? Object.keys(lastAt).find(id => book.nameOf(id) === lastWho) : undefined;
  const lastTime = lastWhoId ? lastLeadWords(lastAt[lastWhoId], now) : d.last.when;
  const openBtn = (k: "off" | "leave", label: string, count: number) => (
    <span {...act(() => setList(l => (l === k ? null : k)))} aria-expanded={list === k} style={{ flex: 1, minWidth: 0, height: "48px", padding: "0 16px", boxSizing: "border-box", borderRadius: "12px", display: "flex", alignItems: "center", gap: "8px", font: `500 14px ${INTER}`,
      background: list === k ? "var(--crm-sel)" : "var(--crm-field)", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}<span style={{ color: "var(--crm-faint)" }}>{count}</span>
      <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)", transform: list === k ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-right" size={14} /></span>
    </span>
  );
  const sub: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", padding: "0 4px", borderBottom: "1px solid var(--crm-rule-soft)", font: `400 14px ${INTER}` };
  return (<>
    <div data-up-next-d3a="" style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "420px minmax(0,1fr)", gap: "32px", alignItems: "start", color: "var(--crm-ink)" }}>
      {/* Left: All ads ▾ · N in turn, the #1 card, Not in turn · On leave. */}
      <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div data-un-menu="" onMouseEnter={d.tipOn} onMouseLeave={d.tipOff} style={{ position: "relative", zIndex: 6, minWidth: 0 }}>
            <span {...act(d.toggleAd)} style={{ height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "8px", display: "flex", alignItems: "center", gap: "7px", font: `500 13.5px ${INTER}`, background: "var(--crm-field)", cursor: "pointer", maxWidth: "300px" }}>
              <span style={CLIP}>{d.adName}</span><Ic name="chevron-down" size={12} />
            </span>
            {d.tipShow && <span style={{ position: "absolute", left: 0, top: "calc(100% + 6px)", zIndex: 6, width: "280px", padding: "10px 12px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", fontSize: "12.5px", lineHeight: 1.5, fontWeight: 400, boxShadow: "0 10px 30px rgba(42,22,12,.25)" }}>{d.splitLine}</span>}
            {d.adOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 7, width: "280px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "60vh", overflowY: "auto" }}>
                {d.ads.map(a => (
                  <div key={a.id} {...act(a.pick)} className={S.menuRow} style={{ display: "flex", alignItems: "center", gap: "10px", height: "38px", flex: "none", padding: "0 10px", borderRadius: "7px", fontSize: "13px", background: a.rowBg, cursor: "pointer" }}>
                    <span style={{ flex: 1, minWidth: 0, fontWeight: a.w, ...CLIP }}>{a.name}</span><span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>{a.sub}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <span style={{ marginLeft: "auto", font: `400 13px ${INTER}`, color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{d.inCount} in turn</span>
        </div>
        <div style={{ position: "relative", zIndex: d.cardZ, display: "flex", flexDirection: "column", gap: "16px", padding: "20px", borderRadius: "18px", background: "var(--crm-ink)", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", font: `400 13px ${INTER}`, color: ON_DARK, ...CLIP }}>
            <span style={{ display: "flex", color: "var(--crm-st-won)" }}><Ic name="history" size={14} /></span>
            {lastWho ? <span style={CLIP}>Last lead went to <b style={{ fontWeight: 600, color: "#fff" }}>{lastWho}</b>{lastTime ? ` · ${lastTime}` : ""}</span> : <span>No lead yet</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "14px", minWidth: 0 }}>
            <span style={{ width: "56px", height: "56px", flex: "none", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", font: `500 30px ${TIGHT}`, background: "#FFFFFF1F" }}>{f ? 1 : "—"}</span>
            <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <span style={{ font: `500 26px ${TIGHT}`, letterSpacing: "-0.02em", ...CLIP }}>{f?.name ?? "Nobody in turn"}</span>
                {f?.pinned && <span style={{ flex: "none", height: "20px", lineHeight: "20px", padding: "0 8px", borderRadius: "10px", background: "#FFFFFF1F", color: "#fff", fontSize: "11px", fontWeight: 600 }}>{f.why.endsWith("set by you") ? "Set by you" : `Set by ${f.why.split("set by ")[1]}`}</span>}
              </span>
              {f && <span style={{ font: `400 13px ${INTER}`, color: ON_DARK, ...CLIP }}>{f.team}{fN ? ` · ${fN} ${fN === 1 ? "lead" : "leads"} today` : ""}</span>}
            </span>
          </div>
          {d.canAct && f?.act && (
            <div style={{ display: "flex", gap: "8px" }}>
              {f.notPinned ? (<>
                <span {...act(f.skip, "Give this one lead to the next person. They keep their place after that.")} style={CARD_BTN}><Ic name="forward" size={15} />Skip</span>
                <span {...act(f.pause, PAUSE_TIP)} style={CARD_BTN}><Ic name="clock" size={15} />Pause</span>
              </>) : <span {...act(d.unpin)} style={CARD_BTN}>Undo</span>}
              <span data-un-menu="" style={{ position: "relative", flex: 1.3, display: "flex" }}>
                <span {...act(d.togglePick)} style={{ ...CARD_BTN, background: "#fff", color: "var(--crm-rust)" }}><Ic name="user-check" size={15} />Give to…</span>
                {d.pickOpen && (
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 5, width: "260px", maxHeight: "50vh", overflowY: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", color: "var(--crm-ink)" }}>
                    {d.pickList.map(p => (
                      <div key={p.id} style={{ display: "contents" }}>
                        {p.head && <div style={{ padding: "8px 8px 4px", font: `500 10.5px ${INTER}`, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{p.head}</div>}
                        <div {...act(p.give)} className={S.menuRow} style={{ display: "flex", alignItems: "center", gap: "10px", height: "36px", flex: "none", padding: "0 8px", borderRadius: "7px", fontSize: "13px", cursor: "pointer" }}>
                          <span style={{ flex: 1 }}>{p.name}</span><span style={{ fontSize: "11px", color: "var(--crm-faint)" }}>{p.team}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </span>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {openBtn("off", "Not in turn", d.offCount)}
          {openBtn("leave", "On leave", d.upCount)}
        </div>
        {list === "off" && (
          <div data-un-list="off" style={{ display: "flex", flexDirection: "column" }}>
            {d.greyed.map(g => (
              <div key={g.id} onMouseEnter={g.hovOn} onMouseLeave={g.hovOff} style={sub}>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, ...CLIP }}>{g.name}</span>
                <span style={{ display: g.txtDisp, flex: "none", fontSize: "12.5px", color: "var(--crm-faint)", ...CLIP, maxWidth: "200px" }}>{g.whyShort}</span>
                {g.canEnd && <span style={{ display: g.actDisp, gap: "6px" }}><span {...act(g.editLeave)} style={ROW_BTN}>Edit</span><span {...act(g.endLeave)} style={ROW_BTN}>End leave</span></span>}
                {g.canResume && <span {...act(g.resume)} style={ROW_BTN}>Resume</span>}
              </div>
            ))}
            {!d.greyed.length && <div style={{ ...sub, color: "var(--crm-faint)", fontSize: "13px" }}>Everybody is in turn</div>}
          </div>
        )}
        {list === "leave" && (
          <div data-un-list="leave" style={{ display: "flex", flexDirection: "column" }}>
            {d.upcoming.map(u => (
              <div key={u.id} onMouseEnter={u.hovOn} onMouseLeave={u.hovOff} style={sub}>
                <span style={{ width: "46px", flex: "none", font: `500 12.5px ${TIGHT}`, color: "var(--crm-faint)" }}>{u.dayNum}</span>
                <span style={{ flex: 1, minWidth: 0, fontWeight: 500, ...CLIP }}>{u.name}</span>
                <span style={{ display: u.txtDisp, flex: "none", fontSize: "12.5px", color: "var(--crm-muted)", ...CLIP, maxWidth: "200px" }}>{u.label} · {u.range}</span>
                <span style={{ display: u.actDisp, gap: "6px" }}><span {...act(u.edit)} style={ROW_BTN}>Edit</span><span {...act(u.cancel)} style={ROW_BTN}>{u.cancelWord}</span></span>
              </div>
            ))}
            {d.upNone && <div style={{ ...sub, color: "var(--crm-faint)", fontSize: "13px" }}>Nobody on leave</div>}
          </div>
        )}
      </div>
      {/* Right: the queue (#2 onward), the actions on hover only. */}
      <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ display: "grid", gridTemplateColumns: UN_COLS, columnGap: "16px", height: "38px", alignItems: "center", padding: "0 12px", borderRadius: "8px", background: "var(--crm-hover)", font: `500 12.5px ${INTER}`, color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
          <span>#</span><span>Next in turn</span><span>Team</span><span style={{ textAlign: "right" }}>Leads today</span><span style={{ textAlign: "right" }}>Last lead</span><span />
        </div>
        {queue.map((m, i) => {
          const k = n(m.id), on = hov === m.id, last = lastAt[m.id] ? lastLeadWords(lastAt[m.id], now) : m.last === "no lead yet" ? "—" : m.last;
          return (
            <div key={m.id} data-un-row={m.id} onMouseEnter={() => { setHov(m.id); m.hovOn(); }} onMouseLeave={() => { setHov(h => (h === m.id ? null : h)); m.hovOff(); }}
              style={{ display: "grid", gridTemplateColumns: UN_COLS, columnGap: "16px", height: "56px", alignItems: "center", padding: "0 12px", borderBottom: "1px solid var(--crm-rule-soft)", font: `400 14.5px ${INTER}`, fontVariantNumeric: "tabular-nums", background: on ? "var(--crm-hover)" : "transparent" }}>
              <span style={{ width: "30px", height: "30px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: `500 13px ${TIGHT}`, background: "var(--crm-field)", color: "var(--crm-muted)" }}>{m.nextTxt === "10+" ? "10+" : i + 2}</span>
              <span style={{ fontWeight: 500, ...CLIP }}>{m.name}</span>
              <span style={{ color: "var(--crm-muted)", ...CLIP }}>{m.team}</span>
              <span style={{ textAlign: "right", color: k ? "var(--crm-ink)" : "var(--crm-faint)" }}>{k}</span>
              <span style={{ textAlign: "right", color: "var(--crm-faint)", ...CLIP }}>{last}</span>
              {/* The 196 px column is always there; its buttons show on hover only, so nothing shifts. */}
              <span data-un-acts="" style={{ display: "flex", justifyContent: "flex-end", gap: "6px", visibility: m.actDisp === "flex" ? "visible" : "hidden" }}>
                <span {...act(m.skip)} style={ROW_BTN}>Skip</span>
                <span {...act(m.pause, PAUSE_TIP)} style={ROW_BTN}>Pause</span>
                <span {...act(m.leave)} style={ROW_BTN}>Leave</span>
              </span>
            </div>
          );
        })}
        {!queue.length && <div style={{ height: "56px", display: "flex", alignItems: "center", padding: "0 12px", borderBottom: "1px solid var(--crm-rule-soft)", font: `400 13px ${INTER}`, color: "var(--crm-faint)" }}>Nobody else in turn</div>}
      </div>
    </div>
    {lv && <LeaveWindow lv={lv} />}
    {toast && <div style={{ position: "fixed", left: "50%", bottom: "28px", zIndex: 70, transform: "translateX(-50%)", padding: "11px 18px", borderRadius: "10px", background: "var(--crm-ink)", color: "#fff", fontSize: "13px", boxShadow: "0 10px 30px rgba(42,22,12,.25)" }}>{toast}</div>}
  </>);
}
