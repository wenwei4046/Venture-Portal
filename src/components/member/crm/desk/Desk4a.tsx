"use client";
/**
 * The desktop CRM's 4a frame (2026-10-18, docs/design_handoff_crm_redesign — change list 9, frames 01–11): the Revenue
 * app's sidebar in ink (the CRM row filled rust), the CRM nav on cream, the 56 px top bar and each page's head. Drawn
 * by hand from the frames' markup, placed into the generated DeskApp by tools/crm-design/desk-4a.cjs, and bound to
 * vm/frame4a.ts — the same links, counts, menus and permissions the frame had before.
 */
import { useState, type CSSProperties, type ReactNode } from "react";
import { Ic } from "../shared/icons4a";
import type { Frame4a } from "./vm/frame4a";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box" };
const MODULE_ROWS: [string, string][] = [["finance", "Finance"], ["principal", "Principal"], ["hr", "HR"], ["revenue", "Revenue team"]];

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
  return (<>
    <aside data-rev-side="" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "240px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "2px",
      padding: "22px 12px 18px", background: "var(--crm-ink)", zIndex: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "0 10px 20px" }}>
        <div style={{ width: "30px", height: "30px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 14px ${TIGHT}`, background: "var(--crm-orange)", color: "#FFFFFF" }}>H</div>
        <div style={{ font: `600 15px ${TIGHT}`, letterSpacing: "0.14em", color: "var(--crm-on-light)" }}>HOUZS</div>
      </div>
      {f.revNav.map(n => <RevRow key={n.label} label={n.label} on={n.on} pick={n.pick} badge={n.badge}><Ic name={n.icon} size={17} /></RevRow>)}
      <RevRow label={f.notif.label} on={false} pick={f.notif.pick} badge={f.notif.count}><Ic name="bell" size={17} /></RevRow>
      {f.products && (<>
        <div style={{ padding: "16px 10px 6px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{f.products.group}</div>
        <RevRow label="Product List" on={false} pick={f.products.onOpen} badge=""><Ic name="layout-grid" size={17} /></RevRow>
      </>)}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px", position: "relative" }}>
        {f.modules && (<>
          {mods && (<>
            <div onClick={() => setMods(false)} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
            <div role="menu" aria-label="Switch module" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 8px)", zIndex: 8, padding: "6px", background: "#FFFFFF",
              borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ padding: "6px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>SWITCH MODULE</span>
              {MODULE_ROWS.map(([id, label]) => { const on = id === f.modules!.current;
                return <button key={id} type="button" role="menuitemradio" aria-checked={on} onClick={() => { setMods(false); if (!on) f.modules!.onPick(id); }}
                  style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 8px", borderRadius: "7px", font: "500 13px Inter, sans-serif",
                    color: "var(--crm-ink)", background: on ? "var(--crm-cream)" : "transparent" }}>
                  <span style={{ flex: 1 }}>{label}</span>{on && <Ic name="check" size={15} style={{ color: "var(--crm-rust)" }} />}</button>; })}
            </div>
          </>)}
          <button type="button" aria-label="Switch module" aria-expanded={mods} onClick={() => setMods(o => !o)} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px",
            height: "36px", padding: "0 10px", borderRadius: "7px", font: "500 13px Inter, sans-serif", color: "var(--crm-sidebar-text)", border: "1px solid rgba(255,255,255,.12)" }}>
            <Ic name="layout-grid" size={15} />Revenue<span style={{ marginLeft: "auto", display: "flex" }}><Ic name="chevron-down" size={13} /></span>
          </button>
        </>)}
        {v.meMenuOpen && (<>
          <div onClick={v.closeMeMenu} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
          <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 4px)", zIndex: 8, padding: "6px", background: "#FFFFFF", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)" }}>
            <button type="button" onClick={v.signOutMe} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 8px", borderRadius: "7px",
              font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}><Ic name="x" size={15} />Sign out</button>
          </div>
        </>)}
        <button type="button" onClick={v.toggleMeMenu} title="Profile" style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", padding: "12px 10px 0", borderTop: "1px solid rgba(255,255,255,.08)" }}>
          <span style={{ width: "32px", height: "32px", borderRadius: "50%", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", font: `500 12px ${TIGHT}`,
            background: "var(--crm-on-light)", color: "var(--crm-ink)" }}>{f.account.ini}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
            <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-on-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.account.name}</span>
            <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.account.sub}</span>
          </span>
        </button>
      </div>
    </aside>
    <aside data-crm-nav="" style={{ position: "absolute", left: "240px", top: 0, bottom: 0, width: "237px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "1px",
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
            padding: "0 10px", borderRadius: "7px", position: "relative", font: `${n.on ? 500 : 400} 14px Inter, sans-serif`, background: n.on ? "var(--crm-cream-nav-active)" : "transparent",
            color: n.on ? "var(--crm-ink)" : "var(--crm-ink-soft)" }} className="crm4a-nav">
            <span style={{ position: "absolute", left: "-12px", top: "9px", bottom: "9px", width: "2px", background: n.on ? "var(--crm-orange)" : "transparent" }} />
            <Ic name={n.icon} size={16} /><span>{n.label}</span>
            {n.badge && <span style={{ marginLeft: "auto", minWidth: "20px", height: "18px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center",
              justifyContent: "center", font: `600 10px ${TIGHT}`, background: "var(--crm-rust)", color: "#FFFFFF" }}>{n.badge}</span>}
          </button>
        ))}
      </div>))}
      <button type="button" onClick={v.returnApp} style={{ ...BTN, marginTop: "auto", flex: "none", display: "flex", alignItems: "center", gap: "10px", height: "36px", padding: "0 10px",
        font: "400 13px Inter, sans-serif", color: "var(--crm-ink-soft)" }}><Ic name="chevron-left" size={15} />Back to Revenue app</button>
    </aside>
  </>);
}

