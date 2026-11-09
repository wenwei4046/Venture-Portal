"use client";
/**
 * Team activity on the phone (the Control panel's Activity tab) — CRM Team Activity.dc.html's 390 frame element for
 * element, on shared/team-activity.ts, the desktop's own view model. Its sheets fade their scrim in and slide up as
 * every Control panel sheet (the owner, 2026-11-08). Sizes are the Revenue app's (typePx).
 */
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { DateRangePicker, rangeWords } from "./date-range";
import type { CrmData } from "@/lib/member/crm-data";
import type { PeopleBook } from "./people-book";
import type { ActivityVM } from "./team-activity";
import { typePx as fs } from "./type";
import { useTeamActivity } from "./use-team-activity";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
const COLS = "minmax(0,1fr) 30px 56px 52px 32px 34px";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Chev = ({ style }: { style?: CSSProperties }) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={style}><path d="m6 9 6 6 6-6" /></svg>;
const SCRIM: CSSProperties = { position: "absolute", inset: 0, zIndex: 40, background: "rgba(42,22,12,.32)", animation: "fadeIn 200ms ease-out" };
const SHEET: CSSProperties = { position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 41, borderRadius: "26px 26px 0 0", background: "#fff", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)", color: "var(--crm-ink)", fontFamily: INTER, boxSizing: "border-box" };


export interface PhoneActivityIn { data: CrmData; book: PeopleBook; live: boolean; who: string | null; nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(id: string): void }

export function PhoneTeamActivity({ a, top }: { a: PhoneActivityIn; top?: ReactNode }) {
  const v = useTeamActivity(a);
  return <PhoneTeamActivityView v={v} top={top} />;
}

