"use client";
/**
 * Team activity on the phone (Insight › Activity) — frame 8e of docs/design_handoff_crm_redesign_v4 (notes/14b), on
 * shared/team-activity.ts, the desktop's own view model: the head and segment (8b), ONE filter row (Everyone ▾ · All ads ▾
 * · Today ▾, the live clock at its end), the espresso figure strip, the table — the rows in activityOrder, the top 5 and
 * "Show N more", Not in turn folded below. No "Team activity" title (the switch says Activity). Its sheets fade their
 * scrim in and slide up as every Control panel sheet. Sizes are the Revenue app's (typePx).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DateRangePicker, rangeWords } from "./date-range";
import type { CrmData } from "@/lib/member/crm-data";
import type { PeopleBook } from "./people-book";
import { ACT_TOP_PHONE, foldTop, type ActivityVM } from "./team-activity";
import { typePx as fs } from "./type";
import { V4 } from "./up-next-style";
import { useTeamActivity } from "./use-team-activity";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
/** 8e: the columns hold "9h 45m" at 13.5 px 600 in Avg and Wait (58 px); names ellipsis instead. */
const COLS = "minmax(0,1fr) 28px 58px 58px 30px 34px";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Chev = ({ style, size = 13 }: { style?: CSSProperties; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="m6 9 6 6 6-6" /></svg>;
const SCRIM: CSSProperties = { position: "absolute", inset: 0, zIndex: 40, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out" };
const SHEET: CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 41, borderRadius: "26px 26px 0 0", background: "#fff", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", color: "var(--crm-ink)", fontFamily: INTER, boxSizing: "border-box" };
/** 8e's filter pill: 36 px, sand, 13 px 500, the 13 px chevron; a long choice ellipsis, never over the clock. */
const PILL: CSSProperties = { flex: "0 1 auto", minWidth: 0, height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "18px", display: "flex", alignItems: "center", gap: "6px", background: "var(--crm-field)", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-ink)", whiteSpace: "nowrap", cursor: "pointer" };
const MENU: CSSProperties = { position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 7, padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto" };
const OPT = (on: boolean): CSSProperties => ({ flex: "none", minHeight: "40px", padding: "8px 10px", boxSizing: "border-box", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", background: on ? "var(--crm-field)" : "transparent", cursor: "pointer" });
const MORE: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", minHeight: "44px", borderBottom: "1px solid var(--crm-rule-soft)", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" };

export interface PhoneActivityIn { data: CrmData; book: PeopleBook; live: boolean; who: string | null; nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(id: string): void }

export function PhoneTeamActivity({ a, top }: { a: PhoneActivityIn; top?: ReactNode }) {
  const v = useTeamActivity(a);
  return <PhoneTeamActivityView v={v} top={top} />;
}

/** The fold, kept with the page's filters across a chat (use-team-activity.ts). */
const GREY = { open: false };
const PERIODS = ["Today", "Week", "Month", "Custom"] as const;
const HEADS = ["", "Leads", "Avg", "Wait", "Appt", "Came"];

export function PhoneTeamActivityView({ v, top }: { v: ActivityVM; top?: ReactNode }) {
  const [greyOpen, setGrey] = useState(GREY.open), [pick, setPick] = useState(false);
  const [menu, setMenu] = useState<"ad" | "per" | null>(null);
  const setGreyOpen = (f: (o: boolean) => boolean) => setGrey(o => (GREY.open = f(o)));
  useEffect(() => {
    if (!menu) return;
    const on = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-act-filters]")) setMenu(null); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [menu]);
  // In turn (or with leads) in the table, in activityOrder; the out-of-turn with no leads folded under Not in turn.
  const active = v.pRows.filter(r => r.op === 1), grey = v.pRows.filter(r => r.op !== 1);
  const fold = foldTop(active, ACT_TOP_PHONE, v.moreOpen);
  const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const at = (s: string, end: boolean) => { const [y, m, d] = s.split("-").map(Number); return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime(); };
  const ad = v.ads.find(a => a.value === v.adVal) ?? v.ads[0];
  const perWord = v.isCustom ? rangeWords(v.cFrom, v.cTo) : v.perVal;
  const zero = (n: number) => (n ? "var(--crm-ink)" : "var(--crm-faint)");
  const row = (r: ActivityVM["pRows"][number]) => (
    <div key={r.id} data-act-row={r.id} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule-soft)" }}>
      <div {...press(r.toggle)} aria-expanded={r.open} style={{ display: "grid", gridTemplateColumns: COLS, columnGap: "6px", alignItems: "center", minHeight: "48px", font: `400 ${fs(13.5)} ${INTER}`, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", cursor: "pointer", color: "var(--crm-ink)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: r.tdot }} />
          <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
            {r.off && <span style={{ fontSize: fs(11), color: "var(--crm-faint)", overflow: "hidden", textOverflow: "ellipsis" }}>{r.turn}</span>}
          </span>
        </span>
        <span data-col="leads" style={{ textAlign: "right", fontWeight: 600, color: zero(r.leads) }}>{r.leads || "—"}</span>
        <span data-col="avg" style={{ textAlign: "right", color: r.avg === "—" ? "var(--crm-faint)" : "var(--crm-ink)" }}>{r.avg}</span>
        <span data-col="wait" style={{ textAlign: "center", fontWeight: 600, color: r.waitC }}>{r.waitShown}</span>
        <span style={{ textAlign: "right", color: zero(r.appt) }}>{r.appt}</span>
        <span style={{ textAlign: "right", color: zero(r.show) }}>{r.show}</span>
      </div>
      {r.open && (
        <div style={{ display: "flex", flexDirection: "column", padding: "0 0 10px 15px" }}>
          {r.list.map(l => (
            <div key={l.key} {...press(l.go)} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", columnGap: "10px", alignItems: "center", minHeight: "44px", padding: "0 8px", margin: "0 -8px", borderRadius: "10px", cursor: "pointer", background: l.bg }}>
              <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.15, font: `600 ${fs(12)} ${TIGHT}`, color: "var(--crm-list-sub)" }}><span style={{ font: `500 ${fs(10.5)} ${INTER}`, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{l.gotD}</span>{l.got}</span>
              <span style={{ fontSize: fs(13.5), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
              <span style={{ fontSize: fs(12.5), fontWeight: 600, whiteSpace: "nowrap", color: l.rc }}>{l.reply}</span>
            </div>
          ))}
          {r.none && <div style={{ minHeight: "40px", display: "flex", alignItems: "center", fontSize: fs(12.5), color: "var(--crm-faint)" }}>No leads</div>}
        </div>
      )}
    </div>
  );
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", font: `400 ${fs(14)} ${INTER}`, color: "var(--crm-ink)" }}>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "14px", padding: "6px 20px 24px" }}>
        {top}
        {/* 8e: Everyone ▾ · All ads ▾ · Today ▾ and the live clock, one row; each menu drops under the whole row. */}
        <div data-act-filters="" style={{ flex: "none", position: "relative", zIndex: 6, display: "flex", alignItems: "center", gap: "6px" }}>
          <span {...press(() => { setMenu(null); v.pOpenMenu(); })} aria-label={`People: ${v.selLabel}`} style={PILL}>
            {v.selDot && <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: v.selDot }} />}
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v.selLabel}</span><Chev style={{ flex: "none" }} />
          </span>
          <span {...press(() => setMenu(m => (m === "ad" ? null : "ad")))} aria-expanded={menu === "ad"} aria-label={`Ad: ${ad.name}`} style={{ ...PILL, background: v.adOn ? "var(--crm-tint-attention)" : "var(--crm-field)" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{ad.name}</span><Chev style={{ flex: "none" }} />
          </span>
          <span {...press(() => setMenu(m => (m === "per" ? null : "per")))} aria-expanded={menu === "per"} aria-label={`Period: ${perWord}`} style={PILL}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{perWord}</span><Chev style={{ flex: "none" }} />
          </span>
          <span style={{ marginLeft: "auto", flex: "none", display: "inline-flex", alignItems: "center", gap: "5px", font: `400 ${fs(12)} ${INTER}`, color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: V4.green }} />{v.clock}
          </span>
          {menu === "ad" && (
            <div role="listbox" aria-label="Ad" style={MENU}>
              {v.ads.map(a => { const on = a.value === v.adVal;
                return (
                  <span key={a.value} {...press(() => { v.setAd({ target: { value: a.value } }); setMenu(null); })} role="option" aria-selected={on} style={OPT(on)}>
                    <span style={{ flex: 1, minWidth: 0, font: `${on ? 600 : 400} ${fs(13)} ${INTER}`, lineHeight: 1.35, color: "var(--crm-ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.name}</span>
                    <span style={{ flex: "none", font: `400 ${fs(12.5)} ${INTER}`, color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{a.n}</span>
                  </span>
                ); })}
            </div>
          )}
          {menu === "per" && (
            <div role="listbox" aria-label="Period" style={MENU}>
              {PERIODS.map(p => { const on = v.perVal === p;
                return (
                  <span key={p} {...press(() => { setMenu(null); v.setPer({ target: { value: p } }); if (p === "Custom") setPick(true); })} role="option" aria-selected={on} style={OPT(on)}>
                    <span style={{ flex: 1, font: `${on ? 600 : 400} ${fs(13)} ${INTER}`, color: "var(--crm-ink)" }}>{p}</span>
                    {p === "Custom" && v.isCustom && <span style={{ flex: "none", font: `400 ${fs(12.5)} ${INTER}`, color: "var(--crm-faint)" }}>{rangeWords(v.cFrom, v.cTo)}</span>}
                  </span>
                ); })}
            </div>
          )}
        </div>
        {pick && <DateRangePicker sheet value={{ a: at(v.cFrom, false), b: at(v.cTo, true) }} allFrom={v.allFrom} onCancel={() => setPick(false)}
          onApply={r => { v.setFrom({ target: { value: iso(r.a) } }); v.setTo({ target: { value: iso(r.b) } }); setPick(false); }} />}
        {/* 8e: the espresso strip — figures white, the Waiting figure #FFB38A when any wait is late, words light on dark. */}
        <div data-act-strip="" style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", padding: "14px 0", borderRadius: "16px", background: "var(--crm-ink)" }}>
          {v.pTiles.map(t => (
            <div key={t.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: 0, textAlign: "center" }}>
              <span style={{ font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.02em", lineHeight: 1, color: t.c, whiteSpace: "nowrap" }}>{v.loading ? "—" : t.v}</span>
              <span style={{ font: `400 ${fs(11)} ${INTER}`, color: V4.onDark, whiteSpace: "nowrap" }}>{t.k}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
          {/* A tapped header still sorts (it overrides the default order); Wait is centred in its column. */}
          <div style={{ display: "grid", gridTemplateColumns: COLS, columnGap: "6px", height: "28px", alignItems: "center", borderBottom: "1px solid var(--crm-rule)", font: `500 ${fs(10.5)} ${INTER}`, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--crm-faint)" }}>
            {HEADS.map((h, i) => { const hd = v.heads[i];
              return i ? <span key={h} {...press(hd.sort)} aria-label={`Sort by ${h}`} style={{ textAlign: i === 3 ? "center" : "right", whiteSpace: "nowrap", color: hd.arrow ? "var(--crm-ink)" : "var(--crm-faint)", cursor: "pointer" }}>{h}{hd.arrow && <span style={{ fontSize: fs(9) }}>{hd.arrow}</span>}</span> : <span key="n" />; })}
          </div>
          {fold.shown.map(row)}
          {fold.more > 0 && <div {...press(v.toggleMore)} aria-expanded={false} style={MORE}>Show {fold.more} more<Chev /></div>}
          {v.moreOpen && active.length > ACT_TOP_PHONE && <div {...press(v.toggleMore)} aria-expanded style={MORE}>Show less<Chev style={{ transform: "rotate(180deg)" }} /></div>}
          {grey.length > 0 && (
            <div {...press(() => setGreyOpen(o => !o))} aria-expanded={greyOpen} style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", borderBottom: "1px solid var(--crm-rule-soft)", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-faint)", cursor: "pointer" }}>
              Not in turn<span style={{ fontVariantNumeric: "tabular-nums" }}>{grey.length}</span>
              <Chev size={14} style={{ marginLeft: "auto", transform: greyOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
            </div>
          )}
          {greyOpen && grey.map(row)}
        </div>
      </div>
      {v.pMenuOpen && (<>
        <div onClick={v.pCloseMenu} style={SCRIM} />
        <div style={{ ...SHEET, maxHeight: "86%", overflow: "auto", padding: "10px 12px calc(28px + var(--sheet-safe, 0px))" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)", margin: "0 auto 10px" }} />
          {v.menu.map(m => (
            <div key={m.key} {...press(m.go)} style={{ minHeight: m.ph, display: "flex", alignItems: "center", gap: "9px", padding: `0 12px 0 ${m.pl}`, borderRadius: "10px", cursor: "pointer", fontSize: fs(14), fontWeight: m.w, background: m.bg, borderTop: `1px solid ${m.bt}` }}>
              {m.dot && <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: m.dot }} />}
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
              <span style={{ fontSize: fs(12), fontWeight: 400, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{m.role}</span>
            </div>
          ))}
        </div>
      </>)}
      {v.pd.open && (<>
        <div onClick={v.pd.close} style={SCRIM} />
        <div style={{ ...SHEET, maxHeight: "90%", display: "flex", flexDirection: "column" }}>
          <div style={{ width: "36px", height: "4px", borderRadius: "2px", background: "var(--crm-line)", margin: "10px auto 0" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "12px 22px 14px" }}>
            <span style={{ font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.02em" }}>{v.pd.name}</span>
            <span style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>{v.pd.ad}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "8px", padding: "0 22px 14px", borderBottom: "1px solid var(--crm-rule)" }}>
            {v.pd.facts.map(f => <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}><span style={{ fontSize: fs(11), color: "var(--crm-faint)" }}>{f.k}</span><span style={{ font: `500 ${fs(15)} ${TIGHT}`, color: f.c, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.v}</span></div>)}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "10px 22px" }}>
            {v.pd.events.map(e => (
              <div key={e.key} style={{ display: "grid", gridTemplateColumns: "48px 12px minmax(0,1fr)", columnGap: "10px" }}>
                <span style={{ paddingTop: "10px", textAlign: "right", font: `600 ${fs(12)} ${TIGHT}`, color: "var(--crm-muted)" }}>{e.d && <span style={{ display: "block", font: `500 ${fs(10.5)} ${INTER}`, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{e.d}</span>}{e.t}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: "1px", height: "14px", background: e.top }} /><span style={{ width: "9px", height: "9px", borderRadius: "50%", flex: "none", background: e.dot }} /><span style={{ flex: 1, width: "1px", background: e.bot }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 0 14px", fontSize: fs(13.5) }}>
                  <span style={{ fontWeight: 600, color: e.c }}>{e.title}</span>
                  {e.sub && <span style={{ fontSize: fs(12), color: "var(--crm-faint)" }}>{e.sub}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "12px 22px calc(30px + var(--sheet-safe, 0px))" }}>
            <span {...press(v.pd.openChat)} style={{ height: "48px", borderRadius: "12px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", font: `500 ${fs(15)} ${INTER}`, cursor: "pointer" }}>Open chat</span>
          </div>
        </div>
      </>)}
    </div>
  );
}
