"use client";
/**
 * Team activity on the desktop — v4 frames D4a (the list) and D4b (a lead open), docs/design_handoff_crm_redesign_v4
 * notes/22, on shared/team-activity.ts (the phone's 8e logic: the default order, the top N, the one time format).
 *
 * Under Insight the head's period is this page's (notes/20; `period`), so the page has no title or period of its own:
 * Everyone ▾ · All ads ▾ · Live · 18:24, the espresso strip, then ONE list (not grouped by team) — Name · Team · Leads ·
 * Avg reply · Waiting · Appt · Show-up — top 6, "Show N more", "Not in turn N" folded at the end. A person opens to their
 * leads on the same grid. A lead opens the 420 px drawer on the right, below the tab row, with no dim: the table stays
 * usable and tightens to 230 / 160 px and a right padding of 452 px, so all seven columns stay in sight; another lead
 * swaps it, ‹ 1 / 3 › steps through the person's leads, × or Esc closes it and gives the table its width back.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CrmData } from "@/lib/member/crm-data";
import type { PeopleBook } from "../shared/people-book";
import { useTeamActivity } from "../shared/use-team-activity";
import { ACT_TOP_DESK, STRIP_LATE, activityOrder, foldTop, type ActivityVM, type ActSort, type Period, type SortKey } from "../shared/team-activity";
import { AuditTimeline } from "../shared/audit-timeline";
import { Ic } from "../shared/icons4a";
import { avatarTint } from "../shared/palette";
import s from "./leave-cal.module.css";
import { DateRangePicker, rangeWords } from "../shared/date-range";

const ymd = (t: number) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const day = (x: string, end: boolean) => { const [y, m, dd] = x.split("-").map(Number); return end ? new Date(y, m - 1, dd, 23, 59, 59, 999).getTime() : new Date(y, m - 1, dd).getTime(); };

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
const CLIP: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });

/**
 * D4a's columns, and D4b's while a lead is open (notes/22): 260 / 200 and 230 / 160 wherever there is the room the
 * prototype has (1440 px with no CRM sidebar). The app's column is ~1070 px at 1440 × 900, which leaves the five figures
 * ~28 px each beside a 420 px drawer — so Name and Team give way first (to 140 / 96) and a figure keeps 56 px, enough for
 * "Avg reply" and "1h 05m"; past that the list scrolls sideways rather than letting the headers run into each other.
 */
export const ACT_COLS = "minmax(160px,260px) minmax(110px,200px) repeat(5,minmax(56px,1fr))";
export const ACT_COLS_TIGHT = "minmax(140px,230px) minmax(96px,160px) repeat(5,minmax(56px,1fr))";
/** The drawer's width and the table's right padding while it is open. */
export const ACT_DRAWER_W = 420;
export const ACT_PAD_OPEN = 452;
/** The page’s side gutter: 32 px under Insight (frames D4a / D4b), 36 px on its own page (v3). */
const PAD_X = 36, PAD_X_INSIGHT = 32;
/** D4a / D4b colours: labels on espresso and the facts' dividers. */
const ON_DARK = "var(--crm-on-dark-meta)", DIVIDER = "var(--crm-fig-div)";