function AdPick({ v }: { v: ActivityVM }) {
  const [open, setOpen] = useState(false);
  const cur = v.ads.find(a => a.value === v.adVal) ?? v.ads[0];
  useEffect(() => {
    if (!open) return;
    const on = (e: Event) => { if (!(e.target as Element | null)?.closest?.("[data-ad-pick]")) setOpen(false); };
    document.addEventListener("click", on);
    return () => document.removeEventListener("click", on);
  }, [open]);
  return (
    <div data-ad-pick="" style={{ flex: "none", position: "relative", zIndex: 6 }}>
      <span {...press(() => setOpen(o => !o))} aria-expanded={open} aria-label={`Ad: ${cur.name}`} style={{ height: "40px", padding: "0 12px 0 14px", boxSizing: "border-box", borderRadius: "20px", display: "flex", alignItems: "center", gap: "8px",
        background: v.adOn ? "var(--crm-tint-attention)" : "var(--crm-field)", font: `500 ${fs(13.5)} ${INTER}`, color: "var(--crm-ink)", cursor: "pointer" }}>
        <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cur.name}</span>
        <span style={{ flex: "none", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{cur.n}</span>
        <Chev style={{ flex: "none", color: "var(--crm-muted)" }} />
      </span>
      {open && (
        <div role="listbox" aria-label="Ad" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 7, padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", maxHeight: "50vh", overflowY: "auto" }}>
          {v.ads.map(a => { const on = a.value === v.adVal;
            return (
              <span key={a.value} {...press(() => { v.setAd({ target: { value: a.value } }); setOpen(false); })} role="option" aria-selected={on}
                style={{ flex: "none", minHeight: "40px", padding: "8px 10px", boxSizing: "border-box", borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", background: on ? "var(--crm-field)" : "transparent", cursor: "pointer" }}>
                <span style={{ flex: 1, minWidth: 0, font: `${on ? 600 : 400} ${fs(13)} ${INTER}`, lineHeight: 1.35, color: "var(--crm-ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{a.name}</span>
                <span style={{ flex: "none", font: `400 ${fs(12.5)} ${INTER}`, color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{a.n}</span>
              </span>
            ); })}
        </div>
      )}
    </div>
  );
}

/** The fold, kept with the page's filters across a chat (use-team-activity.ts). */
const GREY = { open: false };

export function PhoneTeamActivityView({ v, top }: { v: ActivityVM; top?: ReactNode }) {
  // The owner, 2026-11-09: the greyed people (out of today's turn with no leads) go to the bottom, folded at first; Custom is
  // one centred line of dates on the CRM's own picker (the phone's native one was large and dark).
  const [greyOpen, setGrey] = useState(GREY.open), [pick, setPick] = useState(false);
  const setGreyOpen = (f: (o: boolean) => boolean) => setGrey(o => (GREY.open = f(o)));
  const active = v.pRows.filter(r => r.op === 1), grey = v.pRows.filter(r => r.op !== 1);
  const iso = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const at = (s: string, end: boolean) => { const [y, m, d] = s.split("-").map(Number); return end ? new Date(y, m - 1, d, 23, 59, 59, 999).getTime() : new Date(y, m - 1, d).getTime(); };
  const setPer = (e: { target: { value: string } }) => { v.setPer(e); if (e.target.value === "Custom") setPick(true); };
  const row = (r: ActivityVM["pRows"][number]) => (
            <div key={r.id} style={{ display: "flex", flexDirection: "column", borderBottom: "1px solid var(--crm-rule-2)" }}>
              <div {...press(r.toggle)} aria-expanded={r.open} style={{ display: "grid", gridTemplateColumns: COLS, columnGap: "5px", alignItems: "center", minHeight: "50px", fontSize: fs(13.5), fontVariantNumeric: "tabular-nums", cursor: "pointer", color: r.rowFg }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: r.tdot, opacity: r.op }} />
                  <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                    <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                    {r.off && <span style={{ fontSize: fs(11), color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.turn}</span>}
                  </span>
                </span>
                <span style={{ textAlign: "right", fontWeight: 600 }}>{r.leads}</span>
                <span style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.avg}</span>
                <span style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: r.waitFg }}>{r.waitTxt}</span>
                <span style={{ textAlign: "right" }}>{r.appt}</span>
                <span style={{ textAlign: "right" }}>{r.show}</span>
              </div>
              {r.open && (
                <div style={{ display: "flex", flexDirection: "column", padding: "0 0 10px 18px" }}>
                  {r.list.map(l => (
                    <div key={l.key} {...press(l.go)} style={{ display: "grid", gridTemplateColumns: "42px minmax(0,1fr) auto", columnGap: "10px", alignItems: "center", minHeight: "44px", padding: "0 8px", margin: "0 -8px", borderRadius: "10px", cursor: "pointer", background: l.bg }}>
                      <span style={{ font: `600 ${fs(12)} ${TIGHT}`, color: "var(--crm-list-sub)" }}>{l.got}</span>
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
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <h1 style={{ margin: 0, font: `500 ${fs(26)} ${TIGHT}`, letterSpacing: "-0.025em" }}>Team activity</h1>
          <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: fs(12), color: "var(--crm-muted)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-green)" }} />{v.clock}</span>
        </div>
        <div style={{ flex: "none", display: "flex", gap: "8px" }}>
          <span {...press(v.pOpenMenu)} style={{ flex: 1, minWidth: 0, height: "40px", boxSizing: "border-box", padding: "0 12px", borderRadius: "20px", background: "var(--crm-field)", display: "flex", alignItems: "center", gap: "7px", font: `500 ${fs(13.5)} ${INTER}`, cursor: "pointer" }}>
            {v.selDot && <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: v.selDot }} />}
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.selLabel}</span>
            <Chev style={{ marginLeft: "auto", flex: "none", color: "var(--crm-muted)" }} />
          </span>
          <span style={{ position: "relative", flex: "none", height: "40px", borderRadius: "20px", background: "var(--crm-field)", display: "flex", alignItems: "center" }}>
            <select value={v.perVal} onChange={setPer} aria-label="Period" style={{ appearance: "none", WebkitAppearance: "none", height: "40px", padding: "0 32px 0 14px", border: 0, background: "transparent", font: `500 ${fs(13.5)} ${INTER}`, color: "var(--crm-ink)", cursor: "pointer", outline: "none" }}>
              <option value="Today">Today</option><option value="Week">Week</option><option value="Month">Month</option><option value="Custom">Custom</option>
            </select>
            <Chev style={{ position: "absolute", right: "12px", pointerEvents: "none", color: "var(--crm-muted)" }} />
          </span>
        </div>
        {/* All ads, or one ad's leads (the owner, 2026-11-09: "加入可以筛选广告"; then "选择广告时，画面不好看，字太大了" — the
            iPhone's own list drew the long ad names large): the CRM's dropdown, each ad on up to two lines with its count. */}
        <AdPick v={v} />
        {v.isCustom && (
          <span {...press(() => setPick(true))} style={{ alignSelf: "center", flex: "none", height: "36px", padding: "0 16px", borderRadius: "18px", background: "var(--crm-field)", display: "flex", alignItems: "center", gap: "8px", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>
            {rangeWords(v.cFrom, v.cTo)}<Chev style={{ color: "var(--crm-muted)" }} />
          </span>
        )}
        {pick && <DateRangePicker sheet value={{ a: at(v.cFrom, false), b: at(v.cTo, true) }} onCancel={() => setPick(false)}
          onApply={r => { v.setFrom({ target: { value: iso(r.a) } }); v.setTo({ target: { value: iso(r.b) } }); setPick(false); }} />}
        {/* Centred, each figure over its word, on the desktop figures' band (the owner, 2026-11-09: "置中" — "Came" ran off the edge). */}
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", padding: "12px 0", borderRadius: "12px", background: "var(--crm-sum)" }}>
          {v.pTiles.map(t => (
            <div key={t.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "5px", minWidth: 0, textAlign: "center" }}>
              <span style={{ font: `500 ${fs(22)} ${TIGHT}`, letterSpacing: "-0.02em", lineHeight: 1, color: t.c }}>{v.loading ? "—" : t.v}</span>
              <span style={{ fontSize: fs(11), color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{t.k}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: COLS, columnGap: "5px", height: "28px", alignItems: "center", borderBottom: "1px solid var(--crm-rule)", font: `500 ${fs(10.5)} ${INTER}`, letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--crm-faint)" }}>
            <span /><span style={{ textAlign: "right" }}>Leads</span><span style={{ textAlign: "right" }}>Avg</span><span style={{ textAlign: "right" }}>Wait</span><span style={{ textAlign: "right" }}>Appt</span><span style={{ textAlign: "right" }}>Came</span>
          </div>
          {active.map(row)}
          {grey.length > 0 && (
            <div {...press(() => setGreyOpen(o => !o))} aria-expanded={greyOpen} style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "44px", borderBottom: "1px solid var(--crm-rule-2)", font: `500 ${fs(13)} ${INTER}`, color: "var(--crm-faint)", cursor: "pointer" }}>
              Not in turn<span style={{ fontVariantNumeric: "tabular-nums" }}>{grey.length}</span>
              <Chev style={{ marginLeft: "auto", transform: greyOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
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
