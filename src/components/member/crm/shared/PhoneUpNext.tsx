"use client";
/**
 * Insight › Up next on the phone: CRM Up Next v3.dc.html's phone frame, element for element (hex → the --crm-* token it
 * equals; sizes through phone4a's fs(), as every 4a phone page). Mounted by phone-4a.cjs under Insight's head. Its sheets take the
 * phone's own fadeIn / sheetUp, as every sheet of the Control panel (the prototype draws no motion).
 */
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { fs } from "./phone4a";
import { useUpNext } from "./use-up-next";
import type { LeaveForm, UpNextAd, UpNextBook } from "./up-next";
import { UN_ESPRESSO_TEXT, UN_FAINT_PHONE as FAINT, UN_PIN_BG, UN_PIN_FG, UN_TIGHT as TIGHT } from "./up-next-style";

const Chev = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>;
const tap = (fn: () => void) => ({ role: "button", tabIndex: 0, onClick: fn });
const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
const SCRIM: CSSProperties = { position: "absolute", inset: 0, zIndex: 40, background: "rgba(42,22,12,.32)", display: "flex", flexDirection: "column", justifyContent: "flex-end", animation: "fadeIn 200ms ease-out" };
const SHEET: CSSProperties = { background: "#fff", borderRadius: "26px 26px 0 0", display: "flex", flexDirection: "column", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", maxHeight: "94%", overflowY: "auto", scrollbarWidth: "none", color: "var(--crm-ink)" };
const GRAB: CSSProperties = { alignSelf: "center", width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-rule)", flex: "none" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", borderTop: "1px solid var(--crm-rule)" };
const DOT = (c: string): CSSProperties => ({ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: c });
const FIELD: CSSProperties = { height: "40px", padding: "0 10px", boxSizing: "border-box", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", font: `500 ${fs(13.5)} Inter, sans-serif`, color: "var(--crm-ink)", width: "100%" };
const WHITE12: CSSProperties = { height: "44px", borderRadius: "12px", background: "rgba(255,255,255,.12)", color: "#fff", display: "grid", placeItems: "center", fontSize: fs(13.5), fontWeight: 600, cursor: "pointer" };

function LeaveSheet({ lv }: { lv: LeaveForm }) {
  const pair = (label: string, date: string, time: string, sd: (v: string) => void, st: (v: string) => void) => (
    <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>{label}
      <span style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 96px", gap: "6px" }}>
        <input type="date" value={date} onChange={e => sd(e.target.value)} style={{ ...FIELD, minWidth: 0 }} />
        <select value={time} onChange={e => st(e.target.value)} style={FIELD}>{lv.times.map(t => <option key={t} value={t}>{t}</option>)}</select>
      </span>
    </label>
  );
  const foot: CSSProperties = { height: "44px", padding: "0 16px", borderRadius: "22px", display: "flex", alignItems: "center", font: `500 ${fs(13)} Inter, sans-serif`, cursor: "pointer", flex: 1, justifyContent: "center" };
  return (
    <div onClick={lv.cancel} style={{ ...SCRIM, zIndex: 41 }}>
      <div role="dialog" aria-label={`${lv.name} on leave`} onClick={stop} style={{ ...SHEET, padding: "20px 20px calc(26px + var(--sheet-safe, 0px))", boxSizing: "border-box", gap: "16px" }}>
        <div style={{ font: `500 ${fs(18)} ${TIGHT}` }}>{lv.name} on leave</div>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: fs(12), color: "var(--crm-muted)" }}>Reason
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
            {lv.reasons.map(r => <span key={r.label} {...tap(r.pick)} style={{ height: "34px", padding: "0 14px", boxSizing: "border-box", borderRadius: "17px", border: `1px solid ${r.bd}`, background: r.bg, color: r.fg, display: "flex", alignItems: "center", font: `500 ${fs(13)} Inter, sans-serif`, cursor: "pointer" }}>{r.label}</span>)}
          </div>
          {lv.isOther && <input type="text" placeholder="Write the reason" value={lv.note} maxLength={200} onChange={e => lv.setNote(e.target.value)} style={{ ...FIELD, marginTop: "4px" }} />}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px" }}>
          {pair("From", lv.fromDate, lv.fromTime, lv.setFD, lv.setFT)}
          {pair("To", lv.toDate, lv.toTime, lv.setTD, lv.setTT)}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <span {...tap(lv.cancel)} style={{ ...foot, border: "1px solid var(--crm-line)" }}>Cancel</span>
          <span {...tap(lv.save)} style={{ ...foot, background: "var(--crm-rust)", color: "#fff" }}>Save</span>
        </div>
      </div>
    </div>
  );
}

