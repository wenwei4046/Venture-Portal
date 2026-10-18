"use client";
/**
 * The desktop CRM's 4a frame (2026-10-18, docs/design_handoff_crm_redesign — change list 9, frames 01–11): the Revenue
 * app's sidebar in ink (the CRM row filled rust), the CRM nav on cream, the 56 px top bar and each page's head. Drawn
 * by hand from the frames' markup, placed into the generated DeskApp by tools/crm-design/desk-4a.cjs, and bound to
 * vm/frame4a.ts — the same links, counts, menus and permissions the frame had before.
 */
import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Ic } from "../shared/icons4a";
import { avatarTint } from "../shared/palette";
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
        <div style={{ width: "30px", height: "30px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 14px ${TIGHT}`, background: "var(--crm-orange)", color: "#fff" }}>H</div>
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
            <div role="menu" aria-label="Switch module" style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 8px)", zIndex: 8, padding: "6px", background: "#fff",
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
          <div style={{ position: "absolute", left: 0, right: 0, bottom: "calc(100% - 4px)", zIndex: 8, padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)" }}>
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
              justifyContent: "center", font: `600 10px ${TIGHT}`, background: "var(--crm-rust)", color: "#fff" }}>{n.badge}</span>}
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
      borderRadius: "7px", font: "500 14px Inter, sans-serif", background: on ? "var(--crm-rust)" : "transparent", color: on ? "#fff" : "var(--crm-sidebar-text)" }}>
      {children}<span>{label}</span>
      {badge && <span style={{ marginLeft: "auto", minWidth: "20px", height: "18px", padding: "0 6px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center",
        justifyContent: "center", font: `600 10px ${TIGHT}`, background: on ? "rgba(255,255,255,.22)" : "var(--crm-rust)", color: "#fff" }}>{badge}</span>}
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
        {/* The owner, 2026-10-18: CRM alerts is the bell alone (a dot when there are unread ones). */}
        <button type="button" onClick={f4.openAlerts} title={f4.alertsN ? `CRM alerts · ${f4.alertsN} unread` : "CRM alerts"} aria-label="CRM alerts" style={{ ...BTN, position: "relative", width: "36px", height: "36px", borderRadius: "50%",
          display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }} className="crm4a-outline">
          <Ic name="bell" size={16} />
          {f4.alertsN && <span style={{ position: "absolute", top: "6px", right: "7px", width: "7px", height: "7px", boxSizing: "content-box", borderRadius: "50%", background: "var(--crm-orange)", border: "2px solid #fff" }} />}
        </button>
        {h.cta && (
          <span style={{ position: "relative" }}>
            <button type="button" onClick={h.cta.act} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
              font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">
              <Ic name={h.cta.icon} size={15} />{h.cta.label}
            </button>
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
              {/* No line after a team's name (the owner, 2026-10-18); a person keeps theirs. */}
              {r.person && <span style={{ fontSize: "12px", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.sub}</span>}
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
                      font: `${w.sel ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: w.sel ? "var(--crm-cream)" : "transparent" }} className="crm4a-row">
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
              <button type="button" onClick={v.ibBook} style={{ ...BTN, height: "38px", borderRadius: "7px", textAlign: "center", font: "500 13px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">Book a visit</button>
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
  ppGrid: string; ppDragC: (e: never) => void; ppReset: () => void;
  ppSortCols0: { arrow: string; fg: string; pick: () => void }[];
  ppHead: { label: string; arrow: string; fg: string; pick: () => void; remove: () => void; drag: (e: never) => void }[];
  ppAddOpen: boolean; ppAddToggle: () => void; ppAddClose: () => void; ppAddOpts: { label: string; grp: string; chk: string; toggle: () => void }[];
  ppRows: { ini: string; name: string; phone: string; avBg: string; avFg: string; cells: PpCell[]; on: boolean; open: () => void }[];
  ppHas: boolean; ppEmpty: boolean; ppPagerOn: boolean;
}
const MAIN_FILTERS = ["Status", "Ad", "Salesperson", "Showroom"];

function FilterButton({ f, label }: { f: PpSel; label?: string }) {
  const on = f.value !== "Any";
  return (
    <span style={{ position: "relative", flex: "none" }}>
      <button type="button" onClick={f.toggle} aria-expanded={f.open} style={{ ...BTN, height: "36px", padding: "0 12px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px",
        font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, background: on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className={on ? undefined : "crm4a-outline"}>
        {label ?? f.label}{on && <span style={{ color: "var(--crm-rust)" }}>{f.value}</span>}<Ic name="chevron-down" size={13} />
      </button>
      {f.open && (<>
        <div onClick={f.close} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
        <div style={{ position: "absolute", top: "42px", left: 0, zIndex: 8, minWidth: "200px", maxHeight: "300px", overflow: "auto", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "1px" }}>
          {f.opts.map(o => (
            <button key={o.v} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 10px", borderRadius: "7px", font: `${o.on ? 500 : 400} 13px Inter, sans-serif`,
              background: o.on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">
              <span style={{ width: "14px", display: "flex", color: "var(--crm-rust)" }}>{o.on && <Ic name="check" size={14} />}</span>
              <span style={{ flex: 1 }}>{o.v}</span><span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{o.n}</span>
            </button>
          ))}
        </div>
      </>)}
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
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", marginTop: "10px" }}>
          {v.ppChips.map(c => <button key={c.label} type="button" onClick={c.clear} style={{ ...BTN, height: "26px", padding: "0 10px", borderRadius: "13px", display: "flex", alignItems: "center", gap: "6px",
            font: "500 12px Inter, sans-serif", background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{c.label}<Ic name="x" size={11} /></button>)}
          <button type="button" onClick={v.ppClear} style={{ ...BTN, padding: "0 4px", font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Clear all</button>
        </div>
      )}
      {v.ppHas && (
        <div style={{ flex: "1 1 auto", minHeight: "240px", marginTop: "4px", display: "flex", flexDirection: "column", overflow: "auto", border: "1px solid var(--crm-line)", borderRadius: "10px" }}>
          <div style={{ position: "sticky", top: 0, zIndex: 4, display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", minHeight: "34px", padding: "0 12px", background: "var(--crm-cream-nav)", borderBottom: "1px solid var(--crm-rule)",
            font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
            <span style={{ position: "relative", whiteSpace: "nowrap" }}>
              {v.ppSortCols0.map((c, i) => <button key={i} type="button" onClick={c.pick} title="Sort" style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", display: "inline-flex", gap: "4px" }}>Name <span>{c.arrow === "↕" ? "" : c.arrow}</span></button>)}
              <span onPointerDown={v.ppDragC as never} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-11px", width: "9px", cursor: "col-resize" }} />
            </span>
            {v.ppHead.map(h => (
              <span key={h.label} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "4px", whiteSpace: "nowrap", minWidth: 0 }} className="crm4a-th">
                <button type="button" onClick={h.pick} title="Sort" style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", overflow: "hidden", textOverflow: "ellipsis" }}>{h.label}{h.arrow !== "↕" ? ` ${h.arrow}` : ""}</button>
                <button type="button" onClick={h.remove} title="Hide column" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }} className="crm4a-th-x"><Ic name="x" size={10} /></button>
                <span onPointerDown={h.drag as never} onDoubleClick={v.ppReset} title="Drag to resize · double-click to reset" style={{ position: "absolute", top: "-10px", bottom: "-10px", right: "-11px", width: "9px", cursor: "col-resize" }} />
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
            <button key={i} type="button" onClick={d.open} title="Show in the rail" style={{ ...BTN, display: "grid", gridTemplateColumns: v.ppGrid, gap: "14px", alignItems: "center", minHeight: "48px", padding: "8px 12px", position: "relative",
              borderBottom: "1px solid var(--crm-rule-soft)", background: d.on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className={d.on ? undefined : "crm4a-row"}>
              <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: d.on ? "var(--crm-orange)" : "transparent" }} />
              <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span style={{ width: "30px", height: "30px", flex: "none", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 11px ${TIGHT}`, background: d.avBg, color: d.avFg }}>{d.ini}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                  <span style={{ font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</span>
                  <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{d.phone}</span>
                </span>
              </span>
              {d.cells.map((x, j) => (
                <span key={j} style={{ minWidth: 0, display: "flex" }}>
                  {x.pill ? <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "22px", padding: "0 9px", borderRadius: "11px", background: x.bg, color: x.fg, font: "500 12px Inter, sans-serif", whiteSpace: "nowrap" }}>
                    {x.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: x.dot }} />}{x.v}</span>
                    : <span style={{ font: "400 13px Inter, sans-serif", color: x.fg === "var(--crm-faint)" ? "var(--crm-faint-2)" : "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{x.v}</span>}
                </span>
              ))}
              <span />
            </button>
          ))}
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