function RevRow({ label, on, pick, badge, children }: { label: string; on: boolean; pick: () => void; badge: string; children: ReactNode }) {
  return (
    <button type="button" onClick={pick} aria-current={on ? "page" : undefined} style={{ ...BTN, flex: "none", display: "flex", alignItems: "center", gap: "12px", height: "38px", padding: "0 10px",
      borderRadius: "7px", font: "500 14px Inter, sans-serif", background: on ? "var(--crm-rust)" : "transparent", color: on ? "#FFFFFF" : "var(--crm-sidebar-text)" }}>
      {children}<span>{label}</span>
      {badge && <span style={{ marginLeft: "auto", minWidth: "20px", height: "18px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center",
        justifyContent: "center", font: `600 10px ${TIGHT}`, background: on ? "rgba(255,255,255,.22)" : "var(--crm-rust)", color: "#FFFFFF" }}>{badge}</span>}
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
  return (
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
        <button type="button" onClick={f4.openAlerts} title="CRM alerts: moves, shares, won, lost, overdue 9 h+" style={{ ...BTN, height: "36px", padding: "0 14px", borderRadius: "7px",
          display: "flex", alignItems: "center", gap: "8px", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", whiteSpace: "nowrap", color: "var(--crm-ink)" }} className="crm4a-outline">
          <Ic name="bell" size={15} />CRM alerts
          {f4.alertsN && (<><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "var(--crm-orange)" }} />
            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--crm-oxblood)" }}>{f4.alertsN}</span></>)}
        </button>
        {h.cta && (
          <button type="button" onClick={h.cta.act} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
            font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", background: "var(--crm-rust)", color: "#FFFFFF" }} className="crm4a-primary">
            <Ic name={h.cta.icon} size={15} />{h.cta.label}
          </button>
        )}
      </div>
    </div>
  );
}

interface InsightBits {
  metrics4: { label: string; value: string; unit: string; d: string; deltaColor: string; first: boolean; open: () => void }[];
  teams4: { name: string; sub: string; leads: string; appt: string; apptW: string; show: string; won: string; lost: string; dot: string; person: boolean; open: boolean; pick: () => void }[];
  status4: { label: string; n: number; color: string; text: string; pct: string; open: () => void }[];
  statusTotal: number;
}
const T_COLS = "minmax(0,2.2fr) minmax(0,0.7fr) minmax(0,1.5fr) repeat(3,minmax(0,0.8fr))";

/** Frame 01 · Insight: the cream hero of six figures, Team performance (a team opens to its people) and Leads by status. */
export function DeskInsight4a({ v }: { v: InsightBits }) {
  return (<>
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(6,minmax(0,1fr))", padding: "26px 0", borderRadius: "12px", background: "var(--crm-cream)" }}>
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
          <div style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Click a team to see its people</div>
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
              <span style={{ fontSize: "12px", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>
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
              <div style={{ position: "absolute", top: "42px", left: 0, zIndex: 8, width: "260px", maxHeight: "440px", overflow: "auto", padding: "6px", background: "#FFFFFF", borderRadius: "10px",
                boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ padding: "6px 8px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>SHOW THE INBOX OF</span>
                {v.whoOpts.map((w, i) => w.head
                  ? <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }} />{w.label}</div>
                  : <button key={i} type="button" onClick={w.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "36px", padding: "4px 8px", borderRadius: "7px",
                      font: `${w.sel ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: w.sel ? "var(--crm-cream)" : "transparent" }} className="crm4a-row">
                      {w.isGroup ? <span style={{ width: "24px", display: "grid", placeItems: "center" }}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: w.color }} /></span>
                        : <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 10px ${TIGHT}`, background: w.avBg, color: w.avFg }}>{w.ini}</span>}
                      <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{w.label}</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>{w.n ?? ""}</span>
                      <span style={{ width: "16px", display: "flex", color: "var(--crm-rust)" }}>{w.sel && <Ic name="check" size={14} />}</span>
                    </button>)}
                <div style={{ position: "sticky", bottom: "-6px", display: "flex", gap: "8px", margin: "6px -6px -6px", padding: "8px", background: "#FFFFFF", borderTop: "1px solid var(--crm-rule-soft)" }}>
                  <button type="button" onClick={v.whoClear} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Clear</button>
                  <button type="button" onClick={v.toggleWho} style={{ ...BTN, flex: 1, height: "32px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#FFFFFF" }} className="crm4a-primary">Done</button>
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
            borderTop: "1px solid var(--crm-rule-soft)", background: r.sel ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className={r.sel ? undefined : "crm4a-row"}>
            <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: r.sel ? "var(--crm-orange)" : "transparent" }} />
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
                  font: `600 10px ${TIGHT}`, background: "var(--crm-rust)", color: "#FFFFFF" }}>{r.unread}</span>}
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
  ibCpOpen: boolean; ibCpToggle: () => void;
  ibCp: { audit4: { what: string; detail: string; who: string; time: string; main: boolean; hot: boolean }[] };
  ibBook: () => void; editInfo: () => void;
}

