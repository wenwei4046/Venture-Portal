"use client";
/**
 * Reports (2026-10-23; vm/reports-page.ts). v4 D6a (docs/design_handoff_crm_redesign_v4, notes/25): the page draws its own
 * head — "Reports" and its three tabs on one row, CRM alerts and Export at the right — then one filter row (All brands ▾ ·
 * Today / This week / This month / Custom · the dates in grey · All ads ▾ · Group by Ad / Salesperson), then Overview's
 * table: ads folded, an ad opened to its people (top 6, "+N more", "N need a reply"), a person opening the 420 px side
 * panel of their leads, a customer opening their log (the D4b timeline). Columns adds per-status counts, Channel, Spend,
 * Per lead and Won rate. Ads performance is Ads Performance's own body under this head (kAdsPerf); Appointments &
 * show-ups its figures over cards of bars.
 */
import { useRef, useState, type ComponentProps, type CSSProperties, type ReactNode, type RefObject } from "react";
import { DeskAdsTable4a } from "./Desk4a";
import { DateRangePicker } from "../shared/date-range";
import { DeskLeadsByAd } from "./DeskExtras";
import { Ic } from "../shared/icons4a";
import { AuditTimeline } from "../shared/audit-timeline";
import { V4 } from "../shared/up-next-style";
import { MenuChip } from "./DeskMenuChip";
import type { reportsVM } from "./vm/reports-page";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
type R = ReturnType<typeof reportsVM>["reports"];
type O = R["overview"];
type AdsV = ComponentProps<typeof DeskAdsTable4a>["v"] & { apDl?: { tag: string; label: string; bg: string; fg: string; pick: () => void }[]; apDlOpen?: boolean; apToggleDl?: () => void };
type LbaV = ComponentProps<typeof DeskLeadsByAd>["v"];

const TIGHT_R = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const NUM: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
/** The channel tile (D6a, as Ads performance's): Messenger blue, WhatsApp green, a 10–12 % wash of each behind. */
const TILE = { wa: ["color-mix(in srgb, var(--crm-whatsapp) 12%, #fff)", "color-mix(in srgb, var(--crm-whatsapp) 75%, #000)"], ms: ["color-mix(in srgb, var(--crm-messenger) 10%, #fff)", "var(--crm-messenger)"] };