/** Frames 03 / 04 · the page's right rail: Contacts' Breakdown and Selected customer (264 px), the Calendar's figures (248 px). Folds to a strip. */
export function DeskRail4a({ v, extra }: { v: RailBits; extra?: ReactNode }) {
  const people = !!v.side, W = people ? 304 : 288; // 264 / 248 inside, 20 px a side (the frames' content-box)
  const [byOpen, setByOpen] = useState(false);
  if (!v.open) return (
    <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} style={{ ...BTN, width: "44px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingTop: "20px",
      borderLeft: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
      <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="layout-grid" size={16} /></span>
      <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", letterSpacing: "0.04em", color: "var(--crm-ink-soft)" }}>{people ? "Breakdown" : "Figures"}</span>
      <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
    </button>
  );
  const c = v.chart, s = v.side;
  const total = c ? c.rows.reduce((a, r) => a + r.n, 0) : 0;
  let acc = 0;
  const donut = c && total ? `conic-gradient(${c.rows.filter(r => r.n).map(r => { const a = acc; acc += (r.n / total) * 360; return `${r.color} ${a}deg ${acc}deg`; }).join(",")})` : "var(--crm-rule-soft)";
  return (
    <aside style={{ width: `${W}px`, flex: "none", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: "18px", padding: "18px 20px", borderLeft: "1px solid var(--crm-rule)", overflow: "auto", background: "var(--crm-page)" }}>
      {people && c && (<>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <div style={{ font: `500 16px ${TIGHT}`, color: "var(--crm-ink)" }}>Breakdown</div>
          <span style={{ position: "relative", marginLeft: "auto" }}>
            <button type="button" onClick={() => setByOpen(o => !o)} aria-expanded={byOpen} style={{ ...BTN, display: "flex", alignItems: "center", gap: "4px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
              By {(c.bys.find(b => b.on)?.label ?? "Status").toLowerCase()}<Ic name="chevron-down" size={12} />
            </button>
            {byOpen && (<>
              <div onClick={() => setByOpen(false)} style={{ position: "fixed", inset: "-2000px", zIndex: 7 }} />
              <div style={{ position: "absolute", top: "24px", right: 0, zIndex: 8, minWidth: "180px", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
                {c.bys.map(b => <button key={b.label} type="button" onClick={() => { b.pick(); setByOpen(false); }} style={{ ...BTN, height: "32px", padding: "0 10px", borderRadius: "7px", font: `${b.on ? 500 : 400} 13px Inter, sans-serif`,
                  background: b.on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">{b.label}</button>)}
              </div>
            </>)}
          </span>
          <button type="button" onClick={v.toggle} title="Fold" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={14} /></button>
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
        <div style={{ display: "flex", alignItems: "center" }}>
          <button type="button" onClick={v.toggle} title="Fold" style={{ ...BTN, marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={14} /></button>
        </div>
        {extra}
      </>)}
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
            borderRadius: "7px", font: `${on ? 500 : 400} 13px Inter, sans-serif`, background: on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot ?? "transparent", border: t.dot ? 0 : "1px solid var(--crm-faint-2)", boxSizing: "border-box" }} />{t.label}</button>; })}
        </Pop>
        <Pop label={room && room.v !== "all" ? room.label.replace(/ showroom$/i, "") : "Showrooms"} open={roomsOpen} onToggle={() => setRoomsOpen(o => !o)}>
          {v.showroomOpts.map(o => { const on = o.v === v.calShowroom; return <button key={o.v} type="button" onClick={() => { v.pickShowroom({ target: { value: o.v } }); setRoomsOpen(false); }} style={{ ...BTN, height: "34px", padding: "0 10px",
            borderRadius: "7px", font: `${on ? 500 : 400} 13px Inter, sans-serif`, background: on ? "var(--crm-cream)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">{o.label}</button>; })}
        </Pop>
        <Pop label={v.calWhoLabel === "Everyone" ? "People" : v.calWhoLabel} open={v.calWhoOpen} onToggle={v.toggleCalWho}>
          {v.calWhoOpts.map((w, i) => w.head
            ? <div key={i} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 8px 4px", font: "500 10px Inter, sans-serif", letterSpacing: "0.14em", color: "var(--crm-faint)" }}><span style={{ width: "7px", height: "7px", borderRadius: "50%", background: w.color }} />{w.label}</div>
            : <button key={i} type="button" onClick={w.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "34px", padding: "4px 8px", borderRadius: "7px", font: `${w.sel ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)", background: w.sel ? "var(--crm-cream)" : "transparent" }} className="crm4a-row">
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
    rows: { name: string; headline: string; ch: "whatsapp" | "messenger"; cells: AdsCell[] }[];
    total: { label: string; cells: AdsCell[] };
    cmp: boolean;
  };
  apNameArrow: string; apSortName: () => void; openMetrics: () => void;
}

/** Frame 05 · Ads Performance's table: the ad (channel, the name managers typed, Meta's headline), the CRM's figures, Meta's "—", the total under an ink rule. */
export function DeskAdsTable4a({ v }: { v: AdsBits }) {
  const A = v.ap4;
  // Each column's width can be dragged by its head's right edge, double-click to reset (the owner, 2026-10-18: the table's
  // columns marked one by one, "可调整宽度"); kept in this browser only.
  const [colW, setColW] = useState<Record<string, number>>(() => { try { return JSON.parse(localStorage.getItem("crm-ads-cols") ?? "{}") as Record<string, number>; } catch { return {}; } });
  const keepW = (next: Record<string, number>) => { setColW(next); try { localStorage.setItem("crm-ads-cols", JSON.stringify(next)); } catch { /* private window */ } };
  const widthOf = (id: string, dflt: string) => (colW[id] ? `${colW[id]}px` : dflt);
  const grid = `${widthOf("ad", "minmax(180px,2.4fr)")} ${A.cols.map(c => widthOf(c.id, c.id === "apptrate" ? "minmax(100px,1.4fr)" : "minmax(48px,0.8fr)")).join(" ")} 28px`;
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
    const meta = id === "spend" || id === "cpl" || c.v === "—";
    return (
      <span style={{ display: "flex", flexDirection: "column", alignItems: id === "apptrate" ? "stretch" : "flex-end", gap: "2px", minWidth: 0 }}>
        {id === "apptrate" && c.bar != null && !total
          ? <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--crm-track)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${c.bar}%`, background: "var(--crm-rust)" }} /></span>
              <span style={{ width: "40px", textAlign: "right" }}>{c.v.replace(/\.\d+%$/, "%")}</span></span>
          : <span style={{ color: meta && !total ? "var(--crm-faint-2)" : undefined, whiteSpace: "nowrap" }}>{/%$/.test(c.v) ? (id === "showrate" ? c.v.replace(/\.\d+%$/, "%") : c.v.replace(/(\.\d)\d%$/, "$1%")) : c.v}</span>}
        {A.cmp && c.d && <span style={{ alignSelf: "flex-end", font: "500 10px Inter, sans-serif", padding: "0 5px", borderRadius: "4px", background: c.db, color: c.dc }}>{c.d}</span>}
      </span>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", overflowX: "auto", minWidth: 0 }}>
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "12px", alignItems: "center", minHeight: "44px", padding: "0 12px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-ink)",
        font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
        <span style={{ position: "relative", minWidth: 0, display: "flex" }}><button type="button" onClick={v.apSortName} style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit" }}>Ad{v.apNameArrow === "▲" ? " ↑" : v.apNameArrow === "▼" ? " ↓" : ""}</button><Resize id="ad" /></span>
        {A.cols.map(c => <span key={c.id} style={{ position: "relative", minWidth: 0, display: "flex", justifyContent: c.id === "apptrate" ? "flex-start" : "flex-end" }}><button type="button" onClick={c.sort} style={{ ...BTN, font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", textAlign: c.id === "apptrate" ? "left" : "right", lineHeight: 1.25 }}>{c.label}{c.arrow ? ` ${c.arrow}` : ""}</button><Resize id={c.id} /></span>)}
        <button type="button" onClick={v.openMetrics} title="Add columns" style={{ ...BTN, justifySelf: "end", width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", border: "1px dashed var(--crm-rust)", color: "var(--crm-rust)" }}><Ic name="plus" size={12} /></button>
      </div>
      {A.rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: grid, gap: "12px", alignItems: "center", minHeight: "55px", padding: "6px 12px", boxSizing: "border-box", borderBottom: "1px solid var(--crm-rule-soft)",
          font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }} className="crm4a-row">
          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span style={{ display: "flex", color: r.ch === "whatsapp" ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.ch === "whatsapp" ? "phone" : "message-circle"} size={15} /></span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ font: "500 14px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
              {r.headline && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.headline}</span>}
            </span>
          </span>
          {r.cells.map((c, j) => <Cell key={j} c={c} id={A.cols[j].id} />)}
          <span />
        </div>
      ))}
      <div style={{ display: "grid", gridTemplateColumns: grid, gap: "12px", alignItems: "center", minHeight: "52px", padding: "0 12px", borderTop: "1px solid var(--crm-ink)", marginTop: "-1px",
        font: "500 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
        <span>{A.total.label}</span>
        {A.total.cells.map((c, j) => <Cell key={j} c={c} id={A.cols[j].id} total />)}
        <span />
      </div>
    </div>
  );
}

interface AdListBits {
  adList4: { summary: string; unsetN: number; legend: { name: string; color: string }[];
    rows: { name: string; nameless: boolean; headline: string; ch: "whatsapp" | "messenger"; leads: string; segs: { color: string; pct: number }[]; set: boolean; sel: boolean; open: () => void }[] };
  stCur: { label: string; n: number; color: string }; toggleSt: () => void; stOpen: boolean; stOpts: { label: string; hint?: string | null; color: string; pick: () => void; n?: number | string }[];
}
// The name keeps 136 px (the channel icon and "Not named yet"); the split bar gives way first on a narrow screen (the owner, 2026-10-18: "调一下 Split 宽度").
const AD_GRID = "minmax(136px,1fr) 44px minmax(0,106px) 64px";

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
      {L.rows.map((r, i) => (
        <div key={i} onClick={r.open} style={{ display: "grid", gridTemplateColumns: AD_GRID, gap: "12px", alignItems: "center", minHeight: "62px", padding: "0 12px", position: "relative", cursor: "pointer",
          borderBottom: "1px solid var(--crm-rule-soft)", background: r.sel ? "var(--crm-cream)" : "transparent" }} className={r.sel ? undefined : "crm4a-row"}>
          <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: "2px", background: r.sel ? "var(--crm-orange)" : "transparent" }} />
          <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
            <span style={{ display: "flex", color: r.ch === "whatsapp" ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.ch === "whatsapp" ? "phone" : "message-circle"} size={15} /></span>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ font: "500 14px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.nameless ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{r.name}</span>
              {r.headline && <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.headline}</span>}
            </span>
          </span>
          <span style={{ textAlign: "right", font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{r.leads}</span>
          <span style={{ display: "flex", gap: "2px", height: "8px" }}>
            {!r.set ? <span style={{ flex: 1, background: "var(--crm-rule-soft)", borderRadius: "2px" }} /> : r.segs.map((g, j) => <span key={j} style={{ flex: g.pct, background: g.color }} />)}
          </span>
          <span style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={e => { e.stopPropagation(); r.open(); }} style={{ ...BTN, height: "30px", padding: "0 10px", borderRadius: "6px", font: "500 12px Inter, sans-serif", lineHeight: 1.1, textAlign: "center",
              ...(!r.set ? { background: "var(--crm-rust)", color: "#fff" } : { border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }) }} className={!r.set ? "crm4a-primary" : "crm4a-outline"}>{!r.set ? "Set up" : "Edit split"}</button>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Frame 06 · each docked panel's head — Split (× closes the ad), Ad performance and Audit log (» folds each to its strip):
 *  three panels side by side, as the Inbox's Customer info and Audit log (the owner, 2026-10-18: "ads performance, audit log 分开"). */
export function DeskAdTabs4a({ v, which }: { v: { closeAd: () => void; perfFold: () => void; adLogToggle: () => void; ad?: { name?: string } | null }; which: "split" | "perf" | "audit" }) {
  const title = which === "split" ? "Split" : which === "perf" ? "Ad performance" : "Audit log";
  const act = which === "split" ? v.closeAd : which === "perf" ? v.perfFold : v.adLogToggle;
  return (
    <div style={{ flex: "none", height: "48px", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px 0 24px", borderBottom: "1px solid var(--crm-rule)" }}>
      <span style={{ font: `500 15px ${TIGHT}`, color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{title}</span>
      {which === "audit" && v.ad?.name && <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{v.ad.name}</span>}
      <button type="button" onClick={act} title={which === "split" ? "Close (Esc)" : `Fold ${title}`} aria-label={which === "split" ? "Close" : `Fold ${title}`} style={{ ...BTN, marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}>
        {which === "split" ? <Ic name="x" size={16} /> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m13 17 5-5-5-5M6 17l5-5-5-5" /></svg>}
      </button>
    </div>
  );
}

interface RoomsBits {
  sr4: {
    has: boolean; isNew: boolean; pager: { at: number; n: number; prev: () => void; next: () => void; prevOff: boolean; nextOff: boolean }; add: () => void;
    name: string; setName: (e: { target: { value: string } }) => void; addr: string; setAddr: (e: { target: { value: string } }) => void; links: { g: string; w: string };
    limit: number; down: () => void; up: () => void; closures: { when: string; sub: string; remove: () => void }[];
    grid: { label: string; cells: { on: boolean; toggle: () => void }[] }[]; dirty: boolean;
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
  const S = v.sr4;
  const [more, setMore] = useState(false);
  const round = (off: boolean): CSSProperties => ({ ...BTN, width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: off ? "var(--crm-faint-2)" : "var(--crm-ink)" });
  if (!S.has) return (
    <div style={{ padding: "60px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
      <div style={{ font: "500 15px Inter, sans-serif", color: "var(--crm-ink)" }}>No showroom yet</div>
      <button type="button" onClick={S.add} style={{ ...BTN, height: "36px", padding: "0 16px", borderRadius: "7px", background: "var(--crm-rust)", color: "#fff", font: "500 13px Inter, sans-serif" }} className="crm4a-primary">Add a showroom</button>
    </div>
  );
  return (
    <div style={{ display: "flex", minHeight: "100%", margin: "-16px -36px -32px" }}>
      <div style={{ width: "400px", flex: "none", padding: "20px 32px 32px 36px", display: "flex", flexDirection: "column", boxSizing: "content-box", borderRight: "1px solid var(--crm-rule)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button type="button" onClick={S.pager.prev} disabled={S.pager.prevOff} title="Previous showroom" style={round(S.pager.prevOff)}><Ic name="chevron-left" size={14} /></button>
          <span style={{ font: "500 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{S.pager.at} / {S.pager.n}</span>
          <button type="button" onClick={S.pager.next} disabled={S.pager.nextOff} title="Next showroom" style={round(S.pager.nextOff)}><Ic name="chevron-right" size={14} /></button>
          <button type="button" onClick={S.add} title="Add showroom" aria-label="Add showroom" style={{ ...BTN, marginLeft: "auto", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary"><Ic name="plus" size={16} /></button>
        </div>
        <input value={S.name} onChange={S.setName} placeholder="Showroom name" aria-label="Showroom name" style={{ marginTop: "20px", width: "100%", border: 0, outline: "none", padding: 0, background: "transparent",
          font: `500 26px ${TIGHT}`, letterSpacing: "-0.02em", color: "var(--crm-ink)" }} />
        <textarea value={S.addr} onChange={S.setAddr} placeholder="Address" aria-label="Address" rows={2} style={{ marginTop: "6px", width: "100%", border: 0, outline: "none", padding: 0, resize: "none", background: "transparent",
          font: "400 14px/1.5 Inter, sans-serif", color: "var(--crm-ink-soft)" }} />
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
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>How many may book the same time</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", height: "36px", border: "1px solid var(--crm-line)", borderRadius: "7px" }}>
            <button type="button" onClick={S.down} aria-label="Fewer" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink-soft)" }}>−</button>
            <span style={{ width: "28px", textAlign: "center", font: `500 15px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{S.limit}</span>
            <button type="button" onClick={S.up} aria-label="More" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink-soft)" }}>+</button>
          </div>
        </div>
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
            {row.cells.map((c, di) => <button key={di} type="button" onClick={c.toggle} aria-pressed={c.on} title={c.on ? "Open — tap to close" : "Closed — tap to open"}
              style={{ ...BTN, height: "20px", borderRadius: "3px", background: c.on ? "var(--crm-brown)" : "var(--crm-rule-soft)" }} />)}
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
    loose: (ChRow & { id: string })[]; n: number; newTemplate: () => void;
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

type SetKey = "replySoonH" | "replyUrgentH" | "replyOverdueH" | "suggestTemplate" | "autoAssign" | "pushMessages" | "reminders";
interface SetVals { replySoonH: number; replyUrgentH: number; replyOverdueH: number; suggestTemplate: boolean; autoAssign: boolean; pushMessages: boolean; reminders: boolean }
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
  const round: CSSProperties = { ...BTN, width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" };
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
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <button type="button" onClick={() => step(k!, -1)} aria-label={`${r.t} one hour less`} style={round} className="crm4a-outline"><Ic name="minus" size={13} /></button>
                      <span style={{ minWidth: "44px", textAlign: "center", font: "500 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{d[k!] as number} h{k === "replyOverdueH" ? "+" : ""}</span>
                      <button type="button" onClick={() => step(k!, 1)} aria-label={`${r.t} one hour more`} style={round} className="crm4a-outline"><Ic name="plus" size={13} /></button>
                    </span>
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

type FormBits = Pick<ReturnType<typeof import("./vm/formpage").formPageVM>, "cfPages" | "cfSecs" | "cfDirty" | "cfReset" | "cfDevs" | "cfDesk" | "cfDragEnd">;
const Switch = ({ on, act, locked }: { on: boolean; act?: () => void; locked?: boolean }) => (
  <span role="switch" aria-checked={on} onClick={locked ? undefined : act} style={{ position: "relative", width: "30px", height: "18px", flex: "none", borderRadius: "9px", background: on ? "var(--crm-rust)" : "var(--crm-track)", cursor: locked ? "default" : "pointer", opacity: locked ? 0.6 : 1, transition: "background .15s" }}>
    <span style={{ position: "absolute", top: "2px", left: on ? "14px" : "2px", width: "14px", height: "14px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left .15s" }} />
  </span>
);
const CHIP: CSSProperties = { flex: "none", maxWidth: "64px", padding: "2px 7px", borderRadius: "4px", background: "var(--crm-cream-nav)", font: "500 11px Inter, sans-serif", color: "var(--crm-ink-soft)", textAlign: "center", overflow: "hidden" };
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
        <span style={{ ...CF_KICK, paddingBottom: "10px" }}>PAGES</span>
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
              <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{s.count} {s.count === 1 ? "field" : "fields"}</span>
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
                <Switch on={false} locked />
                <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", width: "58px" }}>Required</span>
                <span style={{ width: "14px" }} />
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
                    <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", width: "58px" }}>Required</span>
                    <button type="button" onClick={() => setOpen(isOpen ? null : key)} title={isOpen ? "Close" : "Edit field"} style={{ ...BTN, display: "flex", color: "var(--crm-faint)", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform .15s" }}><Ic name="chevron-right" size={14} /></button>
                  </div>
                  {isOpen && (
                    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "10px", padding: "2px 34px 14px" }}>
                      <label style={CF_LABEL}>Name<input type="text" value={f.label} onChange={f.setLabel} style={CF_FIELD} /></label>
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
            <label style={{ display: "flex", alignItems: "center", gap: "8px", height: "44px", padding: "0 6px", color: "var(--crm-rust)" }}>
              <button type="button" onClick={s.add} title="Add field" style={{ ...BTN, display: "flex", color: "var(--crm-rust)" }}><Ic name="plus" size={14} /></button>
              <input type="text" value={s.draft} onChange={s.setDraft} onKeyDown={e => { if (e.key === "Enter") s.add(); }} placeholder="Add field" style={{ flex: 1, minWidth: 0, border: 0, padding: 0, background: "transparent", font: "500 14px Inter, sans-serif", color: "var(--crm-ink)", outline: "none" }} className="crm4a-add" />
            </label>
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
