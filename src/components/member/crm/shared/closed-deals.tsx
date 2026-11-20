"use client";
/**
 * Profile › Closed deals (the owner, 2026-11-20): one's own Won customers, newest first, a month at a time — the period
 * (This month · 3 months · This year · All), a summary card (the total, how many, the average), then each month with its
 * total and every deal: the customer, the day and where it was won, the amount, its Quotation and Bank slip (opened in the
 * CRM's viewer) and a tap into the chat. The data is sales/vm/deals.ts.
 */
import { Ic } from "./icons4a";
import { typePx } from "./type";
import type { CrmWonFile } from "@/lib/member/crm-data";

const fs = typePx;
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN = { border: 0, background: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;

export interface DealsVM {
  back: () => void;
  /** Drawn on a page with no top bar of its own (the Team side). */
  ownBack?: boolean;
  /** The Team side: Everyone and each seller with a deal. */
  people?: { label: string; on: boolean; pick: () => void }[];
  periods: { label: string; on: boolean; pick: () => void }[];
  total: string; count: string; avg: string;
  months: { key: string; label: string; total: string; n: number; rows: DealRow[] }[];
  empty: string;
}
export interface DealRow {
  key: string; name: string; ini: string; when: string; where: string; amount: string;
  files: { label: string; file: CrmWonFile; open: () => void }[];
  open: (() => void) | null;
}

export function Phone4aDeals({ v }: { v: DealsVM }) {
  return (
    // "‹ Profile" is the shell's own top bar above every Profile sub-page.
    // On the Team side it stands in the Profile's place and pads itself, as Phone4aProfile does.
    <main data-closed-deals="" style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "16px",
      ...(v.ownBack ? { padding: "14px 20px 24px", background: "var(--crm-cream)" } : {}) }}>
      {v.ownBack && <button type="button" onClick={v.back} style={{ ...BTN, alignSelf: "flex-start", display: "flex", alignItems: "center", gap: "4px", fontSize: fs(14), fontWeight: 500, color: "var(--crm-rust)" }}><Ic name="chevron-left" size={16} />Profile</button>}
      <h1 style={{ margin: 0, fontFamily: TIGHT, fontSize: fs(28), fontWeight: 500, letterSpacing: "-0.02em", color: "var(--crm-ink)" }}>Closed deals</h1>

      <div role="tablist" style={{ display: "flex", gap: "4px", padding: "3px", borderRadius: "999px", background: "var(--crm-tint-cold)" }}>
        {v.periods.map(p => (
          <button key={p.label} type="button" role="tab" aria-selected={p.on} onClick={p.pick}
            style={{ ...BTN, flex: 1, height: "32px", borderRadius: "999px", background: p.on ? "#fff" : "transparent", boxShadow: p.on ? "0 1px 2px rgba(0,0,0,.08)" : "none", fontSize: fs(13), fontWeight: p.on ? 600 : 500, color: p.on ? "var(--crm-ink)" : "var(--crm-faint)", whiteSpace: "nowrap" }}>
            {p.label}
          </button>
        ))}
      </div>

      {v.people && (
        <div data-deals-people="" style={{ display: "flex", gap: "6px", overflowX: "auto", scrollbarWidth: "none", margin: "0 -20px", padding: "0 20px" }}>
          {v.people.map(p => (
            <button key={p.label} type="button" aria-pressed={p.on} onClick={p.pick}
              style={{ ...BTN, flex: "none", height: "32px", padding: "0 12px", borderRadius: "999px", border: "1px solid " + (p.on ? "var(--crm-ink)" : "var(--crm-rule)"), background: p.on ? "var(--crm-ink)" : "#fff", color: p.on ? "#fff" : "var(--crm-ink)", fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap" }}>
              {p.label}
            </button>
          ))}
        </div>
      )}
      <section style={{ borderRadius: "20px", padding: "18px 20px", background: "var(--crm-ink)", color: "#fff", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={{ fontSize: fs(12), letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-peach-soft)" }}>Total closed</span>
        <span data-deals-total="" style={{ fontFamily: TIGHT, fontSize: fs(32), fontWeight: 600, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>{v.total}</span>
        <div style={{ display: "flex", gap: "18px", fontSize: fs(13), color: "var(--crm-peach-soft)" }}>
          <span><b style={{ color: "#fff", fontWeight: 600 }}>{v.count}</b> deals</span>
          <span>Average <b style={{ color: "#fff", fontWeight: 600 }}>{v.avg}</b></span>
        </div>
      </section>

      {!v.months.length && (
        <div style={{ padding: "28px 12px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "var(--crm-muted)", fontSize: fs(14) }}>
          <span style={{ width: "48px", height: "48px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-cold)", color: "var(--crm-rust)" }}><Ic name="trending-up" size={22} /></span>
          {v.empty}
        </div>
      )}

      {v.months.map(m => (
        <section key={m.key} data-deals-month={m.key} style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 4px" }}>
            <span style={{ fontSize: fs(13), fontWeight: 600, color: "var(--crm-ink)" }}>{m.label}<span style={{ fontWeight: 400, color: "var(--crm-muted)" }}> · {m.n} {m.n === 1 ? "deal" : "deals"}</span></span>
            <span style={{ fontSize: fs(13), fontWeight: 600, color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{m.total}</span>
          </div>
          <div style={{ borderRadius: "16px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)", overflow: "hidden" }}>
            {m.rows.map((r, i) => (
              <div key={r.key} data-deal="" style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px 14px", borderTop: i ? "1px solid var(--crm-rule-soft)" : 0 }}>
                <button type="button" onClick={r.open ?? undefined} disabled={!r.open} style={{ ...BTN, display: "flex", alignItems: "center", gap: "12px", textAlign: "left", cursor: r.open ? "pointer" : "default" }}>
                  <span style={{ flex: "none", width: "38px", height: "38px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-sel)", color: "var(--crm-rust)", fontSize: fs(13), fontWeight: 600 }}>{r.ini}</span>
                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                    <span style={{ fontSize: fs(15), fontWeight: 600, color: "var(--crm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                    <span style={{ fontSize: fs(12), color: "var(--crm-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.when}{r.where ? ` · ${r.where}` : ""}</span>
                  </span>
                  <span style={{ flex: "none", fontSize: fs(15), fontWeight: 600, color: "var(--crm-st-won)", fontVariantNumeric: "tabular-nums" }}>{r.amount}</span>
                </button>
                {r.files.length > 0 && (
                  <div style={{ display: "flex", gap: "6px", paddingLeft: "50px" }}>
                    {r.files.map(f => (
                      <button key={f.label} type="button" onClick={f.open} title={f.file.name}
                        style={{ ...BTN, display: "flex", alignItems: "center", gap: "5px", height: "28px", padding: "0 10px", borderRadius: "999px", background: "var(--crm-tint-cold)", fontSize: fs(12), fontWeight: 500, color: "var(--crm-ink)" }}>
                        <Ic name="file-text" size={13} />{f.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
