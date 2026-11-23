"use client";
/**
 * Closed deals on the desktop (the owner, 2026-11-20: "电脑版也做 closed deals"; vm/deals.ts). Drawn as Reports draws
 * itself: the title row with CRM alerts, a filter row — Insight's periods with Custom's calendar (RpPeriods) and the seller —
 * the summary tiles (total · deals · average), then ONE table for every month so the columns line up (the owner,
 * 2026-11-23: "排版整齐"), each month a band with its total: Customer · First contact · Won · Took · Unit size · Ad · Sold by
 * · Where · Files · Amount. A row opens the chat.
 */
import type { CSSProperties } from "react";
import { Ic } from "../shared/icons4a";
import { MenuChip } from "./DeskMenuChip";
import { RpPeriods } from "./DeskReports";
import type { DeskDealsVM } from "./vm/deals";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const TH: CSSProperties = { padding: "10px 12px", font: "600 11px Inter, sans-serif", letterSpacing: ".05em", textTransform: "uppercase", color: "var(--crm-muted)", whiteSpace: "nowrap", textAlign: "left", borderBottom: "1px solid var(--crm-rule)", background: "#fff", position: "sticky", top: 0, zIndex: 1 };
const TD: CSSProperties = { padding: "11px 12px", font: "500 13.5px Inter, sans-serif", color: "var(--crm-ink)", verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", borderTop: "1px solid var(--crm-rule-soft)" };
const SOFT: CSSProperties = { color: "var(--crm-muted)" };
// Column widths (%), Customer and Ad taking what is left; fixed so every month's rows sit under the same heads.
const COLS: [string, string, CSSProperties?][] = [
  ["Customer", "17%"], ["First contact", "8.5%"], ["Won", "7%"], ["Took", "7%"], ["Unit size", "8%"], ["Ad", "15%"],
  ["Sold by", "11%"], ["Where", "8%"], ["Files", "11%"], ["Amount", "7.5%", { textAlign: "right" }],
];

export function DeskDeals({ v }: { v: DeskDealsVM }) {
  const who = v.people?.find(p => p.on)?.label ?? "Everyone";
  const dash = <span style={{ color: "var(--crm-faint)" }}>—</span>;
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
        <RpPeriods r={{ periods: v.periods, picker: v.picker, rangeText: v.rangeText }} />
        {v.people && <span style={{ marginLeft: "auto", display: "flex" }}><MenuChip aria="Sold by" label={who} radius={10} pad="0 12px" gap={7} chev={12} menuW={240} on={who !== "Everyone"} opts={v.people} /></span>}
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

        {!v.months.length ? (
          <div style={{ padding: "48px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px", font: "500 14px Inter, sans-serif", color: "var(--crm-muted)" }}>
            <span style={{ width: "52px", height: "52px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-field)", color: "var(--crm-rust)" }}><Ic name="circle-check" size={24} /></span>
            {v.empty}
          </div>
        ) : (
          <div style={{ flex: "none", border: "1px solid var(--crm-rule)", borderRadius: "12px", overflow: "hidden", background: "#fff" }}>
            <table data-deals-table="" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>{COLS.map(([k, w]) => <col key={k} style={{ width: w }} />)}</colgroup>
              <thead><tr>{COLS.map(([k, , s]) => <th key={k} style={{ ...TH, ...s }}>{k}</th>)}</tr></thead>
              {v.months.map(m => (
                <tbody key={m.key} data-deals-month={m.key}>
                  <tr>
                    <td colSpan={COLS.length - 1} style={{ ...TD, background: "var(--crm-field)", font: "600 13px Inter, sans-serif" }}>
                      {m.label}<span style={{ fontWeight: 400, color: "var(--crm-muted)" }}> · {m.n} {m.n === 1 ? "deal" : "deals"}</span>
                    </td>
                    <td style={{ ...TD, background: "var(--crm-field)", font: "600 13px Inter, sans-serif", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{m.total}</td>
                  </tr>
                  {m.rows.map(r => (
                    <tr key={r.key} data-deal="" role={r.open ? "button" : undefined} tabIndex={r.open ? 0 : undefined} onClick={r.open ?? undefined}
                      onKeyDown={r.open ? e => { if (e.key === "Enter") r.open!(); } : undefined} className={r.open ? "crm4a-row" : undefined} style={{ cursor: r.open ? "pointer" : "default" }}>
                      <td style={TD}>
                        <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                          <span style={{ flex: "none", width: "30px", height: "30px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-sel)", color: "var(--crm-rust)", font: "600 11.5px Inter, sans-serif" }}>{r.ini}</span>
                          <span title={r.name} style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                        </span>
                      </td>
                      <td style={{ ...TD, ...SOFT }} data-deal-first="">{r.first || dash}</td>
                      <td style={{ ...TD, ...SOFT }}>{r.day}</td>
                      <td style={TD} data-deal-took="">{r.took || dash}</td>
                      <td style={TD} title={r.unit}>{r.unit || dash}</td>
                      <td style={{ ...TD, ...SOFT }} title={r.ad}>{r.ad || dash}</td>
                      <td style={TD} title={r.by}>{r.by || dash}</td>
                      <td style={{ ...TD, ...SOFT }} title={r.where}>{r.where || dash}</td>
                      <td style={TD}>
                        <span style={{ display: "flex", gap: "6px" }}>
                          {r.files.length ? r.files.map(f => (
                            <button key={f.label} type="button" title={f.file.name} onClick={e => { e.stopPropagation(); f.open(); }}
                              style={{ ...BTN, display: "flex", alignItems: "center", gap: "4px", height: "24px", padding: "0 8px", borderRadius: "999px", background: "var(--crm-field)", font: "500 11.5px Inter, sans-serif", color: "var(--crm-ink)", whiteSpace: "nowrap" }}>
                              <Ic name="file-text" size={11} />{f.label}
                            </button>
                          )) : dash}
                        </span>
                      </td>
                      <td style={{ ...TD, textAlign: "right", fontWeight: 650, fontVariantNumeric: "tabular-nums", color: "var(--crm-st-won)" }}>{r.amount}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
