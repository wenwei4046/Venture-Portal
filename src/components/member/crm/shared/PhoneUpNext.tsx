"use client";
/**
 * Insight › Up next on the phone — frame 9g of docs/design_handoff_crm_redesign_v4 (notes/14): All ads ▾ and "N in turn",
 * the espresso #1 card (who got the last lead, the number tile, the name, "Team · N leads today", Skip · Pause · Give to…),
 * everyone else in turn as 50 px rows, then Not in turn and On leave as two buttons that open their lists. Same data and
 * actions as before (use-up-next.ts); layout only. Head and segment as 8b (Phone4aTeamHead). Its sheets stand in the CRM's
 * shell (above the tab bar) and take the phone's own fadeIn / sheetUp.
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { fs } from "./phone4a";
import { Ic } from "./icons4a";
import { InShell } from "./shell-portal";
import { useBackCloses } from "./back";
import { useUpNext } from "./use-up-next";
import type { LeaveForm, UpNextAd, UpNextBook } from "./up-next";
import { UN_PIN_BG, UN_PIN_FG, UN_TIGHT as TIGHT, V4 } from "./up-next-style";

const Chev = () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const tap = (fn: () => void) => ({ role: "button", tabIndex: 0, onClick: fn });
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SCRIM: CSSProperties = { position: "absolute", inset: 0, zIndex: 60, background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" };
const SHEET: CSSProperties = { background: "#fff", borderRadius: "26px 26px 0 0", display: "flex", flexDirection: "column", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "88%", overflowY: "auto", scrollbarWidth: "none", color: "var(--crm-ink)", fontFamily: "Inter, sans-serif" };
const GRAB: CSSProperties = { alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)", flex: "none" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", borderTop: "1px solid var(--crm-rule)" };
const DOT = (c: string): CSSProperties => ({ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: c });
const FIELD: CSSProperties = { height: "40px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", font: `500 ${fs(16)} Inter, sans-serif`, color: "var(--crm-ink)", width: "100%" };
/** 9g's buttons on espresso: 40 px, radius 20, 13 px 600, a 14 px icon. */
const CARD_BTN: CSSProperties = { flex: 1, minWidth: 0, height: "40px", borderRadius: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", font: `600 ${fs(13)} Inter, sans-serif`, background: V4.white12, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" };

function LeaveSheet({ lv }: { lv: LeaveForm }) {
  const pair = (label: string, date: string, time: string, sd: (v: string) => void, st: (v: string) => void) => (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>{label}
      <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: "6px" }}>
        <input type="date" value={date} onChange={e => sd(e.target.value)} style={{ ...FIELD, minWidth: 0 }} />
        <select value={time} onChange={e => st(e.target.value)} style={FIELD}>{lv.times.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </span>
    </label>
  );
  const foot: CSSProperties = { height: "50px", padding: "0 16px", borderRadius: "25px", display: "flex", alignItems: "center", font: `500 ${fs(15)} Inter, sans-serif`, cursor: "pointer", justifyContent: "center", boxSizing: "border-box" };
  return (
    <div onClick={lv.cancel} style={{ ...SCRIM, zIndex: 63 }}>
      <div role="dialog" aria-label={`${lv.name} on leave`} onClick={stop} style={{ ...SHEET, padding: "10px 20px calc(34px + var(--sheet-safe, 0px))", boxSizing: "border-box", gap: "16px" }}>
        <span style={GRAB} />
        <div style={{ font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.01em" }}>{lv.name} on leave</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>Reason
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: "4px", padding: "4px", borderRadius: "14px", background: "var(--crm-field)" }}>
            {lv.reasons.map(r => { const on = r.bg !== "#fff";
              return <span key={r.label} {...tap(r.pick)} aria-pressed={on} style={{ height: "40px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", font: `${on ? 600 : 500} ${fs(14)} Inter, sans-serif`, background: on ? "#fff" : "transparent", boxShadow: on ? V4.segShadow : "none", color: on ? "var(--crm-ink)" : "var(--crm-muted)", cursor: "pointer" }}>{r.label}</span>; })}
          </div>
          {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} maxLength={200} onChange={e => lv.setNote(e.target.value)} style={{ ...FIELD, marginTop: "4px" }} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {pair("From", lv.fromDate, lv.fromTime, lv.setFD, lv.setFT)}
          {pair("To", lv.toDate, lv.toTime, lv.setTD, lv.setTT)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr", gap: "8px" }}>
          <span {...tap(lv.cancel)} style={{ ...foot, border: "1px solid var(--crm-line)" }}>Cancel</span>
          <span {...tap(lv.save)} style={{ ...foot, fontWeight: 600, background: "var(--crm-rust)", color: "#fff" }}>Save leave</span>
        </div>
      </div>
    </div>
  );
}

