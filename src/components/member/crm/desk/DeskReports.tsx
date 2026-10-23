"use client";
/**
 * Reports (2026-10-23, the owner: "在左手边功能加一个报告的功能，里面分成不一样的 category"; vm/reports-page.ts): the head's
 * tabs pick the category. Ads performance draws Ads Performance's chart and table (the same view model and figures);
 * Leads by ad, Assignment's own; Salespeople a sortable table with a total row; Appointments & show-ups and Lead sources
 * & status their figures over cards of bars. A period for the last three.
 */
import { useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { DeskAdsTable4a } from "./Desk4a";
import { DeskLeadsByAd, LeadsPanel } from "./DeskExtras";
import { Ic } from "../shared/icons4a";
import type { reportsVM } from "./vm/reports-page";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
type R = ReturnType<typeof reportsVM>["reports"];
type AdsV = ComponentProps<typeof DeskAdsTable4a>["v"] & { ap4: { tabs: { label: string; on: boolean; custom: boolean; pick: () => void }[] } };
type LbaV = ComponentProps<typeof DeskLeadsByAd>["v"];

const TIGHT_R = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
/** v2 (frames 12b / 12c): the period control — the segmented style used across the CRM, 34 px. */
function Seg({ opts }: { opts: { label: string; on: boolean; pick: () => void; dot?: string | null }[] }) {
  return (
    <div style={{ height: "34px", padding: "3px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", display: "flex", gap: "2px", alignSelf: "flex-start", font: "500 12px Inter, sans-serif", whiteSpace: "nowrap" }}>
      {opts.map(p => (
        <button key={p.label} type="button" onClick={p.pick} aria-pressed={p.on} style={{ ...BTN, padding: "0 12px", display: "flex", alignItems: "center", borderRadius: "6px", font: "inherit",
          gap: "6px", background: p.on ? "#fff" : "transparent", boxShadow: p.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: p.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{p.dot && <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: p.dot }} />}{p.label}</button>
      ))}
    </div>
  );
}

/** v2 frame 12b: the KPI strip — a sand summary block (note 06), each figure with its share beside it. */
function Tiles({ tiles }: { tiles: { k: string; v: string; pct: string }[] }) {
  return (
    <div style={{ flex: "none", display: "grid", gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))`, padding: "14px 0", borderRadius: "12px", background: "var(--crm-sum)", border: "1px solid var(--crm-sum-line)" }}>
      {tiles.map((t, i) => (
        <div key={t.k} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 20px", minWidth: 0, borderLeft: i ? "1px solid var(--crm-sum-div)" : undefined }}>
          <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>{t.k}</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: "8px", whiteSpace: "nowrap" }}>
            <span style={{ font: `400 28px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{t.v}</span>
            {t.pct && t.pct !== "—" && <span style={{ font: "500 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)" }}>{t.pct}</span>}
          </span>
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

/** v2 frame 12b: By ad, full width — Ad · Channel · Status · Leads · Share. */
const SRC_GRID = "minmax(0, 1fr) 110px 100px 70px 180px";
function AdsTable({ a }: { a: { count: string; rows: { id: string; name: string; channel: string; wa: boolean; status: string; stBg: string; stFg: string; n: number; pct: string; w: number }[] } }) {
  return (
    <div style={{ flex: "none", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px" }}>
        <span style={{ font: `500 15px ${TIGHT_R}`, color: "var(--crm-ink)" }}>By ad</span>
        <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{a.count}</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: SRC_GRID, gap: "16px", alignItems: "center", height: "34px", padding: "0 16px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-nav-line)", borderBottom: "1px solid var(--crm-nav-line)",
        font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
        <span>Ad</span><span>Channel</span><span>Status</span><span style={{ textAlign: "right" }}>Leads</span><span>Share</span>
      </div>
      {!a.rows.length && <div style={{ padding: "16px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No lead from an ad in this period</div>}
      {a.rows.map((r, i) => (
        <div key={r.id} style={{ display: "grid", gridTemplateColumns: SRC_GRID, gap: "16px", alignItems: "center", height: "40px", padding: "0 16px", borderTop: i ? "1px solid var(--crm-rule-soft)" : undefined, font: "400 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
          <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--crm-ink-soft)" }}><span style={{ display: "flex", color: r.wa ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={r.wa ? "phone" : "message-circle"} size={13} /></span>{r.channel}</span>
          <span><span style={{ height: "22px", padding: "0 9px", borderRadius: "11px", display: "inline-flex", alignItems: "center", gap: "5px", font: "500 11px Inter, sans-serif", whiteSpace: "nowrap", background: r.stBg, color: r.stFg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentcolor" }} />{r.status}</span></span>
          <span style={{ textAlign: "right", font: `500 14px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
          <span style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ flex: 1, height: "5px", borderRadius: "3px", background: "var(--crm-rule-soft)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${r.w}%`, background: "var(--crm-rust)" }} /></span>
            <span style={{ width: "32px", textAlign: "right", fontSize: "12px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{r.pct}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * v2 frames 12c / 12c·2 (notes 05 / 06): Salespeople — the team filter beside the period, one table card (title, counts,
 * search), Salesperson · Leads · Replied · First reply · Appts · Show-up · Won · Lost, count · rate pairs, First reply over
 * 4 h in red, a resize handle on every header but the last (minimums kept; widths per browser, crm.rp.sales.cols), a total
 * row. A person opens the panel of their leads; while it is open Replied and First reply step aside.
 */
type S2 = R["sales2"];
type S2Key = "name" | "leads" | "replyRate" | "firstReplyMin" | "appt" | "showed" | "won";
const S2_MIN: Record<S2Key, number> = { name: 150, leads: 44, replyRate: 56, firstReplyMin: 80, appt: 82, showed: 82, won: 82 };
function SalesTable2({ s, head }: { s: S2; head: ReactNode }) {
  const P = s.panel, open = !!P && !P.shut;
  const [w, setW] = useState<Partial<Record<S2Key, number>>>(() => { try { return JSON.parse(localStorage.getItem("crm.rp.sales.cols") ?? "{}"); } catch { return {}; } });
  const save = (n: typeof w) => { setW(n); try { localStorage.setItem("crm.rp.sales.cols", JSON.stringify(n)); } catch { /* private window */ } };
  const col = (k: S2Key, d: string) => (w[k] ? `${w[k]}px` : d);
  const grid = open
    ? `${col("name", "minmax(150px, 1.6fr)")} ${col("leads", "44px")} ${col("appt", "minmax(82px, 1fr)")} ${col("showed", "minmax(82px, 1fr)")} ${col("won", "minmax(82px, 1fr)")} 32px`
    : `${col("name", "minmax(210px, 2.2fr)")} ${col("leads", "52px")} ${col("replyRate", "64px")} ${col("firstReplyMin", "96px")} ${col("appt", "minmax(96px, 1fr)")} ${col("showed", "minmax(96px, 1fr)")} ${col("won", "minmax(96px, 1fr)")} 40px`;
  const drag = (k: S2Key) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    const start = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width, x0 = e.clientX, el = e.currentTarget, body = document.body;
    body.style.cursor = "col-resize"; body.style.userSelect = "none"; el.style.background = "var(--crm-rust)";
    const move = (ev: PointerEvent) => save({ ...w, [k]: Math.max(S2_MIN[k], Math.round(start + ev.clientX - x0)) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); body.style.cursor = ""; body.style.userSelect = ""; el.style.background = ""; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const H = ({ k, label, right = true, tip }: { k: S2Key | null; label: string; right?: boolean; tip?: string }) => {
    const so = k && k !== "name" ? s.sort(k) : null;
    return (
      <span title={tip} style={{ position: "relative", display: "flex", alignItems: "center", gap: "5px", justifyContent: right ? "flex-end" : undefined, whiteSpace: "nowrap" }}>
        <button type="button" onClick={so?.pick} style={{ ...BTN, display: "flex", alignItems: "center", gap: "5px", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", cursor: so ? "pointer" : "default" }}>
          {label}{so?.on && <span style={{ display: "flex", transform: so.dir === "asc" ? "rotate(180deg)" : "none" }}><Ic name="arrow-down" size={10} /></span>}
        </button>
        {k && <span title="Drag to resize" onPointerDown={drag(k)} onDoubleClick={() => { const n = { ...w }; delete n[k]; save(n); }} style={{ position: "absolute", top: "9px", bottom: "9px", right: "-8px", width: "3px", borderRadius: "2px", background: "var(--crm-audit-line)", cursor: "col-resize", touchAction: "none" }} />}
      </span>
    );
  };
  const pair = ([n, p]: [number, string]) => (
    <span style={{ display: "flex", alignItems: "baseline", justifyContent: "flex-end", gap: "6px" }}>
      <span style={{ font: `500 14px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums" }}>{n}</span>
      <span style={{ width: "40px", textAlign: "right", font: "400 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)" }}>{p}</span>
    </span>
  );
  return (
    <div style={{ display: "flex", gap: "14px", alignItems: "flex-start", minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "14px" }}>
        {head}
        <div style={{ flex: "none", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 16px" }}>
            <span style={{ font: `500 15px ${TIGHT_R}`, color: "var(--crm-ink)" }}>Salespeople</span>
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{s.count}</span>
            <label style={{ marginLeft: "auto", width: "200px", height: "32px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-faint)" }}>
              <Ic name="search" size={13} />
              <input value={s.q} onChange={s.setQ} placeholder="Search name" aria-label="Search name" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)" }} />
            </label>
          </div>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: open ? "560px" : "860px" }}>
              <div style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", height: "36px", padding: "0 16px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-nav-line)", borderBottom: "1px solid var(--crm-nav-line)",
                font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
                <span style={{ position: "sticky", left: 0, background: "var(--crm-cream-nav)", zIndex: 1 }}><H k="name" label="Salesperson" right={false} /></span>
                <H k="leads" label="Leads" />
                {!open && <H k="replyRate" label="Replied" />}
                {!open && <H k="firstReplyMin" label="First reply" tip="The average wait from the customer's first message to our first reply (auto-replies not counted)" />}
                <H k="appt" label="Appts" /><H k="showed" label="Show-up" /><H k="won" label="Won" /><H k={null} label="Lost" />
              </div>
              <div style={{ marginTop: "-1px" }}>
                {s.people.map((r, i) => (
                  <div key={r.id || "none"} onClick={r.pick} style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", height: "52px", padding: "0 16px", borderTop: i ? "1px solid var(--crm-rule-soft)" : "1px solid transparent",
                    font: "400 14px Inter, sans-serif", color: "var(--crm-ink)", background: r.on ? "var(--crm-sel)" : "transparent", boxShadow: r.on ? "inset 3px 0 0 var(--crm-rust)" : "none", cursor: r.none ? "default" : "pointer" }} className={r.on || r.none ? undefined : "crm4a-row"}>
                    <span style={{ position: "sticky", left: 0, zIndex: 1, background: r.on ? "var(--crm-sel)" : "#fff", display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 11px ${TIGHT_R}`, color: "var(--crm-ink)" }}>{r.ini}</span>
                      <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                        <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: r.none ? "var(--crm-oxblood)" : undefined }}>{r.name}</span>
                        {r.team && <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: r.dot }} />{r.team}</span>}
                      </span>
                    </span>
                    <span style={{ textAlign: "right", font: `500 14px ${TIGHT_R}`, fontVariantNumeric: "tabular-nums" }}>{r.leads}</span>
                    {!open && <span style={{ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.replied}</span>}
                    {!open && <span style={{ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.late ? "var(--crm-oxblood)" : undefined, fontWeight: r.late ? 500 : undefined }}>{r.first}</span>}
                    {pair(r.appt)}{pair(r.show)}{pair(r.won)}
                    <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink-soft)" }}>{r.lost}</span>
                  </div>
                ))}
                {!s.people.length && <div style={{ padding: "20px 16px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No leads in this period</div>}
                <div style={{ display: "grid", gridTemplateColumns: grid, gap: "14px", alignItems: "center", height: "48px", padding: "0 16px", borderTop: "1px solid var(--crm-ink)", background: "var(--crm-hover)", font: "600 14px Inter, sans-serif", color: "var(--crm-ink)" }}>
                  <span style={{ position: "sticky", left: 0, background: "var(--crm-hover)" }}>All salespeople</span>
                  <span style={{ textAlign: "right", fontFamily: TIGHT_R, fontVariantNumeric: "tabular-nums" }}>{s.total.leads}</span>
                  {!open && <span style={{ display: "block", textAlign: "right" }}>{s.total.replied}</span>}
                  {!open && <span style={{ display: "block", textAlign: "right" }}>{s.total.first}</span>}
                  {pair(s.total.appt)}{pair(s.total.show)}{pair(s.total.won)}
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{s.total.lost}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {P && <div style={{ display: "flex", alignSelf: "stretch", minHeight: "calc(100vh - 220px)" }}><LeadsPanel P={P} /></div>}
    </div>
  );
}

export function DeskReports({ r, lba }: { r: R; ads?: AdsV; lba: LbaV }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", minWidth: 0, paddingTop: r.cat === "ads" || r.cat === "lba" ? 0 : "16px" }}>
      {/* Ads performance (v2 frame 12) is Ads Performance's own body — toolbar, chart, table, pager — drawn by kAdsPerf. */}
      {r.cat === "lba" && <DeskLeadsByAd v={lba} />}
      {(r.cat === "appt" || r.cat === "src") && <Seg opts={r.periods} />}
      {r.cat === "sales" && <SalesTable2 s={r.sales2} head={<div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}><Seg opts={r.periods} /><span style={{ width: "1px", height: "20px", background: "var(--crm-line)" }} /><Seg opts={r.sales2.teams.map(t => ({ ...t, label: t.label, dot: t.dot }))} /></div>} />}
      {r.cat === "appt" && (<><Tiles tiles={r.appt.tiles} /><Cards cards={r.appt.cards} /></>)}
      {r.cat === "src" && (<><Tiles tiles={r.src.tiles} /><AdsTable a={r.src.ads} /><Cards cards={r.src.cards} /></>)}
    </div>
  );
}
