"use client";
/**
 * Reports (2026-10-23, the owner: "在左手边功能加一个报告的功能，里面分成不一样的 category"; vm/reports-page.ts): the head's
 * tabs pick the category. Ads performance draws Ads Performance's chart and table (the same view model and figures);
 * Leads by ad, Assignment's own; Salespeople a sortable table with a total row; Appointments & show-ups and Lead sources
 * & status their figures over cards of bars. A period for the last three.
 */
import type { ComponentProps, CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import { DeskAdsTable4a } from "./Desk4a";
import { DeskLeadsByAd } from "./DeskExtras";
import type { reportsVM } from "./vm/reports-page";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
type R = ReturnType<typeof reportsVM>["reports"];
type AdsV = ComponentProps<typeof DeskAdsTable4a>["v"] & { ap4: { tabs: { label: string; on: boolean; custom: boolean; pick: () => void }[] } };
type LbaV = ComponentProps<typeof DeskLeadsByAd>["v"];

function Seg({ opts }: { opts: { label: string; on: boolean; pick: () => void }[] }) {
  return (
    <div style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "10px", background: "var(--crm-field)", alignSelf: "flex-start" }}>
      {opts.map(p => (
        <button key={p.label} type="button" onClick={p.pick} style={{ ...BTN, height: "32px", padding: "0 14px", borderRadius: "8px", background: p.on ? "#fff" : "transparent", boxShadow: p.on ? "0 1px 2px rgba(42,22,12,.1)" : "none",
          fontSize: "13px", fontWeight: p.on ? 600 : 500, color: p.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{p.label}</button>
      ))}
    </div>
  );
}

function Tiles({ tiles }: { tiles: { k: string; v: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "10px" }}>
      {tiles.map(t => (
        <div key={t.k} style={{ border: "1px solid var(--crm-rule)", borderRadius: "12px", background: "#fff", padding: "12px 14px" }}>
          <div style={{ font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-muted)" }}>{t.k}</div>
          <div style={{ font: "600 22px Inter, sans-serif", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", marginTop: "4px" }}>{t.v}</div>
        </div>
      ))}
    </div>
  );
}

function Cards({ cards }: { cards: { title: string; total: number; rows: { label: string; n: number; pct: string; w: number }[] }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: "12px", alignItems: "start" }}>
      {cards.map(c => (
        <div key={c.title} style={{ border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "8px", padding: "12px 16px", borderBottom: "1px solid var(--crm-field)" }}>
            <strong style={{ flex: 1, font: "650 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{c.title}</strong>
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{c.total}</span>
          </div>
          {!c.rows.length && <div style={{ padding: "18px 16px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Nothing in this period</div>}
          {c.rows.map(r => (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 110px 34px 42px", alignItems: "center", gap: "10px", padding: "7px 16px", borderBottom: "1px solid var(--crm-field)" }}>
              <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)", overflowWrap: "anywhere", lineHeight: 1.3 }}>{r.label}</span>
              <span style={{ height: "6px", borderRadius: "3px", background: "var(--crm-field)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${r.w}%`, background: "var(--crm-rust)" }} /></span>
              <span style={{ textAlign: "right", font: "650 13px Inter, sans-serif", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
              <span style={{ textAlign: "right", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{r.pct}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SalesTable({ s }: { s: R["sales"] }) {
  const grid = `minmax(180px, 1.6fr) repeat(${s.cols.length}, minmax(64px, 1fr))`;
  const head: CSSProperties = { font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" };
  return (
    <div style={{ overflowX: "auto", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
      <div style={{ minWidth: "980px" }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: "10px", alignItems: "center", minHeight: "40px", padding: "0 16px", background: "var(--crm-cream-nav)", ...head }}>
          <span>Salesperson</span>
          {s.cols.map(c => <button key={c.k} type="button" onClick={c.sort} title="Sort" style={{ ...BTN, ...head, textAlign: "right" }}>{c.label}{c.arrow ? ` ${c.arrow}` : ""}</button>)}
        </div>
        {!s.rows.length && <div style={{ padding: "20px 16px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No leads in this period</div>}
        {s.rows.map(r => (
          <div key={r.id || "none"} style={{ display: "grid", gridTemplateColumns: grid, gap: "10px", alignItems: "center", minHeight: "48px", padding: "6px 16px", borderTop: "1px solid var(--crm-field)", font: "400 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
            <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
              <span style={{ fontWeight: 600, color: r.none ? "var(--crm-oxblood)" : "var(--crm-ink)", overflowWrap: "anywhere" }}>{r.name}</span>
              {r.team && <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{r.team}</span>}
            </span>
            {r.cells.map((c, i) => <span key={i} style={{ textAlign: "right", color: c === "—" ? "var(--crm-faint-2)" : undefined }}>{c}</span>)}
          </div>
        ))}
        <div style={{ display: "grid", gridTemplateColumns: grid, gap: "10px", alignItems: "center", minHeight: "48px", padding: "0 16px", borderTop: "1px solid var(--crm-ink)", font: "600 13px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>
          <span>{s.total.name}</span>
          {s.total.cells.map((c, i) => <span key={i} style={{ textAlign: "right" }}>{c}</span>)}
        </div>
      </div>
    </div>
  );
}

export function DeskReports({ r, ads, lba }: { r: R; ads: AdsV; lba: LbaV }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
      {r.cat === "ads" && (<>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <Seg opts={ads.ap4.tabs.filter(t => !t.custom)} />
          <button type="button" onClick={r.openAds} style={{ ...BTN, marginLeft: "auto", display: "flex", alignItems: "center", gap: "6px", font: "500 13px Inter, sans-serif", color: "var(--crm-rust)" }}>
            Open Ads Performance for dates, filters and export<Ic name="chevron-right" size={13} />
          </button>
        </div>
        <DeskAdsTable4a v={ads} />
      </>)}
      {r.cat === "lba" && <div style={{ display: "flex", flexDirection: "column", gap: "22px", paddingTop: "10px" }}><DeskLeadsByAd v={lba} /></div>}
      {(r.cat === "sales" || r.cat === "appt" || r.cat === "src") && <Seg opts={r.periods} />}
      {r.cat === "sales" && <SalesTable s={r.sales} />}
      {r.cat === "appt" && (<><Tiles tiles={r.appt.tiles} /><Cards cards={r.appt.cards} /></>)}
      {r.cat === "src" && (<><Tiles tiles={r.src.tiles} /><Cards cards={r.src.cards} /></>)}
      {r.cat === "sales" && <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Leads that came in during the period, by who holds them now. First reply: the average wait from the customer&apos;s first message to our first reply (auto-replies not counted).</div>}
    </div>
  );
}
