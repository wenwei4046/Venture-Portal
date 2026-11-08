"use client";
/**
 * Team activity on the desktop — CRM Team Activity.dc.html's 1440 frame element for element, on shared/team-activity.ts.
 * The row's chevron turns in .15 s (the design's one transition); the lead drawer slides in and its scrim fades, as every
 * CRM side panel (the owner, 2026-11-08).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CrmData } from "@/lib/member/crm-data";
import type { PeopleBook } from "../shared/people-book";
import { useTeamActivity } from "../shared/use-team-activity";
import type { ActivityVM } from "../shared/team-activity";
import s from "./leave-cal.module.css";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const INTER = "Inter, sans-serif";
const press = (fn: () => void) => ({ role: "button" as const, tabIndex: 0, onClick: fn, onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } } });
const Svg = ({ d, size, w = 2, style }: { d: string; size: number; w?: number; style?: CSSProperties }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" style={style}><path d={d} /></svg>
);
const DATE: CSSProperties = { height: "36px", padding: "0 8px", boxSizing: "border-box", borderRadius: "7px", border: "1px solid var(--crm-line)", font: `500 12.5px ${INTER}`, color: "var(--crm-ink)", background: "#fff" };

export interface DeskActivityIn { data: CrmData; book: PeopleBook; live: boolean; who: string | null; nameOf(id: string | null | undefined): string; roleOf(id: string): string; openChat(id: string): void }

export function DeskTeamActivity({ a }: { a: DeskActivityIn }) {
  const v = useTeamActivity(a);
  return <DeskTeamActivityView v={v} />;
}

export function DeskTeamActivityView({ v }: { v: ActivityVM }) {
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
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "16px", padding: "26px 36px 18px" }}>
        <span style={{ flex: "none", whiteSpace: "nowrap", font: `500 30px ${TIGHT}`, letterSpacing: "-0.025em" }}>Team activity</span>
        <span style={{ flex: "none", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", fontSize: "12.5px", color: "var(--crm-muted)" }}>
          <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "var(--crm-green)", boxShadow: "0 0 0 3px var(--crm-green-ring)" }} />{v.clock}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{ position: "relative" }}>
              <span {...press(v.toggleMenu)} style={{ height: "36px", minWidth: "200px", boxSizing: "border-box", padding: "0 10px 0 12px", borderRadius: "7px", border: "1px solid var(--crm-line)", display: "flex", alignItems: "center", gap: "8px", font: `500 13px ${INTER}`, whiteSpace: "nowrap", cursor: "pointer", background: "#fff" }}>
                {v.selDot && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.selDot }} />}
                <span>{v.selLabel}</span><span style={{ fontSize: "12px", fontWeight: 400, color: "var(--crm-faint)" }}>{v.selRole}</span>
                <Svg d="m6 9 6 6 6-6" size={14} w={2.2} style={{ marginLeft: "auto", color: "var(--crm-faint)" }} />
              </span>
              {v.menuOpen && (<>
                <div onClick={v.closeMenu} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
                <div style={{ position: "absolute", top: "42px", right: 0, zIndex: 21, width: "280px", maxHeight: "520px", overflow: "auto", boxSizing: "border-box", padding: "6px", borderRadius: "10px", background: "#fff", boxShadow: "0 14px 36px rgba(42,22,12,.18)" }}>
                  {v.menu.map(m => (
                    <div key={m.key} {...press(m.go)} className={s.soft} style={{ height: m.h, display: "flex", alignItems: "center", gap: "8px", padding: `0 10px 0 ${m.pl}`, borderRadius: "7px", cursor: "pointer", fontSize: "13px", fontWeight: m.w, background: m.bg, borderTop: `1px solid ${m.bt}` }}>
                      {m.dot && <span style={{ width: "7px", height: "7px", borderRadius: "50%", flex: "none", background: m.dot }} />}
                      <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.label}</span>
                      <span style={{ fontSize: "11.5px", fontWeight: 400, color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{m.role}</span>
                    </div>
                  ))}
                </div>
              </>)}
            </div>
            <div style={{ display: "flex", padding: "3px", borderRadius: "9px", background: "var(--crm-field)" }}>
              {v.periods.map(p => <span key={p.label} {...press(p.go)} style={{ height: "30px", padding: "0 12px", borderRadius: "7px", display: "flex", alignItems: "center", font: `500 12.5px ${INTER}`, whiteSpace: "nowrap", background: p.bg, color: p.fg, boxShadow: p.sh, cursor: "pointer" }}>{p.label}</span>)}
            </div>
          </div>
          {v.isCustom && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input type="date" value={v.cFrom} onChange={v.setFrom} style={DATE} /><span style={{ color: "var(--crm-faint)" }}>–</span><input type="date" value={v.cTo} onChange={v.setTo} style={DATE} />
            </div>
          )}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "0 36px 32px", display: "flex", flexDirection: "column", gap: "24px" }}>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", padding: "20px 0", borderRadius: "12px", background: "var(--crm-sum)" }}>
          {v.tiles.map(t => (
            <div key={t.k} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 20px", borderLeft: `1px solid ${t.bl}` }}>
              <span style={{ font: `500 12px ${INTER}`, color: "var(--crm-muted)" }}>{t.k}</span>
              <span style={{ font: `500 32px ${TIGHT}`, letterSpacing: "-0.03em", lineHeight: 1, color: t.c }}>{v.loading ? "—" : t.v}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: "none", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "grid", gridTemplateColumns: v.cols, columnGap: "12px", alignItems: "center", height: "38px", borderBottom: "1px solid var(--crm-rule)", position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
            {v.heads.map((c, i) => <span key={i} onClick={c.sort} style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: c.just, font: `500 11px ${INTER}`, letterSpacing: "0.06em", textTransform: "uppercase", color: c.fg, cursor: "pointer", whiteSpace: "nowrap" }}>{c.label}<span style={{ fontSize: "10px" }}>{c.arrow}</span></span>)}
          </div>
          {v.groups.map(g => (
            <div key={g.name} style={{ display: "flex", flexDirection: "column" }}>
              {g.rows.map(r => (
                <div key={r.id} style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-rule-2)" }}>
                  <div {...press(r.toggle)} aria-expanded={r.open} className={s.row} style={{ display: "grid", gridTemplateColumns: v.cols, columnGap: "12px", alignItems: "center", height: "48px", fontVariantNumeric: "tabular-nums", cursor: "pointer", background: r.bg }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, opacity: r.op }}>
                      <Svg d="m9 18 6-6-6-6" size={14} w={2.2} style={{ flex: "none", color: "var(--crm-faint)", transform: `rotate(${r.rot})`, transition: "transform .15s" }} />
                      <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: r.tdot }} />
                      <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                        <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameFg }}>{r.name}</span>
                        {r.off && <span style={{ fontSize: "11.5px", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{r.turn}</span>}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", fontWeight: 600 }}>{r.leads}</span>
                    <span style={{ textAlign: "right", color: r.avgFg }}>{r.avg}</span>
                    <span style={{ justifySelf: "end" }}>
                      {r.waitOn && <span style={{ color: r.waitFg, fontWeight: 600, whiteSpace: "nowrap" }}>{r.wait}</span>}
                      {r.waitOff && <span style={{ color: "var(--crm-disabled)" }}>—</span>}
                    </span>
                    <span style={{ textAlign: "right" }}>{r.appt}</span>
                    <span style={{ textAlign: "right" }}>{r.show}</span>
                  </div>
                  {r.open && (
                    <div style={{ display: "flex", flexDirection: "column", padding: "0 0 10px" }}>
                      {r.list.map(l => (
                        <div key={l.key} {...press(l.go)} className={s.row} style={{ display: "grid", gridTemplateColumns: v.cols, columnGap: "12px", alignItems: "center", height: "34px", fontSize: "12.5px", color: "var(--crm-list-sub)", fontVariantNumeric: "tabular-nums", cursor: "pointer", background: l.bg }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0, paddingLeft: "24px" }}>
                            <span style={{ flex: "none", width: "36px", font: `600 12px ${TIGHT}` }}>{l.got}</span>
                            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--crm-ink)" }}>{l.name}</span>
                          </span>
                          <span style={{ gridColumn: "span 1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: "12px", color: l.sFg }}>{l.status}</span>
                          <span style={{ textAlign: "right" }}>{l.repT}</span>
                          <span style={{ textAlign: "right", fontWeight: 600, whiteSpace: "nowrap", color: l.rc }}>{l.waitT}</span>
                          <span /><span />
                        </div>
                      ))}
                      {r.none && <div style={{ height: "42px", display: "flex", alignItems: "center", fontSize: "12.5px", color: "var(--crm-faint)" }}>No leads in this period</div>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {v.dOpen && v.d.open && (<>
        <div onClick={v.dClose} className={s.fadeIn} style={{ position: "fixed", top: "56px", right: 0, bottom: 0, left: `${left}px`, background: "rgba(42,22,12,.12)", zIndex: 30 }} />
        <div className={s.slideIn} style={{ position: "fixed", top: "56px", right: 0, bottom: 0, width: "400px", zIndex: 31, background: "#fff", boxShadow: "-16px 0 40px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", font: `400 14px ${INTER}`, color: "var(--crm-ink)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "22px 22px 18px", borderBottom: "1px solid var(--crm-rule)" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "4px", minWidth: 0 }}>
              <span style={{ font: `500 20px ${TIGHT}`, letterSpacing: "-0.02em" }}>{v.d.name}</span>
              <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.d.ad}</span>
            </div>
            <span {...press(v.dClose)} aria-label="Close" className={s.soft} style={{ width: "30px", height: "30px", borderRadius: "7px", display: "grid", placeItems: "center", color: "var(--crm-muted)", cursor: "pointer" }}><Svg d="M18 6 6 18M6 6l12 12" size={16} /></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", padding: "16px 22px", borderBottom: "1px solid var(--crm-rule)" }}>
            {v.d.facts.map(f => <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "4px" }}><span style={{ fontSize: "11.5px", color: "var(--crm-faint)" }}>{f.k}</span><span style={{ font: `500 16px ${TIGHT}`, color: f.c, whiteSpace: "nowrap" }}>{f.v}</span></div>)}
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "12px 22px" }}>
            {v.d.events.map(e => (
              <div key={e.key} style={{ display: "grid", gridTemplateColumns: "44px 12px minmax(0,1fr)", columnGap: "10px" }}>
                <span style={{ paddingTop: "10px", textAlign: "right", font: `600 12px ${TIGHT}`, color: "var(--crm-muted)" }}>{e.t}</span>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <span style={{ width: "1px", height: "14px", background: e.top }} /><span style={{ width: "9px", height: "9px", borderRadius: "50%", flex: "none", background: e.dot }} /><span style={{ flex: 1, width: "1px", background: e.bot }} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 0 14px", fontSize: "13px" }}>
                  <span style={{ fontWeight: 600, color: e.c }}>{e.title}</span>
                  {e.sub && <span style={{ fontSize: "12px", color: "var(--crm-faint)" }}>{e.sub}</span>}
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: "16px 22px", borderTop: "1px solid var(--crm-rule)" }}>
            <span {...press(v.d.openChat)} className={s.cta} style={{ height: "42px", borderRadius: "8px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", font: `500 14px ${INTER}`, cursor: "pointer" }}>Open chat</span>
          </div>
        </div>
      </>)}
    </div>
  );
}
