"use client";
/**
 * Insight › Overview on the desktop (the owner, 2026-11-17: "我想在 insight 加 Overview，主要是整合 ads performance + team
 * performance"): the brand switch, a strip of figures (the ads' money, then the team's work, each against the period
 * before), the ads — by brand, then ad by ad, an ad opening to the teams its leads went to — and the teams, a team
 * opening to its people. Drawn in Insight's own look (Desk4a.tsx › DeskInsight4a); the figures are vm/overview.ts's.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { DeskOverview as OV } from "./vm/overview";

const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box" };
const HEAD: CSSProperties = { display: "grid", padding: "8px 0", font: "500 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-faint)", borderBottom: "1px solid var(--crm-rule)" };
const ROW: CSSProperties = { ...BTN, width: "100%", display: "grid", alignItems: "center", minHeight: "46px", font: "400 14px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)", borderBottom: "1px solid var(--crm-rule-soft)" };
const R: CSSProperties = { textAlign: "right" };

function Section({ title, go, goLabel, children }: { title: string; go: () => void; goLabel: string; children: ReactNode }) {
  return (
    <section style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", paddingBottom: "12px" }}>
        <h2 style={{ margin: 0, font: `500 18px ${TIGHT}`, color: "var(--crm-ink)" }}>{title}</h2>
        <button type="button" onClick={go} style={{ ...BTN, marginLeft: "auto", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>{goLabel} ›</button>
      </div>
      {children}
    </section>
  );
}

export function DeskOverview({ o, src }: { o: OV; src?: { label: string; on: boolean; pick: () => void }[] }) {
  const adCols = o.money ? "minmax(0,2.4fr) minmax(0,1fr) repeat(5,minmax(0,0.8fr))" : "minmax(0,2.4fr) minmax(0,1fr) repeat(3,minmax(0,0.8fr))";
  const brCols = o.money ? "minmax(0,2fr) repeat(5,minmax(0,1fr))" : "minmax(0,2fr) repeat(3,minmax(0,1fr))";
  const tmCols = "minmax(0,2fr) minmax(0,1.4fr) repeat(4,minmax(0,0.8fr))";
  return (
    <div data-insight-overview="" style={{ display: "flex", flexDirection: "column", gap: "28px", paddingTop: "4px" }}>
      {src && (
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", marginBottom: "-12px" }}>
          <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>Brand</span>
          <div role="group" aria-label="Brand" style={{ height: "32px", padding: "3px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", display: "flex", gap: "2px", font: "500 12px Inter, sans-serif" }}>
            {src.map(s => <button key={s.label} type="button" onClick={s.pick} aria-pressed={s.on} style={{ ...BTN, padding: "0 12px", borderRadius: "6px", font: "inherit", whiteSpace: "nowrap",
              background: s.on ? "#fff" : "transparent", boxShadow: s.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: s.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{s.label}</button>)}
          </div>
          {o.money && !o.ready && <span style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Reading spend from Ads Manager…</span>}
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(o.tiles.length, 4)},minmax(0,1fr))`, rowGap: "22px", padding: "22px 0", borderRadius: "12px", background: "var(--crm-sum)", border: "1px solid var(--crm-sum-line)" }}>
        {o.tiles.map((t, i) => (
          <div key={t.label} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "0 18px", minWidth: 0, borderLeft: `1px solid ${i % 4 ? "var(--crm-hero-line)" : "transparent"}` }}>
            <span style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{t.label}</span>
            <span style={{ font: `500 30px ${TIGHT}`, letterSpacing: "-0.03em", lineHeight: 1, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: i === 0 ? "var(--crm-rust)" : "var(--crm-ink)" }}>{t.value}</span>
            <span style={{ font: "500 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: t.good ? "var(--crm-ink-soft)" : "var(--crm-oxblood)", whiteSpace: "nowrap" }}>
              {t.d} <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}>vs last</span>{t.sub && <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}> · {t.sub}</span>}
            </span>
          </div>
        ))}
      </div>

      <Section title="Ads" go={o.goAds} goLabel="Ads performance">
        {o.brands.length > 1 && (<>
          <div style={{ ...HEAD, gridTemplateColumns: brCols }}><div>Brand</div>{o.money && <><div style={R}>Spend</div><div style={R}>Per lead</div></>}<div style={R}>Leads</div><div style={R}>Appt</div><div style={R}>Won</div></div>
          {o.brands.map(b => (
            <div key={b.label} style={{ ...ROW, cursor: "default", gridTemplateColumns: brCols }}>
              <span style={{ fontWeight: 500 }}>{b.label}</span>{o.money && <><span style={R}>{b.spend}</span><span style={R}>{b.cpl}</span></>}
              <span style={{ ...R, fontWeight: 500 }}>{b.leads}</span><span style={R}>{b.appt}</span><span style={R}>{b.won}</span>
            </div>
          ))}
          <div style={{ height: "18px" }} />
        </>)}
        <div style={{ ...HEAD, gridTemplateColumns: adCols }}><div>Ad</div><div>Brand</div>{o.money && <><div style={R}>Spend</div><div style={R}>Per lead</div></>}<div style={R}>Leads</div><div style={R}>Appt</div><div style={R}>Won</div></div>
        {o.ads.map(a => (
          <Fragment key={a.id}>
            <button type="button" onClick={a.canOpen ? a.toggle : undefined} aria-expanded={a.canOpen ? a.open : undefined} className="crm4a-row" style={{ ...ROW, gridTemplateColumns: adCols, cursor: a.canOpen ? "pointer" : "default" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                <span aria-hidden style={{ width: "10px", flex: "none", color: "var(--crm-faint)", fontSize: "10px", transform: a.open ? "rotate(90deg)" : "none", visibility: a.canOpen ? "visible" : "hidden" }}>▶</span>
                <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={a.name}>{a.name}</span>
              </span>
              <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.brand || "—"}</span>
              {o.money && <><span style={R}>{a.spend}</span><span style={R}>{a.cpl}</span></>}
              <span style={{ ...R, fontWeight: 500 }}>{a.leads}</span><span style={R}>{a.appt}</span><span style={R}>{a.won}</span>
            </button>
            {a.open && a.teams.map(t => (
              <div key={t.name} style={{ ...ROW, cursor: "default", minHeight: "38px", gridTemplateColumns: adCols, background: "var(--crm-hover)", fontSize: "13px" }}>
                <span style={{ display: "flex", alignItems: "center", gap: "8px", paddingLeft: "18px", minWidth: 0 }}>
                  <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: t.dot }} /><span style={{ color: "var(--crm-ink-soft)", whiteSpace: "nowrap" }}>{t.name}</span>
                </span>
                <span style={{ fontSize: "12px", color: "var(--crm-faint)" }}>{t.share} of leads</span>
                {o.money && <><span /><span /></>}
                <span style={R}>{t.leads}</span><span style={R}>{t.appt}</span><span style={R}>{t.won}</span>
              </div>
            ))}
          </Fragment>
        ))}
        {!o.ads.length && <div style={{ padding: "18px 0", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No ad brought a lead in this period.</div>}
        {o.adsMore && <button type="button" onClick={o.adsMore.toggle} style={{ ...BTN, padding: "10px 0", font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>{o.adsMore.label}</button>}
      </Section>

      <Section title="Team" go={o.goTeam} goLabel="Team performance">
        <div style={{ ...HEAD, gridTemplateColumns: tmCols }}><div>Team</div><div style={{ paddingLeft: "24px" }}>Leads</div><div style={R}>Avg. reply</div><div style={R}>Appt rate</div><div style={R}>Show-up</div><div style={R}>Won</div></div>
        {o.teams.map(t => (
          <button key={t.key} type="button" onClick={t.pick} aria-expanded={t.person || !t.canOpen ? undefined : t.open} className="crm4a-row"
            style={{ ...ROW, gridTemplateColumns: tmCols, cursor: t.canOpen ? "pointer" : "default", background: t.person ? "var(--crm-hover)" : "transparent" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0, paddingLeft: t.person ? "18px" : 0 }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "50%", flex: "none", background: t.dot }} />
              <span style={{ fontWeight: t.person ? 400 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: t.person ? "var(--crm-ink-soft)" : "var(--crm-ink)" }}>{t.name}</span>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "24px" }}>
              <span style={{ flex: 1, height: "4px", borderRadius: "2px", background: "var(--crm-track)", position: "relative", overflow: "hidden" }}>
                <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: t.leadsW, background: "var(--crm-rust)" }} />
              </span>
              <span style={{ width: "34px", textAlign: "right", fontWeight: 500 }}>{t.leads}</span>
            </span>
            <span style={R}>{t.reply}</span><span style={R}>{t.appt}</span><span style={R}>{t.show}</span><span style={R}>{t.won}</span>
          </button>
        ))}
      </Section>
    </div>
  );
}
