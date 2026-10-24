"use client";
/**
 * The phone CRM's 4a parts (2026-10-18, docs/design_handoff_crm_redesign — change list 16–20, frames M01–M14, T01–T07),
 * drawn by hand from CRM Phone.dc.html and placed into the generated screens by tools/crm-design/phone-4a.cjs. Behaviour
 * stays in the screens' view models; these only draw.
 *
 * Sizes: the handoff's phone sizes are final on-screen px. The app scales type by --rv-type (.92 on a phone), so a size
 * here is the frame's px scaled up by the phone's type step through typePx (`fs`) — on a phone it lands on the frame's px exactly.
 */
import type { ChangeEvent as RChangeEvent, CSSProperties, FocusEvent, KeyboardEvent, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState, Fragment } from "react";
import { Ic, type Icon4a } from "./icons4a";
import { PHONE_TYPE, typePx } from "./type";
import type { ActiveVM } from "./locked";
export { Phone4aAdsPerf } from "./phone-ads-perf";
export { Phone4aAutoReply } from "./auto-reply-pages";
export { Phone4aBookMode, Phone4aCustomBook } from "./custom-book";

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
  // A chip picked past the row's edge slides into view, as frame M03's Appointment (the row scrolls; the page does not).
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (on) ref.current?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [on]);
  return (
    <button ref={ref} type="button" onClick={onClick} style={{ ...BTN, flex: "none", height: "32px", padding: "0 12px", borderRadius: "16px", display: "flex", alignItems: "center", gap: "6px", fontWeight: 500, fontSize: fs(13), whiteSpace: "nowrap", background: on ? "var(--crm-rust)" : "var(--crm-field)", color: on ? "#fff" : "var(--crm-ink)" }}>
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
/** `compact` = v3 T01's smaller hero: 14px padding, 24px figures. */
export function Phone4aHero({ items, cols, compact }: { items: { label: string; value: string; delta: string; good: boolean; open?: () => void }[]; cols?: number; compact?: boolean }) {
  const n = cols ?? items.length;
  if (compact) return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, rowGap: "12px", padding: "14px 0", borderRadius: "16px", background: "var(--crm-rust)", color: "#fff" }}>
      {items.map((m, i) => (
        <div key={m.label} onClick={m.open} role={m.open ? "button" : undefined} style={{ display: "flex", flexDirection: "column", gap: "3px", padding: "0 16px", borderLeft: i % n ? "1px solid rgba(255,255,255,.22)" : "1px solid transparent", minWidth: 0, cursor: m.open ? "pointer" : "default" }}>
          <span style={{ width: "18px", height: "2px", background: i ? "transparent" : "var(--crm-amber)" }} />
          <span style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: fs(12), fontWeight: 500, color: "var(--crm-peach-soft)", whiteSpace: "nowrap" }}>{m.label}{m.open && <Ic name="chevron-right" size={11} />}</span>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(24), letterSpacing: "-0.02em", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
          <span style={{ minHeight: "14px", fontSize: fs(11), fontWeight: 500, color: m.good ? "var(--crm-delta-good)" : "var(--crm-delta-bad)" }}>{m.delta}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${n}, minmax(0,1fr))`, rowGap: "22px", padding: n === 2 ? "20px 20px 22px" : "20px 16px", borderRadius: "20px", background: "var(--crm-rust)", color: "#fff" }}>
      {items.map((m, i) => (
        <div key={m.label} style={{ display: "flex", flexDirection: "column", gap: "4px", padding: i % n ? "0 0 0 20px" : "0 20px 0 0", borderLeft: i % n ? "1px solid rgba(255,255,255,.22)" : "0", minWidth: 0 }}>
          <span style={{ width: "18px", height: "3px", borderRadius: "2px", background: i ? "transparent" : "var(--crm-amber)", marginBottom: "6px", display: i >= n ? "none" : "block" }} />
          <span style={{ fontSize: fs(13), color: "var(--crm-peach-soft)", whiteSpace: "nowrap" }}>{m.label}</span>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(34), letterSpacing: "-0.035em", lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{m.value}</span>
          <span style={{ minHeight: "16px", fontSize: fs(12), fontWeight: 500, color: m.good ? "var(--crm-delta-good)" : "var(--crm-delta-bad)" }}>{m.delta}</span>
        </div>
      ))}
    </div>
  );
}

/** T01 (v3) · Team Insight's head: the avatar left, "Hello, …" and the line under it, the house right; then, for CRM ·
 * Manage, Team performance | Ads performance (the Ads side is the Ads Performance page drawn under this head). */
export function Phone4aTeamHead({ h }: { h: { greet: string; sub: string; ini: string; house: boolean; exit: () => void; sw: { ads: boolean; team: () => void; adsPick: () => void } | null } }) {
  const seg = (label: string, on: boolean, pick: () => void) => (
    <button type="button" onClick={pick} aria-pressed={on} style={{ ...BTN, flex: 1, height: "34px", borderRadius: "17px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs(13), fontWeight: 500,
      background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{label}</button>);
  return (<>
    <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ flex: "none", width: "40px", height: "40px", borderRadius: "50%", background: "var(--crm-ink)", color: "#fff", display: "grid", placeItems: "center", fontFamily: TIGHT, fontSize: fs(14), fontWeight: 500 }}>{h.ini}</span>
      <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <h1 style={{ margin: 0, fontFamily: TIGHT, fontSize: fs(20), fontWeight: 500, letterSpacing: "-0.01em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.greet}</h1>
        <span style={{ fontSize: fs(12), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.sub}</span>
      </span>
      {h.house && <button type="button" onClick={h.exit} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ ...BTN, flex: "none", width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", boxSizing: "border-box", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)" }}><Ic name="house" size={18} /></button>}
    </div>
    {h.sw && <div style={{ flex: "none", display: "flex", padding: "3px", borderRadius: "20px", background: "var(--crm-field)" }}>{seg("Team performance", !h.sw.ads, h.sw.team)}{seg("Ads performance", h.sw.ads, h.sw.adsPick)}</div>}
  </>);
}

type SplitRow = { team: string; c: string; v: string; range: number; set: (e: RChangeEvent<HTMLInputElement>) => void; setN: (e: RChangeEvent<HTMLInputElement>) => void; selAll: (e: FocusEvent<HTMLInputElement>) => void };
type InnerVM = { id: string; name: string; c: string; ok: boolean; modeLbl: string; held: number; count: number; custom: boolean; isEven: boolean; sum: string; sumFg: string; evenLine: string;
  modes: { label: string; pick: () => void; w: number }[]; people: { name: string; txt: string; w: string; locked: boolean }[]; adjust: () => void };
const SLIDER = (pct: number, c: string): CSSProperties => ({ width: "100%", height: "6px", margin: 0, appearance: "none", WebkitAppearance: "none", borderRadius: "3px", border: 0, boxSizing: "border-box",
  background: `linear-gradient(to right, ${c} ${pct}%, var(--crm-track) ${pct}%)`, ["--thumb" as string]: c });
/** T04 (v3) · By team: a row a team — its dot, name (ink) and line, the share in an 84px decimal box, the slider under the row.
 * A team opens to its member breakdown — results only (name, bar, share) — and Adjust split, which opens T04b's sheet. */
export function Phone4aSplitTeams({ s, inner, enterNext }: { s: { splits: SplitRow[] }; inner: InnerVM[]; enterNext: (e: KeyboardEvent<HTMLInputElement>) => void }) {
  // Every team folded at first (the owner, 2026-10-24: "點進split leads , anthony 的會是開著，全部默認收起").
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", margin: "0 -20px", borderTop: "1px solid var(--crm-rule-soft)" }}>
      {/* The split at a glance (2026-10-24: it left the Assignment cards for this page). */}
      <div style={{ display: "flex", gap: "2px", height: "8px", margin: "12px 20px 4px", borderRadius: "4px", overflow: "hidden", background: "var(--crm-track)" }}>
        {s.splits.filter(r => r.range > 0).map((r, i) => <span key={i} style={{ flex: `${r.range} 1 0px`, background: r.c, transition: "flex-grow 200ms" }} />)}
      </div>
      {s.splits.map((r, i) => {
        const g = inner.find(x => x.name === r.team), dir = /director/i.test(r.team), on = !!g && open === g.id;
        const line = g?.held ? `Over the limit · holding ${g.held} lead${g.held === 1 ? "" : "s"}` : g ? (dir ? `${g.people.map(p => p.name).join(", ")} · always first` : `${g.count} ${g.count === 1 ? "person" : "people"} · ${g.modeLbl}`) : "No share";
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "9px 20px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <button type="button" onClick={() => g && setOpen(on ? null : g.id)} style={{ ...BTN, flex: 1, minWidth: 0, display: "flex", gap: "10px", alignItems: "flex-start", textAlign: "left" }}>
                <span style={{ flex: "none", width: "9px", height: "9px", marginTop: "6px", borderRadius: "2px", background: r.c }} />
                <span style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ fontSize: fs(14), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.team}</span>
                  <span style={{ fontSize: fs(11.5), color: g?.held ? "var(--crm-oxblood)" : "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{line}</span>
                </span>
              </button>
              <label style={{ flex: "none", width: "88px", height: "34px", padding: "0 8px 0 6px", boxSizing: "border-box", borderRadius: "10px", border: "1px solid var(--crm-line)", background: "#fff", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                <input type="text" inputMode="decimal" aria-label={`${r.team} share`} value={r.v} onChange={r.setN} onFocus={r.selAll} enterKeyHint="next" onKeyDown={enterNext}
                  style={{ width: "100%", minWidth: 0, border: 0, background: "transparent", textAlign: "right", font: "inherit", fontFamily: TIGHT, fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", outline: "none", padding: 0 }} />
                <span style={{ flex: "none", fontSize: fs(11), color: "var(--crm-faint)" }}>%</span>
              </label>
            </div>
            <input type="range" data-crm-range="" aria-label={`${r.team} slider`} min="0" max="100" step="5" value={r.range} onChange={r.set} style={SLIDER(r.range, r.c)} />
            {on && g && (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px 12px", borderRadius: "12px", background: "var(--crm-sel)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>{g.modes.map(m => (
                  <button key={m.label} type="button" onClick={m.pick} style={{ ...BTN, padding: "2px 0 4px", fontSize: fs(13), color: m.w > 500 ? "var(--crm-ink)" : "var(--crm-muted)", fontWeight: m.w > 500 ? 600 : 500, borderBottom: `2px solid ${m.w > 500 ? "var(--crm-rust)" : "transparent"}` }}>{m.label}</button>))}
                  {/* Adjust split is an icon at the top-right (the owner, 2026-10-24: "adjust split放到右上角，或者變成一個調整的符號"). */}
                  {g.custom && <button type="button" onClick={g.adjust} aria-label="Adjust split" title="Adjust split" style={{ ...BTN, marginLeft: "auto", width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", display: "grid", placeItems: "center", color: "var(--crm-ink)" }}><Ic name="sliders-horizontal" size={14} /></button>}
                </div>
                {g.isEven && <span style={{ fontSize: fs(12), lineHeight: 1.45, color: "var(--crm-muted)" }}>{g.evenLine}</span>}
                {g.custom && g.people.map(p => (
                  <div key={p.name} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 72px 56px", alignItems: "center", gap: "10px", fontSize: fs(13), color: p.locked ? "var(--crm-faint)" : "var(--crm-ink)" }}>
                    <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    <span style={{ height: "4px", borderRadius: "2px", background: "var(--crm-track)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: p.w, background: "var(--crm-rust)" }} /></span>
                    <span style={{ display: "flex", justifyContent: "flex-end", fontVariantNumeric: "tabular-nums" }}>{p.locked ? <Ic name="lock" size={12} /> : p.txt}</span>
                  </div>))}
                {g.custom && !g.ok && <span style={{ fontSize: fs(12), color: g.sumFg }}>{g.sum}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** T04b (v3) · Adjust split: a bottom sheet over Split leads — Evenly / By % / By max; a row a person (initials, name, a
 * fixed 14px lock slot — set by you —, an 88px decimal box, the slider under it); Total 100% ✓; Cancel / Apply. The list
 * scrolls inside the sheet, so a keyboard never covers the foot. */
export function Phone4aAdjustSheet({ s }: { s: { name: string; c: string; sub: string; ok: boolean; total: string; unit: string; modeLbl: string; modes: { label: string; pick: () => void; w: number }[];
  people: { name: string; ini: string; mine: boolean; range: number; max: number; v: string; slide: (e: RChangeEvent<HTMLInputElement>) => void; set: (e: RChangeEvent<HTMLInputElement>) => void; locked: boolean }[];
  cancel: () => void; apply: (() => void) | undefined } }) {
  const pct = s.modeLbl === "By %", even = s.modeLbl === "Evenly";
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 20, display: "flex", flexDirection: "column", justifyContent: "flex-end", background: "rgba(42,22,12,.38)" }} onClick={s.cancel}>
      <div role="dialog" aria-label={`Adjust split · ${s.name}`} onClick={e => e.stopPropagation()} style={{ maxHeight: "78%", display: "flex", flexDirection: "column", borderRadius: "24px 24px 0 0", background: "#fff" }}>
        <span style={{ alignSelf: "center", width: "36px", height: "4px", margin: "8px 0 4px", borderRadius: "2px", background: "var(--crm-line)" }} />
        <div style={{ flex: "none", display: "flex", alignItems: "flex-start", gap: "10px", padding: "4px 20px 10px" }}>
          <span style={{ flex: "none", width: "9px", height: "9px", marginTop: "8px", borderRadius: "2px", background: s.c }} />
          <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
            <span style={{ fontFamily: TIGHT, fontSize: fs(16), fontWeight: 500, color: "var(--crm-ink)" }}>{s.name}</span>
            <span style={{ fontSize: fs(11.5), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.sub}</span>
          </span>
          <button type="button" aria-label="Close" onClick={s.cancel} style={{ ...BTN, display: "flex", padding: "4px", color: "var(--crm-faint)" }}><Ic name="x" size={18} /></button>
        </div>
        <div style={{ flex: "none", display: "flex", gap: "2px", margin: "0 20px 6px", padding: "3px", borderRadius: "20px", background: "var(--crm-field)" }}>{s.modes.map(m => (
          <button key={m.label} type="button" onClick={m.pick} aria-pressed={m.w > 500} style={{ ...BTN, flex: 1, height: "30px", borderRadius: "15px", fontSize: fs(12.5), fontWeight: 500,
            background: m.w > 500 ? "#fff" : "transparent", boxShadow: m.w > 500 ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: m.w > 500 ? "var(--crm-ink)" : "var(--crm-muted)" }}>{m.label}</button>))}</div>
        <div style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", overscrollBehavior: "contain", padding: "0 20px" }}>
          {s.people.map(p => (
            <div key={p.name} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "8px 0", borderTop: "1px solid var(--crm-rule-soft)", opacity: p.locked ? 0.55 : 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ flex: "none", width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-ink)", fontSize: fs(10), fontWeight: 500 }}>{p.ini}</span>
                <span style={{ flex: 1, minWidth: 0, fontSize: fs(13.5), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                <span style={{ flex: "none", width: "14px", display: "flex", justifyContent: "center", color: "var(--crm-faint)" }}>{(p.mine || p.locked) && <Ic name="lock" size={12} />}</span>
                {even ? <span style={{ flex: "none", width: "88px", textAlign: "right", fontSize: fs(13), color: "var(--crm-muted)" }}>In turn</span>
                  : p.locked ? <span style={{ flex: "none", width: "88px", textAlign: "right", fontSize: fs(12), color: "var(--crm-faint)" }}>Locked</span>
                  : <label style={{ flex: "none", width: "78px", height: "32px", padding: "0 8px", boxSizing: "border-box", borderRadius: "10px", border: `1px solid ${p.mine ? "var(--crm-rust)" : "var(--crm-line)"}`, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px" }}>
                      <input type="text" inputMode={pct ? "decimal" : "numeric"} aria-label={`${p.name} share`} value={p.v} onChange={p.set} onFocus={e => e.currentTarget.select()}
                        style={{ width: "100%", minWidth: 0, border: 0, background: "transparent", textAlign: "right", font: "inherit", fontFamily: TIGHT, fontSize: fs(14.5), fontWeight: 500, color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", outline: "none", padding: 0 }} />
                      <span style={{ fontSize: fs(11), color: "var(--crm-faint)" }}>{s.unit}</span>
                    </label>}
              </div>
              {!even && !p.locked && <input type="range" data-crm-range="" aria-label={`${p.name} slider`} min="0" max={p.max} step={pct ? 0.5 : 1} value={p.range} onChange={p.slide} style={{ ...SLIDER((p.range / p.max) * 100, "var(--crm-rust)"), marginLeft: "34px", width: "calc(100% - 34px)" }} />}
            </div>
          ))}
        </div>
        {!even && <div style={{ flex: "none", margin: "8px 20px 0", padding: "9px 14px", borderRadius: "12px", background: "var(--crm-sel)", display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ flex: 1, fontSize: fs(13), color: "var(--crm-muted)" }}>Total</span>
          <span style={{ fontFamily: TIGHT, fontSize: fs(15), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: s.ok ? "var(--crm-ink)" : "var(--crm-oxblood)" }}>{pct ? s.total : `up to ${s.total}`}</span>
          {s.ok && <span style={{ display: "flex", color: "var(--crm-ink)" }}><Ic name="check" size={14} /></span>}
        </div>}
        <div style={{ flex: "none", display: "flex", gap: "10px", padding: "10px 20px calc(12px + var(--safe-bottom, 0px))" }}>
          <button type="button" onClick={s.cancel} style={{ ...BTN, flex: 1, height: "44px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)" }}>Cancel</button>
          <button type="button" onClick={s.apply} disabled={!s.apply} style={{ ...BTN, flex: 1.6, height: "44px", borderRadius: "22px", background: s.apply ? "var(--crm-rust)" : "var(--crm-faint-2)", color: "#fff", fontSize: fs(15), fontWeight: 600 }}>Apply</button>
        </div>
      </div>
    </div>
  );
}

/** Book visit: the showroom's staff-only remarks under the times (2026-10-23), as the desktop's Appointment sheet shows them. */
export function Phone4aRoomRemarks({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "4px", padding: "10px 12px", borderRadius: "12px", background: "var(--crm-sel)" }}>
      <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: fs(11), fontWeight: 500, color: "var(--crm-muted)" }}><Ic name="lock" size={10} />Remarks · staff only</span>
      <span style={{ fontSize: fs(13), lineHeight: 1.45, color: "var(--crm-ink)", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{text}</span>
    </div>
  );
}

type ProfRow = { label: string; icon: Icon4a; open: () => void; n: string; badge: boolean };
/** v3 T06 / M12 · a Profile as the prototype draws it: the house top-right, the avatar centred with its name and line, on
 * the Team side View as a team member (the dark card), then groups of rows (MANAGE · ME, or MESSAGES) as white cards —
 * each row a solid rust tile, a count or state, a chevron. */
export function Phone4aProfile({ p }: { p: { ini: string; name: string; sub: string; house: boolean; exit: () => void; viewAs?: () => void; groups: { title: string; rows: ProfRow[] }[]; flush?: boolean } }) {
  const Group = ({ title, rows }: { title: string; rows: ProfRow[] }) => rows.length ? (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <span style={{ padding: "0 6px", fontSize: fs(11), fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{title}</span>
      <div style={{ borderRadius: "16px", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.04), 0 6px 18px rgba(42,22,12,.06)", overflow: "hidden" }}>
        {rows.map((r, i) => (
          <button key={r.label} type="button" onClick={r.open} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "14px", padding: "12px 16px", boxSizing: "border-box", borderTop: i ? "1px solid var(--crm-rule-soft)" : 0, textAlign: "left" }}>
            <span style={{ flex: "none", width: "34px", height: "34px", borderRadius: "10px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff" }}><Ic name={r.icon} size={17} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)" }}>{r.label}</span>
            {r.n && (r.badge
              ? <span style={{ minWidth: "22px", height: "22px", padding: "0 6px", boxSizing: "border-box", borderRadius: "11px", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", fontSize: fs(12), fontWeight: 600 }}>{r.n}</span>
              : <span style={{ fontSize: fs(14), color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{r.n}</span>)}
            <span style={{ display: "flex", color: "var(--crm-faint-2)" }}><Ic name="chevron-right" size={15} /></span>
          </button>
        ))}
      </div>
    </div>
  ) : null;
  return (
    // flush: drawn inside a page that pads itself (Mine's Profile) — it takes that padding back.
    <main data-prof-glow="1" style={{ flex: "1 1 auto", minHeight: 0, margin: p.flush ? "-14px -20px -24px" : 0, overflowY: "auto", scrollbarWidth: "none", padding: "14px 20px 24px", display: "flex", flexDirection: "column", gap: "16px",
      background: "linear-gradient(180deg, var(--crm-sand) 0%, var(--crm-sel) 18%, #fff 42%)" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", minHeight: "40px" }}>
        {p.house && <button type="button" onClick={p.exit} title="Back to Revenue app" aria-label="Back to Revenue app" style={{ ...BTN, width: "40px", height: "40px", borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.7)", color: "var(--crm-ink)" }}><Ic name="house" size={18} /></button>}
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px", marginTop: "-6px" }}>
        <span style={{ width: "92px", height: "92px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-rust)", color: "#fff", border: "4px solid #fff", boxShadow: "0 4px 14px rgba(42,22,12,.12)", fontFamily: TIGHT, fontSize: fs(32), fontWeight: 500 }}>{p.ini}</span>
        <h1 style={{ margin: "6px 0 0", fontFamily: TIGHT, fontSize: fs(22), fontWeight: 500, letterSpacing: "-0.01em", color: "var(--crm-ink)" }}>{p.name}</h1>
        <span style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>{p.sub}</span>
      </div>
      {p.viewAs && <button type="button" onClick={p.viewAs} style={{ ...BTN, display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px", borderRadius: "16px", background: "var(--crm-ink)", color: "#fff", textAlign: "left" }}>
        <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", background: "rgba(255,255,255,.12)", color: "var(--crm-peach)" }}><Ic name="users" size={17} /></span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: fs(15), fontWeight: 600 }}>View as a team member</span>
          <span style={{ fontSize: fs(12), color: "var(--crm-peach-soft)" }}>Open anyone&apos;s CRM · reply and book for them</span>
        </span>
        <span style={{ display: "flex", color: "var(--crm-peach-soft)" }}><Ic name="chevron-right" size={15} /></span>
      </button>}
      {p.groups.map(g => <Group key={g.title} title={g.title} rows={g.rows} />)}
    </main>
  );
}

/** M11 · Mine's Insight: Month / Week / Day / Range, the rust hero, the counts, Avg. reply time and Leads by status. */
export function Phone4aInsightMine({ v }: { v: { p4: {
  periods: { label: string; on: boolean; pick: () => void }[]; range: string;
  hero: { label: string; value: string; delta: string; good: boolean }[];
  counts: { label: string; n: number; open: MouseH }[]; reply: { n: string; unit: string };
  status: { label: string; n: number; c: string; hot: boolean; open: () => void }[]; total: number } } }) {
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
        <div style={{ display: "flex", gap: "2px", height: "8px", borderRadius: "4px", overflow: "hidden", background: "var(--crm-track)" }}>
          {P.status.filter(s => s.n).map(s => <span key={s.label} style={{ flex: s.n, background: s.c }} />)}
        </div>
        {/* v3 (M Insight): each row has its chevron and opens Inbox filtered by that status. */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", columnGap: "20px" }}>
          {P.status.map(s => (
            <button key={s.label} type="button" onClick={s.open} style={{ ...BTN, display: "flex", alignItems: "center", gap: "8px", height: "34px", borderBottom: "1px solid var(--crm-rule-soft)", fontSize: fs(13) }}>
              <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.c, flex: "none" }} />
              <span style={{ color: s.hot ? "var(--crm-oxblood)" : "var(--crm-ink)" }}>{s.label}</span>
              <span style={{ marginLeft: "auto", fontWeight: 500, fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{s.n}</span>
              <span style={{ flex: "none", display: "flex", color: "var(--crm-faint-2)" }}><Ic name="chevron-right" size={11} /></span>
            </button>
          ))}
        </div>
        <span style={{ fontSize: fs(12), color: "var(--crm-faint)" }}>Tap a status to open those leads in Inbox</span>
      </div>
    </main>
  );
}


/** M10 · the Calendar's title row: "Calendar" and its views (Month · Week · Day — production's three; 4a's segmented look). */
export function Phone4aCalHead({ v }: { v: { calViews: { label: string; weight: number; pick: () => void }[] } }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", padding: "0 20px" }}>
      <h1 style={{ margin: 0, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(30), letterSpacing: "-0.025em", lineHeight: 1.2 }}>Calendar</h1>
      <div style={{ display: "flex", padding: "4px", borderRadius: "22px", background: "var(--crm-field)" }}>
        {v.calViews.map(o => { const on = o.weight > 600;
          return <button key={o.label} type="button" onClick={o.pick} style={{ ...BTN, height: "34px", padding: "0 14px", borderRadius: "17px", fontSize: fs(14), fontWeight: on ? 500 : 400, background: on ? "var(--crm-rust)" : "transparent", color: on ? "#fff" : "var(--crm-muted)" }}>{o.label}</button>; })}
      </div>
    </div>
  );
}

type CalCell = { n: number; pick: () => void; isT: boolean; isS: boolean; inM: boolean; has: boolean; evC: string };
/** M10 · the month: October 2026 with Today and ‹ ›, the weekday letters, a number per day and a dot under a day with visits. */
export function Phone4aCalMonth({ v }: { v: { cal4: { month: string; prev: () => void; next: () => void }; calToday: (e: RMouseEvent<HTMLElement>) => void; calWk: string[]; calCells: CalCell[];
  calSwDown: (e: RPointerEvent<HTMLElement>) => void; calSwUp: (e: RPointerEvent<HTMLElement>) => void } }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "0 10px 14px", borderBottom: "1px solid var(--crm-rule)" }}>
      <div data-drag-scroll="" style={{ display: "flex", alignItems: "center", gap: "4px", padding: "4px 10px 0" }}>
        <span style={{ flex: 1, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(19), color: "var(--crm-ink)" }}>{v.cal4.month}</span>
        <button type="button" onClick={v.calToday} style={{ ...BTN, height: "30px", padding: "0 12px", marginRight: "6px", borderRadius: "15px", border: "1px solid var(--crm-line)", fontSize: fs(13), fontWeight: 500, color: "var(--crm-ink)" }}>Today</button>
        <button type="button" onClick={v.cal4.prev} title="Previous month" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink)" }}><Ic name="chevron-left" size={20} /></button>
        <button type="button" onClick={v.cal4.next} title="Next month" style={{ ...BTN, width: "34px", height: "34px", display: "grid", placeItems: "center", color: "var(--crm-ink)" }}><Ic name="chevron-right" size={20} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))" }}>
        {v.calWk.map((w, i) => <span key={i} style={{ textAlign: "center", fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)", padding: "4px 0" }}>{w}</span>)}
      </div>
      <div onPointerDown={v.calSwDown} onPointerUp={v.calSwUp} style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", rowGap: "4px", touchAction: "pan-y", userSelect: "none" }}>
        {v.calCells.map((c, i) => (
          <button key={i} type="button" onClick={c.pick} style={{ ...BTN, height: "42px", display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", visibility: c.inM ? "visible" : "hidden" }}>
            <span style={{ width: "34px", height: "34px", borderRadius: "50%", display: "grid", placeItems: "center", fontSize: fs(16), fontVariantNumeric: "tabular-nums", fontWeight: c.isT ? 500 : 400,
              background: c.isT ? "var(--crm-rust)" : c.isS ? "var(--crm-sel)" : "transparent", color: c.isT ? "#fff" : "var(--crm-ink)" }}>{c.n}</span>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: c.has ? c.evC : "transparent" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

type CalItem = { name: string; room: string; open: unknown; t: string; ap: string; kick: string };
type CalBtn = { label: string; kind?: "main" | "green"; on: () => void };
/** M10 (v3) · two-part cards on the pale cream, grouped by day — the name and room on top, the buttons below in equal
 * widths. Today's is green (its 4 px bar, TODAY tag and "in 2 h"): Change · No show · Show up (green). Did they come?:
 * Change · No show · Show up. Upcoming: Change · Send reminder (Send again once sent) — every button production's. */
export function Phone4aCalLists({ v }: { v: {
  hasToday: boolean; todayCount: string; noUpcoming: boolean; upTitle: string; upCount: string;
  todayList: (CalItem & { due: boolean; soon: string; change: unknown; came: () => void; noShow: () => void })[];
  upList: (CalItem & { done: boolean; remind: () => void; rLabel: string; change: unknown })[]; cal4: { today: string } } }) {
  const Kick = ({ children }: { children: ReactNode }) => <span style={{ padding: "4px 4px 0", fontSize: fs(11), fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{children}</span>;
  const Card = ({ a, today, btns }: { a: CalItem; today?: boolean; btns: CalBtn[] }) => {
    const bg = today ? "var(--crm-today-bg)" : "#fff", bd = today ? "var(--crm-today-line)" : "var(--crm-nav-line)", bar = `inset 4px 0 0 ${today ? "var(--crm-today)" : "transparent"}`;
    return (<div>
      <div style={{ display: "flex", gap: "12px", padding: "12px 14px 10px", borderRadius: "16px 16px 0 0", background: bg, border: `1px solid ${bd}`, borderBottom: 0, boxShadow: bar }}>
        <button type="button" onClick={a.open as () => void} style={{ ...BTN, width: "52px", flex: "none", display: "flex", flexDirection: "column", gap: "1px", alignItems: "flex-start" }}>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(17), fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{a.t}</span>
          <span style={{ fontSize: fs(11), color: "var(--crm-faint)" }}>{a.ap}</span>
        </button>
        <button type="button" onClick={a.open as () => void} style={{ ...BTN, flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}>
          <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <span style={{ fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
            {today && <span style={{ flex: "none", height: "20px", padding: "0 8px", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--crm-today)", color: "#fff", fontSize: fs(10), fontWeight: 600, letterSpacing: ".04em" }}><span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#fff" }} />TODAY</span>}
          </span>
          <span style={{ fontSize: fs(12), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.room}</span>
        </button>
      </div>
      <div style={{ display: "flex", gap: "6px", marginTop: "-6px", padding: "6px 14px 12px", background: bg, border: `1px solid ${bd}`, borderTop: 0, borderRadius: "0 0 16px 16px", boxShadow: bar }}>
        {btns.map(x => {
          const fill = x.kind === "green" ? "var(--crm-today)" : x.kind === "main" ? "var(--crm-rust)" : "";
          return <button key={x.label} type="button" onClick={x.on} style={{ ...BTN, flex: "1 1 0", minWidth: 0, height: "36px", borderRadius: "18px", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box", fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap",
            background: fill || "#fff", color: fill ? "#fff" : "var(--crm-ink)", border: `1px solid ${fill || "var(--crm-line)"}` }}>{x.label}</button>;
        })}
      </div>
    </div>);
  };
  // One head a day, as the prototype ("Did they come? · Sat 17 Oct", "Upcoming · Sat 24 Oct").
  const byDay = <T extends CalItem>(xs: T[]) => xs.reduce<[string, T[]][]>((g, x) => { const l = g[g.length - 1]; if (l && l[0] === x.kick) l[1].push(x); else g.push([x.kick, [x]]); return g; }, []);
  const today = v.todayList.filter(a => !a.due), due = v.todayList.filter(a => a.due);
  const marks = (a: (typeof v.todayList)[number], green: boolean): CalBtn[] => [
    { label: "Change", on: a.change as () => void }, { label: "No show", on: a.noShow }, { label: "Show up", kind: green ? "green" : "main", on: a.came }];
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "4px 0 -24px", padding: "14px 16px 28px", background: "var(--crm-hover)", flex: "1 0 auto" }}>
      {v.hasToday && today.length > 0 && (<><Kick>Today · {v.cal4.today}</Kick>{today.map((a, i) => <Card key={"t" + i} a={{ ...a, room: a.soon ? `${a.room} · ${a.soon}` : a.room }} today btns={marks(a, true)} />)}</>)}
      {v.hasToday && byDay(due).map(([d, xs]) => (<Fragment key={"d" + d}><Kick>Did they come? · {d}</Kick>{xs.map((a, i) => <Card key={"d" + d + i} a={a} btns={marks(a, false)} />)}</Fragment>))}
      {v.noUpcoming && (<><Kick>{v.upTitle}</Kick><span style={{ padding: "6px 4px", fontSize: fs(14), color: "var(--crm-muted)" }}>No upcoming appointments.</span></>)}
      {byDay(v.upList).map(([d, xs]) => (<Fragment key={"u" + d}><Kick>Upcoming · {d}</Kick>{xs.map((a, i) => (
        <Card key={"u" + d + i} a={a} btns={[{ label: "Change", on: a.change as () => void }, { label: a.done ? "Send again" : a.rLabel, kind: "main", on: a.remind }]} />))}</Fragment>))}
    </section>
  );
}

/** T03 · an ad on Assignment: its channel, name and headline, the leads, the split bar in team colours, a chevron (the card opens
 * its split) and, unset, "Not set up" (v3). */
export function Phone4aAdCard({ a }: { a: { name: string; head: string; wa: boolean; leads: number; setUp: boolean; held?: boolean; heldTxt?: string; bar: { w: string; c: string; op?: number }[]; edit: () => void } }) {
  // Compact (the owner, 2026-10-23: "下方的廣告也是有沒有可能小一點，如果同時打很多廣告就很亂"): one line — channel, name,
  // leads, chevron — and a thin split bar under it; the headline is the title tooltip.
  return (
    <div onClick={a.edit} title={a.head || undefined} style={{ display: "flex", flexDirection: "column", padding: "11px 12px", borderRadius: "12px", border: `1px solid ${a.setUp ? "var(--crm-tint-attention)" : "var(--crm-line)"}`, background: "#fff", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ flex: "none", display: "flex", color: a.wa ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={a.wa ? "phone" : "message-circle"} size={14} /></span>
        <span style={{ flex: 1, minWidth: 0, fontSize: fs(13.5), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
        {a.held && <span style={{ flex: "none", padding: "2px 7px", borderRadius: "9px", background: "var(--crm-oxblood)", color: "#fff", fontSize: fs(10.5), fontWeight: 600 }}>{a.heldTxt}</span>}
        {/* v3 T03: the whole card opens the split; an unset ad says "Not set up". */}
        {a.setUp && <span style={{ flex: "none", height: "20px", padding: "0 8px", borderRadius: "10px", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-oxblood)", fontSize: fs(11), fontWeight: 500, whiteSpace: "nowrap" }}>Not set up</span>}
        <span style={{ flex: "none", fontSize: fs(12), color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{a.leads} leads</span>
        <span style={{ flex: "none", display: "flex", color: "var(--crm-faint-2)" }}><Ic name="chevron-right" size={13} /></span>
      </div>
    </div>
  );
}

type Room4 = {
  name: string; addr: string; setName: (e: RChangeEvent<HTMLInputElement>) => void; setAddr: (e: RChangeEvent<HTMLInputElement>) => void;
  gmaps: string; waze: string; hasAddr: boolean; cap: number; capMinus?: () => void; capPlus?: () => void;
  days: string[]; grid: { label: string; cells: { on: boolean; pick: () => void }[] }[]; odd: string[];
  closures: { day: string; what: string; rm: () => void }[]; addClosure: () => void; dirty: boolean; cancel: () => void; save: () => void; del: () => void; canDel: boolean;
  hours: { all: { f: string; t: string; apply: (f: string, t: string) => void };
    groups: { label: string; hours: string; open: boolean; days: { l: string; open: boolean; f: string; t: string; set: (f: string, t: string) => void; toggle: () => void }[] }[] };
  remarks: string; setRemarks: (e: RChangeEvent<HTMLTextAreaElement>) => void;
};
const TIME: CSSProperties = { flex: 1, minWidth: 0, height: "40px", padding: "0 12px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", outline: "none", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" };
/** v3 T07 · Opening hours: All days + Apply to all days, then the days grouped by the same hours; a group opens to its days. */
function RoomHours({ h }: { h: Room4["hours"] }) {
  const [f, setF] = useState(h.all.f), [t, setT] = useState(h.all.t), [open, setOpen] = useState<number | null>(null);
  useEffect(() => { setF(h.all.f); setT(h.all.t); }, [h.all.f, h.all.t]);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", alignItems: "baseline" }}>
        <span style={{ flex: 1, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(15) }}>Opening hours</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px", borderRadius: "14px", background: "var(--crm-sel)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ flex: "none", width: "58px", fontSize: fs(13), color: "var(--crm-ink)" }}>All days</span>
          <input type="time" step={3600} aria-label="All days from" value={f} onChange={e => setF(e.target.value)} style={TIME} />
          <span style={{ color: "var(--crm-faint)" }}>–</span>
          <input type="time" step={3600} aria-label="All days to" value={t} onChange={e => setT(e.target.value)} style={TIME} />
        </div>
        <button type="button" onClick={() => h.all.apply(f, t)} style={{ ...BTN, height: "40px", borderRadius: "20px", background: "var(--crm-rust)", color: "#fff", fontSize: fs(14), fontWeight: 600 }}>Apply to all days</button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-line)", borderRadius: "14px", overflow: "hidden" }}>
        {h.groups.map((g, i) => (
          <div key={i} style={{ borderTop: i ? "1px solid var(--crm-rule-soft)" : 0 }}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", height: "42px", padding: "0 14px", boxSizing: "border-box", color: g.open ? "var(--crm-ink)" : "var(--crm-faint)" }}>
              <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: g.open ? "var(--crm-brown)" : "var(--crm-line)" }} />
              <span style={{ flex: 1, textAlign: "left", fontSize: fs(14) }}>{g.label}</span>
              <span style={{ fontSize: fs(14), fontVariantNumeric: "tabular-nums" }}>{g.hours}</span>
              <span style={{ display: "flex", color: "var(--crm-faint-2)", transform: open === i ? "rotate(90deg)" : "none", transition: "transform 150ms" }}><Ic name="chevron-right" size={14} /></span>
            </button>
            {open === i && g.days.map(d => (
              <div key={d.l} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 14px 8px 30px" }}>
                <span style={{ flex: "none", width: "34px", fontSize: fs(13) }}>{d.l}</span>
                {d.open ? <>
                  <input type="time" step={3600} aria-label={d.l + " from"} defaultValue={d.f} onBlur={e => d.set(e.target.value, d.t)} style={{ ...TIME, height: "34px" }} />
                  <input type="time" step={3600} aria-label={d.l + " to"} defaultValue={d.t} onBlur={e => d.set(d.f, e.target.value)} style={{ ...TIME, height: "34px" }} />
                </> : <span style={{ flex: 1, fontSize: fs(13), color: "var(--crm-faint)" }}>Closed</span>}
                <button type="button" onClick={d.toggle} style={{ ...BTN, flex: "none", fontSize: fs(12.5), fontWeight: 500, color: "var(--crm-rust)" }}>{d.open ? "Close" : "Open"}</button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
/** T07 (v3) · a showroom as one page: name and address in place, map chips, Opening hours, Visits per slot, the weekly slots
 * folded to a row, Closures, Remarks (staff only). Delete is the header's trash. */
export function Phone4aRoom({ r }: { r: { q4: Room4 } }) {
  const q = r.q4;
  const [editName, setEditName] = useState(false), [grid, setGrid] = useState(false);
  const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "6px", height: "30px", padding: "0 12px", borderRadius: "15px", background: "var(--crm-field)", color: "var(--crm-ink)", fontSize: fs(12.5), textDecoration: "none" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", paddingBottom: q.dirty ? "70px" : "0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* A phone field is 16 px (the app's rule, so iOS does not zoom): the name is the title until tapped, then a field. */}
        {editName || !q.name
          ? <input autoFocus={editName} value={q.name} onChange={q.setName} onBlur={() => setEditName(false)} placeholder="Showroom name" aria-label="Showroom name" style={{ height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", outline: "none", fontWeight: 500, color: "var(--crm-ink)" }} />
          : <button type="button" onClick={() => setEditName(true)} title="Rename" style={{ ...BTN, textAlign: "left", fontFamily: TIGHT, fontWeight: 500, fontSize: fs(20), letterSpacing: "-0.01em", lineHeight: 1.2, color: "var(--crm-ink)" }}>{q.name}</button>}
        <input value={q.addr} onChange={q.setAddr} placeholder="Add the address" aria-label="Address" style={{ border: 0, padding: 0, background: "transparent", outline: "none", fontSize: fs(13), color: q.addr ? "var(--crm-ink-soft)" : "var(--crm-faint)" }} />
      </div>
      <div style={{ display: "flex", gap: "8px", opacity: q.hasAddr ? 1 : 0.45 }}>
        <a href={q.gmaps} target="_blank" rel="noopener" style={chip}><Ic name="map-pin" size={15} />Google Maps</a>
        <a href={q.waze} target="_blank" rel="noopener" style={chip}><Ic name="map-pin" size={15} />Waze</a>
      </div>
      <RoomHours h={q.hours} />
      {/* The size of the Mon – Sun row above (the owner, 2026-10-24: "跟mon-sun 的欄位一樣大小，看起來整齊"). */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "42px", padding: "0 6px 0 14px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "14px" }}>
        <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "6px" }}>
          <span style={{ fontSize: fs(14), color: "var(--crm-ink)" }}>Visits per slot</span>
          <span style={{ fontSize: fs(12), color: "var(--crm-faint)" }}>1 slot = 1 hour</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", height: "30px", border: "1px solid var(--crm-line)", borderRadius: "15px" }}>
          <button type="button" onClick={q.capMinus} aria-label="Fewer" style={{ ...BTN, width: "30px", height: "30px", fontSize: fs(15), color: q.capMinus ? "var(--crm-ink)" : "var(--crm-line)" }}>−</button>
          <span style={{ minWidth: "22px", textAlign: "center", fontFamily: TIGHT, fontWeight: 500, fontSize: fs(15), fontVariantNumeric: "tabular-nums" }}>{q.cap}</span>
          <button type="button" onClick={q.capPlus} aria-label="More" style={{ ...BTN, width: "30px", height: "30px", fontSize: fs(15), color: q.capPlus ? "var(--crm-ink)" : "var(--crm-line)" }}>+</button>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {/* v3 T07: the weekly slots fold to one row; tapped, the 24 × 7 grid opens. */}
        <button type="button" onClick={() => setGrid(!grid)} aria-expanded={grid} style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", minHeight: "42px", padding: "0 14px", boxSizing: "border-box", border: "1px solid var(--crm-line)", borderRadius: "14px", textAlign: "left" }}>
          <span style={{ display: "flex", color: "var(--crm-ink)" }}><Ic name="calendar" size={15} /></span>
          <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "6px" }}>
            <span style={{ fontSize: fs(14), color: "var(--crm-ink)" }}>Weekly slots</span>
            <span style={{ fontSize: fs(12), color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{grid ? "tap a cell to open or close" : "tap to paint the grid"}</span>
          </span>
          <span style={{ display: "flex", color: "var(--crm-faint-2)", transform: grid ? "rotate(90deg)" : "none", transition: "transform 150ms" }}><Ic name="chevron-right" size={15} /></span>
        </button>
        {grid && <div style={{ display: "grid", gridTemplateColumns: "42px repeat(7, minmax(0,1fr))", columnGap: "5px", rowGap: "5px" }}>
          <span />
          {q.days.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}>{d}</span>)}
          {q.grid.map((row, h) => [
            <span key={"l" + h} style={{ fontSize: fs(11), color: "var(--crm-faint)", lineHeight: "14px" }}>{row.label}</span>,
            ...row.cells.map((c, k) => <button key={h + ":" + k} type="button" onClick={c.pick} aria-label={`${h}:00 day ${k + 1} ${c.on ? "open" : "closed"}`} style={{ ...BTN, height: "14px", borderRadius: "3px", background: c.on ? "var(--crm-brown)" : "var(--crm-field)" }} />),
          ])}
        </div>}
        {q.odd.length > 0 && <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>Also off the hour: {q.odd.join(", ")}</span>}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "baseline", paddingBottom: "6px" }}>
          <span style={{ flex: 1, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(17) }}>Closures</span>
          <button type="button" onClick={q.addClosure} style={{ ...BTN, fontSize: fs(15), fontWeight: 500, color: "var(--crm-rust)" }}>Add</button>
        </div>
        {!q.closures.length && <span style={{ padding: "8px 0", fontSize: fs(14), color: "var(--crm-faint)" }}>None</span>}
        {q.closures.map((c, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "10px", minHeight: "48px", borderBottom: "1px solid var(--crm-rule)" }}>
            <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="calendar-x" size={16} /></span>
            <span style={{ fontSize: fs(16), color: "var(--crm-ink)", whiteSpace: "nowrap" }}>{c.day}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: fs(14), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.what}</span>
            <button type="button" onClick={c.rm} aria-label="Remove closure" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={15} /></button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(15) }}>Remarks</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", height: "22px", padding: "0 8px", borderRadius: "11px", background: "var(--crm-field)", color: "var(--crm-muted)", fontSize: fs(11), fontWeight: 500 }}><Ic name="lock" size={10} />Staff only</span>
        </div>
        <textarea value={q.remarks} onChange={q.setRemarks} rows={3} placeholder="Notes for the team — parking, where to meet the customer…" aria-label="Remarks"
          style={{ padding: "12px 14px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", outline: "none", resize: "none", font: "inherit", lineHeight: 1.45, color: "var(--crm-ink)" }} />
        <span style={{ fontSize: fs(12), color: "var(--crm-faint)" }}>Customers never see this.</span>
      </div>
      {q.dirty && (
        <div style={{ position: "sticky", bottom: "0", display: "flex", gap: "8px", margin: "0 -20px", padding: "12px 20px", background: "#fff", borderTop: "1px solid var(--crm-rule)" }}>
          <button type="button" onClick={q.cancel} style={{ ...BTN, flex: 1, height: "46px", borderRadius: "23px", border: "1px solid var(--crm-line)", fontSize: fs(15), fontWeight: 500 }}>Cancel</button>
          <button type="button" onClick={q.save} style={{ ...BTN, flex: 2, height: "46px", borderRadius: "23px", background: "var(--crm-rust)", color: "#fff", fontSize: fs(15), fontWeight: 500 }}>Save changes</button>
        </div>
      )}
    </div>
  );
}

/** Frame M03 · a filter with no chat in it: the tinted circle and its icon, what shows here and why, and See all chats. */
export function Phone4aEmpty({ e }: { e: { icon: Icon4a; title: string; sub: string; all: (() => void) | null } }) {
  return (
    <div data-inbox-empty="" style={{ minHeight: "460px", padding: "48px 40px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
      <span style={{ width: "72px", height: "72px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-tint-attention)", color: "var(--crm-rust)" }}><Ic name={e.icon} size={28} /></span>
      <span style={{ marginTop: "16px", fontFamily: TIGHT, fontWeight: 500, fontSize: fs(22), letterSpacing: "-0.02em", color: "var(--crm-ink)" }}>{e.title}</span>
      <span style={{ marginTop: "8px", maxWidth: "270px", fontSize: fs(15), lineHeight: 1.5, color: "var(--crm-muted)" }}>{e.sub}</span>
      {e.all && <button type="button" onClick={e.all} style={{ ...BTN, marginTop: "20px", height: "44px", padding: "0 20px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", fontWeight: 500, fontSize: fs(15), color: "var(--crm-ink)" }}>See all chats</button>}
    </div>
  );
}

/**
 * T03 · Assignment › Active (2026-10-22, the owner: its own tab after Ads to teams): every team, each person Active or
 * Locked — a locked member takes no new leads and leaves Assignment's lists, their share to the rest of the team. Saved at
 * by Save — Phone4aActiveSave, in Assignment's title row (the owner, 2026-10-22: "为什么 apps 没有 save button", then "save
 * button overlap"): always there, grey until something changed, Cancel beside it while there are changes.
 */
export function Phone4aActive({ v }: { v: ActiveVM }) {
  const { groups } = v;
  // Each team folds to its head and opens again (the owner, 2026-10-23: "做可以下拉收起展開"); folded at first (2026-10-24:
  // "member work type & active 默認收起") — `opened` keeps the ones opened.
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  return (
    <section style={{ flex: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
      {groups.map(g => { const off = !opened[g.name]; return (
        <div key={g.name} style={{ borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
          <button type="button" aria-expanded={!off} onClick={() => setOpened(x => ({ ...x, [g.name]: off }))} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", boxSizing: "border-box", borderBottom: off ? "0" : "1px solid var(--crm-rule-soft)", textAlign: "left" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: g.color }} />
            <strong style={{ flex: "1", fontSize: fs(13.5), fontWeight: 600, color: "var(--crm-ink)" }}>{g.name}</strong>
            <small style={{ fontSize: fs(11.5), color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{g.count}</small>
            <span style={{ display: "flex", color: "var(--crm-faint)", transform: off ? "none" : "rotate(180deg)", transition: "transform 160ms" }}><Ic name="chevron-down" size={15} /></span>
          </button>
          {!off && g.people.map((p, k) => (
            <div key={p.id} role="button" aria-pressed={p.active} onClick={p.toggle} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "9px 14px", borderTop: k ? "1px solid var(--crm-rule-soft)" : "0", cursor: "pointer", opacity: p.active ? 1 : 0.75 }}>
              <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", background: p.active ? "var(--crm-tint-attention)" : "var(--crm-field)", color: p.active ? "var(--crm-rust)" : "var(--crm-faint)", fontSize: fs(12), fontWeight: 600 }}>{p.ini}</span>
              <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "1px" }}>
                <strong style={{ fontSize: fs(14), fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</strong>
                <small style={{ fontSize: fs(11.5), color: "var(--crm-muted)" }}>{p.active ? p.role : "Locked · no new leads"}</small>
              </span>
              <span style={{ flex: "none", position: "relative", width: "40px", height: "24px", borderRadius: "12px", background: p.active ? "var(--crm-brown)" : "var(--crm-line)", transition: "background 160ms" }}>
                <span style={{ position: "absolute", top: "3px", left: p.active ? "19px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.25)", transition: "left 160ms" }} />
              </span>
            </div>
          ))}
        </div>
      ); })}
    </section>
  );
}

/** Assignment › Active's Save, at the right of the title (grey until a switch changed; Cancel beside it then). */
export function Phone4aActiveSave({ v }: { v: ActiveVM }) {
  return (
    <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "8px" }}>
      {v.dirty && <button type="button" onClick={v.cancel} style={{ height: "36px", padding: "0 14px", borderRadius: "18px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: fs(13), fontWeight: 500, color: "var(--crm-ink)", cursor: "pointer" }}>Cancel</button>}
      <button type="button" onClick={v.save} disabled={!v.dirty} style={{ height: "36px", padding: "0 18px", borderRadius: "18px", border: "0", background: v.dirty ? "var(--crm-rust)" : "var(--crm-line)", font: "inherit", fontSize: fs(13), fontWeight: 600, color: "#fff", whiteSpace: "nowrap", cursor: v.dirty ? "pointer" : "default" }}>{v.dirty ? v.saveLabel : "Save"}</button>
    </span>
  );
}
