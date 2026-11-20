"use client";
/**
 * Closed deals on the desktop (the owner, 2026-11-20: "电脑版也做 closed deals"; vm/deals.ts). Drawn as Reports draws
 * itself: the title row with CRM alerts, a filter row (the period · the seller), the summary tiles (total · deals ·
 * average), then month by month a table — Customer · Won · Sold by · Where · Files · Amount — a row opening the chat.
 */
import type { CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import { MenuChip } from "./DeskMenuChip";
import { Seg } from "./DeskReports";
import type { DealsVM } from "../shared/closed-deals";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const NUM: CSSProperties = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
const COLS = "minmax(200px, 1.6fr) 90px minmax(120px, 1fr) minmax(120px, 1fr) minmax(170px, auto) 120px";
const TH: CSSProperties = { font: "600 11.5px Inter, sans-serif", letterSpacing: ".04em", textTransform: "uppercase", color: "var(--crm-muted)", whiteSpace: "nowrap" };

export function DeskDeals({ v }: { v: DealsVM & { alertsN: string; openAlerts: () => void } }) {
  const who = v.people?.find(p => p.on)?.label ?? "Everyone";
  return (
    <div data-desk-deals="" style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "28px", padding: "26px 32px 0", borderBottom: "1px solid var(--crm-rule)", minWidth: 0 }}>
        <div style={{ font: `500 34px ${TIGHT}`, letterSpacing: "-0.025em", paddingBottom: "12px", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>Closed deals</div>
        <span style={{ marginLeft: "auto", alignSelf: "center", marginBottom: "12px", display: "flex", gap: "10px", flex: "none" }}>
          <button type="button" onClick={v.openAlerts} aria-label="CRM alerts" title="CRM alerts" style={{ ...BTN, position: "relative", width: "40px", height: "40px", borderRadius: "10px", border: "1px solid var(--crm-line)", display: "grid", placeItems: "center", color: "var(--crm-ink)" }} className="crm4a-outline">
            <Ic name="bell" size={17} />
            {v.alertsN && <span style={{ position: "absolute", top: "-6px", right: "-6px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "grid", placeItems: "center",
              background: "var(--crm-rust)", color: "#fff", font: "600 10px Inter, sans-serif", fontVariantNumeric: "tabular-nums", boxShadow: "0 0 0 2px #fff" }}>{v.alertsN}</span>}
          </button>
        </span>
      </div>

      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "18px 32px", minWidth: 0 }}>
        <Seg opts={v.periods} />
        {v.people && <MenuChip aria="Sold by" label={who} radius={10} pad="0 12px" gap={7} chev={12} menuW={240} on={who !== "Everyone"} opts={v.people} />}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column", gap: "20px", padding: "0 32px 32px" }}>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", padding: "14px 0", borderRadius: "12px", background: "var(--crm-sum)", border: "1px solid var(--crm-sum-line)" }}>
          {([["Total closed", v.total], ["Deals", v.count], ["Average", v.avg]] as const).map(([k, val], i) => (
            <div key={k} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "0 20px", minWidth: 0, borderLeft: i ? "1px solid var(--crm-sum-div)" : undefined }}>
              <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>{k}</span>
              <span data-deals-tile={k} style={{ font: `400 28px ${TIGHT}`, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{val}</span>
            </div>
          ))}
        </div>

        {!v.months.length && (
          <div style={{ padding: "48px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", font: "500 14px Inter, sans-serif", color: "var(--crm-muted)" }}>
            <span style={{ width: "52px", height: "52px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-rust)" }}><Ic name="circle-check" size={24} /></span>
            {v.empty}
          </div>
        )}

        {v.months.map(m => (
          <section key={m.key} data-deals-month={m.key} style={{ flex: "none", display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "12px", overflow: "hidden", background: "#fff" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--crm-rule)", background: "var(--crm-field)" }}>
              <span style={{ font: "600 14px Inter, sans-serif", color: "var(--crm-ink)" }}>{m.label}<span style={{ fontWeight: 400, color: "var(--crm-muted)" }}> · {m.n} {m.n === 1 ? "deal" : "deals"}</span></span>
              <span style={{ font: "600 14px Inter, sans-serif", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{m.total}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: COLS, gap: "16px", padding: "10px 18px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <span style={TH}>Customer</span><span style={TH}>Won</span><span style={TH}>Sold by</span><span style={TH}>Where</span><span style={TH}>Files</span><span style={{ ...TH, ...NUM }}>Amount</span>
            </div>
            {m.rows.map((r, i) => (
              <div key={r.key} data-deal="" role={r.open ? "button" : undefined} tabIndex={r.open ? 0 : undefined} onClick={r.open ?? undefined}
                onKeyDown={r.open ? e => { if (e.key === "Enter") r.open!(); } : undefined} className={r.open ? "crm4a-row" : undefined}
                style={{ display: "grid", gridTemplateColumns: COLS, gap: "16px", alignItems: "center", padding: "10px 18px", borderTop: i ? "1px solid var(--crm-rule-soft)" : 0, cursor: r.open ? "pointer" : "default", font: "500 13.5px Inter, sans-serif", color: "var(--crm-ink)" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                  <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-sel)", color: "var(--crm-rust)", font: "600 12px Inter, sans-serif" }}>{r.ini}</span>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                </span>
                <span style={{ color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{r.day}</span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.by || "—"}</span>
                <span style={{ color: "var(--crm-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.where || "—"}</span>
                <span style={{ display: "flex", gap: "6px" }}>
                  {r.files.length ? r.files.map(f => (
                    <button key={f.label} type="button" title={f.file.name} onClick={e => { e.stopPropagation(); f.open(); }}
                      style={{ ...BTN, display: "flex", alignItems: "center", gap: "5px", height: "26px", padding: "0 9px", borderRadius: "999px", background: "var(--crm-field)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>
                      <Ic name="file-text" size={12} />{f.label}
                    </button>
                  )) : <span style={{ color: "var(--crm-faint)" }}>—</span>}
                </span>
                <span style={{ ...NUM, fontWeight: 650, color: "var(--crm-st-won)", whiteSpace: "nowrap" }}>{r.amount}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