export function PhoneUpNext({ head, live, book, ads, canAct, line }: { head: ReactNode; live: boolean; book: UpNextBook; ads: UpNextAd[]; canAct: boolean; line: string | null }) {
  const { d, lv, toast, failed, close } = useUpNext({ live, book, ads, canAct, line });
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
  const main: CSSProperties = { flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "18px 20px 32px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "16px", color: "var(--crm-ink)" };
  if (!d) return <main style={main}>{head}{failed && <div style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>{failed}</div>}</main>;
  const f = d.first;
  return (<>
    <main style={main}>
      {head}
      <div data-un-menu="" style={{ flex: "none", position: "relative", zIndex: 6 }}>
        <span {...tap(d.toggleAd)} style={{ height: "44px", padding: "0 14px", boxSizing: "border-box", borderRadius: "12px", background: "var(--crm-field)", display: "flex", alignItems: "center", gap: "8px", fontSize: fs(13.5), fontWeight: 500, cursor: "pointer" }}><span style={{ flex: 1 }}>{d.adName}</span><Chev /></span>
        {d.adOpen && (
          <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 7, padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto" }}>
            {d.ads.map(a => <div key={a.id} {...tap(a.pick)} style={{ display: "flex", alignItems: "center", gap: "10px", height: "44px", flex: "none", padding: "0 10px", borderRadius: "7px", fontSize: fs(13), background: a.rowBg, cursor: "pointer" }}><span style={{ flex: 1, minWidth: 0, fontWeight: a.w, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span><span style={{ fontSize: fs(11.5), color: "var(--crm-faint)" }}>{a.sub}</span></div>)}
          </div>
        )}
      </div>
      <div style={{ flex: "none", display: "flex", flexDirection: "column", padding: "14px 16px", borderRadius: "14px", background: "var(--crm-ink)", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", paddingBottom: "12px", fontSize: fs(11.5), color: "var(--crm-sidebar-text)", whiteSpace: "nowrap", overflow: "hidden" }}><span>Last lead</span><span style={{ fontWeight: 600, color: "#fff" }}>{d.last.name}</span>{d.last.when && <span>· {d.last.when}</span>}</div>
        <div {...(f ? tap(f.open) : {})} style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
          <span style={{ width: "48px", height: "48px", borderRadius: "50%", flex: "none", display: "grid", placeItems: "center", background: "rgba(255,255,255,.18)", color: "#fff", font: `500 ${fs(16)} ${TIGHT}` }}>{f?.ini ?? "—"}</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(22), letterSpacing: "-0.02em", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f?.name ?? "Nobody in turn"}</span>
              {f?.pinned && <span style={{ flex: "none", height: "17px", lineHeight: "17px", padding: "0 6px", borderRadius: "9px", background: UN_PIN_BG, color: UN_PIN_FG, fontSize: fs(10), fontWeight: 600 }}>{f.why.endsWith("set by you") ? "Set by you" : `Set by ${f.why.split("set by ")[1]}`}</span>}
            </span>
            {f && <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: fs(12), color: UN_ESPRESSO_TEXT }}><span style={{ width: "14px", height: "14px", borderRadius: "50%", flex: "none", background: "#fff", display: "grid", placeItems: "center" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: f.dot }} /></span><span>{f.team}</span><span>· next lead</span></span>}
          </span>
        </div>
        {d.canAct && f?.act && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.4fr", gap: "8px", padding: "14px 0 0" }}>
            {f.notPinned && (<>
              <span {...tap(f.skip)} style={WHITE12}>Skip</span>
              <span {...tap(f.pause)} style={WHITE12}>Pause</span>
              <span {...tap(d.togglePick)} style={{ height: "44px", borderRadius: "12px", background: "#fff", color: "var(--crm-rust)", display: "grid", placeItems: "center", fontSize: fs(13.5), fontWeight: 600, cursor: "pointer" }}>Give to…</span>
            </>)}
            {f.pinned && <span {...tap(d.unpin)} style={{ ...WHITE12, gridColumn: "1 / -1" }}>Undo</span>}
          </div>
        )}
      </div>
      <div style={{ flex: "none", display: "flex", flexDirection: "column", marginTop: "-8px" }}>
        {d.chain.map(s => (
          <div key={s.k} {...(d.canAct ? tap(s.open) : {})} style={{ display: "flex", alignItems: "center", gap: "10px", height: "46px", padding: "0 4px", borderBottom: "1px solid var(--crm-rule)", cursor: "pointer" }}>
            <span style={{ width: "24px", font: `600 ${fs(12)} ${TIGHT}`, color: FAINT }}>#{s.k}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: fs(11.5), color: FAINT }}><span style={DOT(s.dot)} />{s.teamShort}</span>
          </div>
        ))}
        <span {...tap(d.toggleMore)} style={{ height: "40px", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", fontSize: fs(12.5), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>{d.moreLabel}<Chev /></span>
      </div>
      <section style={{ flex: "none", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", padding: "3px", borderRadius: "12px", background: "var(--crm-field)", marginBottom: "4px" }}>
          {d.ltabs.map(t => <span key={t.key} {...tap(t.go)} style={{ flex: 1, height: "36px", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: t.bg, boxShadow: t.sh, fontSize: fs(12.5), fontWeight: 600, color: t.fg, cursor: "pointer" }}>{t.label}<span style={{ font: `600 ${fs(11)} Inter, sans-serif`, color: FAINT }}>{t.n}</span></span>)}
        </div>
        {d.tabIn && d.inTurn.map(m => (
          <div key={m.id} {...(d.canAct ? tap(m.open) : {})} style={{ ...ROW, cursor: "pointer" }}>
            <span style={{ width: "26px", font: `600 ${fs(12)} ${TIGHT}`, color: FAINT }}>{m.nextTxt}</span><span style={DOT(m.dot)} />
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
            <span style={{ fontSize: fs(11.5), color: FAINT, whiteSpace: "nowrap" }}>{m.last}</span>
          </div>
        ))}
        {d.tabOff && d.greyed.map(g => (
          <div key={g.id} style={{ ...ROW, color: FAINT }}>
            <span style={{ width: "26px" }} /><span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", boxSizing: "border-box", border: `1.5px solid ${g.dot}` }} />
            <span style={{ flex: "none", fontSize: fs(14), fontWeight: 500 }}>{g.name}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(11.5), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.whyMini}</span>
            {g.canResume && <span {...tap(g.resume)} style={{ height: "44px", display: "flex", alignItems: "center", fontSize: fs(12.5), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>Resume</span>}
            {g.canEnd && <span {...tap(g.editLeave)} style={{ height: "44px", display: "flex", alignItems: "center", fontSize: fs(12.5), fontWeight: 600, color: "var(--crm-rust)", cursor: "pointer" }}>Edit</span>}
          </div>
        ))}
        {d.tabUp && d.upcoming.map(u => (
          <div key={u.id} {...(d.canAct ? tap(u.edit) : {})} style={{ ...ROW, cursor: "pointer" }}>
            <span style={{ width: "26px", font: `600 ${fs(11.5)} ${TIGHT}`, color: FAINT }}>{u.dayNum}</span><span style={DOT(u.dot)} />
            <span style={{ flex: "none", fontSize: fs(14), fontWeight: 500 }}>{u.name}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(11.5), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.short}</span>
          </div>
        ))}
        {d.tabUp && d.upNone && <div style={{ minHeight: "48px", display: "flex", alignItems: "center", fontSize: fs(12.5), color: FAINT }}>Nobody on leave</div>}
      </section>
    </main>
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
        <div onClick={stop} style={{ ...SHEET, padding: "10px 20px calc(26px + var(--sheet-safe, 0px))", gap: "14px" }}>
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
    {toast && <div style={{ position: "absolute", left: "16px", right: "16px", bottom: "76px", zIndex: 42, padding: "11px 14px", borderRadius: "12px", background: "var(--crm-ink)", color: "#fff", fontSize: fs(12.5), textAlign: "center" }}>{toast}</div>}
  </>);
}