/** "08:40" → "8:40", as D4a writes a time. */
const hm = (t: string) => t.replace(/^0(\d)/, "$1");
/** A lead's status square (6 px, radius 2) in the CRM's status colour. */
const SQ: Record<string, string> = { New: "var(--crm-st-new)", "Follow up": "var(--crm-st-follow)", Appointment: "var(--crm-st-appt)", "Handed away": "var(--crm-faint-2)" };
const HEAD_KEY: Record<string, SortKey> = { Leads: "leads", "Avg reply": "avg", Waiting: "waitMax", Appt: "appt", "Show-up": "show" };
const ini = (n: string) => n.split(/\s+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase();

export interface DeskActivityIn {
  data: CrmData; book: PeopleBook; live: boolean; who: string | null; nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(id: string): void;
  /** Insight's head period (notes/20 / 22): when set, it is this page's period and the page draws no head of its own. */
  period?: { per: Period; from: string; to: string };
}

export function DeskTeamActivity({ a }: { a: DeskActivityIn }) {
  const v = useTeamActivity(a);
  const p = a.period;
  // The head's period drives the page (before the paint, so the old period never shows).
  useLayoutEffect(() => {
    if (!p) return;
    if (p.per === "Custom" && (v.cFrom !== p.from || v.cTo !== p.to)) { v.setFrom({ target: { value: p.from } }); v.setTo({ target: { value: p.to } }); }
    if (v.perVal !== p.per) v.setPer({ target: { value: p.per } });
  }, [p?.per, p?.from, p?.to, v.perVal, v.cFrom, v.cTo]); // eslint-disable-line react-hooks/exhaustive-deps
  return <DeskTeamActivityView v={v} inInsight={!!p} />;
}

/** The fold, the "Show N more" and the Not in turn, kept with the page's filters across a chat (use-team-activity.ts). */
const KEPT = { grey: false, more: false };

type Row = ActivityVM["groups"][number]["rows"][number] & { team: string; dot: string };

export function DeskTeamActivityView({ v, inInsight = true }: { v: ActivityVM; inInsight?: boolean }) {
  const [greyOpen, setGrey] = useState(KEPT.grey), [more, setMore] = useState(KEPT.more);
  const [pick, setPick] = useState(false), [menu, setMenu] = useState<"ads" | null>(null), pickAt = useRef<HTMLButtonElement>(null);
  const flip = (k: "grey" | "more", set: (b: boolean) => void, cur: boolean) => { KEPT[k] = !cur; set(!cur); };
  // One list, not grouped by team: every person once, with their team's name and dot.
  const seen = new Set<string>();
  const rows: Row[] = v.groups.flatMap(g => g.rows.map(r => ({ ...r, team: g.name, dot: g.dot }))).filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
  // The order the heads say (none tapped: leads high → low, notes/14b), 0-lead people last; the greyed fold below.
  const sh = v.heads.find(h => h.arrow), sort: ActSort = sh && HEAD_KEY[sh.label] ? { k: HEAD_KEY[sh.label], d: sh.arrow === "↑" ? 1 : -1 } : null;
  const active = activityOrder(rows.filter(r => r.op === 1), sort), grey = activityOrder(rows.filter(r => r.op !== 1), sort);
  const top = foldTop(active, ACT_TOP_DESK, more);
  // The lead open (D4b): the person whose list holds it, its place among their leads.
  const owner = v.dOpen && v.d.open ? rows.find(r => r.list.some(l => l.bg !== "transparent")) : undefined;
  const at = owner ? owner.list.findIndex(l => l.bg !== "transparent") : -1;
  const open = !!owner && at >= 0;
  const cols = open ? ACT_COLS_TIGHT : ACT_COLS;
  const today = v.perVal === "Today";
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") v.dClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, v]);

  const grid = (h: string, extra?: CSSProperties): CSSProperties => ({ display: "grid", gridTemplateColumns: cols, columnGap: "16px", height: h, alignItems: "center", padding: "0 12px", ...extra });
  const person = (r: Row) => (
    <div key={r.id} data-act-person={r.id} style={{ display: "flex", flexDirection: "column" }}>
      <div {...press(r.toggle)} aria-expanded={r.open} className={s.row} style={grid("50px", { borderBottom: "1px solid var(--crm-rule-soft)", font: `400 14.5px ${INTER}`, fontVariantNumeric: "tabular-nums", cursor: "pointer", background: r.open ? "var(--crm-hover)" : "transparent" })}>
        <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
          <span style={{ flex: "none", width: "13px", display: "flex", color: "var(--crm-faint)", transform: `rotate(${r.open ? 90 : 0}deg)`, transition: "transform .15s" }}><Ic name="chevron-right" size={13} /></span>
          <span style={{ fontWeight: 500, ...CLIP }}>{r.name}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, color: "var(--crm-muted)" }}>
          <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "50%", background: r.dot }} /><span style={CLIP}>{r.team}</span>
        </span>
        <span style={{ textAlign: "right", fontWeight: 600, color: r.leads ? "var(--crm-ink)" : "var(--crm-faint)" }}>{r.leads}</span>
        <span style={{ textAlign: "right", whiteSpace: "nowrap", color: r.avg === "—" ? "var(--crm-faint)" : "var(--crm-ink)" }}>{r.avg}</span>
        <span style={{ textAlign: "center", fontWeight: 600, whiteSpace: "nowrap", color: r.late ? "var(--crm-oxblood)" : "var(--crm-faint)" }}>{r.waitShown}</span>
        <span style={{ textAlign: "right", color: r.appt ? "var(--crm-ink)" : "var(--crm-faint)" }}>{r.appt}</span>
        <span style={{ textAlign: "right", color: r.show ? "var(--crm-ink)" : "var(--crm-faint)" }}>{r.show}</span>
      </div>
      {r.open && (
        <div style={{ display: "flex", flexDirection: "column", padding: "2px 0 6px", background: "var(--crm-hover)", borderBottom: "1px solid var(--crm-rule-soft)" }}>
          {r.list.map(l => {
            const sel = l.bg !== "transparent";
            return (
              <div key={l.key} {...press(l.go)} data-act-lead={l.key} style={grid("36px", { font: `400 13.5px ${INTER}`, fontVariantNumeric: "tabular-nums", cursor: "pointer" })}>
                <span style={{ paddingLeft: "23px", minWidth: 0, fontWeight: sel ? 600 : 500, color: sel ? "var(--crm-rust)" : "var(--crm-ink)", ...CLIP }}>{l.name}</span>
                <span style={{ paddingLeft: "15px", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{today ? hm(l.got) : `${l.gotD}, ${hm(l.got)}`}</span>
                <span />
                <span style={{ textAlign: "right", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{l.repT}</span>
                <span style={{ textAlign: "center", fontWeight: 600, whiteSpace: "nowrap", color: l.rc }}>{l.waitT}</span>
                <span style={{ gridColumn: "span 2", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "7px", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
                  {l.status && <><span style={{ width: "6px", height: "6px", borderRadius: "2px", background: SQ[l.status] ?? "var(--crm-faint-2)" }} />{l.status}</>}
                </span>
              </div>
            );
          })}
          {r.none && <div style={{ height: "36px", display: "flex", alignItems: "center", paddingLeft: "47px", font: `400 13px ${INTER}`, color: "var(--crm-faint)" }}>No leads in this period</div>}
        </div>
      )}
    </div>
  );

  const pill: CSSProperties = { height: "34px", padding: "0 12px", boxSizing: "border-box", borderRadius: "8px", display: "flex", alignItems: "center", gap: "7px", font: `500 13.5px ${INTER}`, background: "var(--crm-field)", color: "var(--crm-ink)", whiteSpace: "nowrap", cursor: "pointer" };
  const pop: CSSProperties = { position: "absolute", top: "40px", left: 0, zIndex: 21, maxHeight: "520px", overflow: "auto", boxSizing: "border-box", padding: "6px", borderRadius: "10px", background: "#fff", boxShadow: "0 14px 36px rgba(42,22,12,.18)" };
  const adCur = v.ads.find(x => x.value === v.adVal);
  const st = (x: { c: string; k: string }) => (x.k === "Waiting" && v.anyLate ? STRIP_LATE : "#fff");
  const d = v.d;
  const name = owner ? d.name : "";
  const [ab, af] = avatarTint(name || "?");
  return (
    <div data-team-activity="" style={{ position: "relative", flex: "1 1 auto", minHeight: 0, height: "100%", display: "flex", flexDirection: "column", font: `400 14px ${INTER}`, color: "var(--crm-ink)", background: "#fff" }}>
      {/* The page on its own (no Insight head): its title and period, as before. */}
      {!inInsight && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "20px", padding: "26px 36px 0" }}>
          <span style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>Team activity</span>
          <div role="group" aria-label="Period" style={{ display: "flex", padding: "3px", borderRadius: "10px", background: "var(--crm-field)" }}>
            {v.periods.map(p => <button key={p.label} ref={p.label === "Custom" ? pickAt : undefined} type="button" onClick={() => { p.go(); if (p.label === "Custom") setPick(true); }} aria-pressed={p.bg === "#fff"}
              style={{ height: "30px", padding: "0 14px", border: 0, borderRadius: "8px", display: "flex", alignItems: "center", font: `${p.bg === "#fff" ? 600 : 500} 13.5px ${INTER}`, background: p.bg, boxShadow: p.bg === "#fff" ? "0 1px 2px #2A160C1F" : "none", color: p.bg === "#fff" ? "var(--crm-ink)" : "var(--crm-muted)", cursor: "pointer" }}>{p.label === "Week" ? "This week" : p.label === "Month" ? "This month" : p.label}</button>)}
          </div>
          <span style={{ font: `400 14px ${INTER}`, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{v.isCustom ? rangeWords(v.cFrom, v.cTo) : rangeWords(v.range.a, v.range.b)}</span>
          {pick && <DateRangePicker anchor={pickAt} value={{ a: day(v.cFrom, false), b: day(v.cTo, true) }} allFrom={v.allFrom} onCancel={() => setPick(false)}
            onApply={r => { v.setFrom({ target: { value: ymd(r.a) } }); v.setTo({ target: { value: ymd(r.b) } }); setPick(false); }} />}
        </div>
      )}
      <div data-act-scroll="" style={{ flex: 1, minHeight: 0, overflow: "auto", padding: `20px ${open ? ACT_PAD_OPEN : inInsight ? PAD_X_INSIGHT : PAD_X}px 32px ${inInsight ? PAD_X_INSIGHT : PAD_X}px`, display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{ position: "relative" }}>
            <span {...press(v.toggleMenu)} style={pill}>
              {v.selDot && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.selDot }} />}{v.selLabel}<Ic name="chevron-down" size={12} />
            </span>
            {v.menuOpen && (<>
              <div onClick={v.closeMenu} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div style={{ ...pop, width: "280px" }}>
                {v.menu.map(m => (
                  <div key={m.key} {...press(m.go)} className={s.soft} style={{ height: m.h, display: "flex", alignItems: "center", gap: "8px", padding: `0 10px 0 ${m.pl}`, borderRadius: "7px", cursor: "pointer", fontSize: "13px", fontWeight: m.w, background: m.bg, borderTop: `1px solid ${m.bt}` }}>
                    {m.dot && <span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: m.dot }} />}
                    <span style={{ flex: 1, ...CLIP }}>{m.label}</span>
                    <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{m.role}</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
          {/* All ads, or one ad's leads (the owner, 2026-11-09), in the CRM's own dropdown. */}
          <div style={{ position: "relative" }}>
            <span {...press(() => setMenu(m => (m ? null : "ads")))} aria-label="Ad" style={{ ...pill, maxWidth: "320px", color: v.adOn ? "var(--crm-rust)" : "var(--crm-ink)" }}>
              <span style={CLIP}>{v.adOn ? adCur?.name ?? "Ad" : "All ads"}</span><Ic name="chevron-down" size={12} />
            </span>
            {menu === "ads" && (<>
              <div onClick={() => setMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
              <div role="listbox" style={{ ...pop, width: "300px" }}>
                {v.ads.map(x => (
                  <div key={x.value} {...press(() => { v.setAd({ target: { value: x.value } }); setMenu(null); })} role="option" aria-selected={x.value === v.adVal} className={s.soft}
                    style={{ minHeight: "36px", display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", boxSizing: "border-box", borderRadius: "7px", cursor: "pointer", fontSize: "13px", fontWeight: x.value === v.adVal ? 600 : 400, background: x.value === v.adVal ? "var(--crm-field)" : "transparent" }}>
                    <span style={{ flex: 1, minWidth: 0, ...CLIP }}>{x.name}</span><span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>{x.n}</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
          <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", font: `400 13px ${INTER}`, color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-v4-green)" }} />Live · {v.clock}
          </span>
        </div>
        {/* The espresso strip: five equal centred columns, white figures, Waiting #FFB38A when any wait is late. */}
        <div data-act-strip="" style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", height: "88px", alignItems: "center", borderRadius: "16px", background: "var(--crm-ink)", color: "#fff" }}>
          {v.tiles.map((t, i) => (
            <div key={t.k} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", borderLeft: i ? "1px solid #FFFFFF1F" : undefined }}>
              <span style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.02em", lineHeight: 1, color: st(t), fontVariantNumeric: "tabular-nums" }}>{v.loading ? "—" : t.v}</span>
              <span style={{ font: `400 13px ${INTER}`, color: ON_DARK }}>{t.k}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
          <div data-act-head="" style={grid("38px", { borderRadius: "8px", background: "var(--crm-hover)", font: `500 12.5px ${INTER}`, color: "var(--crm-muted)", whiteSpace: "nowrap" })}>
            <span style={{ paddingLeft: "23px" }}>Name</span><span style={{ paddingLeft: "15px" }}>Team</span>
            {v.heads.slice(1).map(h => {
              const on = !!h.arrow || (!sort && h.label === "Leads");
              return <span key={h.label} {...press(h.sort)} style={{ textAlign: h.label === "Waiting" ? "center" : "right", color: on ? "var(--crm-ink)" : undefined, cursor: "pointer" }}>{h.label}{on ? ` ${h.arrow || "↓"}` : ""}</span>;
            })}
          </div>
          {top.shown.map(person)}
          {top.more > 0 && (
            <div {...press(() => flip("more", setMore, more))} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", height: "44px", borderBottom: "1px solid var(--crm-rule-soft)", font: `500 13.5px ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>
              Show {top.more} more<Ic name="chevron-down" size={13} />
            </div>
          )}
          {more && active.length > ACT_TOP_DESK && (
            <div {...press(() => flip("more", setMore, more))} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", height: "44px", borderBottom: "1px solid var(--crm-rule-soft)", font: `500 13.5px ${INTER}`, color: "var(--crm-rust)", cursor: "pointer" }}>
              Show fewer<Ic name="chevron-down" size={13} style={{ transform: "rotate(180deg)" }} />
            </div>
          )}
          {grey.length > 0 && (
            <div {...press(() => flip("grey", setGrey, greyOpen))} aria-expanded={greyOpen} style={{ display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 12px 0 35px", borderBottom: "1px solid var(--crm-rule-soft)", font: `500 13.5px ${INTER}`, color: "var(--crm-faint)", cursor: "pointer" }}>
              Not in turn<span>{grey.length}</span>
              <span style={{ marginLeft: "auto", display: "flex", transform: greyOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-down" size={13} /></span>
            </div>
          )}
          {greyOpen && grey.map(person)}
        </div>
      </div>
      {open && owner && (
        <aside data-act-drawer="" aria-label={`${d.name}'s log`} className={s.slideIn} style={{ position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 6, width: `${ACT_DRAWER_W}px`, background: "#fff", boxShadow: "-16px 0 40px #2A160C26", display: "flex", flexDirection: "column", font: `400 14px ${INTER}`, color: "var(--crm-ink)" }}>
          <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "12px", padding: "24px 24px 16px", borderBottom: "1px solid var(--crm-rule)" }}>
            <span style={{ width: "44px", height: "44px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: `500 15px ${TIGHT}`, background: ab, color: af }}>{ini(d.name)}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ font: `500 22px ${TIGHT}`, letterSpacing: "-0.01em", ...CLIP }}>{d.name}</span>
              <span style={{ font: `400 13px ${INTER}`, color: "var(--crm-muted)" }}>{d.ad}</span>
            </span>
            <span style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px", marginRight: "4px" }}>
              {(["‹", "›"] as const).map((dir, i) => {
                const to = owner.list[at + (i ? 1 : -1)], round: CSSProperties = { width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: to ? "var(--crm-ink)" : "var(--crm-faint-2)", cursor: to ? "pointer" : "default", order: i ? 3 : 1 };
                return <span key={dir} {...press(() => to?.go())} aria-label={i ? "Next lead" : "Previous lead"} aria-disabled={!to} style={round}><Ic name={i ? "chevron-right" : "chevron-left"} size={14} /></span>;
              })}
              <span style={{ order: 2, font: `500 12.5px ${INTER}`, color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{at + 1} / {owner.list.length}</span>
            </span>
            <span {...press(v.dClose)} aria-label="Close" title="Close (Esc)" style={{ width: "36px", height: "36px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--crm-field)", color: "var(--crm-muted)", cursor: "pointer" }}><Ic name="x" size={15} /></span>
          </div>
          <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", padding: "16px 24px", borderBottom: "1px solid var(--crm-rule)" }}>
            {d.facts.map((f, i) => (
              <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: 0, ...(i ? { paddingLeft: "14px", borderLeft: `1px solid ${DIVIDER}` } : {}) }}>
                <span style={{ font: `500 12px ${INTER}`, color: "var(--crm-muted)" }}>{f.k}</span>
                <span style={{ font: `600 14.5px ${INTER}`, color: f.c, ...CLIP }}>{f.v}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "18px 24px 0" }}>
            <AuditTimeline lines={d.lines} />
          </div>
          <div style={{ flex: "none", padding: "16px 24px 24px", borderTop: "1px solid var(--crm-rule)" }}>
            <span {...press(d.openChat)} className={s.cta} style={{ height: "46px", borderRadius: "23px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: `600 14.5px ${INTER}`, background: "var(--crm-rust)", color: "#fff", cursor: "pointer" }}>Open chat</span>
          </div>
        </aside>
      )}
    </div>
  );
}
