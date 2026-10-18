"use client";
/**
 * The phone CRM's 4a parts (2026-10-18, docs/design_handoff_crm_redesign — change list 16–20, frames M01–M14, T01–T07),
 * drawn by hand from CRM Phone.dc.html and placed into the generated screens by tools/crm-design/phone-4a.cjs. Behaviour
 * stays in the screens' view models; these only draw.
 *
 * Sizes: the handoff's phone sizes are final on-screen px. The app scales type by --rv-type (.92 on a phone), so a size
 * here is the frame's px ÷ .92 through typePx (`fs`) — on a phone it lands on the frame's px exactly.
 */
import type { CSSProperties, MouseEvent as RMouseEvent, ReactNode } from "react";
import { Ic, type Icon4a } from "./icons4a";
import { PHONE_TYPE, typePx } from "./type";

/** A frame's on-screen px as the app's scaled size. */
export const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
export const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", padding: 0, margin: 0, boxSizing: "border-box" };

const TAB_ICON: Record<string, Icon4a> = { Inbox: "inbox", Contacts: "contact", Calendar: "calendar", Insight: "trending-up", Profile: "user-round", Assignment: "users", Overview: "trending-up" };

/** Change list 16 · the bottom bar: a 52 × 30 pill per tab, the active one rust with a white icon and a rust label. */
export function Phone4aBar({ items, hidden }: { items: { label: string; on: boolean; badge?: number | string | null; go: () => void }[]; hidden?: boolean }) {
  return (
    <nav style={{ flex: "none", display: hidden ? "none" : "flex", padding: "8px 6px 8px", boxSizing: "border-box", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>
      {items.map(t => (
        <button key={t.label} type="button" onClick={t.go} style={{ ...BTN, flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "4px", color: t.on ? "var(--crm-rust)" : "var(--crm-muted)" }}>
          <span style={{ position: "relative", width: "52px", height: "30px", borderRadius: "15px", display: "flex", alignItems: "center", justifyContent: "center", background: t.on ? "var(--crm-rust)" : "transparent", color: t.on ? "#fff" : "var(--crm-muted)", transition: "background .18s" }}>
            <Ic name={TAB_ICON[t.label] ?? "inbox"} size={22} />
            {!!t.badge && (
              <span style={{ position: "absolute", top: "-4px", right: "2px", minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TIGHT, fontWeight: 600, fontSize: fs(10), background: "var(--crm-rust)", color: "#fff", border: "2px solid #fff" }}>{t.badge}</span>
            )}
          </span>
          <span style={{ fontWeight: t.on ? 600 : 500, fontSize: fs(11) }}>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/** Change list 17 · a chip: 32 px, the active one rust with white words and a peach count; the rest on the field colour. */
export function Phone4aChip({ label, count, on, hot, onClick, children }: { label: string; count?: number | string | null; on: boolean; hot?: boolean; onClick?: () => void; children?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{ ...BTN, flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 500, fontSize: fs(13), whiteSpace: "nowrap", background: on ? "var(--crm-rust)" : "var(--crm-field)", color: on ? "#fff" : "var(--crm-ink)" }}>
      {children}{label}
      {count != null && count !== "" && <span style={{ fontVariantNumeric: "tabular-nums", color: on ? "var(--crm-rust-meta)" : hot ? "var(--crm-oxblood)" : "var(--crm-faint)" }}>{count}</span>}
    </button>
  );
}

/** Change list 18 · the chat's 34 px status strip: status and wait (oxblood on pale orange), the reply window on the right; grey when cold. */
export function Phone4aStrip({ s }: { s: { cold: boolean; left: string; right: string; dot: string } }) {
  return (
    <div data-chat-strip="" style={{ height: "34px", padding: "0 16px", boxSizing: "border-box", display: "flex", alignItems: "center", gap: "8px", borderTop: "1px solid var(--crm-rule)", background: s.cold ? "var(--crm-field)" : "var(--crm-tint-attention)", fontSize: fs(13), whiteSpace: "nowrap" }}>
      <span style={{ width: "7px", height: "7px", flex: "none", borderRadius: "50%", background: s.dot }} />
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontWeight: 500, color: s.cold ? "var(--crm-muted)" : "var(--crm-oxblood)" }}>{s.left}</span>
      {s.right && <span style={{ flex: "none", color: "var(--crm-muted)" }}>{s.right}</span>}
    </div>
  );
}

type MouseH = (e: RMouseEvent<HTMLElement>) => void;
const card: CSSProperties = { border: "1px solid var(--crm-line)", borderRadius: "16px", background: "#fff", boxSizing: "border-box" };

/** Change list 17 · a segmented control: the active segment rust with white words. */
export function Phone4aSeg({ items }: { items: { label: string; on: boolean; pick: () => void }[] }) {
  return (
    <div style={{ display: "flex", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>
      {items.map(o => (
        <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, flex: 1, height: "34px", borderRadius: "17px", fontSize: fs(14), fontWeight: o.on ? 500 : 400, background: o.on ? "var(--crm-rust)" : "transparent", color: o.on ? "#fff" : "var(--crm-muted)", transition: "background .15s" }}>{o.label}</button>
      ))}
    </div>
  );
}

/** Change list 19 · the rust hero: three rates in white, an amber mark over the first, each one's change readable on rust. */
export function Phone4aHero({ items }: { items: { label: string; value: string; delta: string; good: boolean }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))`, padding: "20px 16px", borderRadius: "20px", background: "var(--crm-rust)", color: "#fff" }}>
      {items.map((m, i) => (
        <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: i ? "0 0 0 16px" : "0 16px 0 0", borderLeft: i ? "1px solid rgba(255,255,255,.22)" : "0", minWidth: 0 }}>
          <span style={{ width: "18px", height: "3px", borderRadius: "2px", background: i ? "transparent" : "var(--crm-amber)", marginBottom: "6px" }} />
          <span style={{ fontSize: fs(13), color: "var(--crm-peach-soft)", whiteSpace: "nowrap" }}>{m.label}</span>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(34), letterSpacing: "-0.035em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
          <span style={{ minHeight: "16px", fontSize: fs(12), fontWeight: 500, color: m.good ? "var(--crm-delta-good)" : "var(--crm-delta-bad)" }}>{m.delta}</span>
        </div>
      ))}
    </div>
  );
}

/** M11 · Mine's Insight: Month / Week / Day / Range, the rust hero, the counts, Avg. reply time and Leads by status. */
export function Phone4aInsightMine({ v }: { v: { p4: {
  periods: { label: string; on: boolean; pick: () => void }[]; range: string;
  hero: { label: string; value: string; delta: string; good: boolean }[];
  counts: { label: string; n: number; open: MouseH }[]; reply: { n: string; unit: string };
  status: { label: string; n: number; c: string; hot: boolean }[]; total: number } } }) {
  const P = v.p4;
  return (
    <main style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", scrollbarWidth: "none", padding: "6px 20px 24px", display: "flex", flexDirection: "column", gap: "16px" }}>
      <h1 style={{ margin: 0, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(30), letterSpacing: "-0.025em", lineHeight: 1.2 }}>Insight</h1>
      <Phone4aSeg items={P.periods} />
      {P.range && <span style={{ marginTop: "-8px", fontSize: fs(12), color: "var(--crm-muted)" }}>{P.range}</span>}
      <Phone4aHero items={P.hero} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "8px" }}>
        {P.counts.map(c => (
          <button key={c.label} type="button" onClick={c.open} style={{ ...BTN, ...card, display: "flex", flexDirection: "column", gap: "4px", padding: "14px 14px 12px", textAlign: "left" }}>
            <span style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>{c.label}</span>
            <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(26), fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{c.n}</span>
          </button>
        ))}
      </div>
      <div style={{ ...card, display: "flex", alignItems: "center", gap: "12px", height: "56px", padding: "0 16px" }}>
        <span style={{ display: "flex", color: "var(--crm-ink-soft)" }}><Ic name="clock" size={20} /></span>
        <span style={{ flex: 1, fontSize: fs(15), color: "var(--crm-ink)" }}>Avg. reply time</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: "3px", color: "var(--crm-ink)" }}><span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(22) }}>{P.reply.n}</span><span style={{ fontSize: fs(13) }}>{P.reply.unit}</span></span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ flex: 1, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(17) }}>Leads by status</span>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(17), fontVariantNumeric: "tabular-nums" }}>{P.total}</span>
        </div>
        <div style={{ display: "flex", gap: "3px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "var(--crm-track)" }}>
          {P.status.filter(s => s.n).map(s => <span key={s.label} style={{ flex: s.n, background: s.c }} />)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: "20px" }}>
          {P.status.map(s => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", gap: "10px", height: "35px", borderBottom: "1px solid var(--crm-rule)", fontSize: fs(14) }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.c, flex: "none" }} />
              <span style={{ flex: 1, color: s.hot ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{s.label}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{s.n}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