/** The segmented control (README › Design tokens): track sand, padding 3, radius 10; options 30 px, radius 8; on white. */
export function Seg({ opts, refFor }: { opts: { label: string; on: boolean; pick: () => void }[]; refFor?: { label: string; ref: RefObject<HTMLButtonElement | null> } }) {
  return (
    <div style={{ display: "flex", padding: "3px", borderRadius: "10px", background: "var(--crm-field)", flex: "none" }}>
      {opts.map(p => (
        <button key={p.label} ref={refFor?.label === p.label ? refFor.ref : undefined} type="button" onClick={p.pick} aria-pressed={p.on} style={{ ...BTN, height: "30px", padding: "0 13px", borderRadius: "8px", display: "flex", alignItems: "center",
          font: `${p.on ? 600 : 500} 13px Inter, sans-serif`, whiteSpace: "nowrap", background: p.on ? "#fff" : "transparent", boxShadow: p.on ? V4.segShadow : "none", color: p.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{p.label}</button>
      ))}
    </div>
  );
}

/**
 * The period: Today · This week · This month · Custom, the dates in grey. Custom opens the calendar (shared/date-range.tsx)
 * at the button, where days are picked and Last month / All time are presets.
 */
export function RpPeriods({ r }: { r: Pick<R, "periods" | "picker"> & { rangeText: string } }) {
  const at = useRef<HTMLButtonElement>(null);
  return (<>
    <Seg opts={r.periods} refFor={{ label: "Custom", ref: at }} />
    <span style={{ flex: "none", font: "400 13.5px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{r.rangeText}</span>
    {r.picker && <DateRangePicker value={r.picker.value} onApply={r.picker.apply} onCancel={r.picker.cancel} anchor={at} allFrom={r.picker.allFrom} />}
  </>);
}

/** v2 frame 12b: the KPI strip — a sand summary block (note 06). */
function Tiles({ tiles }: { tiles: { k: string; v: string; pct: string }[] }) {
  return (
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, padding: "14px 0", borderRadius: "12px", background: "var(--crm-sum)", border: "1px solid var(--crm-sum-line)" }}>
      {tiles.map((t, i) => (
        <div key={t.k} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 20px", minWidth: 0, borderLeft: i ? "1px solid var(--crm-sum-div)" : undefined }}>
          <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>{t.k}</span>
          <span style={{ font: `400 28px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{t.v}</span>
        </div>
      ))}
    </div>
  );
}

/** v2 frame 12b: the mini cards, two a row — a stacked bar in each row's colour, then the rows (dot, label, count, share). */
function Cards({ cards }: { cards: { title: string; total: number; rows: { label: string; n: number; pct: string; w: number; color: string }[] }[] }) {
  return (
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "14px", alignItems: "start" }}>
      {cards.map(c => (
        <div key={c.title} style={{ border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "12px 16px 10px" }}>
            <span style={{ font: `500 14px ${TIGHT_R}`, color: "var(--crm-ink)" }}>{c.title}</span>
            <span style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)" }}>{c.total}</span>
          </div>
          {c.total > 0 && <div style={{ display: "flex", height: "8px", margin: "0 16px 8px", borderRadius: "4px", overflow: "hidden", gap: "2px" }}>
            {c.rows.filter(r => r.n).map(r => <span key={r.label} style={{ flex: `${r.n} 1 0px`, background: r.color }} />)}</div>}
          {!c.rows.length && <div style={{ padding: "12px 16px 14px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Nothing in this period</div>}
          {c.rows.map(r => (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "10px minmax(0, 1fr) auto 36px", gap: "10px", alignItems: "center", height: "30px", padding: "0 16px", borderTop: "1px solid var(--crm-rule-soft)", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: r.color }} />
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
              <span style={{ font: `500 13px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
              <span style={{ textAlign: "right", fontSize: "12px", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{r.pct}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** D6a's head: the title and its tabs on one row under one rule; CRM alerts and Export at the right. */
function Head({ r, ads }: { r: R; ads?: AdsV }) {
  const exportMenu = r.cat === "ads" && ads?.apDl ? ads : null;
  return (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "28px", padding: "26px 32px 0", borderBottom: "1px solid var(--crm-rule)", margin: r.cat === "ads" ? "0 -36px" : 0, minWidth: 0 }}>
      <div style={{ font: `500 34px ${TIGHT_R}`, letterSpacing: "-0.025em", paddingBottom: "12px", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>Reports</div>
      {r.cats.map(t => (
        <button key={t.label} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, alignSelf: "flex-end", paddingBottom: "13px", marginBottom: "-1px", whiteSpace: "nowrap",
          font: `${t.on ? 600 : 500} 14.5px Inter, sans-serif`, color: t.on ? "var(--crm-ink)" : "var(--crm-muted)", borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}` }}>{t.label}</button>
      ))}
      <span style={{ marginLeft: "auto", alignSelf: "center", marginBottom: "12px", display: "flex", gap: "10px", flex: "none", position: "relative" }}>
        <button type="button" onClick={r.openAlerts} aria-label="CRM alerts" title="CRM alerts" style={{ ...BTN, position: "relative", width: "40px", height: "40px", borderRadius: "10px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", color: "var(--crm-ink)" }} className="crm4a-outline">
          <Ic name="bell" size={17} />
          {r.alertsN && <span style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "grid", placeItems: "center",
            background: "var(--crm-rust)", color: "#fff", font: "600 10px Inter, sans-serif", fontVariantNumeric: "tabular-nums", boxShadow: "0 0 0 2px #fff" }}>{r.alertsN}</span>}
        </button>
        {(exportMenu || r.canCsv) && (
          <button type="button" onClick={exportMenu ? exportMenu.apToggleDl : r.csv} style={{ ...BTN, height: "40px", padding: "0 16px", borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px", font: "600 14px Inter, sans-serif", whiteSpace: "nowrap", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">
            <Ic name="download" size={16} />Export
          </button>
        )}
        {exportMenu?.apDlOpen && (<>
          <div onClick={exportMenu.apToggleDl} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div style={{ position: "absolute", top: "46px", right: 0, zIndex: 21, minWidth: "200px", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
            {exportMenu.apDl!.map(o => (
              <button key={o.tag} type="button" onClick={o.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 10px", borderRadius: "7px", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-row">
                <span style={{ minWidth: "30px", height: "18px", padding: "0 5px", borderRadius: "4px", background: o.bg, color: o.fg, font: "600 10px Inter, sans-serif", display: "grid", placeItems: "center" }}>{o.tag}</span>{o.label}</button>
            ))}
          </div>
        </>)}
      </span>
    </div>
  );
}

/** Columns (notes/25): tick a figure, a status or Channel to add it as a column; kept for this user. */
function ColumnsPick({ o }: { o: O }) {
  const [open, setOpen] = useState(false);
  const groups = ["Figures", "Statuses", "Channel"].map(g => ({ g, items: o.picker.filter(p => p.group === g) }));
  return (
    <span style={{ marginLeft: "auto", position: "relative", display: "flex" }}>
      <button type="button" onClick={() => setOpen(x => !x)} aria-expanded={open} style={{ ...BTN, display: "flex", alignItems: "center", gap: "6px", font: "500 13.5px Inter, sans-serif", color: "var(--crm-muted)" }}>
        <Ic name="sliders-horizontal" size={14} />Columns
      </button>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
        <div role="dialog" aria-label="Columns" style={{ position: "absolute", top: "26px", right: 0, zIndex: 21, width: "240px", padding: "8px", boxSizing: "border-box", background: "#fff", borderRadius: "12px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "2px" }}>
          {groups.map(({ g, items }) => (
            <div key={g} style={{ display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ padding: "8px 8px 4px", font: "600 11px Inter, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--crm-brown)" }}>{g}</span>
              {items.map(p => (
                <button key={p.k} type="button" role="menuitemcheckbox" aria-checked={p.on} onClick={p.toggle} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "34px", padding: "0 8px", borderRadius: "7px", font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-row">
                  <span style={{ width: "16px", height: "16px", flex: "none", boxSizing: "border-box", borderRadius: "4px", display: "grid", placeItems: "center", border: p.on ? "0" : "1.5px solid var(--crm-faint-2)", background: p.on ? "var(--crm-rust)" : "#fff", color: "#fff" }}>{p.on && <Ic name="check" size={11} sw={3} />}</span>
                  {p.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </>)}
    </span>
  );
}

type Cell = O["ads"][number]["cells"][number];
const cellStyle = (c: Cell, i: number, big: boolean): CSSProperties => ({ ...NUM, fontWeight: c.late ? 600 : big && i === 0 ? 600 : undefined, color: c.late ? "var(--crm-oxblood)" : c.grey ? "var(--crm-faint)" : undefined, whiteSpace: "nowrap" });

/** Overview's table (D6a): ads folded, an ad opened to its people; or every person when grouped by salesperson. */
function Overview({ o }: { o: O }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [more, setMore] = useState<Record<string, boolean>>({});
  const grid = `minmax(240px,1fr) ${o.heads.map(h => `${h.w}px`).join(" ")}`;
  const minW = 240 + o.heads.reduce((n, h) => n + h.w, 0) + o.heads.length * 16 + 32;
  const row: CSSProperties = { display: "grid", gridTemplateColumns: grid, columnGap: "16px", alignItems: "center", padding: "0 16px" };
  const byAd = o.by === "ad";
  const Person = ({ p, top }: { p: O["people"][number]; top: boolean }) => (
    <div role={p.pick ? "button" : undefined} tabIndex={p.pick ? 0 : undefined} onClick={p.pick ?? undefined} onKeyDown={e => { if (p.pick && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); p.pick(); } }}
      style={{ ...row, height: top ? "52px" : "38px", font: `400 ${top ? 14.5 : 13.5}px Inter, sans-serif`, fontVariantNumeric: "tabular-nums", borderBottom: top ? "1px solid var(--crm-rule-soft)" : undefined, cursor: p.pick ? "pointer" : "default", color: "var(--crm-ink)" }}
      className={p.pick ? "crm4a-row" : undefined}>
      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, paddingLeft: top ? 0 : "23px" }}>
        <span style={{ flex: "none", display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-right" size={top ? 13 : 11} /></span>
        <span style={{ fontWeight: p.on ? 600 : top ? 500 : 400, color: p.on ? "var(--crm-rust)" : p.none ? "var(--crm-muted)" : undefined, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
        {p.need && <span style={{ flex: "none", font: "600 11.5px Inter, sans-serif", color: "var(--crm-oxblood)", whiteSpace: "nowrap" }}>{p.need}</span>}
      </span>
      {p.cells.map((c, i) => <span key={c.k} style={cellStyle(c, i, false)}>{c.text}</span>)}
    </div>
  );
  return (
    <div style={{ minWidth: `${minW}px` }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: "8px", paddingBottom: "10px" }}>
        <span style={{ font: `500 18px ${TIGHT_R}`, color: "var(--crm-ink)" }}>{o.title}</span>
        <span style={{ font: "400 13.5px Inter, sans-serif", color: "var(--crm-faint)" }}>{o.count}</span>
        <ColumnsPick o={o} />
      </div>
      <div style={{ ...row, height: "38px", borderRadius: "8px", background: "var(--crm-hover)", font: "500 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>
        <span style={{ paddingLeft: byAd ? "59px" : "23px" }}>{byAd ? "Ad" : "Salesperson"}</span>
        {o.heads.map(h => <button key={h.k} type="button" onClick={h.pick} style={{ ...BTN, ...NUM, font: "inherit", color: h.on ? "var(--crm-ink)" : "inherit", whiteSpace: "nowrap" }}>{h.label}{h.arrow}</button>)}
      </div>
      {byAd ? o.ads.map(a => {
        const isOpen = !!open[a.key], tile = a.wa ? TILE.wa : TILE.ms;
        const top = more[a.key] ? a.people : a.people.slice(0, 6);
        return (
          <div key={a.key}>
            <div role="button" tabIndex={0} aria-expanded={isOpen} onClick={() => setOpen(x => ({ ...x, [a.key]: !x[a.key] }))} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(x => ({ ...x, [a.key]: !x[a.key] })); } }}
              style={{ ...row, height: "52px", borderBottom: "1px solid var(--crm-rule-soft)", font: "400 14.5px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", cursor: "pointer" }} className="crm4a-row">
              <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                <span style={{ flex: "none", display: "flex", color: "var(--crm-faint)", transform: `rotate(${isOpen ? 90 : 0}deg)`, transition: "transform .15s" }}><Ic name="chevron-right" size={13} /></span>
                <span style={{ flex: "none", width: "26px", height: "26px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", background: tile[0], color: tile[1] }}><Ic name={a.wa ? "phone" : "message-circle"} size={13} /></span>
                <span title={a.name} style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
              </span>
              {a.cells.map((c, i) => <span key={c.k} style={cellStyle(c, i, true)}>{c.text}</span>)}
            </div>
            {isOpen && (
              <div style={{ background: "var(--crm-hover)", borderBottom: "1px solid var(--crm-rule-soft)", padding: "4px 0" }}>
                {top.map(p => <Person key={p.key} p={p} top={false} />)}
                {a.people.length > 6 && <button type="button" onClick={() => setMore(x => ({ ...x, [a.key]: !x[a.key] }))} style={{ ...BTN, padding: "4px 16px 4px 39px", font: "500 12.5px Inter, sans-serif", color: "var(--crm-rust)" }}>
                  {more[a.key] ? "Show fewer" : `+${a.people.length - 6} more ${a.people.length - 6 === 1 ? "person" : "people"}`}</button>}
              </div>
            )}
          </div>
        );
      }) : o.people.map(p => <Person key={p.key} p={p} top />)}
      {!(byAd ? o.ads.length : o.people.length) && <div style={{ padding: "28px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No leads in this period</div>}
    </div>
  );
}

const TONE = { oxblood: "var(--crm-oxblood)", muted: "var(--crm-muted)", green: "var(--crm-v4-green)" } as const;

/** The person's side panel (420 px, from below the filter row): their leads in plain words; a customer opens their log. */
function Panel({ p }: { p: NonNullable<O["panel"]> }) {
  const L = p.lead;
  const close = (
    <button type="button" onClick={p.close} aria-label="Close" style={{ ...BTN, flex: "none", width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-muted)" }}><Ic name="x" size={14} /></button>
  );
  return (
    <aside aria-label={`${p.name}'s leads`} style={{ position: "absolute", top: 0, right: 0, bottom: 0, zIndex: 6, width: "420px", background: "#fff", boxShadow: "-16px 0 40px rgba(42,22,12,.12)", display: "flex", flexDirection: "column" }}>
      {L ? (<>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "12px", padding: "22px 24px 16px", borderBottom: "1px solid var(--crm-rule)" }}>
          <button type="button" onClick={L.back} aria-label={`Back to ${p.name}'s leads`} style={{ ...BTN, flex: "none", width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-muted)" }}><Ic name="chevron-left" size={15} /></button>
          <span style={{ flex: "none", width: "44px", height: "44px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 15px ${TIGHT_R}`, background: "var(--crm-cream)", color: "var(--crm-ink)" }}>{L.ini}</span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ font: `500 22px ${TIGHT_R}`, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{L.name}</span>
            <span title={L.ad} style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{L.ad}</span>
          </span>
          {close}
        </div>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", padding: "14px 24px", borderBottom: "1px solid var(--crm-rule)" }}>
          {L.facts.map((f, i) => (
            <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0, paddingLeft: i ? "14px" : 0, borderLeft: i ? "1px solid var(--crm-rule-2)" : undefined }}>
              <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{f.k}</span>
              <span style={{ font: "600 14px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.v}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", padding: "20px 24px 4px" }}><AuditTimeline lines={L.lines} /></div>
        <div style={{ flex: "none", padding: "14px 24px 20px", borderTop: "1px solid var(--crm-rule)" }}>
          <button type="button" onClick={L.openChat} style={{ ...BTN, width: "100%", height: "46px", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", font: "600 15px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }} className="crm4a-primary">
            <Ic name="message-circle" size={16} />Open chat</button>
        </div>
      </>) : (<>
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "12px", padding: "22px 24px 16px", borderBottom: "1px solid var(--crm-rule)" }}>
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ font: `500 22px ${TIGHT_R}`, color: "var(--crm-ink)" }}>{p.name}</span>
            <span title={p.sub} style={{ font: "400 13px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.sub}</span>
          </span>
          {close}
        </div>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", padding: "14px 24px", borderBottom: "1px solid var(--crm-rule)" }}>
          {p.facts.map((f, i) => (
            <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: "3px", paddingLeft: i ? "14px" : 0, borderLeft: i ? "1px solid var(--crm-rule-2)" : undefined }}>
              <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{f.k}</span>
              <span style={{ font: "600 18px Inter, sans-serif", color: f.hot ? "var(--crm-oxblood)" : "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{f.v}</span>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", padding: "6px 24px" }}>
          {p.customers.map(c => (
            <button key={c.id} type="button" onClick={c.open} style={{ ...BTN, flex: "none", display: "flex", flexDirection: "column", gap: "5px", padding: "13px 0", borderBottom: "1px solid var(--crm-rule-soft)", color: "var(--crm-ink)" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                <span style={{ flex: 1, minWidth: 0, font: "600 14.5px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ flex: "none", font: "400 12.5px Inter, sans-serif", color: "var(--crm-faint)" }}>{c.got}</span>
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ font: "600 13px Inter, sans-serif", color: TONE[c.tone] }}>{c.text}</span>
                <span style={{ marginLeft: "auto", font: "400 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>{c.status}</span>
              </span>
            </button>
          ))}
          {!p.customers.length && <span style={{ padding: "16px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No leads in this period</span>}
          {p.customers.length > 0 && <span style={{ flex: "none", paddingTop: "12px", font: "400 12.5px Inter, sans-serif", color: "var(--crm-faint)" }}>Sorted: needs a reply first. Click a customer for their log and Open chat.</span>}
        </div>
      </>)}
    </aside>
  );
}

export function DeskReports({ r, ads }: { r: R; ads?: AdsV; lba?: LbaV }) {
  const o = r.overview;
  const filters: ReactNode = (
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "18px 32px", minWidth: 0 }}>
      <MenuChip aria="Brand" label={o.brandLabel} radius={10} pad="0 12px" gap={7} chev={12} menuW={220} opts={o.brands} />
      <RpPeriods r={{ periods: r.periods, picker: r.picker, rangeText: o.rangeText }} />
      {r.cat === "overview" && <MenuChip aria="Ad" label={o.adLabel} radius={10} pad="0 12px" gap={7} chev={12} maxW={300} menuW={420} on={o.adOn}
        opts={o.adOpts.map(x => ({ label: x.label, n: x.n, on: x.value === o.adVal, pick: () => o.setAd(x.value) }))} />}
      {r.cat === "overview" && (
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px", flex: "none", font: "500 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Group by<Seg opts={o.bys} /></span>
      )}
    </div>
  );
  return (
    <div style={{ flex: r.cat === "ads" ? "none" : 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }} data-reports="">
      <Head r={r} ads={ads} />
      {r.cat !== "ads" && filters}
      {r.cat === "overview" && (
        <div style={{ flex: 1, minHeight: 0, position: "relative", display: "flex" }}>
          <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: `0 ${o.panel ? 452 : 32}px 32px 32px` }}><Overview o={o} /></div>
          {o.panel && <Panel p={o.panel} />}
        </div>
      )}
      {r.cat === "appt" && (
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "14px", padding: "0 32px 32px" }}>
          <Tiles tiles={r.appt.tiles} /><Cards cards={r.appt.cards} />
        </div>
      )}
    </div>
  );
}