export function PhoneUpNext({ head, live, book, ads, canAct, line }: { head: ReactNode; live: boolean; book: UpNextBook; ads: UpNextAd[]; canAct: boolean; line: string | null }) {
  const { d, lv, toast, failed, close } = useUpNext({ live, book, ads, canAct, line });
  // Not in turn / On leave open their lists (9g's two buttons; the old Off / Leave tabs).
  const [list, setList] = useState<"off" | "up" | null>(null);
  // notes/10 §1: the Not in turn / On leave sheet holds a Back step of its own.
  useBackCloses(!!list, () => setList(null), "upNextList");
  // A tap outside the ad menu closes it. Not a see-through layer over the screen: on an iPhone the CRM's scrollers take
  // -webkit-overflow-scrolling: touch (crm.module.css), which makes <main> a layer of its own, so a layer beside it sat
  // OVER the menu and every tap on an ad only closed it — the ad never changed (2026-11-08, the owner's iPhone).
  const adOpen = !!d?.adOpen;
  useEffect(() => {
    if (!adOpen) return;
    const on = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-un-menu]")) close(); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [adOpen, close]);
  // The head starts where every Insight side starts it (v4 8b: 6 px down, 14 px between rows) — no jump between them.
  const main: CSSProperties = { flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "14px", color: "var(--crm-ink)", fontFamily: "Inter, sans-serif" };
  if (!d) return <main style={main}>{head}{failed && <div style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>{failed}</div>}</main>;
  const f = d.first;
  const listBtn = (label: string, n: number, k: "off" | "up") => (
    <span {...tap(() => setList(k))} aria-label={`${label} ${n}`} style={{ flex: 1, minWidth: 0, height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "12px", display: "flex", alignItems: "center", gap: "8px", font: `500 ${fs(13)} Inter, sans-serif`, background: "var(--crm-field)", cursor: "pointer", whiteSpace: "nowrap" }}>
      {label}<span style={{ color: "var(--crm-faint)" }}>{n}</span>
      <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={13} /></span>
    </span>
  );
  return (<>
    <main style={main}>
      {head}
      {/* 9g: All ads ▾ (36 px, sand) on the left, "N in turn" on the right. */}
      <div data-un-menu="" style={{ flex: "none", position: "relative", zIndex: 6, display: "flex", alignItems: "center", gap: "6px" }}>
        <span {...tap(d.toggleAd)} aria-expanded={d.adOpen} style={{ flex: "0 1 auto", minWidth: 0, height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "18px", background: "var(--crm-field)", display: "flex", alignItems: "center", gap: "6px", font: `500 ${fs(13)} Inter, sans-serif`, whiteSpace: "nowrap", cursor: "pointer" }}>
          <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{d.adName}</span><Chev />
        </span>
        <span style={{ marginLeft: "auto", flex: "none", font: `400 ${fs(12)} Inter, sans-serif`, color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{d.inCount} in turn</span>
        {d.adOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 7, padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto" }}>
            {d.ads.map(a => <div key={a.id} {...tap(a.pick)} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "44px", flex: "none", padding: "0 10px", borderRadius: "8px", fontSize: fs(13), background: a.rowBg, cursor: "pointer" }}><span style={{ flex: 1, minWidth: 0, fontWeight: a.w, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span><span style={{ flex: "none", fontSize: fs(11.5), color: "var(--crm-faint)" }}>{a.sub}</span></div>)}
          </div>
        )}
      </div>
      {/* 9g: the #1 card in espresso — radius 18, padding 16, 14 px between its three lines. */}
      <div data-un-first="" style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px", padding: "16px", borderRadius: "18px", background: "var(--crm-ink)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", font: `400 ${fs(12)} Inter, sans-serif`, color: V4.onDark, whiteSpace: "nowrap", overflow: "hidden" }}>
          <span style={{ flex: "none", display: "flex", color: V4.histIcon }}><Ic name="history" size={13} /></span>
          <span>Last lead went to</span>
          <b style={{ fontWeight: 600, color: "#fff", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{d.last.name}</b>
          {d.last.at && <span style={{ flex: "none" }}>· {d.last.at}</span>}
        </div>
        <div {...(f ? tap(f.open) : {})} style={{ display: "flex", alignItems: "center", gap: "14px", cursor: f ? "pointer" : "default" }}>
          <span style={{ flex: "none", width: "48px", height: "48px", borderRadius: "14px", display: "grid", placeItems: "center", background: V4.white12, color: "#fff", font: `500 ${fs(26)} ${TIGHT}` }}>1</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
              <span style={{ minWidth: 0, font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.02em", lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f?.name ?? "Nobody in turn"}</span>
              {f?.pinned && <span style={{ flex: "none", height: "17px", lineHeight: "17px", padding: "0 6px", borderRadius: "9px", background: UN_PIN_BG, color: UN_PIN_FG, fontSize: fs(10), fontWeight: 600 }}>{f.why.endsWith("set by you") ? "Set by you" : `Set by ${f.why.split("set by ")[1]}`}</span>}
            </span>
            {f && <span style={{ font: `400 ${fs(12)} Inter, sans-serif`, color: V4.onDark, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.todayLine}</span>}
          </span>
        </div>
        {d.canAct && f?.act && (
          <div style={{ display: "flex", gap: "8px" }}>
            {f.notPinned && (<>
              <span {...tap(f.skip)} style={CARD_BTN}><Ic name="forward" size={14} />Skip</span>
              <span {...tap(f.pause)} style={CARD_BTN}><Ic name="clock" size={14} />Pause</span>
              <span {...tap(d.togglePick)} style={{ ...CARD_BTN, flex: 1.3, background: "#fff", color: "var(--crm-rust)" }}><Ic name="user-check" size={14} />Give to…</span>
            </>)}
            {f.pinned && <span {...tap(d.unpin)} style={CARD_BTN}>Undo</span>}
          </div>
        )}
      </div>
      {/* 9g: #2 onward — the whole in-turn list, 50 px rows, a 28 px number circle, "{team} · {n} today" in faint. */}
      <div style={{ flex: "none", display: "flex", flexDirection: "column", marginTop: "-4px" }}>
        {d.queue.map(q => (
          <div key={q.id} {...(d.canAct ? tap(q.open) : {})} data-un-row={q.id} style={{ display: "flex", alignItems: "center", gap: "12px", height: "50px", borderBottom: "1px solid var(--crm-rule-soft)", cursor: d.canAct ? "pointer" : "default" }}>
            <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 ${fs(q.num.length > 2 ? 11 : 13)} ${TIGHT}`, background: "var(--crm-field)", color: "var(--crm-muted)" }}>{q.num}</span>
            <span style={{ flex: 1, minWidth: 0, font: `500 ${fs(15)} Inter, sans-serif`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.name}</span>
            <span style={{ flex: "none", maxWidth: "45%", font: `400 ${fs(12)} Inter, sans-serif`, color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.right}</span>
          </div>
        ))}
        {/* Five on screen, the rest folded (the owner, 2026-11-10) — Activity's "Show N more" row (8e): 13px 500 rust, 44px, centred. */}
        {d.queueMore > 0 && (
          <button type="button" onClick={d.toggleQueue} aria-expanded={d.queueAll} style={{ border: 0, background: "none", padding: 0, height: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", font: `500 ${fs(13)} Inter, sans-serif`, color: "var(--crm-rust)", cursor: "pointer" }}>
            {d.queueAll ? "Show less" : `Show ${d.queueMore} more`}
            <span style={{ display: "flex", transform: d.queueAll ? "rotate(180deg)" : "none", transition: "transform 150ms" }}><Ic name="chevron-down" size={13} /></span>
          </button>
        )}
      </div>
      <div style={{ flex: "none", display: "flex", gap: "8px" }}>
        {listBtn("Not in turn", d.offCount, "off")}
        {listBtn("On leave", d.upCount, "up")}
      </div>
    </main>
    <InShell>
      {list && (
        <div onClick={() => setList(null)} style={SCRIM}>
          <div role="dialog" aria-label={list === "off" ? "Not in turn" : "On leave"} onClick={stop} style={{ ...SHEET, padding: "10px 20px calc(26px + var(--sheet-safe, 0px))", boxSizing: "border-box", gap: "8px" }}>
            <span style={GRAB} />
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "6px 0" }}>
              <span style={{ font: `500 ${fs(20)} ${TIGHT}` }}>{list === "off" ? "Not in turn" : "On leave"}</span>
              <span style={{ fontSize: fs(13), color: "var(--crm-faint)" }}>{list === "off" ? d.offCount : d.upCount}</span>
            </div>
            {list === "off" && d.greyed.map(g => (
              <div key={g.id} style={{ ...ROW, color: "var(--crm-faint)" }}>
                <span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", boxSizing: "border-box", border: `1.5px solid ${g.dot}` }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
                <span style={{ flex: "none", maxWidth: "40%", fontSize: fs(12), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{g.whyMini}</span>
                {g.canResume && <span {...tap(g.resume)} style={{ flex: "none", height: "44px", display: "flex", alignItems: "center", fontSize: fs(13), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>Resume</span>}
                {g.canEnd && <span {...tap(g.editLeave)} style={{ flex: "none", height: "44px", display: "flex", alignItems: "center", fontSize: fs(13), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>Edit</span>}
              </div>
            ))}
            {list === "off" && !d.greyed.length && <div style={{ minHeight: "48px", display: "flex", alignItems: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>Everyone is in turn</div>}
            {list === "up" && d.upcoming.map(u => (
              <div key={u.id} {...(d.canAct ? tap(() => { setList(null); u.edit(); }) : {})} style={{ ...ROW, cursor: d.canAct ? "pointer" : "default" }}>
                <span style={{ flex: "none", width: "44px", font: `600 ${fs(12)} ${TIGHT}`, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{u.dayNum}</span><span style={DOT(u.dot)} />
                <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</span>
                <span style={{ flex: "none", maxWidth: "45%", fontSize: fs(12), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textAlign: "right" }}>{u.short}</span>
              </div>
            ))}
            {list === "up" && d.upNone && <div style={{ minHeight: "48px", display: "flex", alignItems: "center", fontSize: fs(13), color: "var(--crm-faint)" }}>Nobody on leave</div>}
          </div>
        </div>
      )}
      {d.pickOpen && (
        <div onClick={d.togglePick} style={SCRIM}>
          <div onClick={stop} style={{ ...SHEET, padding: "10px 12px calc(22px + var(--sheet-safe, 0px))" }}>
            <span style={{ ...GRAB, marginBottom: "10px" }} />
            <div style={{ padding: "0 8px 4px", font: `500 ${fs(16)} ${TIGHT}` }}>Give the next lead to</div>
            {d.pickList.map(q => (
              <div key={q.id} style={{ display: "contents" }}>
                {q.head && <div style={{ padding: "8px 8px 4px", font: `500 ${fs(10.5)} Inter, sans-serif`, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{q.head}</div>}
                <div {...tap(q.give)} style={{ display: "flex", alignItems: "center", gap: "10px", height: "46px", flex: "none", padding: "0 8px", borderRadius: "10px", fontSize: fs(14), cursor: "pointer" }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: q.dot }} /><span style={{ flex: 1 }}>{q.name}</span><span style={{ fontSize: fs(11.5), color: "var(--crm-faint)" }}>{q.team}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {d.sh && (
        <div onClick={d.close} style={SCRIM}>
          <div onClick={stop} style={{ ...SHEET, padding: "10px 20px calc(26px + var(--sheet-safe, 0px))", boxSizing: "border-box", gap: "14px" }}>
            <span style={GRAB} />
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 ${fs(15)} ${TIGHT}` }}>{d.sh.ini}</span>
              <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}><strong style={{ font: `500 ${fs(18)} ${TIGHT}` }}>{d.sh.name}</strong><span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{d.sh.team} · {d.sh.pos}</span></span>
            </div>
            <div style={{ padding: "10px 12px", borderRadius: "12px", background: "var(--crm-field)", fontSize: fs(12.5), lineHeight: 1.45, color: "var(--crm-ink-soft)" }}>{d.sh.why}</div>
            {d.sh.act && <><span {...tap(d.sh.give)} style={{ height: "48px", flex: "none", borderRadius: "24px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: fs(14), fontWeight: 600, cursor: "pointer" }}>Give them the next lead</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
              <span {...tap(d.sh.skip)} style={{ height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: fs(13.5), fontWeight: 600, cursor: "pointer" }}>Skip this turn</span>
              <span {...tap(d.sh.pause)} style={{ height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: fs(13.5), fontWeight: 600, color: "var(--crm-oxblood)", cursor: "pointer" }}>Pause</span>
              <span {...tap(d.sh.leave)} style={{ gridColumn: "1 / -1", height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", fontSize: fs(13.5), fontWeight: 600, cursor: "pointer" }}>Mark on leave</span>
            </div></>}
          </div>
        </div>
      )}
      {lv && <LeaveSheet lv={lv} />}
      {toast && <div role="status" style={{ position: "absolute", left: "16px", right: "16px", bottom: "calc(96px + var(--safe-bottom, 0px))", zIndex: 64, padding: "11px 14px", borderRadius: "12px", background: "var(--crm-ink)", color: "#fff", fontSize: fs(12.5), textAlign: "center" }}>{toast}</div>}
    </InShell>
  </>);
}
