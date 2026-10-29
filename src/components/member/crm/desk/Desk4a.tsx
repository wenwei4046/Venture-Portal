"use client";
/**
 * The desktop CRM's 4a frame (2026-10-18, docs/design_handoff_crm_redesign — change list 9, frames 01–11): the Revenue
 * app's sidebar in ink (the CRM row filled rust), the CRM nav on cream, the 56 px top bar and each page's head. Drawn
 * by hand from the frames' markup, placed into the generated DeskApp by tools/crm-design/desk-4a.cjs, and bound to
 * vm/frame4a.ts — the same links, counts, menus and permissions the frame had before.
 */
import { DeskApptTypes } from "./DeskApptTypes";
import type { apptTypesVM } from "./vm/appt-types";
import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { boldRuns, wrapBold } from "../shared/bold-text";
import { Ic, type Icon4a } from "../shared/icons4a";
import { usePanelOpenOn } from "./panel-state";
import { DeskAdsChart, FoldHead, type AdsChartBits } from "./DeskAdsChart";
import { avatarTint, STATUS } from "../shared/palette";
import type { Frame4a } from "./vm/frame4a";
import { DeskAddCustomer, DeskProfileDrawer, type ProfileDrawerV } from "./DeskExtras";
import { WA_VERTICALS } from "@/lib/meta/channels";
import { REVENUE_APP_VIEWS } from "@/lib/view-switch";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box" };
// Every view, as the Revenue app's module menu lists them (2026-10-27 — the owner: the Principal's list in every app;
// lib/view-switch.ts).
const MODULE_ROWS: [string, string][] = REVENUE_APP_VIEWS.map(v => [v.value, v.short]);

interface SideBits {
  f4: Frame4a;
  showScope: boolean;
  scopeOpts: { label: string; on: boolean; pick: () => void }[];
  toggleSb: () => void;
  returnApp: () => void;
  meMenuOpen: boolean;
  toggleMeMenu: () => void;
  closeMeMenu: () => void;
  signOutMe: () => void;
}