function Strip({ label, icon, bg, onOpen }: { label: string; icon: "user-round" | "history"; bg: string; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} title={`Open ${label}`} style={{ ...BTN, width: "44px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingTop: "20px",
      borderLeft: "1px solid var(--crm-rule)", background: bg }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name={icon} size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", letterSpacing: "0.04em", color: "var(--crm-ink-soft)" }}>{label}</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
}

/** Frames 02 / 02b / 02c · Customer info (white) and this chat's Audit log (#F6E7D8), each folding to a 44 px strip. */
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
              <button type="button" onClick={v.ibBook} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#FFFFFF" }} className="crm4a-primary">Book a visit</button>
              <button type="button" onClick={v.editInfo} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">Edit customer info</button>
            </div>
          </>)}
        </div>
      </aside>
    )}
    {!v.ibCpOpen ? <Strip label="Audit log" icon="history" bg="var(--crm-audit)" onOpen={v.ibCpToggle} /> : (
      <aside style={{ width: "290px", flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", minHeight: 0, borderLeft: "1px solid var(--crm-audit-line)", background: "var(--crm-audit)" }}>
        <button type="button" onClick={v.ibCpToggle} title="Fold the Audit log" style={{ ...BTN, height: "62px", flex: "none", display: "flex", alignItems: "center", gap: "8px", padding: "0 20px", borderBottom: "1px solid var(--crm-audit-line)", color: "var(--crm-ink)" }}>
          <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="history" size={15} /></span>
          <span style={{ font: `500 16px ${TIGHT}` }}>Audit log</span><span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>this chat</span>
          <span style={{ marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", padding: "16px 20px" }}>
          {v.ibNone && <span style={{ padding: "24px 0", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Pick a chat to see its history</span>}
          {v.ibHas && v.ibCp.audit4.map((a, i) => (
            <div key={i} style={{ display: "flex", gap: "12px" }}>
              <div style={{ width: "10px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span style={{ width: "9px", height: "9px", marginTop: "4px", borderRadius: "50%", boxSizing: "border-box", background: a.hot ? "var(--crm-orange)" : a.main ? "var(--crm-rust)" : "#FFFFFF",
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