/** The Revenue sidebar (216 px, ink) and the CRM nav (212 px, cream), side by side. */
export function Desk4aSide({ v }: { v: SideBits }) {
  const f = v.f4;
  const [mods, setMods] = useState(false);
  // The Revenue sidebar folds to its icons (68 px) while the CRM is open; pointing at it, tabbing into it or one of its menus
  // open shows it whole over the CRM (the owner, 2026-10-18: "点入crm 后，左手边自动收起"). frame.ts › sbW counts 68.
  const [hover, setHover] = useState(false), open = hover || mods || v.meMenuOpen;
  return (<>
    <aside data-rev-side="" data-open={open ? "" : undefined} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setHover(false); }}
      style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: open ? "240px" : "68px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px",
      padding: "22px 12px 18px", background: "var(--crm-ink)", zIndex: open ? 9 : 6, overflow: open ? "visible" : "hidden", whiteSpace: "nowrap",
      transition: "width 180ms ease, box-shadow 180ms ease", boxShadow: open ? "10px 0 28px rgba(20,10,4,.25)" : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: open ? "0 10px 20px" : "0 0 20px 5px" }}>
        <div style={{ flex: "none", width: "30px", height: "30px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 14px ${TIGHT}`, background: "var(--crm-orange)", color: "#fff" }}>H</div>
        <div style={{ font: `600 15px ${TIGHT}`, letterSpacing: "0.14em", color: "var(--crm-on-light)", visibility: open ? "visible" : "hidden" }}>HOUZS</div>
      </div>
      {f.revNav.map(n => <RevRow key={n.label} label={n.label} on={n.on} pick={n.pick} badge={n.badge} folded={!open}><Ic name={n.icon} size={17} /></RevRow>)}
      <RevRow label={f.notif.label} on={false} pick={f.notif.pick} badge={f.notif.count} folded={!open}><Ic name="bell" size={17} /></RevRow>
      {f.products && (<>
        <div style={{ padding: "16px 10px 6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)", visibility: open ? "visible" : "hidden" }}>{f.products.group}</div>
        <RevRow label="Product List" on={false} pick={f.products.onOpen} badge="" folded={!open}><Ic name="layout-grid" size={17} /></RevRow>
      </>)}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
        {f.modules && (<>
          {mods && (<>
            <div onClick={() => setMods(false)} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
            <div role="menu" aria-label="Switch module" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 8px)", zIndex: 8, padding: "6px", background: "#fff",
              borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ padding: "6px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>SWITCH MODULE</span>
              {MODULE_ROWS.map(([id, label]) => { const on = id === f.modules!.current;
                return <button key={id} type="button" role="menuitemradio" aria-checked={on} onClick={() => { setMods(false); if (!on) f.modules!.onPick(id); }}
                  style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 8px", borderRadius: "7px", font: "500 13px Inter, sans-serif",
                    color: "var(--crm-ink)", background: on ? "var(--crm-sel)" : "transparent" }}>
                  <span style={{ flex: 1 }}>{label}</span>{on && <Ic name="check" size={15} style={{ color: "var(--crm-rust)" }} />}</button>; })}
            </div>
          </>)}
          <button type="button" aria-label="Switch module" aria-expanded={mods} onClick={() => setMods(o => !o)} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px",
            height: "36px", padding: open ? "0 10px" : 0, justifyContent: open ? undefined : "center", borderRadius: "7px", font: "500 13px Inter, sans-serif", color: "var(--crm-sidebar-text)", border: "1px solid rgba(255,255,255,.12)" }}>
            <Ic name="layout-grid" size={15} />{open && <>Revenue<span style={{ marginLeft: "auto", display: "flex" }}><Ic name="chevron-down" size={13} /></span></>}
          </button>
        </>)}
        {v.meMenuOpen && (<>
          <div onClick={v.closeMeMenu} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 4px)", zIndex: 8, padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)" }}>
            <button type="button" onClick={v.signOutMe} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 8px", borderRadius: "7px",
              font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}><Ic name="x" size={15} />Sign out</button>
          </div>
        </>)}
        <button type="button" onClick={v.toggleMeMenu} title="Profile" style={{ ...BTN, display: "flex", alignItems: "center", justifyContent: open ? undefined : "center", gap: "10px", padding: open ? "12px 10px 0" : "12px 0 0", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <span style={{ width: "32px", height: "32px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", font: `500 12px ${TIGHT}`,
            background: "var(--crm-on-light)", color: "var(--crm-ink)" }}>{f.account.ini}</span>
          <span style={{ display: open ? "flex" : "none", flexDirection: "column", gap: "1px", minWidth: 0 }}>
            <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-on-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.account.name}</span>
            <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.account.sub}</span>
          </span>
        </button>
      </div>
    </aside>
    <aside data-crm-nav="" style={{ position: "absolute", left: "68px", top: 0, bottom: 0, width: "237px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "1px",
      padding: "24px 12px 18px", background: "var(--crm-cream-nav)", borderRight: "1px solid var(--crm-nav-line)", zIndex: 6, overflow: "auto" }}>
      <div style={{ display: "flex", alignItems: "center", padding: "0 10px 18px" }}>
        <span style={{ flex: 1, font: `500 22px ${TIGHT}`, letterSpacing: "-0.01em", color: "var(--crm-ink)" }}>CRM</span>
        <button type="button" onClick={v.toggleSb} title="Collapse sidebar" style={{ ...BTN, width: "26px", height: "26px", borderRadius: "6px", display: "grid", placeItems: "center", color: "var(--crm-faint)" }}>
          <Ic name="chevron-left" size={15} />
        </button>
      </div>
      {v.showScope && (
        <div style={{ display: "flex", margin: "0 0 10px", background: "var(--crm-field)", borderRadius: "7px", padding: "3px", gap: "2px" }}>
          {v.scopeOpts.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, flex: 1, height: "26px", borderRadius: "5px", textAlign: "center", font: "500 13px Inter, sans-serif",
            background: o.on ? "var(--crm-page)" : "transparent", color: o.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{o.label}</button>)}
        </div>
      )}
      {f.crmNav.map((g, gi) => (<div key={gi} style={{ display: "contents" }}>
        {g.head && <div style={{ padding: "20px 10px 6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>{g.head}</div>}
        {g.items.map(n => (
          <button key={n.label} type="button" onClick={n.pick} aria-current={n.on ? "page" : undefined} style={{ ...BTN, flex: "none", display: "flex", alignItems: "center", gap: "11px", height: "36px",
            padding: "0 10px", borderRadius: "7px", position: "relative", font: `${n.on ? 500 : 400} 14px Inter, sans-serif`, background: n.on ? "var(--crm-nav-active)" : "transparent",
            color: n.on ? "var(--crm-ink)" : "var(--crm-ink-soft)" }} className="crm4a-nav">
            <span style={{ position: "absolute", left: "-12px", top: "9px", bottom: "9px", width: "2px", background: n.on ? "var(--crm-orange)" : "transparent" }} />
            <Ic name={n.icon} size={16} /><span>{n.label}</span>
            {n.badge && <span style={{ marginLeft: "auto", minWidth: "20px", height: "18px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center",
              justifyContent: "center", font: `600 10px ${TIGHT}`, background: "var(--crm-rust)", color: "#fff" }}>{n.badge}</span>}
          </button>
        ))}
      </div>))}
      <button type="button" onClick={v.returnApp} style={{ ...BTN, marginTop: "auto", flex: "none", display: "flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 10px",
        font: "400 13px Inter, sans-serif", color: "var(--crm-ink-soft)" }}><Ic name="chevron-left" size={15} />Back to Revenue app</button>
    </aside>
  </>);
}

function RevRow({ label, on, pick, badge, folded, children }: { label: string; on: boolean; pick: () => void; badge: string; folded?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={pick} aria-current={on ? "page" : undefined} aria-label={folded ? label : undefined} title={folded ? label : undefined}
      style={{ ...BTN, flex: "none", position: "relative", display: "flex", alignItems: "center", justifyContent: folded ? "center" : undefined, gap: "12px", height: "38px", padding: folded ? 0 : "0 10px",
      borderRadius: "7px", font: "500 14px Inter, sans-serif", background: on ? "var(--crm-rust)" : "transparent", color: on ? "#fff" : "var(--crm-sidebar-text)" }}>
      {children}{!folded && <span>{label}</span>}
      {badge && !folded && <span style={{ marginLeft: "auto", minWidth: "20px", height: "18px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center",
        justifyContent: "center", font: `600 10px ${TIGHT}`, background: on ? "rgba(255,255,255,.22)" : "var(--crm-rust)", color: "#fff" }}>{badge}</span>}
      {/* Folded, a count is a dot on the icon. */}
      {badge && folded && <span style={{ position: "absolute", top: "7px", right: "10px", width: "8px", height: "8px", borderRadius: "50%", background: on ? "#fff" : "var(--crm-orange)", boxShadow: "0 0 0 2px var(--crm-ink)" }} />}
    </button>
  );
}

/** The 56 px top bar: the greeting, the sub-department's view switch, the date. */
export function Desk4aTop({ f4, left }: { f4: Frame4a; left: number }) {
  return (
    <header style={{ position: "absolute", left: `${left}px`, right: 0, top: 0, height: "56px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "18px", padding: "0 36px",
      borderBottom: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
      <div style={{ font: "400 14px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{f4.greet}, <span style={{ fontWeight: 500, color: "var(--crm-ink)" }}>{f4.first}</span></div>
      {f4.subName && (
        <button type="button" onClick={f4.openSubDept} aria-label="Switch sub-department" style={{ ...BTN, marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px",
          font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
          {f4.subName} view
          <span style={{ width: "30px", height: "18px", borderRadius: "9px", position: "relative", boxSizing: "border-box", border: "1px solid var(--crm-faint-2)" }}>
            <span style={{ position: "absolute", left: "2px", top: "2px", width: "12px", height: "12px", borderRadius: "50%", background: "var(--crm-faint)" }} />
          </span>
        </button>
      )}
      <div style={{ width: "1px", height: "18px", background: "var(--crm-rule)", marginLeft: f4.subName ? 0 : "auto" }} />
      <div style={{ font: "400 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{f4.date}</div>
    </header>
  );
}

/** A page's head: its title, underline tabs, a muted line, CRM alerts and the page's one primary button. */
export function Desk4aHead({ f4, extra }: { f4: Frame4a; extra?: ReactNode }) {
  const h = f4.head;
  return (<>
    {f4.addCust && <DeskAddCustomer v={f4.addCust} />}
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "22px", padding: "26px 36px 22px", minWidth: 0 }}>
      <div style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.025em", whiteSpace: "nowrap", color: "var(--crm-ink)" }}>{h.title}</div>
      {h.tabs.length > 0 && (
        <div style={{ display: "flex", gap: "22px", font: "500 13px Inter, sans-serif" }}>
          {h.tabs.map(t => <button key={t.label} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, padding: "6px 0", whiteSpace: "nowrap", font: "inherit",
            borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}`, color: t.on ? "var(--crm-ink)" : "var(--crm-faint)" }}>{t.label}</button>)}
        </div>
      )}
      {h.sub && <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{h.sub}</div>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px", flex: "none" }}>
        {extra}
        {/* v2 (2026-10-23, the owner: "全部根据新设计"; supersedes 2026-10-18's bell alone): CRM alerts is the outline button
            with the bell, its words, and an orange dot + oxblood count when some are unread. */}
        {/* The owner, 2026-10-23 (testing v2): "改成小铃铛即可" — the bell alone in a 36 px outline square, the unread count on its corner. */}
        <button type="button" onClick={f4.openAlerts} aria-label="CRM alerts" title="CRM alerts" style={{ ...BTN, position: "relative", width: "36px", height: "36px", borderRadius: "7px", display: "grid", placeItems: "center",
          boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">
          <Ic name="bell" size={16} />
          {f4.alertsN && <span style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "grid", placeItems: "center",
            background: "var(--crm-rust)", color: "#fff", font: "600 10px Inter, sans-serif", fontVariantNumeric: "tabular-nums", boxShadow: "0 0 0 2px #fff" }}>{f4.alertsN}</span>}
        </button>
        {h.cta && (
          <span style={{ position: "relative" }}>
            <button type="button" onClick={h.cta.act} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
              font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">
              {h.cta.icon && <Ic name={h.cta.icon} size={15} />}{h.cta.label}
            </button>
            {h.cta.menu?.open && (<>
              <div onClick={h.cta.menu.close} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "42px", right: 0, zIndex: 8, minWidth: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                {h.cta.menu.items.map(o => (
                  <button key={o.tag} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", borderRadius: "7px", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-row">
                    <span style={{ minWidth: "30px", height: "18px", padding: "0 5px", borderRadius: "4px", background: o.bg, color: o.fg, font: "600 10px Inter, sans-serif", display: "grid", placeItems: "center" }}>{o.tag}</span>{o.label}</button>
                ))}
              </div>
            </>)}
            {f4.bookPick.open && h.cta.label === "Book a visit" && (<>
              <div onClick={f4.bookPick.close} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "42px", right: 0, zIndex: 8, width: "300px", maxHeight: "420px", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", overflow: "hidden" }}>
                <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--crm-rule-soft)", display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>Book a visit for</div>
                  <label style={{ height: "34px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
                    <Ic name="search" size={14} />
                    <input autoFocus value={f4.bookPick.q} onChange={f4.bookPick.setQ} placeholder="Search a customer" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", padding: 0 }} />
                  </label>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "6px" }}>
                  {f4.bookPick.rows.map(r => (
                    <button key={r.id} type="button" onClick={r.pick} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "6px 8px", borderRadius: "7px", color: "var(--crm-ink)" }} className="crm4a-row">
                      <span style={{ width: "28px", height: "28px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 10px ${TIGHT}`, background: avatarTint(r.name)[0], color: avatarTint(r.name)[1] }}>{r.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
                      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                        <span style={{ font: "500 13px Inter, sans-serif" }}>{r.name}</span>
                        <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                      </span>
                    </button>
                  ))}
                  {!f4.bookPick.rows.length && <div style={{ padding: "16px", textAlign: "center", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>No customer found</div>}
                </div>
              </div>
            </>)}
          </span>
        )}
      </div>
    </div>
    {/* v2 frames 01 / 01b: a second row of tabs under the title (Insight's Team performance | Ads performance). */}
    {h.subTabs && h.subTabs.length > 0 && (
      <div style={{ flex: "none", display: "flex", gap: "26px", padding: "0 36px", marginTop: "-10px", borderBottom: "1px solid var(--crm-rule)", font: "500 13px Inter, sans-serif" }}>
        {h.subTabs.map(t => <button key={t.label} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, padding: "8px 0 10px", whiteSpace: "nowrap", font: "inherit", marginBottom: "-1px",
          borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}`, color: t.on ? "var(--crm-ink)" : "var(--crm-faint)" }}>{t.label}</button>)}
      </div>
    )}
  </>);
}

interface InsightBits {
  metrics4: { label: string; value: string; unit: string; d: string; deltaColor: string; first: boolean; open: () => void }[];
  teams4: { name: string; sub: string; leads: string; appt: string; apptW: string; show: string; won: string; lost: string; dot: string; person: boolean; open: boolean; pick: () => void }[];
  status4: { label: string; n: number; color: string; text: string; pct: string; open: () => void }[];
  statusTotal: number;
  /** All · The Conts · DC over the page (2026-10-29). */
  src4?: { label: string; on: boolean; pick: () => void }[];
}
const T_COLS = "minmax(0,2.2fr) minmax(0,0.7fr) minmax(0,1.5fr) repeat(3,minmax(0,0.8fr))";

/** Frame 01 · Insight: the cream hero of six figures, Team performance (a team opens to its people) and Leads by status. */
export function DeskInsight4a({ v }: { v: InsightBits }) {
  return (<>
    {v.src4 && (
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Brand</span>
        <div role="group" aria-label="Brand" style={{ height: "32px", padding: "3px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", display: "flex", gap: "2px", font: "500 12px Inter, sans-serif" }}>
          {v.src4.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={{ ...BTN, padding: "0 12px", borderRadius: "6px", font: "inherit", whiteSpace: "nowrap",
            background: o.on ? "#fff" : "transparent", boxShadow: o.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: o.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{o.label}</button>)}
        </div>
      </div>
    )}
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", padding: "26px 0", borderRadius: "12px", background: "var(--crm-sum)", border: "1px solid var(--crm-sum-line)" }}>
      {v.metrics4.map(m => (
        <button key={m.label} type="button" onClick={m.open} style={{ ...BTN, display: "flex", flexDirection: "column", gap: "10px", padding: "0 18px", minWidth: 0,
          borderLeft: `1px solid ${m.first ? "transparent" : "var(--crm-hero-line)"}` }} className="crm4a-metric">
          <span style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <span style={{ width: "20px", height: "2px", background: m.first ? "var(--crm-orange)" : "transparent" }} />
            <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{m.label}</span>
          </span>
          <span style={{ font: `500 42px ${TIGHT}`, letterSpacing: "-0.035em", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: m.first ? "var(--crm-rust)" : "var(--crm-ink)" }}>
            {m.value}{m.unit && <span style={{ fontSize: "0.42em", letterSpacing: 0, marginLeft: "3px", fontWeight: 400 }}>{m.unit}</span>}
          </span>
          <span style={{ font: "500 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: m.deltaColor, whiteSpace: "nowrap" }}>{m.d} <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}>vs last</span></span>
        </button>
      ))}
    </div>
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: "minmax(0,1.9fr) minmax(0,1fr)", gap: "40px" }}>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", paddingBottom: "12px" }}>
          <div style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Team performance</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: T_COLS, padding: "8px 0", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)", borderBottom: "1px solid var(--crm-rule)" }}>
          <div>Team</div><div style={{ textAlign: "right" }}>Leads</div><div style={{ paddingLeft: "24px" }}>Appt rate</div><div style={{ textAlign: "right" }}>Show-up</div><div style={{ textAlign: "right" }}>Won</div><div style={{ textAlign: "right" }}>Lost</div>
        </div>
        {v.teams4.map((r, i) => (
          <button key={i} type="button" onClick={r.pick} aria-expanded={r.person ? undefined : r.open} style={{ ...BTN, width: "100%", display: "grid", gridTemplateColumns: T_COLS, alignItems: "center", height: "46px",
            font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", borderBottom: "1px solid var(--crm-rule-soft)", background: r.person ? "var(--crm-hover)" : "transparent" }} className="crm4a-row">
            <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, paddingLeft: r.person ? "18px" : 0 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: r.dot }} />
              <span style={{ fontWeight: r.person ? 400 : 500, whiteSpace: "nowrap", color: r.person ? "var(--crm-ink-soft)" : "var(--crm-ink)" }}>{r.name}</span>
              {/* v2 frame 01 draws the team's lead after its name again ("TL Priya Menon"; supersedes 2026-10-18's none). */}
              {r.sub && <span style={{ fontSize: "12px", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>}
            </span>
            <span style={{ textAlign: "right", fontWeight: 500 }}>{r.leads}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "24px" }}>
              <span style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--crm-track)", position: "relative", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: r.apptW, background: "var(--crm-rust)" }} />
              </span>
              <span style={{ width: "34px", textAlign: "right" }}>{r.appt}</span>
            </span>
            <span style={{ textAlign: "right" }}>{r.show}</span><span style={{ textAlign: "right" }}>{r.won}</span><span style={{ textAlign: "right", color: "var(--crm-muted)" }}>{r.lost}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <div style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Leads by status</div>
          <div style={{ marginLeft: "auto", font: `500 22px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{v.statusTotal.toLocaleString("en-MY")}</div>
        </div>
        <div style={{ display: "flex", height: "8px", gap: "2px" }}>
          {v.status4.filter(s => s.n).map(s => <div key={s.label} style={{ flex: s.n, background: s.color }} />)}
          {!v.statusTotal && <div style={{ flex: 1, background: "var(--crm-rule-soft)" }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {v.status4.map(s => (
            <button key={s.label} type="button" onClick={s.open} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "42px", font: "400 14px Inter, sans-serif",
              borderBottom: "1px solid var(--crm-rule-soft)", color: "var(--crm-ink)" }} className="crm4a-row">
              <span style={{ width: "8px", height: "8px", background: s.color }} /><span style={{ color: s.text }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", fontWeight: 500 }}>{s.n}</span>
              <span style={{ width: "40px", textAlign: "right", fontSize: "12px", fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{s.pct}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  </>);
}

interface WhoOpt { head?: boolean; sel?: boolean; label: string; n?: number; color?: string; isGroup?: boolean; isPerson?: boolean; avBg?: string; avFg?: string; ini?: string; pick?: () => void }
interface InboxListBits {
  whoLabel: string; whoOpen: boolean; toggleWho: () => void; whoClear: () => void; whoOpts: WhoOpt[];
  list4: {
    q: string; setQ: (e: { target: { value: string } }) => void;
    tabs: { label: string; count: number; on: boolean; hot: boolean; pick: () => void }[];
    rows: { id: string; name: string; ini: string; avBg: string; avFg: string; ch: "whatsapp" | "messenger"; ad: string; msg: string; time: string; unread: string; dot: boolean; hot: boolean;
      owner: string; pinned: boolean; muted: boolean; sel: boolean; note: string; noteColor: string; noteWeight: number; open: () => void }[];
  };
}

/** Frame 02 · the Inbox's list (290 px): Everyone ▾, Search, the eight status tabs, the chats. */
export function DeskInboxList4a({ v }: { v: InboxListBits }) {
  const L = v.list4;
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px", padding: "16px 18px 12px" }}>
        <div style={{ display: "flex", gap: "8px" }}>
          <span style={{ position: "relative", flex: "none" }}>
            <button type="button" onClick={v.toggleWho} aria-expanded={v.whoOpen} style={{ ...BTN, height: "36px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "6px",
              font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)", whiteSpace: "nowrap", maxWidth: "150px" }} className="crm4a-outline">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{v.whoLabel}</span><Ic name="chevron-down" size={13} />
            </button>
            {v.whoOpen && (<>
              <div onClick={v.toggleWho} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "42px", left: 0, zIndex: 8, width: "260px", maxHeight: "440px", overflow: "auto", padding: "6px", background: "#fff", borderRadius: "10px",
                boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ padding: "6px 8px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>SHOW THE INBOX OF</span>
                {v.whoOpts.map((w, i) => w.head
                  ? <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }} />{w.label}</div>
                  : <button key={i} type="button" onClick={w.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", padding: "4px 8px", borderRadius: "7px",
                      font: `${w.sel ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: w.sel ? "var(--crm-sel)" : "transparent" }} className="crm4a-row">
                      {w.isGroup ? <span style={{ width: "24px", display: "grid", placeItems: "center" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: w.color }} /></span>
                        : <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 10px ${TIGHT}`, background: w.avBg, color: w.avFg }}>{w.ini}</span>}
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.label}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>{w.n ?? ""}</span>
                      <span style={{ width: "16px", display: "flex", color: "var(--crm-rust)" }}>{w.sel && <Ic name="check" size={14} />}</span>
                    </button>)}
                <div style={{ position: "sticky", bottom: "-6px", display: "flex", gap: "8px", margin: "6px -6px -6px", padding: "8px", background: "#fff", borderTop: "1px solid var(--crm-rule-soft)" }}>
                  <button type="button" onClick={v.whoClear} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Clear</button>
                  <button type="button" onClick={v.toggleWho} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">Done</button>
                </div>
              </div>
            </>)}
          </span>
          <label style={{ flex: 1, minWidth: 0, height: "36px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", font: "400 13px Inter, sans-serif",
            background: "var(--crm-field)", color: "var(--crm-faint)", boxSizing: "border-box" }}>
            <Ic name="search" size={14} />
            <input value={L.q} onChange={L.setQ} placeholder="Search" aria-label="Search chats" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "inherit", color: "var(--crm-ink)", padding: 0 }} />
          </label>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: "14px", rowGap: "6px" }}>
          {L.tabs.map(t => (
            <button key={t.label} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, display: "flex", alignItems: "baseline", gap: "5px", padding: "3px 0", font: `${t.on ? 600 : 400} 12px Inter, sans-serif`,
              borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}`, color: t.on ? "var(--crm-ink)" : "var(--crm-ink-soft)" }}>
              {t.label}<span style={{ fontVariantNumeric: "tabular-nums", color: t.hot && t.count ? "var(--crm-oxblood)" : "var(--crm-faint)" }}>{t.count}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }} data-inbox-list="">
        {L.rows.map(r => (
          <button key={r.id} type="button" onClick={r.open} aria-current={r.sel ? "true" : undefined} style={{ ...BTN, width: "100%", display: "flex", gap: "12px", padding: "14px 18px", position: "relative",
            borderTop: "1px solid var(--crm-rule-soft)", background: r.sel ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className={r.sel ? undefined : "crm4a-row"}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: r.sel ? "var(--crm-rust)" : "transparent" }} />
            <span style={{ width: "40px", height: "40px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: `500 13px ${TIGHT}`, background: r.avBg, color: r.avFg }}>{r.ini}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ font: `${r.hot ? 600 : 500} 14px Inter, sans-serif`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px", font: "400 11px Inter, sans-serif", whiteSpace: "nowrap", color: r.hot ? "var(--crm-rust)" : "var(--crm-faint)" }}>
                  {r.muted && <Ic name="bell" size={11} style={{ opacity: 0.6 }} />}{r.pinned && <Ic name="pin" size={11} />}{r.time}
                </span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "5px", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden" }}>
                <span style={{ display: "flex", color: r.ch === "whatsapp" ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.ch === "whatsapp" ? "phone" : "message-circle"} size={12} /></span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{r.ad}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ flex: 1, minWidth: 0, font: "400 13px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.msg}</span>
                {r.unread && <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center",
                  font: `600 10px ${TIGHT}`, background: "var(--crm-rust)", color: "#fff" }}>{r.unread}</span>}
                {r.dot && <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--crm-rust)" }} />}
              </span>
              {(r.note || r.owner) && (
                <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                  {r.note && <span style={{ font: `${r.noteWeight} 11px Inter, sans-serif`, color: r.noteColor, whiteSpace: "nowrap" }}>{r.note}</span>}
                  <span style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.owner}</span>
                </span>
              )}
            </span>
          </button>
        ))}
        {!L.rows.length && <div style={{ padding: "40px 18px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No chats here</div>}
      </div>
    </div>
  );
}

interface InboxSideBits {
  ibHas: boolean; ibNone: boolean; ibInfoShut: boolean; ibInfoFold: () => void; ibInfoRail: { open: () => void }; ibInfoW: number;
  dragInfo: (e: never) => void; resetInfo: () => void;
  ibInfo: { groups: { label: string; rows: { k: string; v: string; href: string | null; c: string }[] }[] };
  ibCpOpen: boolean; ibCpToggle: () => void; ibCpW?: number; dragCp?: (e: never) => void; resetCp?: () => void;
  ibCp: { audit4: { what: string; detail: string; who: string; time: string; main: boolean; hot: boolean }[] };
  ibBook: () => void; editInfo: () => void;
}

function Strip({ label, icon, bg, onOpen }: { label: string; icon: "user-round" | "history"; bg: string; onOpen: () => void }) {
  return (
    // v2 (note 04): every folded rail is the one style — the cream nav, whatever its panel's colour (bg kept for the call sites).
    <button type="button" onClick={onOpen} title={`Open ${label}`} data-bg={bg} style={{ ...BTN, width: "44px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingTop: "20px",
      borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-cream-nav)" }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name={icon} size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>{label}</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
}

/** Frames 02 / 02b / 02c · Customer info (white) and this chat's Audit log, each folding to a 44 px strip. */
export function DeskInboxSide4a({ v, value }: { v: InboxSideBits; value: (v: string, href: string | null) => ReactNode }) {
  return (<>
    {v.ibInfoShut ? <Strip label="Customer info" icon="user-round" bg="var(--crm-page)" onOpen={v.ibInfoRail.open} /> : (
      <aside style={{ position: "relative", width: `${v.ibInfoW}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
        <div onPointerDown={v.dragInfo as never} onDoubleClick={v.resetInfo} title="Drag to resize · double-click to reset" style={{ position: "absolute", left: "-5px", top: 0, bottom: 0, width: "9px", zIndex: 6, cursor: "col-resize", touchAction: "none" }} />
        <button type="button" onClick={v.ibInfoFold} title="Fold Customer info" style={{ ...BTN, height: "62px", flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px",
          font: `500 16px ${TIGHT}`, borderBottom: "1px solid var(--crm-rule)", color: "var(--crm-ink)" }}>
          <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="user-round" size={15} /></span>Customer info
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {v.ibNone && <span style={{ padding: "40px 20px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a chat to see the customer</span>}
          {v.ibHas && (<>
            {v.ibInfo.groups.map(g => (
              <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
                <div style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{g.label}</div>
                {g.rows.map(r => (
                  <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: "12px", font: "400 13px Inter, sans-serif" }}>
                    <span style={{ color: "var(--crm-muted)", flex: "none" }}>{r.k}</span>
                    <span style={{ textAlign: "right", fontWeight: 500, color: r.c, overflowWrap: "anywhere", minWidth: 0 }}>{value(r.v, r.href)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: "8px" }}>
              <button type="button" onClick={v.ibBook} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">Book a visit</button>
              <button type="button" onClick={v.editInfo} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Edit customer info</button>
            </div>
          </>)}
        </div>
      </aside>
    )}
    {!v.ibCpOpen ? <Strip label="Audit log" icon="history" bg="var(--crm-audit)" onOpen={v.ibCpToggle} /> : (
      // v2 (frame 02b, note 06): --crm-hover under a --crm-sel head, --crm-sum-div lines, dragged at its left edge (240–520 px).
      <aside style={{ position: "relative", width: `${v.ibCpW ?? 290}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-sum-div)", background: "var(--crm-hover)" }}>
        {v.dragCp && <span onPointerDown={v.dragCp as never} onDoubleClick={v.resetCp} title="Drag to resize" style={{ position: "absolute", top: 0, bottom: 0, left: "-5px", width: "10px", zIndex: 2, cursor: "col-resize", display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none" }}>
          <span style={{ width: "3px", height: "36px", borderRadius: "2px", background: "var(--crm-audit-line)" }} /></span>}
        <button type="button" onClick={v.ibCpToggle} title="Fold the Audit log" style={{ ...BTN, height: "62px", flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", borderBottom: "1px solid var(--crm-sum-div)", background: "var(--crm-sum)", color: "var(--crm-ink)" }}>
          <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="history" size={15} /></span>
          <span style={{ font: `500 16px ${TIGHT}` }}>Audit log</span><span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>this chat</span>
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", padding: "16px 20px" }}>
          {v.ibNone && <span style={{ padding: "24px 0", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a chat to see its history</span>}
          {v.ibHas && v.ibCp.audit4.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: "12px" }}>
              <div style={{ width: "10px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: "9px", height: "9px", marginTop: "4px", borderRadius: "50%", boxSizing: "border-box", background: a.hot ? "var(--crm-orange)" : a.main ? "var(--crm-rust)" : "#fff",
                  border: `2px solid ${a.hot ? "var(--crm-orange)" : a.main ? "var(--crm-rust)" : "var(--crm-faint)"}` }} />
                {i < v.ibCp.audit4.length - 1 && <span style={{ flex: 1, width: "1px", background: "var(--crm-audit-line)" }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "3px", paddingBottom: "16px" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <div style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{a.what}</div>
                  <div style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{a.time}</div>
                </div>
                <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>{a.detail}</div>
                <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)" }}>{a.who}</div>
              </div>
            </div>
          ))}
        </div>
      </aside>
    )}
  </>);
}

interface PpSel { label: string; value: string; open: boolean; toggle: () => void; close: () => void; opts: { v: string; n: number; on: boolean; pick: () => void }[] }
interface PpCell { pill: boolean; plain: boolean; v: string; bg: string; fg: string; dot?: string }
interface ContactsBits {
  ppQ: string; setPpQ: (e: { target: { value: string } }) => void;
  ppSelGroups: { label: string; sels: PpSel[] }[];
  ppChips: { label: string; clear: () => void }[]; ppHasChips: boolean; ppClear: () => void;
  ppGrid: string; ppKeys: string[]; ppMinW: number; ppDragC: (e: never) => void; ppReset: () => void;
  ppSortCols0: { arrow: string; fg: string; pick: () => void }[];
  ppHead: { label: string; arrow: string; fg: string; pick: () => void; remove: () => void; drag: (e: never) => void }[];
  ppAddOpen: boolean; ppAddToggle: () => void; ppAddClose: () => void; ppAddOpts: { label: string; grp: string; chk: string; toggle: () => void }[];
  ppRows: { ini: string; name: string; phone: string; avBg: string; avFg: string; cells: PpCell[]; on: boolean; open: () => void }[];
  ppHas: boolean; ppEmpty: boolean; ppPagerOn: boolean;
}
const MAIN_FILTERS = ["Status", "Ad", "Team", "Showroom"];

/**
 * A filter's menu (v2 frame 03b, note 01): 280 px (240 at least), a 1 px line and the popover shadow, 8 px inside; the Ad
 * menu alone opens on a search field; each option is tick · label · count on one grid, the label clamped to two lines
 * (its full name in the tooltip) so long ad names never run into each other; the list scrolls past 300 px.
 */
function FilterMenu({ f }: { f: PpSel }) {
  const [q, setQ] = useState("");
  const searchable = f.label === "Ad";
  const opts = q ? f.opts.filter(o => o.v.toLowerCase().includes(q.trim().toLowerCase())) : f.opts;
  return (<>
    <div onClick={f.close} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
    <div style={{ position: "absolute", top: "42px", left: 0, zIndex: 8, width: "280px", minWidth: "240px", maxWidth: "calc(100vw - 32px)", boxSizing: "border-box", padding: "8px", background: "#fff",
      border: "1px solid var(--crm-line)", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "6px" }}>
      {searchable && (
        <label style={{ height: "34px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", background: "var(--crm-field)", color: "var(--crm-faint)", font: "400 13px Inter, sans-serif" }}>
          <Ic name="search" size={13} />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search ads" aria-label="Search ads" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "inherit", color: "var(--crm-ink)", padding: 0 }} />
        </label>
      )}
      <div style={{ maxHeight: "300px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px" }}>
        {opts.map(o => (
          <button key={o.v} type="button" onClick={o.pick} title={o.v} style={{ ...BTN, display: "grid", gridTemplateColumns: "16px minmax(0,1fr) auto", alignItems: "start", columnGap: "10px", padding: "8px 10px", borderRadius: "7px",
            background: o.on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className={o.on ? undefined : "crm4a-row"}>
            <span style={{ width: "14px", height: "14px", marginTop: "2px", display: "flex", color: "var(--crm-rust)" }}>{o.on && <Ic name="check" size={14} />}</span>
            <span style={{ font: `${o.on ? 600 : 400} 13px/1.4 Inter, sans-serif`, color: "var(--crm-ink)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", overflowWrap: "anywhere" }}>{o.v}</span>
            <span style={{ font: `500 12px/1.4 ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{o.n}</span>
          </button>
        ))}
        {!opts.length && <div style={{ padding: "8px 10px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No ad matches</div>}
      </div>
    </div>
  </>);
}

function FilterButton({ f, label }: { f: PpSel; label?: string }) {
  const on = f.value !== "Any";
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={f.toggle} aria-expanded={f.open} style={{ ...BTN, height: "36px", padding: "0 12px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
        font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, background: on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className={on ? undefined : "crm4a-outline"}>
        {label ?? f.label}{on && <span style={{ color: "var(--crm-rust)" }}>{f.value}</span>}<Ic name="chevron-down" size={13} />
      </button>
      {f.open && <FilterMenu f={f} />}
    </span>
  );
}

/** Frame 03 · Contacts: search and filters, the table (cream head on an ink rule, + for more columns), its pager. */
export function DeskContacts4a({ v, pager }: { v: ContactsBits; pager: ReactNode }) {
  const [more, setMore] = useState(false);
  const all = v.ppSelGroups.flatMap(g => g.sels.map(s => ({ ...s, group: g.label })));
  const main = MAIN_FILTERS.map(l => all.find(s => s.label === l)).filter((s): s is (typeof all)[number] => !!s);
  const rest = all.filter(s => !main.includes(s));
  const moreOn = rest.filter(s => s.value !== "Any").length;
  // The owner, 2026-10-18: the list sits in a box of its own — its rows scroll inside it under the table head.
  const barRef = useRef<HTMLDivElement>(null);
  return (
    <div style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div ref={barRef} style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "16px 0 12px" }}>
        <label style={{ width: "210px", height: "36px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", font: "400 13px Inter, sans-serif", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
          <Ic name="search" size={14} />
          <input value={v.ppQ} onChange={v.setPpQ} placeholder="Search name or phone" aria-label="Search contacts" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", background: "transparent", font: "inherit", color: "var(--crm-ink)", padding: 0 }} />
        </label>
        {main.map(f => <FilterButton key={f.label} f={f} label={f.label === "Salesperson" ? "Assigned to" : undefined} />)}
        {rest.length > 0 && (
          <span style={{ position: "relative" }}>
            <button type="button" onClick={() => setMore(o => !o)} aria-expanded={more} title="More filters" aria-label="More filters" style={{ ...BTN, height: "36px", padding: "0 11px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
              font: "500 13px Inter, sans-serif", border: `1px solid ${moreOn ? "var(--crm-rust)" : "var(--crm-line)"}`, color: "var(--crm-ink)" }} className="crm4a-outline">
              <Ic name="sliders-horizontal" size={14} />{moreOn > 0 && <span style={{ color: "var(--crm-rust)" }}>{moreOn}</span>}
            </button>
            {more && (<>
              <div onClick={() => setMore(false)} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "42px", left: 0, zIndex: 8, width: "340px", maxHeight: "420px", overflow: "auto", padding: "10px 12px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "12px" }}>
                {rest.map(f => (
                  <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{f.group} · {f.label}</span>
                    <span style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {f.opts.map(o => <button key={o.v} type="button" onClick={o.pick} style={{ ...BTN, height: "28px", padding: "0 10px", borderRadius: "14px", font: "500 12px Inter, sans-serif",
                        background: o.on ? "var(--crm-rust)" : "var(--crm-field)", color: o.on ? "#fff" : "var(--crm-ink-soft)" }}>{o.v}<span style={{ marginLeft: "5px", opacity: 0.7 }}>{o.n}</span></button>)}
                    </span>
                  </div>
                ))}
              </div>
            </>)}
          </span>
        )}
      </div>
      {v.ppHasChips && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", margin: "12px 0 14px" }}>
          {v.ppChips.map(c => <button key={c.label} type="button" onClick={c.clear} style={{ ...BTN, height: "26px", padding: "0 10px", borderRadius: "13px", display: "flex", alignItems: "center", gap: "6px",
            font: "500 12px Inter, sans-serif", background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{c.label}<Ic name="x" size={11} /></button>)}
          <button type="button" onClick={v.ppClear} style={{ ...BTN, padding: "0 4px", font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Clear all</button>
        </div>
      )}
      {v.ppHas && (
        // v2 (frame 03): no box round the table — the header sits on an ink rule; the rows scroll under it, sideways too when
        // the columns no longer fit (Name sticky, notes 05 / 06).
        <div style={{ flex: "1 1 auto", minHeight: "240px", display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ minWidth: `${v.ppMinW}px`, display: "flex", flexDirection: "column" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 4, display: "grid", gridTemplateColumns: v.ppGrid, gap: "8px", alignItems: "center", padding: "9px 12px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-ink)", borderBottom: "1px solid var(--crm-nav-line)",
            font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
            <span style={{ position: "sticky", left: 0, zIndex: 1, background: "var(--crm-cream-nav)", whiteSpace: "nowrap" }}>
              {v.ppSortCols0.map((c, i) => <button key={i} type="button" onClick={c.pick} title="Sort" style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", display: "inline-flex", gap: "4px" }}>Name <span>{c.arrow === "↕" ? "" : c.arrow}</span></button>)}
              <span onPointerDown={v.ppDragC as never} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" className="crm4a-colgrip crm4a-colgrip-seen" style={{ position: "absolute", top: "-6px", bottom: "-6px", right: "-9px", width: "10px", cursor: "col-resize", touchAction: "none", zIndex: 2 }} />
            </span>
            {v.ppHead.map(h => (
              // A header wraps onto a second line as the frame's does ("ASSIGNED / TO") rather than lose its words.
              <span key={h.label} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "4px", minWidth: 0 }} className="crm4a-th">
                <button type="button" onClick={h.pick} title="Sort" style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", lineHeight: 1.25, minWidth: 0, overflowWrap: "anywhere" }}>{h.label}{h.arrow !== "↕" ? ` ${h.arrow}` : ""}</button>
                <button type="button" onClick={h.remove} title="Hide column" style={{ ...BTN, position: "absolute", right: "0", top: "50%", transform: "translateY(-50%)", padding: "2px", borderRadius: "4px", background: "var(--crm-cream-nav)", display: "flex", color: "var(--crm-faint)" }} className="crm4a-th-x"><Ic name="x" size={10} /></button>
                <span onPointerDown={h.drag as never} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" className="crm4a-colgrip crm4a-colgrip-seen" style={{ position: "absolute", top: "-6px", bottom: "-6px", right: "-9px", width: "10px", cursor: "col-resize", touchAction: "none", zIndex: 2 }} />
              </span>
            ))}
            <span style={{ position: "relative", display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={v.ppAddToggle} title="Add columns" style={{ ...BTN, width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", border: "1px dashed var(--crm-rust)", color: "var(--crm-rust)" }}>
                <Ic name="plus" size={13} />
              </button>
              {v.ppAddOpen && (<>
                <div onClick={v.ppAddClose} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
                <div style={{ position: "absolute", top: "32px", right: 0, zIndex: 8, width: "240px", maxHeight: "420px", overflow: "auto", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", textTransform: "none", letterSpacing: 0 }}>
                  <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
                    <div style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>Add columns</div>
                    <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)" }}>Any field from the Customer form</div>
                  </div>
                  <div style={{ padding: "6px" }}>
                    {v.ppAddOpts.map(o => { const on = o.chk !== "transparent";
                      return <button key={o.label} type="button" onClick={o.toggle} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 8px", borderRadius: "7px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-row">
                        <span style={{ width: "16px", height: "16px", borderRadius: "4px", boxSizing: "border-box", display: "grid", placeItems: "center", border: `1.5px solid ${on ? "var(--crm-rust)" : "var(--crm-faint-2)"}`, background: on ? "var(--crm-rust)" : "transparent", color: "#fff" }}>{on && <Ic name="check" size={11} sw={3} />}</span>
                        <span style={{ flex: 1 }}>{o.label}</span><span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>{o.grp}</span>
                      </button>; })}
                  </div>
                </div>
              </>)}
            </span>
          </div>
          {v.ppRows.map((d, i) => (
            <button key={i} type="button" onClick={d.open} title="Show in the rail" style={{ ...BTN, display: "grid", gridTemplateColumns: v.ppGrid, gap: "8px", alignItems: "center", height: "47px", padding: "0 12px", position: "relative",
              font: "400 13px Inter, sans-serif", borderBottom: "1px solid var(--crm-rule-soft)", background: d.on ? "var(--crm-sel)" : "var(--crm-page)", color: "var(--crm-ink)" }} className={d.on ? undefined : "crm4a-row"}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", zIndex: 2, background: d.on ? "var(--crm-rust)" : "transparent" }} />
              <span style={{ position: "sticky", left: 0, zIndex: 1, background: "inherit", display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span style={{ width: "30px", height: "30px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 11px ${TIGHT}`, background: d.avBg, color: d.avFg }}>{d.ini}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                  <span style={{ font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                  <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{d.phone}</span>
                </span>
              </span>
              {d.cells.map((x, j) => (
                // v2 (frame 03): pills 24 px; Ad and Visit in ink-soft, Assigned to in ink, Added muted. Every column on the left, under
                // its head (the owner, 2026-10-29: "统一靠左边" — Added sat right, under Last chat's head).
                <span key={j} style={{ minWidth: 0, display: "flex", overflow: "hidden" }}>
                  {x.pill ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "24px", padding: "0 9px", borderRadius: "12px", background: x.bg, color: x.fg, font: "500 12px Inter, sans-serif", whiteSpace: "nowrap" }}>
                    {x.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: x.dot }} />}{x.v}</span>
                    : <span style={{ font: "400 13px Inter, sans-serif", color: x.v === "—" ? "var(--crm-faint-2)" : v.ppKeys[j] === "sp" ? "var(--crm-ink)" : v.ppKeys[j] === "first" ? "var(--crm-muted)" : "var(--crm-ink-soft)",
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{x.v}</span>}
                </span>
              ))}
              <span />
            </button>
          ))}
          </div>
        </div>
      )}
      {v.ppPagerOn && <div style={{ flex: "none", marginTop: "12px" }}>{pager}</div>}
      {v.ppEmpty && (
        <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "48px 20px", borderTop: "1px solid var(--crm-ink)", textAlign: "center" }}>
          <span style={{ font: "500 15px Inter, sans-serif", color: "var(--crm-ink)" }}>No contacts match these filters</span>
          <button type="button" onClick={v.ppClear} style={{ ...BTN, font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>Clear filters</button>
        </div>
      )}
    </div>
  );
}

interface RailChart { title: string; sum: string; empty: boolean; bys: { label: string; on: boolean; pick: () => void }[]; rows: { label: string; n: number; pct: string; color: string; on: boolean; pick?: () => void }[] }
interface RailSide {
  has: boolean; ini: string; name: string; phone: string; ch: string; status: string; owner: string; ad: string; adUrl: string | null; lastAt: string; visit: string | null;
  groups: { label: string; rows: { k: string; v: string }[] }[]; hasMsgs: boolean; msgs: { mine: boolean; text: string; at: string }[];
  openChat: () => void; edit: () => void; close: () => void;
  todoTitle: string; todo: { id: string; ini: string; name: string; sub: string; pick: () => void; fill: (e: { stopPropagation(): void }) => void }[];
}
interface RailBits {
  open: boolean; toggle: () => void; title: string; chart: RailChart | null; side: RailSide | null;
  stats: { figures: { label: string; value: string; color: string; open: () => void }[]; by: { l: string; pick: () => void; op: number | string }[]; bars: { name: string; pct: number; label: string; color: string }[] } | null;
}
const KICK: CSSProperties = { font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" };
const HOT = new Set(["Attention", "Overdue", "Urgent", "Reply soon"]);

/**
 * The shared folded rail (v2 note 04 / 08): 44 px on the cream nav (--crm-cream-nav) with the rule on its left; top to bottom a 16 px icon in
 * brown, the panel's name running down (12 px, 500, ink-soft) and one chevron-left (13 px, faint). A click anywhere opens it.
 */
export function FoldedRail4a({ icon, label, open, side = "left" }: { icon: Icon4a; label: string; open: () => void; side?: "left" | "right" }) {
  return (
    <button type="button" onClick={open} title={`Open ${label}`} aria-label={`Open ${label}`} style={{ ...BTN, width: "44px", flex: "none", alignSelf: "stretch", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px",
      paddingTop: "20px", background: "var(--crm-cream-nav)", [side === "left" ? "borderLeft" : "borderRight"]: "1px solid var(--crm-rule)" }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name={icon} size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>{label}</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
}

/** A panel's collapse button (v2 note 08): 24 px square, 1 px line, chevron-right 11 px muted — beside its ✕ when it has one. */
export function CollapseBtn4a({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} title="Collapse" aria-label="Collapse" style={{ ...BTN, flex: "none", width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center",
      border: "1px solid var(--crm-line)", color: "var(--crm-muted)" }}><Ic name="chevron-right" size={11} /></button>
  );
}

/**
 * Frame 03 · Contacts' rail (v2, notes 01 / 08): SELECTED and its collapse button; the customer picked in the table — 44 px
 * avatar, name, phone · channel, Status · Ad · Assigned to · Visit · Last message — with Open chat and Customer info at
 * its foot. Nobody picked: who still lacks property info, each opening its customer. Open at first, kept per browser.
 */
function ContactSelected4a({ s }: { s: RailSide }) {
  // A name clicked in the table opens the panel even when it was folded (the owner, 2026-10-23: "点名字后可以看到 customer info & open chat").
  const [open, toggle] = usePanelOpenOn("contacts-selected", s.has ? s.name : null, true);
  if (!open) return <FoldedRail4a icon="user-round" label="Selected" open={toggle} />;
  const KICK2: CSSProperties = { font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" };
  const row = (k: string, val: ReactNode, c?: string) => (
    <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "10px", font: "400 13px Inter, sans-serif" }}>
      <span style={{ color: "var(--crm-muted)", flex: "none" }}>{k}</span>
      <span style={{ fontWeight: 500, textAlign: "right", color: c ?? "var(--crm-ink)", minWidth: 0, overflowWrap: "anywhere" }}>{val}</span>
    </div>
  );
  const st = STATUS[s.status as keyof typeof STATUS];
  return (
    <aside style={{ width: "264px", flex: "none", display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px", borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-page)", overflow: "auto", minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "center" }}><div style={KICK2}>{s.has ? "Selected" : s.todoTitle || "Selected"}</div><span style={{ marginLeft: "auto" }}><CollapseBtn4a onClick={toggle} /></span></div>
        {s.has ? (<>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: `500 14px ${TIGHT}`, background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{s.ini}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
              <div style={{ font: `500 16px ${TIGHT}`, color: "var(--crm-ink)", overflowWrap: "anywhere" }}>{s.name}</div>
              <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{[s.phone, s.ch].filter(Boolean).join(" · ")}</div>
            </div>
          </div>
          {row("Status", s.status || "—", st?.text)}
          {row("Ad", s.ad ? <AdLinkInline ad={s.ad} url={s.adUrl} /> : "—")}
          {row("Assigned to", s.owner || "—")}
          {row("Visit", s.visit || "—")}
          {row("Last message", s.lastAt || "—")}
        </>) : s.todo.length ? s.todo.map(t => (
          <button key={t.id} type="button" onClick={t.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", padding: "6px 0", color: "var(--crm-ink)" }} className="crm4a-row">
            <span style={{ width: "30px", height: "30px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 11px ${TIGHT}`, background: avatarTint(t.name)[0], color: avatarTint(t.name)[1] }}>{t.ini}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
              <span style={{ font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
              <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</span>
            </span>
          </button>
        )) : <div style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a customer in the table.</div>}
      </div>
      {s.has && (
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button type="button" onClick={s.openChat} style={{ ...BTN, height: "38px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">
            <Ic name="message-circle" size={15} />Open chat</button>
          <button type="button" onClick={s.edit} style={{ ...BTN, height: "38px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", font: "500 13px Inter, sans-serif", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Customer info</button>
        </div>
      )}
    </aside>
  );
}
const AdLinkInline = ({ ad, url }: { ad: string; url: string | null }) => (url ? <a href={url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{ad}</a> : <>{ad}</>);

/** Frames 03 / 04 · the page's right rail: Contacts' Breakdown and Selected customer (264 px), the Calendar's figures (248 px). Folds to a strip. */
export function DeskRail4a({ v, extra }: { v: RailBits; extra?: ReactNode }) {
  const [byOpen, setByOpen] = useState(false);
  // v2 (frame 03, note 01): Contacts' rail is the Selected panel alone — Breakdown and its figures are gone.
  if (v.side) return <ContactSelected4a s={v.side} />;
  const people = !!(v.side as RailSide | null), W = people ? 304 : 288; // 264 / 248 inside, 20 px a side (the frames' content-box)
  if (!v.open) return (
    <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} style={{ ...BTN, width: "44px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingTop: "20px",
      borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="layout-grid" size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", letterSpacing: "0.04em", color: "var(--crm-ink-soft)" }}>{people ? "Breakdown" : "Figures"}</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
  const c = v.chart, s = v.side as RailSide | null; // the Calendar's now; Contacts returned above
  const total = c ? c.rows.reduce((a, r) => a + r.n, 0) : 0;
  let acc = 0;
  const donut = c && total ? `conic-gradient(${c.rows.filter(r => r.n).map(r => { const a = acc; acc += (r.n / total) * 360; return `${r.color} ${a}deg ${acc}deg`; }).join(",")})` : "var(--crm-rule-soft)";
  return (
    // Open, a panel as Inbox's Customer info: its 62 px head (icon, name, › folds it) over what scrolls (the owner, 2026-10-18:
    // "做成可收缩式，像inbox customer info 一样，默认收起").
    <aside style={{ width: `${W}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
      <button type="button" onClick={v.toggle} title={people ? "Fold Breakdown" : "Fold Figures"} style={{ ...BTN, height: "62px", flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px",
        font: `500 16px ${TIGHT}`, borderBottom: "1px solid var(--crm-rule)", color: "var(--crm-ink)" }}>
        <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="layout-grid" size={15} /></span>{people ? "Breakdown" : "Figures"}
        <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
      </button>
      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px" }}>
      {people && c && (<>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>Customers</div>
          <span style={{ position: "relative", marginLeft: "auto" }}>
            <button type="button" onClick={() => setByOpen(o => !o)} aria-expanded={byOpen} style={{ ...BTN, display: "flex", alignItems: "center", gap: "4px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
              By {(c.bys.find(b => b.on)?.label ?? "Status").toLowerCase()}<Ic name="chevron-down" size={12} />
            </button>
            {byOpen && (<>
              <div onClick={() => setByOpen(false)} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "24px", right: 0, zIndex: 8, minWidth: "180px", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                {c.bys.map(b => <button key={b.label} type="button" onClick={() => { b.pick(); setByOpen(false); }} style={{ ...BTN, height: "32px", padding: "0 10px", borderRadius: "7px", font: `${b.on ? 500 : 400} 13px Inter, sans-serif`,
                  background: b.on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">{b.label}</button>)}
              </div>
            </>)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div style={{ width: "112px", height: "112px", flex: "none", borderRadius: "50%", position: "relative", background: donut }}>
            <div style={{ position: "absolute", inset: "18px", borderRadius: "50%", background: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <div style={{ font: `500 20px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{total.toLocaleString("en-MY")}</div>
              <div style={{ font: "400 10px Inter, sans-serif", color: "var(--crm-faint)" }}>customers</div>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "5px" }}>
            {c.rows.map(r => (
              <button key={r.label} type="button" onClick={r.pick} disabled={!r.pick} title={r.pick ? "Click to filter" : undefined} style={{ ...BTN, display: "flex", alignItems: "center", gap: "7px", font: `${r.on ? 500 : 400} 12px Inter, sans-serif`,
                color: "var(--crm-ink)", cursor: r.pick ? "pointer" : "default" }}>
                <span style={{ width: "7px", height: "7px", flex: "none", background: r.color }} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                <span style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)" }}>{r.n}</span>
              </button>
            ))}
          </div>
        </div>
        {extra}
        <div style={{ height: "1px", flex: "none", background: "var(--crm-rule)" }} />
      </>)}
      {people && s && s.has && (<>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center" }}><div style={KICK}>Selected</div>
            <button type="button" onClick={s.close} title="Clear" style={{ ...BTN, marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={13} /></button></div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", flex: "none", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", font: `500 14px ${TIGHT}`, background: avatarTint(s.name)[0], color: avatarTint(s.name)[1] }}>{s.ini}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
              <div style={{ font: `500 16px ${TIGHT}`, color: "var(--crm-ink)" }}>{s.name}</div>
              <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{s.phone} · {s.ch}</div>
            </div>
          </div>
          {([["Status", s.status, HOT.has(s.status) ? "var(--crm-oxblood)" : "var(--crm-ink)"], ["Ad", s.ad, "var(--crm-ink)"], ["Assigned to", s.owner, "var(--crm-ink)"],
            ["Visit", s.visit || "—", "var(--crm-ink)"], ["Last message", s.lastAt, "var(--crm-ink)"]] as const).map(([k, val, col]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "10px", font: "400 13px Inter, sans-serif" }}>
              <span style={{ color: "var(--crm-muted)", flex: "none" }}>{k}</span><span style={{ fontWeight: 500, textAlign: "right", color: col, minWidth: 0, overflowWrap: "anywhere" }}>{val}</span>
            </div>
          ))}
          {s.groups.map(g => (
            <div key={g.label} style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }}>
              <div style={KICK}>{g.label}</div>
              {g.rows.map(r => <div key={r.k} style={{ display: "flex", justifyContent: "space-between", gap: "10px", font: "400 13px Inter, sans-serif" }}>
                <span style={{ color: "var(--crm-muted)" }}>{r.k}</span><span style={{ fontWeight: 500, textAlign: "right", color: r.v === "—" ? "var(--crm-faint-2)" : "var(--crm-ink)" }}>{r.v}</span></div>)}
            </div>
          ))}
          {s.hasMsgs && (
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px" }}>
              <div style={KICK}>Latest messages</div>
              {s.msgs.map((m, i) => <span key={i} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "92%", padding: "6px 10px", borderRadius: m.mine ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                background: m.mine ? "var(--crm-rust)" : "var(--crm-field)", color: m.mine ? "#fff" : "var(--crm-ink)", font: "400 12px Inter, sans-serif" }}>
                <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.text}</span>
                <small style={{ display: "block", textAlign: "right", fontSize: "10px", opacity: 0.75 }}>{m.at}</small></span>)}
            </div>
          )}
        </div>
        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
          <button type="button" onClick={s.openChat} style={{ ...BTN, height: "38px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary"><Ic name="message-circle" size={15} />Open chat</button>
          <button type="button" onClick={s.edit} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Customer info</button>
        </div>
      </>)}
      {/* The owner, 2026-10-18: no "To fill in · Property info missing" list here. */}
      {!people && v.stats && (<>
        {extra}
      </>)}
      </div>
    </aside>
  );
}

/** Contacts' figures (production's stats band), under the Breakdown in 4a's rail. */
export function DeskContactFigures4a({ v }: { v: { k: string; v: string; sub: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "12px", columnGap: "12px" }}>
      {v.map(f => (
        <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
          <div style={{ font: "500 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.k}</div>
          <div style={{ font: `500 18px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{f.v}</div>
          <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.sub}</div>
        </div>
      ))}
    </div>
  );
}

interface CalBits {
  cal4: {
    stats: { k: string; v: string; c: string; open: () => void }[];
    byLabel: string; flip: () => void; flipTo: string; groups: { name: string; n: number; w: string }[];
    today: { id: string; name: string; time: string; room: string; owner: string; sent: boolean; remind: () => void }[];
  };
}
/** Frame 04 · the Calendar's rail: the figures, By showroom, Upcoming today with Send reminder. */
export function DeskCalFigures4a({ v }: { v: CalBits }) {
  const c = v.cal4;
  return (<>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: "18px" }}>
      {c.stats.map(s => (
        <button key={s.k} type="button" onClick={s.open} style={{ ...BTN, display: "flex", flexDirection: "column", gap: "4px" }}>
          <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{s.k}</span>
          <span style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", color: s.c }}>{s.v}</span>
        </button>
      ))}
    </div>
    <div style={{ height: "1px", flex: "none", background: "var(--crm-rule)" }} />
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <div style={KICK}>{c.byLabel}</div>
        <button type="button" onClick={c.flip} style={{ ...BTN, marginLeft: "auto", font: "500 11px Inter, sans-serif", color: "var(--crm-muted)" }}>{c.flipTo}</button>
      </div>
      {c.groups.map(g => (
        <div key={g.name} style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
          <div style={{ display: "flex", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{g.name}<span style={{ marginLeft: "auto", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{g.n}</span></div>
          <div style={{ height: "4px", borderRadius: "2px", background: "var(--crm-track)", position: "relative", overflow: "hidden" }}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: g.w, background: "var(--crm-brown)" }} />
          </div>
        </div>
      ))}
    </div>
    <div style={{ height: "1px", flex: "none", background: "var(--crm-rule)" }} />
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      <div style={KICK}>Upcoming today</div>
      {!c.today.length && <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>No more visits today</div>}
      {c.today.map(u => (
        <div key={u.id} style={{ display: "flex", flexDirection: "column", gap: "8px", paddingBottom: "12px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
            <div style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{u.name}</div>
            <div style={{ marginLeft: "auto", font: "500 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink-soft)" }}>{u.time}</div>
          </div>
          <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{u.room} · {u.owner}</div>
          <button type="button" onClick={u.remind} style={{ ...BTN, alignSelf: "flex-start", height: "30px", padding: "0 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", font: "500 12px Inter, sans-serif",
            background: u.sent ? "transparent" : "var(--crm-rust)", color: u.sent ? "var(--crm-ink)" : "#fff", border: `1px solid ${u.sent ? "var(--crm-line)" : "var(--crm-rust)"}` }} className={u.sent ? "crm4a-outline" : "crm4a-primary"}>
            {u.sent ? "Reminder sent · Send again" : "Send reminder"}
          </button>
        </div>
      ))}
    </div>
  </>);
}

interface CalVisit { time: string; short: string; name: string; who: string; room: string; status: string; stBg: string; stFg: string; look: { bg: string; fg: string; bd: string; bs: string }; hour: number; mins: number; open: () => void }
interface CalPageBits {
  calStep: (d: 1 | -1) => () => void; calToday: () => void;
  rangeLabel: string; rangeOpen: boolean; toggleRange: () => void; rangeOpts: { label: string; hint: string; pick: () => void; fg: string }[]; rangeFrom: string; rangeTo: string;
  setFrom: (e: { target: { value: string } }) => void; setTo: (e: { target: { value: string } }) => void;
  calTeams: { label: string; dot: string | null; bg: string; pick: () => void }[];
  calShowroom: string; pickShowroom: (e: { target: { value: string } }) => void; showroomOpts: { v: string; label: string }[];
  calWhoLabel: string; calWhoOpen: boolean; toggleCalWho: () => void; calWhoClear: () => void; calWhoOpts: WhoOpt[];
  calMonth: boolean; calWeek: boolean; calDay: boolean; calUp: boolean;
  dow: { l: string }[]; monthCells: { num: number; bg: string; numBg: string; numFg: string; visits: CalVisit[] }[];
  week4: { days: { dow: string; num: number; today: boolean; visits: CalVisit[] }[]; h0: number; hours: string[] };
  daySlots: { time: string; visits: CalVisit[]; free: boolean }[]; freeLabel: string;
  upDays: { label: string; visits: CalVisit[] }[];
}
const TOOL: CSSProperties = { ...BTN, height: "32px", padding: "0 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" };
const POP: CSSProperties = { position: "absolute", top: "38px", left: 0, zIndex: 8, minWidth: "220px", maxHeight: "360px", overflow: "auto", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "1px" };

function Pop({ label, open, onToggle, children }: { label: ReactNode; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={TOOL} className="crm4a-outline">{label}<Ic name="chevron-down" size={12} /></button>
      {open && (<><div onClick={onToggle} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} /><div style={POP}>{children}</div></>)}
    </span>
  );
}
function Block({ x, abs }: { x: CalVisit; abs?: CSSProperties }) {
  return (
    <button type="button" onClick={x.open} title={`${x.name} · ${x.time} · ${x.room} · ${x.status}`} style={{ ...BTN, ...abs, borderRadius: "6px", padding: "5px 7px", overflow: "hidden", display: "flex", flexDirection: "column", lineHeight: 1.3,
      background: x.look.bg, color: x.look.fg, border: `1px ${x.look.bs} ${x.look.bd}` }}>
      <span style={{ font: "600 12px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.name}</span>
      <span style={{ font: "400 11px Inter, sans-serif", opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.time}</span>
      <span style={{ font: "400 11px Inter, sans-serif", opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.room}</span>
    </button>
  );
}

/** Frame 04 · Calendar: the toolbar (‹ › Today, the range, Teams, Showrooms, People, the legend), then the view — the week a time grid. */
export function DeskCalendar4a({ v }: { v: CalPageBits }) {
  const [teamsOpen, setTeamsOpen] = useState(false), [roomsOpen, setRoomsOpen] = useState(false);
  const team = v.calTeams.find(t => t.bg === "var(--crm-ink)");
  const room = v.showroomOpts.find(o => o.v === v.calShowroom);
  const ROW = 59;
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0, paddingTop: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "12px", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "2px" }}>
          <button type="button" onClick={v.calStep(-1)} title="Previous" style={{ ...TOOL, width: "32px", padding: 0, justifyContent: "center" }} className="crm4a-outline"><Ic name="chevron-left" size={14} /></button>
          <button type="button" onClick={v.calStep(1)} title="Next" style={{ ...TOOL, width: "32px", padding: 0, justifyContent: "center" }} className="crm4a-outline"><Ic name="chevron-right" size={14} /></button>
        </div>
        <button type="button" onClick={v.calToday} style={TOOL} className="crm4a-outline">Today</button>
        <Pop label={v.rangeLabel} open={v.rangeOpen} onToggle={v.toggleRange}>
          {v.rangeOpts.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", flexDirection: "column", gap: "1px", padding: "6px 10px", borderRadius: "7px", color: "var(--crm-ink)" }} className="crm4a-row">
            <span style={{ font: "500 13px Inter, sans-serif" }}>{o.label}</span><span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>{o.hint}</span></button>)}
          <div style={{ display: "flex", gap: "6px", padding: "8px 10px 4px", borderTop: "1px solid var(--crm-rule-soft)", marginTop: "4px" }}>
            <input type="date" value={v.rangeFrom} onChange={v.setFrom} aria-label="From" style={{ flex: 1, minWidth: 0, height: "30px", padding: "0 6px", border: "1px solid var(--crm-line)", borderRadius: "6px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)" }} />
            <input type="date" value={v.rangeTo} onChange={v.setTo} aria-label="To" style={{ flex: 1, minWidth: 0, height: "30px", padding: "0 6px", border: "1px solid var(--crm-line)", borderRadius: "6px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)" }} />
          </div>
        </Pop>
        <Pop label={team && team.label !== "All teams" ? team.label : "Teams"} open={teamsOpen} onToggle={() => setTeamsOpen(o => !o)}>
          {v.calTeams.map(t => { const on = t.bg === "var(--crm-ink)"; return <button key={t.label} type="button" onClick={() => { t.pick(); setTeamsOpen(false); }} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px",
            borderRadius: "7px", font: `${on ? 500 : 400} 13px Inter, sans-serif`, background: on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot ?? "transparent", border: t.dot ? 0 : "1px solid var(--crm-faint-2)", boxSizing: "border-box" }} />{t.label}</button>; })}
        </Pop>
        <Pop label={room && room.v !== "all" ? room.label.replace(/ showroom$/i, "") : "Showrooms"} open={roomsOpen} onToggle={() => setRoomsOpen(o => !o)}>
          {v.showroomOpts.map(o => { const on = o.v === v.calShowroom; return <button key={o.v} type="button" onClick={() => { v.pickShowroom({ target: { value: o.v } }); setRoomsOpen(false); }} style={{ ...BTN, height: "34px", padding: "0 10px",
            borderRadius: "7px", font: `${on ? 500 : 400} 13px Inter, sans-serif`, background: on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">{o.label}</button>; })}
        </Pop>
        <Pop label={v.calWhoLabel === "Everyone" ? "People" : v.calWhoLabel} open={v.calWhoOpen} onToggle={v.toggleCalWho}>
          {v.calWhoOpts.map((w, i) => w.head
            ? <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }} />{w.label}</div>
            : <button key={i} type="button" onClick={w.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "34px", padding: "4px 8px", borderRadius: "7px", font: `${w.sel ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: w.sel ? "var(--crm-sel)" : "transparent" }} className="crm4a-row">
                <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 9px ${TIGHT}`, background: w.avBg, color: w.avFg }}>{w.ini}</span>
                <span style={{ flex: 1 }}>{w.label}</span><span style={{ width: "16px", display: "flex", color: "var(--crm-rust)" }}>{w.sel && <Ic name="check" size={14} />}</span></button>)}
          <button type="button" onClick={v.calWhoClear} style={{ ...BTN, margin: "6px 4px 2px", height: "30px", borderRadius: "6px", textAlign: "center", font: "500 12px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }}>Clear</button>
        </Pop>
        <div style={{ marginLeft: "auto", display: "flex", gap: "14px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", background: "var(--crm-ink)" }} />Came</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", boxSizing: "border-box", background: "var(--crm-tint-appt)", border: "1px solid var(--crm-amber-line)" }} />Booked</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "3px", boxSizing: "border-box", border: "1px dashed var(--crm-faint)" }} />No-show</span>
        </div>
      </div>
      {v.calWeek && (<>
        <div style={{ display: "flex", borderTop: "1px solid var(--crm-ink)" }}>
          <div style={{ width: "52px", flex: "none" }} />
          {v.week4.days.map(d => (
            <div key={d.dow} style={{ flex: 1, minWidth: 0, height: "44px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: "500 12px Inter, sans-serif", borderLeft: "1px solid var(--crm-rule-soft)", color: d.today ? "var(--crm-ink)" : "var(--crm-muted)" }}>
              {d.dow}<span style={{ minWidth: "26px", height: "26px", borderRadius: "13px", display: "flex", alignItems: "center", justifyContent: "center", font: `500 14px ${TIGHT}`, fontVariantNumeric: "tabular-nums",
                background: d.today ? "var(--crm-rust)" : "transparent", color: d.today ? "#fff" : "var(--crm-ink)" }}>{d.num}</span>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", borderTop: "1px solid var(--crm-rule)" }}>
          <div style={{ width: "52px", flex: "none", display: "flex", flexDirection: "column" }}>
            {v.week4.hours.map(h => <div key={h} style={{ height: `${ROW}px`, font: "400 11px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)", paddingTop: "4px", boxSizing: "border-box" }}>{h}</div>)}
          </div>
          {v.week4.days.map(d => (
            <div key={d.dow} style={{ flex: 1, minWidth: 0, height: `${v.week4.hours.length * ROW}px`, position: "relative", borderLeft: "1px solid var(--crm-rule-soft)",
              backgroundImage: `repeating-linear-gradient(to bottom, var(--crm-rule-soft) 0, var(--crm-rule-soft) 1px, transparent 1px, transparent ${ROW}px)`, backgroundColor: d.today ? "var(--crm-hover)" : "transparent" }}>
              {d.visits.map((x, i) => <Block key={i} x={x} abs={{ position: "absolute", left: "4px", right: "4px", top: `${(x.hour - v.week4.h0) * ROW}px`, height: `${Math.max(ROW - 4, (x.mins / 60) * ROW - 4)}px` }} />)}
            </div>
          ))}
        </div>
      </>)}
      {v.calMonth && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-ink)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", borderBottom: "1px solid var(--crm-rule)" }}>
            {v.dow.map(d => <span key={d.l} style={{ height: "34px", display: "flex", alignItems: "center", justifyContent: "center", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", color: "var(--crm-muted)" }}>{d.l}</span>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))" }}>
            {v.monthCells.map((c, i) => (
              <div key={i} style={{ minHeight: "96px", padding: "6px", borderLeft: i % 7 ? "1px solid var(--crm-rule-soft)" : 0, borderBottom: "1px solid var(--crm-rule-soft)", display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                <span style={{ alignSelf: "flex-start", minWidth: "24px", height: "24px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", font: `500 13px ${TIGHT}`, fontVariantNumeric: "tabular-nums",
                  background: c.numBg, color: c.numFg }}>{c.num}</span>
                {c.visits.map((x, j) => <button key={j} type="button" onClick={x.open} title={`${x.name} · ${x.time} · ${x.room} · ${x.status}`} style={{ ...BTN, display: "flex", gap: "5px", minWidth: 0, padding: "2px 6px", borderRadius: "5px",
                  font: "500 11px Inter, sans-serif", background: x.look.bg, color: x.look.fg, border: `1px ${x.look.bs} ${x.look.bd}` }}>
                  <span style={{ flex: "none", fontVariantNumeric: "tabular-nums", opacity: 0.85 }}>{x.short}</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.name}</span></button>)}
              </div>
            ))}
          </div>
        </div>
      )}
      {v.calDay && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-ink)" }}>
          {v.daySlots.map(t => (
            <div key={t.time} style={{ display: "flex", gap: "14px", minHeight: `${ROW}px`, padding: "6px 0", borderBottom: "1px solid var(--crm-rule-soft)", boxSizing: "border-box" }}>
              <span style={{ width: "52px", flex: "none", font: "400 11px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)", paddingTop: "4px" }}>{t.time}</span>
              <span style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: "6px" }}>
                {t.visits.map((x, i) => <Block key={i} x={x} abs={{ width: "220px", height: "52px" }} />)}
                {t.free && <span style={{ paddingTop: "4px", font: "400 12px Inter, sans-serif", color: "var(--crm-faint-2)" }}>{v.freeLabel}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {v.calUp && (
        <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-ink)" }}>
          {v.upDays.map(d => (
            <div key={d.label} style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "14px 0 6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{d.label}</div>
              {d.visits.map((x, i) => (
                <button key={i} type="button" onClick={x.open} style={{ ...BTN, display: "flex", alignItems: "center", gap: "14px", height: "52px", borderBottom: "1px solid var(--crm-rule-soft)", color: "var(--crm-ink)" }} className="crm4a-row">
                  <span style={{ width: "10px", height: "10px", borderRadius: "3px", boxSizing: "border-box", background: x.look.bg === "transparent" ? "transparent" : x.look.bg, border: `1px ${x.look.bs} ${x.look.bd}` }} />
                  <span style={{ width: "70px", font: "500 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums" }}>{x.time}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <span style={{ font: "500 14px Inter, sans-serif" }}>{x.name}</span><span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{x.who}</span>
                  </span>
                  <span style={{ height: "22px", padding: "0 9px", borderRadius: "11px", display: "flex", alignItems: "center", font: "500 12px Inter, sans-serif", background: x.stBg, color: x.stFg, whiteSpace: "nowrap" }}>{x.status}</span>
                </button>
              ))}
            </div>
          ))}
          {!v.upDays.length && <div style={{ padding: "40px 0", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Nothing coming up</div>}
        </div>
      )}
    </div>
  );
}

interface AdsCell { v: string; cv: string; d: string; dc: string; db: string; bar?: number | null }
interface AdsBits {
  ap4: {
    cols: { id: string; label: string; arrow: string; num: boolean; sort: () => void }[];
    rows: { name: string; headline: string; ch: "whatsapp" | "messenger"; cells: AdsCell[]; url?: string; hidden?: boolean; hide?: () => void }[];
    hiddenN?: number; showHidden?: boolean; toggleHidden?: () => void;
    total: { label: string; cells: AdsCell[] };
    cmp: boolean;
  };
  apNameArrow: string; apSortName: () => void; openMetrics: () => void;
  /** The chart over the table and the table's own fold (2026-10-23); absent in the prototype harness, which keeps 4a's table alone. */
  apChartV?: AdsChartBits & { tableShut: boolean; foldTable: () => void; adsN: number };
  apPager?: { range: string; per: number; sizes: number[]; setPer: (n: number) => void; pages: number; cur: number; go: (i: number) => void };
}

/**
 * An ad's name in Ads Performance: a small ↗ beside it opens the ad (the owner, 2026-10-24: "電腦版也要有可以導入看該廣告");
 * a right click offers View ad and, for CRM · Manage, Hide from Ads Performance / Show again ("右鍵點擊廣告名稱可以選擇hide").
 */
function AdName({ r }: { r: { name: string; url?: string; hidden?: boolean; hide?: () => void } }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const item: CSSProperties = { ...BTN, display: "flex", alignItems: "center", gap: "8px", width: "100%", padding: "8px 12px", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", textAlign: "left" };
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }} onContextMenu={e => { if (!r.url && !r.hide) return; e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }}>
      <span title={r.hide ? "Right click to hide" : undefined} style={{ font: "500 14px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.hidden ? "var(--crm-faint)" : "var(--crm-ink)" }}>{r.name}{r.hidden ? " · hidden" : ""}</span>
      {r.url && <a href={r.url} target="_blank" rel="noopener noreferrer" title="View ad" aria-label="View ad" onClick={e => e.stopPropagation()} style={{ flex: "none", width: "20px", height: "20px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-muted)" }}><Ic name="arrow-up-right" size={11} /></a>}
      {menu && <>
        <span onClick={() => setMenu(null)} onContextMenu={e => { e.preventDefault(); setMenu(null); }} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
        <span role="menu" style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 41, minWidth: "210px", padding: "4px 0", borderRadius: "10px", background: "#fff", boxShadow: "0 8px 24px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
          {r.url && <a role="menuitem" href={r.url} target="_blank" rel="noopener noreferrer" onClick={() => setMenu(null)} style={{ ...item, textDecoration: "none" }}><Ic name="arrow-up-right" size={13} />View ad</a>}
          {r.hide && <button type="button" role="menuitem" onClick={() => { setMenu(null); r.hide!(); }} style={{ ...item, color: r.hidden ? "var(--crm-ink)" : "var(--crm-oxblood)" }}><Ic name={r.hidden ? "plus" : "x"} size={13} />{r.hidden ? "Show in Ads Performance" : "Hide from Ads Performance"}</button>}
        </span>
      </>}
    </span>
  );
}

/** Frame 05 · Ads Performance's table: the ad (channel, the name managers typed, Meta's headline), the CRM's figures, Meta's "—", the total under an ink rule. */
export function DeskAdsTable4a({ v }: { v: AdsBits }) {
  const A = v.ap4;
  // Each column's width can be dragged by its head's right edge, double-click to reset (the owner, 2026-10-18: the table's
  // columns marked one by one, "可调整宽度"); kept in this browser only.
  const [colW, setColW] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem("crm-ads-cols") ?? "{}") as Record<string, number>; } catch { return {}; } });
  const keepW = (next: Record<string, number>) => { setColW(next); try { localStorage.setItem("crm-ads-cols", JSON.stringify(next)); } catch { /* private window */ } };
  const widthOf = (id: string, dflt: string) => (colW[id] ? `${colW[id]}px` : dflt);
  // v2 (frame 05): Ad 2.8fr (180 px at least — note 05), Leads · Appts .7, the rates and Won .75, Spend · Per lead .8, the + 28 px.
  const FR: Record<string, number> = { leads: 0.7, appt: 0.7, spend: 0.8, cpl: 0.8 };
  const grid = `${widthOf("ad", "minmax(180px,2.8fr)")} ${A.cols.map(c => widthOf(c.id, `minmax(48px,${FR[c.id] ?? 0.75}fr)`)).join(" ")} 28px`;
  const Resize = ({ id }: { id: string }) => (
    <span role="separator" aria-orientation="vertical" title="Drag to resize · double-click to reset" className="crm4a-colgrip"
      onDoubleClick={() => { const n = { ...colW }; delete n[id]; keepW(n); }}
      onPointerDown={e => {
        e.preventDefault(); e.stopPropagation();
        const cell = (e.currentTarget.parentElement as HTMLElement), x0 = e.clientX, w0 = cell.getBoundingClientRect().width;
        let last = colW;
        const move = (m: PointerEvent) => { last = { ...colW, [id]: Math.max(id === "ad" ? 120 : 44, Math.round(w0 + m.clientX - x0)) }; setColW(last); };
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); keepW(last); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
      }}
      style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-8px", width: "10px", cursor: "col-resize", zIndex: 2, touchAction: "none" }} />
  );
  const Cell = ({ c, id, total }: { c: AdsCell; id: string; total?: boolean }) => {
    // Faint only when there is no figure: Spend and Per lead were drawn faint as "Meta not connected", which they are since
    // 2026-10-22 (Ads Manager's own figures) — the owner, 2026-10-23: "数据浅灰色的原因？".
    const meta = c.v === "—";
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "2px", minWidth: 0 }}>
        {/* Appt rate is its figure alone, no bar (the owner, 2026-10-18). */}
        {<span style={{ color: meta && !total ? "var(--crm-faint-2)" : undefined, whiteSpace: "nowrap" }}>{/%$/.test(c.v) ? (id === "showrate" || id === "apptrate" ? `${Math.round(parseFloat(c.v))}%` : c.v.replace(/(\.\d)\d%$/, "$1%")) : c.v}</span>}
        {A.cmp && c.d && <span style={{ alignSelf: "flex-end", font: "500 10px Inter, sans-serif", padding: "0 5px", borderRadius: "4px", background: c.db, color: c.dc }}>{c.d}</span>}
      </span>
    );
  };
  const C = v.apChartV;
  // The ad's column stays put while the figures scroll sideways under it (the owner, 2026-10-29: "往右拉动时，广告名称栏位是
  // freeze 的"): sticky at the scroller's left, over the row's own padding, on the row's colour.
  const pin = (bg: string): CSSProperties => ({ position: "sticky", left: 0, zIndex: 1, marginLeft: "-12px", paddingLeft: "12px", alignSelf: "stretch", alignItems: "center", background: bg, boxShadow: "8px 0 8px -8px rgba(42,22,12,.18)" });
  // The header band and every row run the whole width of the columns however many metrics are added (the owner,
  // 2026-10-23: "要 full cover 不管加多少指标") — the rows sit in a max-content box inside the sideways scroller.
  const table = (
    <div style={{ overflowX: "auto", minWidth: 0 }}><div style={{ display: "flex", flexDirection: "column", width: "max-content", minWidth: "100%" }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", padding: "9px 12px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-ink)", borderBottom: "1px solid var(--crm-nav-line)",
        font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
        <span style={{ ...pin("var(--crm-cream-nav)"), minWidth: 0, display: "flex", zIndex: 2 }}><button type="button" onClick={v.apSortName} style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit" }}>Ad{v.apNameArrow === "▲" ? " ↑" : v.apNameArrow === "▼" ? " ↓" : ""}</button><Resize id="ad" /></span>
        {A.cols.map(c => <span key={c.id} style={{ position: "relative", minWidth: 0, display: "flex", justifyContent: "flex-end" }}><button type="button" onClick={c.sort} style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", textAlign: "right", lineHeight: 1.25 }}>{c.label}{c.arrow ? ` ${c.arrow}` : ""}</button><Resize id={c.id} /></span>)}
        {/* The + stays in sight at the right however many columns there are (the owner, 2026-10-24: "+號…應該一直都在"). */}
        <button type="button" onClick={v.openMetrics} title="Add columns" style={{ ...BTN, justifySelf: "end", position: "sticky", right: "0", zIndex: 1, width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", border: "1px dashed var(--crm-rust)", background: "var(--crm-cream-nav)", boxShadow: "-10px 0 8px var(--crm-cream-nav)", color: "var(--crm-rust)" }}><Ic name="plus" size={12} /></button>
      </div>
      {A.rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", height: "44px", padding: "0 12px", boxSizing: "border-box", borderBottom: "1px solid var(--crm-rule-soft)",
          font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }} className="crm4a-row">
          <span style={{ ...pin("#fff"), display: "flex", gap: "10px", minWidth: 0 }}>
            <span style={{ display: "flex", color: r.ch === "whatsapp" ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.ch === "whatsapp" ? "phone" : "message-circle"} size={15} /></span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <AdName r={r} />
              {r.headline && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.headline}</span>}
            </span>
          </span>
          {r.cells.map((c, j) => <Cell key={j} c={c} id={A.cols[j].id} />)}
          <span />
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", minHeight: "44px", padding: "0 12px", borderTop: "1px solid var(--crm-ink)", marginTop: "-1px",
        font: "500 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
        <span style={{ ...pin("#fff"), display: "flex" }}>{A.total.label}</span>
        {A.total.cells.map((c, j) => <Cell key={j} c={c} id={A.cols[j].id} total />)}
        <span />
      </div>
      {!!A.hiddenN && <button type="button" onClick={A.toggleHidden} style={{ ...BTN, margin: "10px 12px 0", font: "500 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>{A.showHidden ? "Leave the hidden ads out" : `Hidden ads (${A.hiddenN}) · show`}</button>}
    </div></div>
  );
  if (!C) return table;
  // The chart, then the ads one by one — each folds to its head (the owner, 2026-10-23: "下方的个别数据及图片做成可展开收缩").
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <DeskAdsChart v={C} />
      <div style={{ paddingBottom: "10px" }}><FoldHead title="By ad" sub={`${C.adsN} ads`} shut={C.tableShut} fold={C.foldTable} /></div>
      {!C.tableShut && table}
      {!C.tableShut && v.apPager && <AdsPager4a p={v.apPager} />}
    </div>
  );
}

/** Frame 05's pager: "1–5 of 10 ads · Show [5 ▾] per page", the pages on the right (the one on in ink). */
function AdsPager4a({ p }: { p: NonNullable<AdsBits["apPager"]> }) {
  const sq = (on: boolean): CSSProperties => ({ ...BTN, width: "28px", height: "28px", borderRadius: "6px", display: "grid", placeItems: "center", font: `500 12px ${TIGHT}`, background: on ? "var(--crm-ink)" : "transparent", color: on ? "#fff" : "var(--crm-ink-soft)", textAlign: "center" });
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "14px", padding: "8px 4px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{p.range}</span>
      <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>Show
        <span style={{ position: "relative", height: "28px", padding: "0 8px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", boxSizing: "border-box", border: "1px solid var(--crm-line)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }}>
          {p.per}<span style={{ display: "flex", color: "var(--crm-muted)" }}><Ic name="chevron-down" size={10} /></span>
          <select value={p.per} onChange={e => p.setPer(Number(e.target.value))} aria-label="Ads per page" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>
            {p.sizes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>per page</span>
      <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "4px" }}>
        <button type="button" onClick={() => p.cur > 0 && p.go(p.cur - 1)} disabled={p.cur === 0} aria-label="Previous page" style={{ ...sq(false), color: p.cur === 0 ? "var(--crm-faint-2)" : "var(--crm-ink-soft)" }}><Ic name="chevron-left" size={12} /></button>
        {Array.from({ length: p.pages }, (_, i) => <button key={i} type="button" onClick={() => p.go(i)} aria-current={i === p.cur} style={sq(i === p.cur)}>{i + 1}</button>)}
        <button type="button" onClick={() => p.cur < p.pages - 1 && p.go(p.cur + 1)} disabled={p.cur >= p.pages - 1} aria-label="Next page" style={{ ...sq(false), color: p.cur >= p.pages - 1 ? "var(--crm-faint-2)" : "var(--crm-ink-soft)" }}><Ic name="chevron-right" size={12} /></button>
      </span>
    </div>
  );
}

interface AdListBits {
  adList4: { summary: string; unsetN: number; legend: { name: string; color: string }[];
    rows: { name: string; nameless: boolean; paused?: boolean; run?: string; brand?: string; brandHead?: boolean; brandN?: number; headline: string; ch: "whatsapp" | "messenger"; leads: string; segs: { color: string; pct: number }[]; set: boolean; sel: boolean; open: () => void }[] };
  stCur: { label: string; n: number; color: string }; toggleSt: () => void; stOpen: boolean; stOpts: { label: string; hint?: string | null; color: string; pick: () => void; n?: number | string }[];
}
// The name keeps 136 px (the channel icon and "Not named yet"); the split bar gives way first on a narrow screen (the owner, 2026-10-18: "调一下 Split 宽度").
const AD_GRID = "minmax(136px,1fr) 44px minmax(0,106px) 84px";

/** Frame 06 · Assignment › Ads to teams: the summary and team legend, then every ad — channel, name, headline, leads, its split, Edit split / Set up. */
export function DeskAdList4a({ v }: { v: AdListBits }) {
  const L = v.adList4;
  return (
    <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: "10px 14px", paddingBottom: "16px" }}>
        <div style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap", alignSelf: "center" }}>{L.summary}{L.unsetN > 0 && <span style={{ color: "var(--crm-oxblood)" }}> · {L.unsetN} not set up</span>}</div>
        <span style={{ position: "relative", alignSelf: "center" }}>
          <button type="button" onClick={v.toggleSt} style={{ ...BTN, display: "flex", alignItems: "center", gap: "5px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: v.stCur.color }} />{v.stCur.label}<Ic name="chevron-down" size={11} /></button>
          {v.stOpen && (<>
            <div onClick={v.toggleSt} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
            <div style={{ position: "absolute", top: "22px", left: 0, zIndex: 8, width: "260px", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
              {v.stOpts.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", padding: "4px 8px", borderRadius: "7px", color: "var(--crm-ink)" }} className="crm4a-row">
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: o.color }} />
                <span style={{ flex: 1, display: "flex", flexDirection: "column" }}><span style={{ font: "500 13px Inter, sans-serif" }}>{o.label}</span>{o.hint && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)" }}>{o.hint}</span>}</span>
                <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>{o.n}</span></button>)}
            </div>
          </>)}
        </span>
        <div style={{ marginLeft: "auto", alignSelf: "center", display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: "6px 14px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
          {L.legend.map(t => <span key={t.name} style={{ display: "flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" }}><span style={{ width: "8px", height: "8px", background: t.color }} />{t.name}</span>)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: AD_GRID, gap: "12px", alignItems: "center", minHeight: "34px", padding: "0 12px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-ink)",
        font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
        <span>Ad</span><span style={{ textAlign: "right" }}>Leads</span><span>Split</span><span />
      </div>
      {L.rows.map((r, i) => (<Fragment key={i}>
        {r.brandHead && <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "34px", padding: "0 12px", background: "var(--crm-page)", borderBottom: "1px solid var(--crm-rule-soft)", font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-ink-soft)" }}>{r.brand}<span style={{ fontWeight: 400, color: "var(--crm-faint)" }}>{r.brandN}</span></div>}
        <div onClick={r.open} style={{ display: "grid", gridTemplateColumns: AD_GRID, gap: "12px", alignItems: "center", minHeight: "62px", padding: "0 12px", position: "relative", cursor: "pointer",
          borderBottom: "1px solid var(--crm-rule-soft)", background: r.sel ? "var(--crm-sel)" : "transparent" }} className={r.sel ? undefined : "crm4a-row"}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: r.sel ? "var(--crm-rust)" : "transparent" }} />
          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span style={{ display: "flex", color: r.ch === "whatsapp" ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.ch === "whatsapp" ? "phone" : "message-circle"} size={15} /></span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ font: "500 14px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameless ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{r.name}{r.paused && <span style={{ marginLeft: "8px", padding: "1px 6px", borderRadius: "4px", background: "var(--crm-rule-soft)", font: "500 10px Inter, sans-serif", letterSpacing: "0.04em", textTransform: "uppercase", color: "var(--crm-faint)", verticalAlign: "2px" }}>Paused</span>}</span>
              {r.headline && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.headline}</span>}
              {r.run && <span style={{ font: "500 11px Inter, sans-serif", color: /^Running/.test(r.run) ? "var(--crm-whatsapp)" : /^(Scheduled|Pending)/.test(r.run) ? "var(--crm-rust)" : "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.run}</span>}
            </span>
          </span>
          <span style={{ textAlign: "right", font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{r.leads}</span>
          <span style={{ display: "flex", gap: "2px", height: "8px" }}>
            {!r.set ? <span style={{ flex: 1, background: "var(--crm-rule-soft)", borderRadius: "2px" }} /> : r.segs.map((g, j) => <span key={j} style={{ flex: g.pct, background: g.color }} />)}
          </span>
          <span style={{ display: "flex", justifyContent: "flex-end" }}>
            {/* No Edit split / Set up button: the row opens the split (the owner, 2026-10-24: "點廣告名就能進到assign 版面"); an ad
                nobody split says "Not set up" ("還沒set的要有提示"). */}
            {!r.set ? <span style={{ height: "24px", padding: "0 9px", borderRadius: "12px", display: "inline-flex", alignItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", font: "500 11.5px Inter, sans-serif", whiteSpace: "nowrap" }}>Not set up</span>
              : <span style={{ display: "flex", color: "var(--crm-faint-2)" }}><Ic name="chevron-right" size={15} /></span>}
          </span>
        </div>
      </Fragment>))}
    </div>
  );
}

/** Frame 06 (v2, note 04 / 08): the ad panel's head — Split · Ad performance · Audit log as underline tabs, then the 24 px
 *  collapse (folds the panel to the 44 px rail) and × (closes the ad). The three were side-by-side panels until v2. */
export function DeskAdTabs4a({ v }: { v: { closeAd: () => void; splitFold?: () => void; adPanes?: F4TabLike[] }; which?: "split" | "perf" | "audit" }) {
  return (
    <div style={{ flex: "none", display: "flex", gap: "22px", padding: "14px 24px 0", font: "500 13px Inter, sans-serif", borderBottom: "1px solid var(--crm-rule)" }}>
      {(v.adPanes ?? []).map(t => (
        <button key={t.label} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, padding: "6px 0 10px", font: "inherit", whiteSpace: "nowrap", marginBottom: "-1px",
          borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}`, color: t.on ? "var(--crm-ink)" : "var(--crm-faint)" }}>{t.label}</button>
      ))}
      <span style={{ marginLeft: "auto", alignSelf: "center", display: "flex", gap: "8px", paddingBottom: "4px" }}>
        {v.splitFold && <CollapseBtn4a onClick={v.splitFold} />}
        <button type="button" onClick={v.closeAd} title="Close (Esc)" aria-label="Close" style={{ ...BTN, width: "16px", height: "16px", alignSelf: "center", display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={16} /></button>
      </span>
    </div>
  );
}
type F4TabLike = { label: string; on: boolean; pick: () => void };

interface SplitBits {
  ad: { name: string; headline: string; canName: boolean; nameDraft: string; onName: (e: { target: { value: string } }) => void; saveName: () => void; nameKey: (e: { key: string; currentTarget: { blur(): void } }) => void };
  adModes: { label: string; on: boolean; pick: () => void }[];
  evenTeams: { name: string; color: string; names: string }[];
  split4: null | { total: string; ok: boolean; rows: {
    id: string; name: string; color: string; sub: string; subColor: string; pct: number; pctStr: string; onType: (e: { target: { value: string } }) => void;
    open: boolean; toggle: () => void; modes: { label: string; on: boolean; pick: () => void }[]; isPct: boolean; isMax: boolean; unit: string; note: string;
    members: { id: string; name: string; locked: boolean; val: number; pctW: number; valStr: string; onType: (e: { target: { value: string } }) => void }[];
  }[] };
}

/** A share's slider (note 06): a 4 px track, the fill and the thumb's ring in the row's colour; drags in steps of .5 (typing in
 *  the box allows decimals). The thumb stays inside the track. */
function SplitSlider({ pct, color, thumb, onChange, label }: { pct: number; color: string; thumb: number; onChange: (e: { target: { value: string } }) => void; label: string }) {
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div style={{ position: "relative", height: "16px", display: "flex", alignItems: "center", cursor: "pointer" }}>
      <span style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--crm-track-2)", position: "relative" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${p}%`, borderRadius: "2px", background: color }} />
      </span>
      <span style={{ position: "absolute", left: `calc(${p}% - ${(thumb * p) / 100}px)`, width: `${thumb}px`, height: `${thumb}px`, borderRadius: "50%", background: "#fff", border: `2px solid ${color}`, boxSizing: "border-box", boxShadow: "0 1px 3px rgba(42,22,12,.2)", pointerEvents: "none" }} />
      <input type="range" min="0" max="100" step="0.5" value={p} onChange={onChange} aria-label={label} style={{ position: "absolute", inset: "-6px 0", width: "100%", margin: 0, opacity: 0, cursor: "pointer" }} />
    </div>
  );
}

/** The % / max box (note 04): 84 px, right-aligned, the unit inside. Teams 34 px tall, people 26. */
function SplitBox({ value, unit, onChange, small, label }: { value: string; unit: string; onChange: (e: { target: { value: string } }) => void; small?: boolean; label: string }) {
  return (
    <label style={{ marginLeft: small ? 0 : "auto", flex: "none", width: "84px", height: small ? "26px" : "34px", padding: "0 10px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px",
      boxSizing: "border-box", border: "1px solid var(--crm-line)", background: "#fff", font: `500 ${small ? 13 : 14}px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
      <input type="text" inputMode={unit === "%" ? "decimal" : "numeric"} value={value} onChange={onChange} aria-label={label}
        style={{ width: "100%", minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "inherit", color: "inherit", textAlign: "right" }} />
      <span style={{ color: "var(--crm-faint)", fontSize: small ? "11px" : "12px" }}>{unit}</span>
    </label>
  );
}

/** Frame 06 · the Split tab's body (v2): the ad's name (typed in place) and Meta's headline, Evenly | By team, then every team —
 *  the director's row first — with its line, an 84 px box and a slider under it; a team opens (its name) to its own Evenly ·
 *  By % · By max and its people. Total last. The body scrolls; Save sits in the panel's foot. */
export function DeskSplit4a({ v }: { v: SplitBits }) {
  const S = v.split4;
  const [adj, setAdj] = useState<Record<string, boolean>>({});
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: "14px", padding: "18px 24px", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--crm-line) transparent" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <div style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Ad name</div>
        <label style={{ height: "42px", padding: "0 12px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", border: "1px solid var(--crm-ink)", font: `500 16px ${TIGHT}`, color: "var(--crm-ink)" }}>
          {v.ad.canName
            ? <input aria-label="Ad name" value={v.ad.nameDraft} onChange={v.ad.onName} onBlur={v.ad.saveName} onKeyDown={v.ad.nameKey} placeholder={v.ad.headline} maxLength={120}
                style={{ flex: 1, minWidth: 0, margin: 0, padding: 0, border: 0, outline: "none", background: "transparent", font: "inherit", color: "inherit" }} />
            : <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.ad.name}</span>}
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-muted)" }}><Ic name="pencil" size={15} /></span>
        </label>
      </div>
      <div style={{ display: "flex", padding: "3px", borderRadius: "8px", background: "var(--crm-field)" }}>
        {v.adModes.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center",
          font: "500 13px Inter, sans-serif", color: o.on ? "var(--crm-ink)" : "var(--crm-muted)", background: o.on ? "#fff" : "transparent", boxShadow: o.on ? "0 1px 3px rgba(42,22,12,.12)" : "none" }}>{o.label}</button>)}
      </div>
      {!S && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {v.evenTeams.map(t => (
            <div key={t.name} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "11px 0", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <span style={{ width: "9px", height: "9px", borderRadius: "2px", flex: "none", background: t.color }} />
              <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
                <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.names}</span>
              </div>
              <span style={{ marginLeft: "auto", flex: "none", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Equal share</span>
            </div>
          ))}
        </div>
      )}
      {S && (<>
        {/* The split at a glance, as the phone's Split leads (2026-10-24). */}
        <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "var(--crm-rule-soft)" }}>
          {S.rows.filter(r => r.pct > 0).map(r => <span key={r.id} style={{ flex: `${r.pct} 1 0px`, background: r.color, transition: "flex-grow 200ms" }} />)}
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {S.rows.map(r => (
            <div key={r.id} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "11px 0", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span style={{ width: "9px", height: "9px", borderRadius: "2px", flex: "none", background: r.color }} />
                <button type="button" onClick={r.toggle} aria-expanded={r.open} title={r.open ? "Hide its people" : "Show its people"} style={{ ...BTN, display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                  <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                  <span style={{ font: "400 11px Inter, sans-serif", color: r.subColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
                </button>
                <SplitBox value={r.pctStr} unit="%" onChange={r.onType} label={`${r.name} share`} />
              </div>
              <div style={{ paddingLeft: "19px" }}><SplitSlider pct={r.pct} color={r.color} thumb={14} onChange={r.onType} label={`${r.name} share`} /></div>
              {r.open && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginLeft: "19px", padding: "10px 12px 12px", borderRadius: "10px", background: "var(--crm-sel)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "16px", font: "500 12px Inter, sans-serif" }}>
                    {r.modes.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={{ ...BTN, paddingBottom: "3px", font: "inherit",
                      borderBottom: `2px solid ${o.on ? "var(--crm-rust)" : "transparent"}`, color: o.on ? "var(--crm-ink)" : "var(--crm-faint)" }}>{o.label}</button>)}
                    {/* Results first, as the phone; the icon opens each person's box and slider (the phone's Adjust split). */}
                    {(r.isPct || r.isMax) && <button type="button" onClick={() => setAdj(a => ({ ...a, [r.id]: !a[r.id] }))} aria-pressed={!!adj[r.id]} aria-label="Adjust split" title="Adjust split" style={{ ...BTN, marginLeft: "auto", width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", background: adj[r.id] ? "var(--crm-ink)" : "#fff", color: adj[r.id] ? "#fff" : "var(--crm-ink)" }}><Ic name="sliders-horizontal" size={13} /></button>}
                  </div>
                  {!adj[r.id] && r.members.map(m => (
                    <div key={m.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 56px", alignItems: "center", gap: "10px", font: "400 13px Inter, sans-serif", color: m.locked ? "var(--crm-faint)" : "var(--crm-ink)" }}>
                      <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                      <span style={{ height: "4px", borderRadius: "2px", background: "var(--crm-track)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${r.isPct ? Math.min(100, m.val) : 0}%`, background: "var(--crm-rust)" }} /></span>
                      <span style={{ display: "flex", justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>{m.locked ? <Ic name="lock" size={12} /> : r.isPct ? `${m.valStr}%` : r.isMax ? (m.val ? `up to ${m.valStr}` : "none") : "Even"}</span>
                    </div>
                  ))}
                  {adj[r.id] && r.members.map(m => (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: "10px", font: "400 13px Inter, sans-serif", color: m.locked ? "var(--crm-faint)" : "var(--crm-ink-soft)" }}>
                      <span style={{ flex: "none", width: "92px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        {r.isPct && !m.locked && <SplitSlider pct={m.pctW} color="var(--crm-rust)" thumb={12} onChange={m.onType} label={`${m.name} share`} />}
                        {m.locked && <span style={{ font: "400 12px Inter, sans-serif" }}>Locked · no new leads</span>}
                      </span>
                      {m.locked
                        ? <span aria-label="Locked" style={{ flex: "none", width: "84px", display: "flex", justifyContent: "flex-end", color: "var(--crm-faint)" }}><Ic name="lock" size={14} /></span>
                        : r.isPct || r.isMax ? <SplitBox small value={m.valStr} unit={r.unit} onChange={m.onType} label={`${m.name} ${r.isMax ? "most leads" : "share"}`} />
                        : <span style={{ flex: "none", width: "84px", textAlign: "right", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Equal share</span>}
                    </div>
                  ))}
                  {r.note && <div style={{ font: "500 12px Inter, sans-serif", color: r.note.includes("needs") ? "var(--crm-oxblood)" : "var(--crm-muted)" }}>{r.note}</div>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
          Total
          <span style={{ marginLeft: "auto", font: `500 16px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: S.ok ? "var(--crm-ink)" : "var(--crm-oxblood)" }}>{S.total}%</span>
          <span style={{ display: "flex", color: S.ok ? "var(--crm-brown)" : "var(--crm-oxblood)" }}><Ic name={S.ok ? "circle-check" : "triangle-alert"} size={15} /></span>
        </div>
      </>)}
    </div>
  );
}

/** A typed hour ("10:00"): kept as typed while the box has focus, applied on blur or Enter when it reads as a whole hour. */
const hourOf = (s: string) => { const m = s.trim().match(/^(\d{1,2})(?::(\d{2}))?$/); if (!m) return null; const h = Number(m[1]); return h >= 0 && h <= 24 && (!m[2] || m[2] === "00") ? h : null; };
const HOUR_BOX: CSSProperties = { flex: "1 1 0%", minWidth: 0, height: "32px", padding: "0 10px", borderRadius: "6px", boxSizing: "border-box", border: "1px solid var(--crm-line)", background: "#fff",
  font: `500 13px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", outline: "none" };
function HourBox({ value, onDone, label }: { value: string; onDone: (h: number) => void; label: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  const done = () => { if (txt != null) { const h = hourOf(txt); if (h != null) onDone(h); setTxt(null); } };
  return <input value={txt ?? value} onChange={e => setTxt(e.target.value)} onBlur={done} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={label} inputMode="numeric" style={HOUR_BOX} />;
}
function AllDaysHours({ f, t, apply }: { f: string; t: string; apply: (f: number, t: number) => void }) {
  const [a, setA] = useState<string | null>(null), [b, setB] = useState<string | null>(null);
  const fa = hourOf(a ?? f), tb = hourOf(b ?? t), ok = fa != null && tb != null && tb > fa;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px", borderRadius: "8px", background: "var(--crm-cream)" }}>
      <span style={{ flex: "none", width: "44px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }}>All days</span>
      <input value={a ?? f} onChange={e => setA(e.target.value)} aria-label="All days from" inputMode="numeric" style={HOUR_BOX} />
      <span style={{ color: "var(--crm-faint)" }}>–</span>
      <input value={b ?? t} onChange={e => setB(e.target.value)} aria-label="All days to" inputMode="numeric" style={HOUR_BOX} />
      <button type="button" disabled={!ok} onClick={() => { if (ok) { apply(fa!, tb!); setA(null); setB(null); } }} style={{ ...BTN, flex: "none", height: "32px", padding: "0 12px", borderRadius: "6px", display: "flex", alignItems: "center",
        background: ok ? "var(--crm-rust)" : "var(--crm-line)", color: "#fff", font: "500 12px Inter, sans-serif", whiteSpace: "nowrap" }} className={ok ? "crm4a-primary" : undefined}>Apply to all</button>
    </div>
  );
}
function DayHours({ d }: { d: { l: string; open: boolean; f: string; t: string; set: (f: number, t: number) => void; toggle: () => void } }) {
  const fh = hourOf(d.f) ?? 10, th = hourOf(d.t) ?? 21;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <button type="button" role="switch" aria-checked={d.open} aria-label={`${d.l} open`} onClick={d.toggle} style={{ ...BTN, flex: "none", width: "32px", height: "18px", borderRadius: "9px", position: "relative", background: d.open ? "var(--crm-rust)" : "var(--crm-line)", transition: "background .16s" }}>
        <span style={{ position: "absolute", top: "2px", left: d.open ? "16px" : "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", transition: "left .16s" }} />
      </button>
      <span style={{ flex: "none", width: "34px", font: "500 13px Inter, sans-serif", color: d.open ? "var(--crm-ink)" : "var(--crm-faint)" }}>{d.l}</span>
      {d.open ? (<>
        <HourBox value={d.f} onDone={h => d.set(h, Math.max(th, h + 1))} label={`${d.l} from`} />
        <span style={{ color: "var(--crm-faint)" }}>–</span>
        <HourBox value={d.t} onDone={h => d.set(Math.min(fh, h - 1), h)} label={`${d.l} to`} />
      </>) : <span style={{ flex: "1 1 0%", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Closed</span>}
    </div>
  );
}
/** Delete showroom (note 04): a bin beside + (the owner, 2026-10-29: "delete showroom 可以变成垃圾桶放在+号的右边"), asked
 * again under it; the database refuses it while visits are upcoming and says how many. */
function DeleteRoom({ name, del }: { name: string; del: () => void }) {
  const [ask, setAsk] = useState(false);
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={() => setAsk(a => !a)} title="Delete showroom" aria-label="Delete showroom" aria-expanded={ask} style={{ ...BTN, width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-oxblood)" }} className="crm4a-outline"><Ic name="trash-2" size={15} /></button>
      {ask && (<>
        <span onClick={() => setAsk(false)} style={{ position: "fixed", inset: 0, zIndex: 7 }} />
        <span role="dialog" aria-label="Delete showroom" style={{ position: "absolute", top: "42px", right: 0, zIndex: 8, width: "260px", padding: "12px", borderRadius: "10px", background: "#fff", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "10px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
          <span>Delete {name || "this showroom"}? Past visits keep its name.</span>
          <span style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button type="button" onClick={() => setAsk(false)} style={{ ...BTN, height: "30px", padding: "0 12px", borderRadius: "6px", border: "1px solid var(--crm-line)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }}>Cancel</button>
            <button type="button" onClick={() => { setAsk(false); del(); }} style={{ ...BTN, height: "30px", padding: "0 12px", borderRadius: "6px", background: "var(--crm-oxblood)", color: "#fff", font: "500 12px Inter, sans-serif" }}>Delete</button>
          </span>
        </span>
      </>)}
    </span>
  );
}

/** Remarks with a B button (2026-10-29: "remarks 可以加粗体字"): the words picked go **bold** — drawn bold where sales see them. */
function RemarksBox({ value, set }: { value: string; set: (e: { target: { value: string } }) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const bold = () => {
    const el = ref.current; if (!el) return;
    const w = wrapBold(value, el.selectionStart ?? value.length, el.selectionEnd ?? value.length);
    set({ target: { value: w.value } });
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(w.start, w.end); });
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "4px 6px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
        <button type="button" onMouseDown={e => e.preventDefault()} onClick={bold} title="Bold the words picked" aria-label="Bold" style={{ ...BTN, width: "26px", height: "24px", borderRadius: "5px", display: "grid", placeItems: "center", font: "700 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-row">B</button>
        <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>Pick words, then B</span>
      </div>
      <textarea ref={ref} value={value} onChange={set} aria-label="Remarks" placeholder="Parking, which lift, what to show first…" rows={3} style={{ minHeight: "72px", padding: "10px 12px", border: 0, boxSizing: "border-box",
        font: "400 13px/1.5 Inter, sans-serif", color: "var(--crm-ink-soft)", resize: "vertical", outline: "none", background: "#fff" }} />
      {/\*\*[^*\n]+?\*\*/.test(value) && <div style={{ padding: "8px 12px", borderTop: "1px solid var(--crm-rule-soft)", font: "400 12.5px/1.5 Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere", background: "var(--crm-sel)" }}>{boldRuns(value)}</div>}
    </div>
  );
}

interface RoomsBits {
  srPage: "rooms" | "types"; at: ReturnType<typeof apptTypesVM>;
  sr4: {
    has: boolean; isNew: boolean; pager: { at: number; n: number; prev: () => void; next: () => void; prevOff: boolean; nextOff: boolean }; add: () => void;
    name: string; setName: (e: { target: { value: string } }) => void; addr: string; setAddr: (e: { target: { value: string } }) => void; links: { g: string; w: string };
    limit: number; down: () => void; up: () => void; closures: { when: string; sub: string; remove: () => void }[];
    grid: { label: string; cells: { on: boolean; toggle: () => void }[] }[]; dirty: boolean;
    hours: { all: { f: string; t: string; apply: (f: number, t: number) => void }; days: { l: string; open: boolean; f: string; t: string; set: (f: number, t: number) => void; toggle: () => void }[] };
    remarks: string; setRemarks: (e: { target: { value: string } }) => void; canDelete: boolean; del: () => void;
    keys?: { on: boolean; can: boolean; toggle: () => void };
    move?: { can: boolean; earlier: () => void; later: () => void; earlierOff: boolean; laterOff: boolean };
  };
  srBlkOpen: boolean; srBlkToggle: () => void; srBlk: { from: string; to: string; reason: string };
  srBlkFrom: (e: { target: { value: string } }) => void; srBlkTo: (e: { target: { value: string } }) => void; srBlkReason: (e: { target: { value: string } }) => void;
  srTimeModes: { label: string; pick: () => void; fg: string }[]; srPickTime: boolean;
  srRanges: { f: string; t: string; fromHours: { v: string }[]; toHours: { v: string }[]; setF: (e: { target: { value: string } }) => void; setT: (e: { target: { value: string } }) => void; remove: () => void }[];
  srAddRange: () => void; srDtAdd: () => void; srDtNoAdd: boolean;
  srBlkDays: { l: string; bg: string; fg: string; toggle: () => void }[];
  srLinkModes: { label: string; pick: () => void; fg: string }[];
  srE: { manual: boolean; linkFields: { ch: string; ph: string; v: string; set: (e: { target: { value: string } }) => void }[]; photo: string; noPhoto: boolean };
  srSetPhoto: (e: { target: { files: FileList | null } }) => void; srRemovePhoto: () => void;
}
const FIELD: CSSProperties = { height: "32px", padding: "0 8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "6px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)", background: "#fff" };

/** Frame 07 · Showrooms: one at a time — its name and address typed in place, the map links, visits per slot, closures — and the weekly slots, 24 × 7. */
export function DeskShowrooms4a({ v }: { v: RoomsBits }) {
  // Before the Appointment types page's return: every render calls the same hooks (react-hooks/rules-of-hooks).
  const [more, setMore] = useState(false);
  const paint = useRef<boolean | null>(null);
  if (v.srPage === "types") return <DeskApptTypes v={v.at} />;
  const S = v.sr4;
  const round = (off: boolean): CSSProperties => ({ ...BTN, width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: off ? "var(--crm-faint-2)" : "var(--crm-ink)" });
  if (!S.has) return (
    <div style={{ padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div style={{ font: "500 15px Inter, sans-serif", color: "var(--crm-ink)" }}>No showroom yet</div>
      <button type="button" onClick={S.add} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", background: "var(--crm-rust)", color: "#fff", font: "500 13px Inter, sans-serif" }} className="crm4a-primary">Add a showroom</button>
    </div>
  );
  return (
    <div style={{ display: "flex", minHeight: "100%", margin: "-16px -36px -32px" }}>
      <div style={{ width: "420px", flex: "none", padding: "20px 28px 24px 36px", display: "flex", flexDirection: "column", boxSizing: "border-box", borderRight: "1px solid var(--crm-rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button type="button" onClick={S.pager.prev} disabled={S.pager.prevOff} title="Previous showroom" style={round(S.pager.prevOff)}><Ic name="chevron-left" size={14} /></button>
          <span style={{ font: "500 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{S.pager.at} / {S.pager.n}</span>
          <button type="button" onClick={S.pager.next} disabled={S.pager.nextOff} title="Next showroom" style={round(S.pager.nextOff)}><Ic name="chevron-right" size={14} /></button>
          {S.move?.can && (
            <span title="Move this showroom in the list" style={{ marginLeft: "10px", display: "flex", alignItems: "center", gap: "2px", font: "500 11px Inter, sans-serif", color: "var(--crm-muted)" }}>
              Order
              <button type="button" onClick={S.move.earlier} disabled={S.move.earlierOff} title="Move earlier" aria-label="Move earlier" style={{ ...BTN, width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", color: S.move.earlierOff ? "var(--crm-faint-2)" : "var(--crm-ink)" }}><Ic name="arrow-left" size={13} /></button>
              <button type="button" onClick={S.move.later} disabled={S.move.laterOff} title="Move later" aria-label="Move later" style={{ ...BTN, width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", color: S.move.laterOff ? "var(--crm-faint-2)" : "var(--crm-ink)" }}><Ic name="arrow-right" size={13} /></button>
            </span>
          )}
          <button type="button" onClick={S.add} title="Add showroom" aria-label="Add showroom" style={{ ...BTN, marginLeft: "auto", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary"><Ic name="plus" size={16} /></button>
          {S.canDelete && <DeleteRoom name={S.name} del={S.del} />}
        </div>
        <input value={S.name} onChange={S.setName} placeholder="Showroom name" aria-label="Showroom name" style={{ marginTop: "20px", width: "100%", border: 0, outline: "none", padding: 0, background: "transparent",
          font: `500 26px ${TIGHT}`, letterSpacing: "-0.02em", color: "var(--crm-ink)" }} />
        {/* The address as a field of its own, seen and changed in place (the owner, 2026-10-27: "能不能有个可以看到我输入地址，可修改的地方？" —
            it was a borderless box the page drew blank). It is the visit card's location and the maps links' search. */}
        <label style={{ display: "block", marginTop: "14px", font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>
          Address
          <textarea value={S.addr} onChange={S.setAddr} placeholder="Type the showroom's address" aria-label="Address" rows={3}
            style={{ ...FIELD, display: "block", marginTop: "6px", width: "100%", height: "auto", minHeight: "64px", padding: "8px 10px", resize: "vertical",
              font: "400 13px/1.5 Inter, sans-serif" }} />
        </label>
        <div style={{ display: "flex", gap: "16px", marginTop: "6px", font: "500 13px Inter, sans-serif" }}>
          {([["Google Maps", S.links.g], ["Waze", S.links.w]] as const).map(([l, u]) => u
            ? <a key={l} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--crm-ink)", textDecoration: "underline", textUnderlineOffset: "3px" }}>{l}<Ic name="external-link" size={12} /></a>
            : <span key={l} style={{ color: "var(--crm-faint-2)" }}>{l}</span>)}
          <button type="button" onClick={() => setMore(o => !o)} style={{ ...BTN, marginLeft: "auto", font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{more ? "Hide links & photo" : "Links & photo"}</button>
        </div>
        {more && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "12px", padding: "12px", borderRadius: "10px", background: "var(--crm-field)" }}>
            <div style={{ display: "flex", gap: "6px" }}>{v.srLinkModes.map(m => <button key={m.label} type="button" onClick={() => { if (!S.dirty) S.setName({ target: { value: S.name } }); m.pick(); }} style={{ ...BTN, height: "28px", padding: "0 10px", borderRadius: "6px", font: "500 12px Inter, sans-serif", background: m.fg === "var(--crm-ink)" ? "#fff" : "transparent", color: m.fg }}>{m.label}</button>)}</div>
            {S.dirty && v.srE.manual && v.srE.linkFields.map(f => <input key={f.ch} value={f.v} onChange={f.set} placeholder={f.ph} aria-label={f.ch === "G" ? "Google Maps link" : "Waze link"} style={{ ...FIELD, width: "100%" }} />)}
            {S.dirty && (v.srE.noPhoto
              ? <label style={{ ...BTN, alignSelf: "flex-start", height: "30px", padding: "0 12px", borderRadius: "6px", display: "flex", alignItems: "center", gap: "6px", font: "500 12px Inter, sans-serif", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}>
                  <Ic name="image" size={13} />Add a photo<input type="file" accept="image/*" onChange={v.srSetPhoto} style={{ display: "none" }} /></label>
              : <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={v.srE.photo} alt="" style={{ width: "56px", height: "40px", objectFit: "cover", borderRadius: "6px" }} />
                  <button type="button" onClick={v.srRemovePhoto} style={{ ...BTN, font: "500 12px Inter, sans-serif", color: "var(--crm-oxblood)" }}>Remove photo</button></div>)}
          </div>
        )}
        <div style={{ height: "1px", background: "var(--crm-rule)", margin: "22px 0 18px" }} />
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Visits per slot</span>
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Each slot is one hour</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", height: "36px", border: "1px solid var(--crm-line)", borderRadius: "7px" }}>
            <button type="button" onClick={S.down} aria-label="Fewer" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink-soft)" }}>−</button>
            <span style={{ width: "28px", textAlign: "center", font: `500 15px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{S.limit}</span>
            <button type="button" onClick={S.up} aria-label="More" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink-soft)" }}>+</button>
          </div>
        </div>
        {S.keys?.can && (<>
          <div style={{ height: "1px", background: "var(--crm-rule)", margin: "18px 0 16px" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Key handover</span>
              <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Sales photo the key collected and returned in the app</span>
            </div>
            <button type="button" role="switch" aria-checked={S.keys.on} aria-label="Key handover" onClick={S.keys.toggle} style={{ ...BTN, marginLeft: "auto", width: "40px", height: "22px", borderRadius: "11px", position: "relative", flex: "none", background: S.keys.on ? "var(--crm-rust)" : "var(--crm-line)", transition: "background 150ms" }}>
              <span style={{ position: "absolute", top: "3px", left: S.keys.on ? "21px" : "3px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", transition: "left 150ms" }} />
            </button>
          </div>
        </>)}
        <div style={{ height: "1px", background: "var(--crm-rule)", margin: "18px 0 16px" }} />
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Closures</span>
          <button type="button" onClick={v.srBlkToggle} style={{ ...BTN, marginLeft: "auto", font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>{v.srBlkOpen ? "Close" : "Add closure"}</button>
        </div>
        {v.srBlkOpen && (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "12px", padding: "12px", borderRadius: "10px", background: "var(--crm-field)" }}>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>
              <input type="date" value={v.srBlk.from} onChange={v.srBlkFrom} aria-label="From" style={{ ...FIELD, flex: 1 }} />–<input type="date" value={v.srBlk.to} onChange={v.srBlkTo} aria-label="To" style={{ ...FIELD, flex: 1 }} />
            </div>
            <div style={{ display: "flex", gap: "6px" }}>{v.srTimeModes.map(m => <button key={m.label} type="button" onClick={m.pick} style={{ ...BTN, height: "28px", padding: "0 10px", borderRadius: "6px", font: "500 12px Inter, sans-serif", background: m.fg === "var(--crm-ink)" ? "#fff" : "transparent", color: m.fg }}>{m.label}</button>)}</div>
            {v.srPickTime && v.srRanges.map((r, i) => (
              <div key={i} style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <select value={r.f} onChange={r.setF} aria-label="From time" style={{ ...FIELD, flex: 1 }}>{r.fromHours.map(h => <option key={h.v}>{h.v}</option>)}</select>–
                <select value={r.t} onChange={r.setT} aria-label="To time" style={{ ...FIELD, flex: 1 }}>{r.toHours.map(h => <option key={h.v}>{h.v}</option>)}</select>
                <button type="button" onClick={r.remove} aria-label="Remove" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={13} /></button>
              </div>
            ))}
            {v.srPickTime && <button type="button" onClick={v.srAddRange} style={{ ...BTN, alignSelf: "flex-start", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>+ Add a time</button>}
            <input value={v.srBlk.reason} onChange={v.srBlkReason} placeholder="Reason (optional)" style={{ ...FIELD, width: "100%" }} />
            <button type="button" onClick={v.srDtAdd} disabled={v.srDtNoAdd} style={{ ...BTN, alignSelf: "flex-start", height: "30px", padding: "0 14px", borderRadius: "6px", font: "500 12px Inter, sans-serif",
              background: v.srDtNoAdd ? "var(--crm-line)" : "var(--crm-rust)", color: "#fff" }}>Add closure</button>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingTop: "4px", borderTop: "1px solid var(--crm-line)" }}>
              <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Closed every week on</span>
              <div style={{ display: "flex", gap: "4px" }}>{v.srBlkDays.map(dd => <button key={dd.l} type="button" onClick={dd.toggle} style={{ ...BTN, flex: 1, height: "28px", borderRadius: "6px", textAlign: "center", font: "500 11px Inter, sans-serif", background: dd.bg, color: dd.fg, border: "1px solid var(--crm-line)" }}>{dd.l}</button>)}</div>
            </div>
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "8px" }}>
          {S.closures.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 0", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <span style={{ display: "flex", color: "var(--crm-oxblood)" }}><Ic name="calendar-x" size={16} /></span>
              <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{c.when}</span>
                <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{c.sub}</span>
              </span>
              <button type="button" onClick={c.remove} aria-label="Remove closure" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>
            </div>
          ))}
          {!S.closures.length && !v.srBlkOpen && <span style={{ padding: "12px 0", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>No closures</span>}
        </div>
        {/* v2 frame 07 (note 04): opening hours typed in — All days + Apply to all, then each day; the grid shows the same. */}
        <div style={{ height: "1px", background: "var(--crm-rule)", margin: "20px 0" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <div style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Opening hours</div>
            <div style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Type, or drag on the grid</div>
          </div>
          <AllDaysHours f={S.hours.all.f} t={S.hours.all.t} apply={S.hours.all.apply} />
          {S.hours.days.map(d => <DayHours key={d.l} d={d} />)}
        </div>
        <div style={{ height: "1px", background: "var(--crm-rule)", margin: "20px 0" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Remarks</div>
            <span style={{ height: "20px", padding: "0 8px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--crm-tint-lost)", color: "var(--crm-muted)", font: "500 11px Inter, sans-serif" }}><Ic name="lock" size={10} />Staff only</span>
          </div>
          <RemarksBox value={S.remarks} set={S.setRemarks} />
          <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>Customers never see this. It shows to sales when they book a visit here.</div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0, padding: "20px 36px 32px 28px", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", paddingBottom: "14px" }}>
          <span style={{ font: `500 16px ${TIGHT}`, color: "var(--crm-ink)" }}>Weekly slots</span>
          <span style={{ marginLeft: "auto", display: "flex", gap: "14px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--crm-brown)" }} />Open</span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}><span style={{ width: "10px", height: "10px", borderRadius: "2px", background: "var(--crm-rule-soft)" }} />Closed</span>
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "44px repeat(7,minmax(0,1fr))", columnGap: "4px", rowGap: "4px" }}>
          <span />
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(dw => <span key={dw} style={{ textAlign: "center", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", paddingBottom: "2px" }}>{dw}</span>)}
          {S.grid.map((row, h) => (<Fragment key={h}>
            <span style={{ font: "400 10px Inter, sans-serif", color: "var(--crm-faint)", lineHeight: "20px" }}>{row.label}</span>
            {row.cells.map((c, di) => <button key={di} type="button" aria-pressed={c.on} title={c.on ? "Open — tap or drag to close" : "Closed — tap or drag to open"}
              // Drag across the grid to open or close many hours at once (the head says so — it only took taps; the owner,
              // 2026-10-29: "无法拉动/根本不灵敏"): the first cell decides open or close, every cell passed takes the same.
              onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); paint.current = !c.on; c.toggle(); const up = () => { paint.current = null; window.removeEventListener("pointerup", up); }; window.addEventListener("pointerup", up); }}
              onPointerEnter={() => { if (paint.current !== null && c.on !== paint.current) c.toggle(); }}
              onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.toggle(); } }}
              style={{ ...BTN, height: "20px", borderRadius: "3px", touchAction: "none", background: c.on ? "var(--crm-brown)" : "var(--crm-rule-soft)" }} />)}
          </Fragment>))}
        </div>
      </div>
    </div>
  );
}

interface ChRow { title: string; sub: string; linked: boolean; act: () => void; actLabel: string }
interface ChannelsBits {
  ch4: {
    cards: { number: string; label: string; route: string; edit: () => void; wa: ChRow; page: ChRow }[];
    loose: (ChRow & { id: string })[]; n: number; newTemplate: () => void; profile: ProfileDrawerV | null;
    tpls: { name: string; body: string; cat: string; lang: string; st: string; dot: string; fg: string }[];
  };
}
function ChannelRow({ r, wa }: { r: ChRow; wa: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px 14px 66px", borderTop: "1px solid var(--crm-rule-soft)" }}>
      <span style={{ display: "flex", color: r.linked ? (wa ? "var(--crm-whatsapp)" : "var(--crm-messenger)") : "var(--crm-faint-2)" }}><Ic name={wa ? "phone" : "message-circle"} size={16} /></span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
        <span style={{ font: "500 13px Inter, sans-serif", color: r.linked ? "var(--crm-ink)" : "var(--crm-muted)" }}>{r.title}</span>
        <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>{r.sub}</span>
      </span>
      <span style={{ display: "flex", alignItems: "center", gap: "6px", font: "400 12px Inter, sans-serif", color: r.linked ? "var(--crm-ink)" : "var(--crm-muted)", whiteSpace: "nowrap" }}>
        <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.linked ? "var(--crm-brown)" : "var(--crm-faint-2)" }} />{r.linked ? "Connected" : "Not linked"}
      </span>
      <button type="button" onClick={r.act} style={{ ...BTN, height: "28px", padding: "0 12px", borderRadius: "6px", font: "500 12px Inter, sans-serif", whiteSpace: "nowrap",
        ...(r.linked ? { border: "1px solid var(--crm-line)", color: "var(--crm-ink)" } : { background: "var(--crm-rust)", color: "#fff" }) }} className={r.linked ? "crm4a-outline" : "crm4a-primary"}>{r.actLabel}</button>
    </div>
  );
}

/** Frame 09 · Channels › Connections: every phone number with the WhatsApp Business and Facebook Page it routes, and the message templates beside them. */
export function DeskChannels4a({ v }: { v: ChannelsBits }) {
  const C4 = v.ch4;
  const Card = ({ head, children }: { head: ReactNode; children: ReactNode }) => (
    <div style={{ border: "1px solid var(--crm-line)", borderRadius: "10px", overflow: "hidden" }}>{head}{children}</div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "40px", alignItems: "start" }}>
      {C4.profile && <DeskProfileDrawer key={C4.profile.key} v={C4.profile} verticals={WA_VERTICALS} />}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "16px", paddingBottom: "12px", borderBottom: "1px solid var(--crm-ink)" }}>
          <span style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Phone numbers</span>
          <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{C4.n} {C4.n === 1 ? "number" : "numbers"} · each links its own WhatsApp and Facebook</span>
        </div>
        {C4.cards.map(c => (
          <Card key={c.number} head={
            <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", background: "var(--crm-cream)" }}>
              <span style={{ width: "36px", height: "36px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-ink)", color: "#fff" }}><Ic name="phone" size={16} /></span>
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ font: `500 18px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{c.number}</span>
                <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{c.label} · {c.route}</span>
              </span>
              <button type="button" onClick={c.edit} style={{ ...BTN, height: "30px", padding: "0 12px", borderRadius: "6px", font: "500 12px Inter, sans-serif", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }} className="crm4a-outline">Edit</button>
            </div>}>
            <ChannelRow r={c.wa} wa />
            <ChannelRow r={c.page} wa={false} />
          </Card>
        ))}
        {C4.loose.length > 0 && (
          <Card head={<div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 18px", background: "var(--crm-cream)" }}>
            <span style={{ width: "36px", height: "36px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-faint-2)", color: "#fff" }}><Ic name="message-circle" size={16} /></span>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>No number</span>
              <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Pages whose listed phone is none of these numbers</span></span></div>}>
            {C4.loose.map(p => <ChannelRow key={p.id} r={p} wa={false} />)}
          </Card>
        )}
        {!C4.cards.length && !C4.loose.length && <div style={{ padding: "24px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No WhatsApp number or Facebook Page read from Meta yet.</div>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", paddingBottom: "12px", borderBottom: "1px solid var(--crm-ink)" }}>
          <span style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>Message templates</span>
          <button type="button" onClick={C4.newTemplate} style={{ ...BTN, marginLeft: "auto", font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>New template</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.9fr) minmax(0,0.8fr) minmax(0,0.8fr)", gap: "12px", padding: "10px 0", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em",
          textTransform: "uppercase", color: "var(--crm-faint)", borderBottom: "1px solid var(--crm-rule)" }}><span>Name</span><span>Category</span><span>Language</span><span style={{ textAlign: "right" }}>Status</span></div>
        {C4.tpls.map(t => (
          <div key={t.name + t.lang} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(0,0.9fr) minmax(0,0.8fr) minmax(0,0.8fr)", gap: "12px", alignItems: "center", minHeight: "50px", padding: "6px 0", boxSizing: "border-box",
            borderBottom: "1px solid var(--crm-rule-soft)", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
              {t.body && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.body}</span>}</span>
            <span style={{ color: "var(--crm-ink-soft)" }}>{t.cat}</span><span style={{ color: "var(--crm-ink-soft)" }}>{t.lang}</span>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "6px", color: t.fg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.dot }} />{t.st}</span>
          </div>
        ))}
        {!C4.tpls.length && <div style={{ padding: "24px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No templates read from Meta yet.</div>}
      </div>
    </div>
  );
}

type SetKey = "replySoonH" | "replyUrgentH" | "replyOverdueH" | "suggestTemplate" | "autoAssign" | "pushMessages" | "reminders" | "teamAlerts" | "sendAutoReply";
interface SetVals { replySoonH: number; replyUrgentH: number; replyOverdueH: number; suggestTemplate: boolean; autoAssign: boolean; pushMessages: boolean; reminders: boolean; teamAlerts: boolean; sendAutoReply: boolean }
interface SettingsBits {
  set4: { title: string; sub: string; rows: { t: string; s: string; v: string; key?: SetKey }[] }[];
  settings4: { can: boolean; cur: SetVals; save: (st: SetVals) => Promise<boolean> };
}
const HOUR_KEYS: SetKey[] = ["replySoonH", "replyUrgentH", "replyOverdueH"];
/**
 * Frame 10 · Settings › General: two columns of groups in the frame's rows. A stored setting (Reply soon · Urgent ·
 * Overdue, Suggest a template, Auto-assign, Push for new messages, Reminders — mig 20261018100000) is a stepper or a
 * switch for CRM · Manage; the rest keep
 * the frame's locked row (a padlock and the value). Any change brings up Cancel / Save changes, as Showrooms.
 */
export function DeskSettings4a({ v }: { v: SettingsBits }) {
  const S = v.settings4;
  const [draft, setDraft] = useState<SetVals | null>(null);
  const [busy, setBusy] = useState(false);
  const d = draft ?? S.cur;
  const dirty = !!draft && (Object.keys(S.cur) as SetKey[]).some(k => draft[k] !== S.cur[k]);
  const rising = d.replySoonH >= 1 && d.replyUrgentH > d.replySoonH && d.replyOverdueH > d.replyUrgentH && d.replyOverdueH <= 24;
  const put = (k: SetKey, val: number | boolean) => setDraft({ ...d, [k]: val });
  const step = (k: SetKey, by: number) => put(k, Math.min(24, Math.max(1, (d[k] as number) + by)));
  const save = () => { if (!dirty || !rising || busy) return; setBusy(true); void S.save(d).then(ok => { setBusy(false); if (ok) setDraft(null); }); };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: "48px", rowGap: "32px", alignItems: "start" }}>
        {v.set4.map(g => (
          <div key={g.title} style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingBottom: "10px", borderBottom: "1px solid var(--crm-ink)" }}>
              <span style={{ font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>{g.title}</span>
              <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{g.sub}</span>
            </div>
            {g.rows.map(r => {
              const k = r.key, edit = !!k && S.can, hours = !!k && HOUR_KEYS.includes(k);
              return (
                <div key={r.t} style={{ display: "flex", alignItems: "center", gap: "16px", minHeight: "58px", padding: "8px 0", boxSizing: "border-box", borderBottom: "1px solid var(--crm-rule-soft)" }}>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                    <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{r.t}</span>
                    <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{r.s}</span>
                  </span>
                  {!edit ? (
                    <span title={k ? "Only CRM · Manage changes this" : "Fixed in the CRM"} style={{ display: "flex", alignItems: "center", gap: "5px", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>
                      <Ic name="lock" size={13} />{r.v}
                    </span>
                  ) : hours ? (
                    // v2 frame 10: the hours typed in an 84 px box, the unit inside (as Split's boxes).
                    <label style={{ width: "84px", height: "34px", padding: "0 10px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "3px", boxSizing: "border-box",
                      border: `1px solid ${rising ? "var(--crm-line)" : "var(--crm-oxblood)"}`, background: "#fff", font: `500 14px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
                      <input type="text" inputMode="numeric" value={String(d[k!] as number)} aria-label={`${r.t} hours`}
                        onChange={e => { const n = parseInt(e.target.value.replace(/D/g, ""), 10); if (!Number.isNaN(n)) put(k!, Math.min(24, Math.max(1, n))); }}
                        onKeyDown={e => { if (e.key === "ArrowUp") { e.preventDefault(); step(k!, 1); } if (e.key === "ArrowDown") { e.preventDefault(); step(k!, -1); } }}
                        style={{ width: "100%", minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "inherit", color: "inherit", textAlign: "right" }} />
                      <span style={{ color: "var(--crm-faint)", fontSize: "12px" }}>{k === "replyOverdueH" ? "h+" : "h"}</span>
                    </label>
                  ) : (
                    <button type="button" role="switch" aria-checked={!!d[k!]} aria-label={r.t} onClick={() => put(k!, !d[k!])}
                      style={{ ...BTN, width: "40px", height: "24px", borderRadius: "12px", position: "relative", background: d[k!] ? "var(--crm-rust)" : "var(--crm-line)", transition: "background .15s" }}>
                      <span style={{ position: "absolute", top: "3px", left: d[k!] ? "19px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left .15s" }} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {dirty && (
        <div style={{ position: "sticky", bottom: 0, display: "flex", alignItems: "center", gap: "10px", padding: "14px 0", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>
          <span style={{ flex: 1, font: "400 12px Inter, sans-serif", color: rising ? "var(--crm-muted)" : "var(--crm-oxblood)" }}>
            {!rising ? "Reply soon, Urgent and Overdue must rise, from 1 to 24 hours."
              : !d.autoAssign ? "Auto-assign off: new leads go to nobody and wait in the Team inbox to be sent by hand."
              : !d.pushMessages || !d.reminders ? "Saved for everyone in the CRM — nobody's phone gets what is switched off."
              : "Saved for everyone in the CRM."}
          </span>
          <button type="button" onClick={() => setDraft(null)} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", border: "1px solid var(--crm-line)", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-outline">Cancel</button>
          <button type="button" onClick={save} disabled={!rising || busy} style={{ ...BTN, height: "36px", padding: "0 18px", borderRadius: "7px", font: "500 13px Inter, sans-serif", color: "#fff", background: rising ? "var(--crm-rust)" : "var(--crm-line)", cursor: rising && !busy ? "pointer" : "default" }} className={rising ? "crm4a-primary" : undefined}>{busy ? "Saving…" : "Save changes"}</button>
        </div>
      )}
    </div>
  );
}

interface AuOpt { label: string; on: boolean; pick: () => void }
interface AuditBits {
  auQ: string; setAuQ: (e: { target: { value: string } }) => void; auEmpty: boolean; auClear: () => void;
  au4: { open: "who" | "area" | "per" | null; toggle: (k: "who" | "area" | "per") => void; close: () => void; whoLabel: string; areaLabel: string; perLabel: string;
    who: AuOpt[]; areas: AuOpt[]; pers: AuOpt[];
    rows: { time: string; day: string; who: string; sys: boolean; area: string; change: string; before: string; after: string }[] };
}
const AU_COLS = "111px 130px 111px 224px minmax(0,1fr)";
/** Frame 11 · Audit log: a search, Everyone / All areas / Last 7 days, and the table When · Who · Area · Change · Before → after. */
export function DeskAudit4a({ v }: { v: AuditBits }) {
  const A = v.au4;
  const Menu = ({ k, label, opts }: { k: "who" | "area" | "per"; label: string; opts: AuOpt[] }) => (
    <span style={{ position: "relative" }}>
      <button type="button" onClick={() => A.toggle(k)} style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 12px", borderRadius: "8px", border: "1px solid var(--crm-line)", background: "#fff", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap" }} className="crm4a-outline">
        {label}<Ic name="chevron-down" size={14} />
      </button>
      {A.open === k && (<>
        <span onClick={A.close} style={{ position: "fixed", inset: 0, zIndex: 7 }} />
        <span style={{ position: "absolute", top: "40px", left: 0, zIndex: 8, minWidth: "180px", maxHeight: "320px", overflowY: "auto", padding: "4px", background: "#fff", border: "1px solid var(--crm-line)", borderRadius: "10px", boxShadow: "var(--crm-shadow-pop, 0 10px 30px rgba(42,22,12,.14))", display: "flex", flexDirection: "column" }}>
          {opts.map(o => (
            <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px", borderRadius: "6px", font: `${o.on ? 600 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: o.on ? "var(--crm-cream-nav)" : "transparent", whiteSpace: "nowrap" }} className="crm4a-row">
              <span style={{ flex: 1 }}>{o.label}</span>{o.on && <Ic name="check" size={14} />}
            </button>
          ))}
        </span>
      </>)}
    </span>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ display: "flex", alignItems: "center", gap: "8px", width: "260px", height: "36px", padding: "0 12px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", color: "var(--crm-faint)" }}>
          <Ic name="search" size={15} />
          <input type="text" value={v.auQ} onChange={v.setAuQ} placeholder="Search changes" style={{ flex: 1, minWidth: 0, border: 0, background: "transparent", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", outline: "none" }} />
        </span>
        <Menu k="who" label={A.whoLabel} opts={A.who} />
        <Menu k="area" label={A.areaLabel} opts={A.areas} />
        <Menu k="per" label={A.perLabel} opts={A.pers} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", borderTop: "1px solid var(--crm-ink)" }}>
        <div style={{ display: "grid", gridTemplateColumns: AU_COLS, alignItems: "center", height: "42px", padding: "0 12px", background: "var(--crm-cream-nav)", borderBottom: "1px solid var(--crm-rule)", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-muted)" }}>
          <span>When</span><span>Who</span><span>Area</span><span>Change</span><span>Before → after</span>
        </div>
        {A.rows.map((r, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: AU_COLS, alignItems: "center", minHeight: "50px", padding: "6px 12px", boxSizing: "border-box", borderBottom: "1px solid var(--crm-rule-soft)", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
            <span style={{ display: "flex", flexDirection: "column" }}><span style={{ fontVariantNumeric: "tabular-nums" }}>{r.time}</span><span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>{r.day}</span></span>
            <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0, paddingRight: "8px" }}>
              <span style={{ width: "24px", height: "24px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 9px ${TIGHT}`, background: r.sys ? "var(--crm-field)" : avatarTint(r.who)[0], color: r.sys ? "var(--crm-ink-soft)" : avatarTint(r.who)[1] }}>{r.sys ? "S" : r.who.split(/\s+/).map(w => w[0] ?? "").join("").slice(0, 2).toUpperCase()}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</span>
            </span>
            <span style={{ color: "var(--crm-ink-soft)" }}>{r.area}</span>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", paddingRight: "12px" }}>{r.change}</span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
              <span style={{ color: "var(--crm-faint)", textDecoration: r.before === "—" ? "none" : "line-through", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45%" }}>{r.before}</span>
              <Ic name="chevron-right" size={12} style={{ color: "var(--crm-faint)", flex: "none" }} />
              <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.after}</span>
            </span>
          </div>
        ))}
        {v.auEmpty && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", padding: "48px 20px", textAlign: "center" }}>
            <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>Nothing recorded under this filter</span>
            <button type="button" onClick={v.auClear} style={{ ...BTN, font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>Clear filters</button>
          </div>
        )}
      </div>
    </div>
  );
}

type FormBits = Pick<ReturnType<typeof import("./vm/formpage").formPageVM>, "cfPages" | "cfSecs" | "cfDirty" | "cfReset" | "cfDevs" | "cfDesk" | "cfDragEnd" | "cfForms">;
const Switch = ({ on, act, locked }: { on: boolean; act?: () => void; locked?: boolean }) => (
  <span role="switch" aria-checked={on} onClick={locked ? undefined : act} style={{ position: "relative", width: "30px", height: "18px", flex: "none", borderRadius: "9px", background: on ? "var(--crm-rust)" : "var(--crm-track)", cursor: locked ? "default" : "pointer", opacity: locked ? 0.6 : 1, transition: "background .15s" }}>
    <span style={{ position: "absolute", top: "2px", left: on ? "14px" : "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left .15s" }} />
  </span>
);
const CHIP: CSSProperties = { flex: "none", maxWidth: "88px", boxSizing: "border-box", padding: "3px 8px", borderRadius: "4px", background: "var(--crm-field)", font: "500 11px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const CF_FIELD: CSSProperties = { height: "34px", boxSizing: "border-box", padding: "0 10px", border: "1px solid var(--crm-line)", borderRadius: "6px", background: "#fff", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)", outline: "none" };
const CF_LABEL: CSSProperties = { display: "flex", flexDirection: "column", gap: "4px", font: "500 11px Inter, sans-serif", color: "var(--crm-muted)" };
const CF_KICK: CSSProperties = { font: "500 10.5px Inter, sans-serif", letterSpacing: "0.1em", color: "var(--crm-faint)" };
/**
 * Frame 08 · Customer form: the pages down the left, the open page's sections and fields in the middle (a field opens
 * to its editor on its chevron), the live preview on the right. Appearance only — every control is vm/formpage.ts's,
 * as before (pages, sections and fields dragged, rename, add, delete, answer type, choices, Required, Discard).
 */
export function DeskForm4a({ v, preview }: { v: FormBits; preview: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const P = v.cfPages;
  return (
    <div onDragEnd={v.cfDragEnd} style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "242px minmax(0,1fr) 340px" }}>
      <div style={{ padding: "18px 16px 24px 36px", borderRight: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", gap: "4px", overflowY: "auto" }}>
        {/* v2 frame 08: the form picker — several forms kept, the first in use; Duplicate and Delete beside it. */}
        <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)", paddingBottom: "8px" }}>Form</span>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "16px", marginBottom: "14px", borderBottom: "1px solid var(--crm-rule)" }}>
          <label style={{ position: "relative", flex: 1, minWidth: 0, height: "34px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden" }}>
            <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{v.cfForms.list.find(x => x.id === v.cfForms.cur)?.label.replace(/ · in use$/, "") ?? "Customer info"}</span>
            <span style={{ marginLeft: "auto", flex: "none", display: "flex", color: "var(--crm-muted)" }}><Ic name="chevron-down" size={11} /></span>
            <select value={v.cfForms.cur} onChange={v.cfForms.pick} aria-label="Form" style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}>{v.cfForms.list.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <button type="button" onClick={v.cfForms.duplicate} title="Duplicate form" aria-label="Duplicate form" style={{ ...BTN, flex: "none", width: "34px", height: "34px", borderRadius: "7px", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-ink-soft)" }}><Ic name="copy" size={14} /></button>
          <button type="button" onClick={v.cfForms.canDelete ? v.cfForms.askDelete : undefined} title={v.cfForms.deleteTip} aria-label="Delete form" style={{ ...BTN, flex: "none", width: "34px", height: "34px", borderRadius: "7px", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)",
            color: v.cfForms.canDelete ? "var(--crm-oxblood)" : "var(--crm-faint-2)", cursor: v.cfForms.canDelete ? "pointer" : "not-allowed" }}><Ic name="trash-2" size={14} /></button>
        </div>
        {!v.cfForms.inUse && <button type="button" onClick={v.cfForms.setActive} style={{ ...BTN, alignSelf: "flex-start", margin: "-8px 0 14px", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>Set as active</button>}
        {v.cfForms.ask && (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px", margin: "-6px 0 14px", font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
            Delete this form? Answers already given stay on each customer.
            <span style={{ display: "flex", gap: "8px" }}>
              <button type="button" onClick={v.cfForms.askDelete} style={{ ...BTN, height: "28px", padding: "0 10px", borderRadius: "6px", border: "1px solid var(--crm-line)", font: "500 12px Inter, sans-serif" }}>Cancel</button>
              <button type="button" onClick={v.cfForms.del} style={{ ...BTN, height: "28px", padding: "0 10px", borderRadius: "6px", background: "var(--crm-oxblood)", color: "#fff", font: "500 12px Inter, sans-serif" }}>Delete</button>
            </span>
          </div>
        )}
        <span style={{ font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)", paddingBottom: "10px" }}>Pages</span>
        {P.tabs.map(t => (
          <button key={t.num} type="button" onClick={t.pick} onDragOver={t.over} onDrop={t.drop} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 10px", borderRadius: "6px",
            background: t.lit ? "var(--crm-tint-attention)" : t.on ? "var(--crm-cream-nav-active)" : "transparent", outline: t.lit ? "2px dashed var(--crm-rust)" : "none", outlineOffset: "-3px",
            font: `${t.on ? 500 : 400} 14px Inter, sans-serif`, color: "var(--crm-ink)" }} className={t.on ? undefined : "crm4a-nav"}>
            <span style={{ display: "flex", color: "var(--crm-faint-2)" }}><Ic name="grip-vertical" size={13} /></span>
            <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.label}</span>
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>{t.count}</span>
          </button>
        ))}
        <button type="button" onClick={P.addPage} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 10px", font: "500 14px Inter, sans-serif", color: "var(--crm-rust)" }}><Ic name="plus" size={14} />Add page</button>
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "18px", paddingTop: "14px", borderTop: "1px solid var(--crm-rule-soft)" }}>
          <span style={CF_KICK}>PAGE NAME</span>
          <input type="text" value={P.title} onChange={P.setTitle} placeholder="Page name" style={CF_FIELD} />
          <button type="button" onClick={P.addSection} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "32px", font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}><Ic name="plus" size={13} />Add section</button>
          {P.many && <button type="button" onClick={P.remove} disabled={!P.canDelete} title={P.deleteTip} style={{ ...BTN, height: "28px", font: "500 13px Inter, sans-serif", color: P.canDelete ? "var(--crm-oxblood)" : "var(--crm-faint-2)", cursor: P.canDelete ? "pointer" : "not-allowed" }}>Delete page</button>}
          {v.cfDirty && <button type="button" onClick={v.cfReset} style={{ ...BTN, height: "28px", font: "500 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Discard changes</button>}
          {P.dragging && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Drop on a page to move it there</span>}
        </div>
      </div>
      <div style={{ padding: "16px 28px 32px", display: "flex", flexDirection: "column", gap: "28px", overflowY: "auto" }}>
        {v.cfSecs.map((s, si) => (
          <section key={s.anchor} id={s.anchor} onDragOver={s.dragOver} onDrop={s.drop} style={{ display: "flex", flexDirection: "column", opacity: s.op, borderRadius: "6px", boxShadow: s.ring }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", paddingBottom: "8px", borderBottom: "1px solid var(--crm-ink)" }}>
              <span draggable onDragStart={s.grip} title="Drag to move this section" style={{ display: "flex", color: "var(--crm-faint-2)", cursor: "grab" }}><Ic name="grip-vertical" size={14} /></span>
              {s.custom
                ? <input type="text" value={s.title} onChange={s.setTitle} placeholder="Section name" style={{ flex: 1, minWidth: 0, border: 0, padding: 0, background: "transparent", font: `500 18px ${TIGHT}`, color: "var(--crm-ink)", outline: "none" }} />
                : <span style={{ flex: 1, font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>{s.title}</span>}
              <span style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{s.count} {s.count === 1 ? "field" : "fields"}</span>
              <span style={{ width: "56px", textAlign: "right", font: "500 10px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)" }}>Required</span>
              {s.removable && <button type="button" onClick={s.remove} title="Delete section" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>}
            </div>
            {s.autoList.map(a => (
              <div key={a.label} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "53px", padding: "6px 10px", boxSizing: "border-box", borderBottom: "1px solid var(--crm-rule-soft)" }}>
                <span style={{ width: "14px" }} />
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                  <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{a.label}</span>
                  <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Filled by the CRM</span>
                </span>
                <span style={CHIP}>Automatic</span>
                <Switch on={false} locked />                <span style={{ width: "14px" }} />
              </div>
            ))}
            {s.fields.map((f, fi) => { const key = `${si}:${fi}`, isOpen = open === key;
              return (
                <div key={key} data-cf-row onDragOver={f.dragOver} onDrop={f.drop} style={{ display: "flex", flexDirection: "column", opacity: f.op, borderTop: f.bt.startsWith("2px") ? f.bt : undefined, borderBottom: "1px solid var(--crm-rule-soft)", background: isOpen ? "var(--crm-cream-nav)" : undefined }} className={isOpen ? undefined : "crm4a-row"}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "53px", padding: "6px 10px", boxSizing: "border-box" }}>
                    <span draggable onDragStart={f.grip} title="Drag to move" style={{ display: "flex", color: "var(--crm-faint-2)", cursor: "grab" }}><Ic name="grip-vertical" size={14} /></span>
                    <span onClick={() => setOpen(isOpen ? null : key)} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", cursor: "pointer" }}>
                      <span style={{ font: "500 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{f.label || "Untitled field"}</span>
                      <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.hasOpts && f.opts ? f.opts : f.core ? "Always asked" : f.type}</span>
                    </span>
                    <span style={CHIP}>{f.type}</span>
                    <Switch on={f.reqOn} act={f.toggleReq} locked={f.core} />
                    <button type="button" onClick={() => setOpen(isOpen ? null : key)} title={isOpen ? "Close" : "Edit field"} style={{ ...BTN, display: "flex", color: "var(--crm-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-right" size={14} /></button>
                  </div>
                  {isOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px", padding: "2px 34px 14px" }}>
                      <label style={CF_LABEL}>Name<input type="text" value={f.label} onChange={f.setLabel} style={CF_FIELD} data-cf-new-name={f.label === "New field" ? "" : undefined} /></label>
                      <span style={{ ...CF_LABEL, position: "relative" }}>Answer type
                        <button type="button" onClick={f.typeToggle} style={{ ...BTN, ...CF_FIELD, display: "flex", alignItems: "center", border: `1px solid ${f.typeBd}` }}><span style={{ flex: 1 }}>{f.type}</span><Ic name="chevron-down" size={14} /></button>
                        {f.typeOpen && (<>
                          <span onClick={f.typeClose} style={{ position: "fixed", inset: 0, zIndex: 7 }} />
                          <span style={{ position: "absolute", top: "58px", left: 0, right: 0, zIndex: 8, padding: "4px", background: "#fff", border: "1px solid var(--crm-line)", borderRadius: "8px", boxShadow: "0 10px 30px rgba(42,22,12,.14)", display: "flex", flexDirection: "column" }}>
                            {f.types.map(t => <button key={t.t} type="button" onClick={() => { t.pick(); f.typeClose(); }} style={{ ...BTN, display: "flex", alignItems: "center", height: "32px", padding: "0 10px", borderRadius: "6px", background: t.bg, font: `${t.w} 13px Inter, sans-serif`, color: t.fg }} className="crm4a-row"><span style={{ flex: 1 }}>{t.t}</span>{t.on && <Ic name="check" size={13} />}</button>)}
                          </span>
                        </>)}
                      </span>
                      {f.hasOpts && <label style={{ ...CF_LABEL, gridColumn: "1 / -1" }}>Choices · separated by commas<input type="text" value={f.opts} onChange={f.setOpts} style={CF_FIELD} /></label>}
                      <span style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: "14px" }}>
                        <button type="button" onClick={f.up} title="Move up" style={{ ...BTN, display: "flex", color: f.upFg }}><Ic name="arrow-down" size={14} style={{ transform: "rotate(180deg)" }} /></button>
                        <button type="button" onClick={f.down} title="Move down" style={{ ...BTN, display: "flex", color: f.dnFg }}><Ic name="arrow-down" size={14} /></button>
                        <span style={{ flex: 1 }} />
                        {f.core && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Core · always on the form</span>}
                        {f.removable && <button type="button" onClick={f.remove} style={{ ...BTN, display: "flex", alignItems: "center", gap: "6px", font: "500 13px Inter, sans-serif", color: "var(--crm-oxblood)" }}><Ic name="trash-2" size={13} />Remove field</button>}
                      </span>
                    </div>
                  )}
                </div>
              ); })}
            {/* One click adds "New field" and opens its editor, the name ready to type (the owner, 2026-10-18: "add field 没有反应" —
                the words were a text box's placeholder; only its + added). */}
            <button type="button" onClick={() => { s.add("New field"); setOpen(`${si}:${s.fields.length}`); setTimeout(() => { const el = document.querySelector<HTMLInputElement>("[data-cf-new-name]"); el?.focus(); el?.select(); }, 60); }}
              style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 6px", font: "500 14px Inter, sans-serif", color: "var(--crm-rust)" }} className="crm4a-row">
              <Ic name="plus" size={14} />Add field
            </button>
          </section>
        ))}
      </div>
      <div style={{ background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 0 24px", overflow: "hidden" }}>
        <span style={{ ...CF_KICK, display: "flex", gap: "6px", paddingBottom: "16px" }}>
          LIVE PREVIEW ·
          {v.cfDevs.map(d => <button key={d.label} type="button" onClick={d.pick} style={{ ...BTN, font: "inherit", letterSpacing: "inherit", color: d.on ? "var(--crm-ink-soft)" : "var(--crm-faint-2)" }}>{d.label.toUpperCase()}</button>)}
        </span>
        {v.cfDesk
          ? <div style={{ width: "290px", flex: 1, minHeight: 0, overflowY: "auto", background: "#fff", border: "1px solid var(--crm-line)", borderRadius: "10px", padding: "14px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "10px" }}>
              {v.cfSecs.map(s => (
                <div key={s.anchor} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <span style={{ font: `500 14px ${TIGHT}`, color: "var(--crm-ink)" }}>{s.title}</span>
                  {s.pvFields.map(p => (
                    <span key={p.label} style={{ display: "flex", flexDirection: "column", gap: "3px", font: "400 11px Inter, sans-serif", color: "var(--crm-muted)" }}>{p.label}{p.star ? " *" : ""}
                      <span style={{ height: p.isLong ? "48px" : "28px", border: "1px solid var(--crm-line)", borderRadius: "6px", background: p.isAuto ? "var(--crm-field)" : "#fff" }} />
                    </span>
                  ))}
                </div>
              ))}
            </div>
          : <div style={{ width: "270px", height: "560px", boxSizing: "border-box", border: "8px solid var(--crm-deep)", borderRadius: "36px", background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>{preview}</div>}
      </div>
    </div>
  );
}
