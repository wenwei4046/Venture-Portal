"use client";
/**
 * v4 (docs/design_handoff_crm_redesign_v4): the sand menu chip — the Inbox's Brand beside Search (D5a) and Reports' All
 * brands ▾ / All ads ▾ (D6a) — and the Inbox's People / Status filter (D5a, the phone's 2c / 2c·2 brought to the desktop):
 * two buttons with the number picked, the picked ones as removable tags, "N chats of M · Clear all", and a popover where
 * teams, people and statuses are picked several at once and "Show N chats" applies them.
 */
import { useState, type CSSProperties } from "react";
import { Ic } from "../shared/icons4a";

const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, padding: 0, boxSizing: "border-box" };
const TIGHT = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";

export interface MenuOpt { label: string; on: boolean; pick: () => void; n?: number | string; title?: string }

/** A sand chip (36 px) that opens its list: one pick, ticked. D5a draws it r 9 / 0 10 / chevron 11, D6a r 10 / 0 12 / 12. */
export function MenuChip({ label, opts, aria, radius = 9, pad = "0 10px", gap = 6, chev = 11, maxW, menuW = 240, on = false }: {
  label: string; opts: MenuOpt[]; aria: string; radius?: number; pad?: string; gap?: number; chev?: number; maxW?: number; menuW?: number; on?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", flex: "none", minWidth: 0, maxWidth: maxW ? `${maxW}px` : undefined, display: "flex" }}>
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} aria-label={`${aria}: ${label}`} style={{ ...BTN, height: "36px", maxWidth: "100%", padding: pad, borderRadius: `${radius}px`, display: "flex", alignItems: "center", gap: `${gap}px`,
        font: "500 13px Inter, sans-serif", whiteSpace: "nowrap", background: "var(--crm-field)", color: "var(--crm-ink)", boxShadow: on ? "inset 0 0 0 1px var(--crm-line)" : "none" }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span><Ic name="chevron-down" size={chev} />
      </button>
      {open && (<>
        <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
        <div role="listbox" aria-label={aria} style={{ position: "absolute", top: "42px", left: 0, zIndex: 21, width: `${menuW}px`, maxHeight: "420px", overflow: "auto", padding: "6px", boxSizing: "border-box", background: "#fff", borderRadius: "10px",
          boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "grid", gridAutoRows: "max-content", gap: "1px" }}>
          {opts.map(o => (
            <button key={o.label} type="button" role="option" aria-selected={o.on} title={o.title ?? o.label} onClick={() => { o.pick(); setOpen(false); }} style={{ ...BTN, minHeight: "34px", padding: "6px 8px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "10px",
              font: `${o.on ? 600 : 400} 13px Inter, sans-serif`, background: o.on ? "var(--crm-sel)" : "transparent", color: "var(--crm-ink)" }} className="crm4a-row">
              <span style={{ flex: 1, minWidth: 0, lineHeight: 1.35 }}>{o.label}</span>
              {o.n != null && <span style={{ flex: "none", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{o.n}</span>}
              <span style={{ flex: "none", width: "16px", display: "flex", color: "var(--crm-rust)" }}>{o.on && <Ic name="check" size={14} />}</span>
            </button>
          ))}
        </div>
      </>)}
    </span>
  );
}

export interface InboxFilterBits {
  peopleN: number; statusN: number; who: string[]; st: string[];
  teams: { key: string; val: string | null; label: string; dot: string; n: number; people: { id: string; label: string; n: number }[] }[];
  statuses: { label: string; dot: string; n: number; hot: boolean }[];
  chips: { key: string; label: string; dot: string; round: boolean; remove: () => void }[];
  shownN: number; totalN: number;
  count(who: string[], st: string[]): number;
  apply(who: string[], st: string[]): void;
  clear(): void;
}

const pill = (on: boolean, h: number): CSSProperties => ({ ...BTN, height: `${h}px`, padding: h === 34 ? "0 11px" : "0 13px", borderRadius: `${h / 2}px`, display: "flex", alignItems: "center", gap: h === 34 ? "6px" : "7px",
  font: "500 13px Inter, sans-serif", background: on ? "var(--crm-sel)" : "#fff", border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, color: "var(--crm-ink)", whiteSpace: "nowrap" });

/** D5a's filter: People / Status buttons, the tags, the result line; either button opens the 2c·2 picker over the list. */
export function InboxFilter({ f }: { f: InboxFilterBits }) {
  const [draft, setDraft] = useState<{ who: string[]; st: string[] } | null>(null);
  const open = (sec: "people" | "status") => { setDraft({ who: f.who, st: f.st }); setTimeout(() => document.querySelector(`[data-ib-sec="${sec}"]`)?.scrollIntoView({ block: "nearest" }), 0); };
  const tg = (list: string[], v: string) => (list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  const Btn = ({ sec, label, n }: { sec: "people" | "status"; label: string; n: number }) => (
    <button type="button" onClick={() => open(sec)} aria-expanded={!!draft} style={{ ...BTN, flex: 1, minWidth: 0, height: "36px", padding: "0 10px", borderRadius: "9px", display: "flex", alignItems: "center", gap: "7px",
      background: "var(--crm-field)", border: "1px solid transparent", color: "var(--crm-ink)" }}>
      {sec === "people" ? <span style={{ display: "flex", flex: "none" }}><Ic name="users" size={14} /></span> : <span style={{ width: "9px", height: "9px", flex: "none", borderRadius: "3px", background: "var(--crm-ink)" }} />}
      <span style={{ flex: 1, minWidth: 0, font: "600 13px Inter, sans-serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      {n > 0 && <span style={{ minWidth: "18px", height: "18px", padding: "0 5px", boxSizing: "border-box", borderRadius: "9px", display: "flex", alignItems: "center", justifyContent: "center", font: `600 10.5px ${TIGHT}`, background: "var(--crm-ink)", color: "#fff" }}>{n}</span>}
      <span style={{ display: "flex", flex: "none", color: "var(--crm-muted)" }}><Ic name="chevron-down" size={11} /></span>
    </button>
  );
  const d = draft;
  return (
    <>
      <div style={{ display: "flex", gap: "8px", position: "relative" }}>
        <Btn sec="people" label="People" n={f.peopleN} /><Btn sec="status" label="Status" n={f.statusN} />
        {d && (<>
          <div onClick={() => setDraft(null)} style={{ position: "fixed", inset: 0, zIndex: 20 }} />
          <div role="dialog" aria-label="Filter chats" style={{ position: "absolute", top: "44px", left: 0, zIndex: 21, width: "400px", maxHeight: "min(620px, calc(100vh - 220px))", overflow: "auto", boxSizing: "border-box", padding: "18px 20px 20px",
            background: "#fff", borderRadius: "16px", boxShadow: "0 16px 36px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ font: `500 20px ${TIGHT}`, letterSpacing: "-0.01em", color: "var(--crm-ink)" }}>Filter chats</span>
              <button type="button" onClick={() => setDraft({ who: [], st: [] })} style={{ ...BTN, marginLeft: "auto", font: "500 14px Inter, sans-serif", color: "var(--crm-rust)" }}>Clear all</button>
            </div>
            <div data-ib-sec="people" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ font: "600 11px Inter, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--crm-brown)" }}>People</span>
                <span style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Pick teams or people</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {f.teams.map(t => { const on = t.val ? d.who.includes(t.val) : t.people.length > 0 && t.people.every(p => d.who.includes(p.id));
                  return <button key={t.key} type="button" aria-pressed={on} onClick={() => setDraft({ ...d, who: t.val ? tg(d.who, t.val) : on ? d.who.filter(x => !t.people.some(p => p.id === x)) : [...d.who, ...t.people.map(p => p.id).filter(id => !d.who.includes(id))] })} style={pill(on, 38)}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: t.dot }} />{t.label}<span style={{ fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{t.n}</span>
                    {on && <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="check" size={13} /></span>}</button>; })}
              </div>
              {f.teams.filter(t => t.val && d.who.includes(t.val) && t.people.length).map(t => (
                <div key={t.key} style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 12px", borderRadius: "14px", background: "var(--crm-hover)" }}>
                  <div style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{t.label} · people</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {t.people.map(p => { const on = d.who.includes(p.id);
                      // A person picked inside a team narrows it to them (the team's chip goes, the person stays).
                      return <button key={p.id} type="button" aria-pressed={on} onClick={() => setDraft({ ...d, who: on ? d.who.filter(x => x !== p.id) : [...d.who.filter(x => x !== t.val), p.id] })} style={pill(on, 34)}>
                        {p.label}<span style={{ fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{p.n}</span></button>; })}
                  </div>
                </div>
              ))}
              {/* People picked whose team chip is not on: still shown so they can be taken off. */}
              {f.teams.flatMap(t => (t.val && d.who.includes(t.val) ? [] : t.people.filter(p => d.who.includes(p.id)).map(p => ({ t, p })))).length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {f.teams.flatMap(t => (t.val && d.who.includes(t.val) ? [] : t.people.filter(p => d.who.includes(p.id)).map(p => (
                    <button key={p.id} type="button" aria-pressed onClick={() => setDraft({ ...d, who: d.who.filter(x => x !== p.id) })} style={pill(true, 34)}>
                      <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: t.dot }} />{p.label}<span style={{ fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{p.n}</span></button>))))}
                </div>
              )}
            </div>
            <div data-ib-sec="status" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", alignItems: "baseline" }}><span style={{ font: "600 11px Inter, sans-serif", letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--crm-brown)" }}>Status</span>
                <span style={{ marginLeft: "auto", font: "400 12px Inter, sans-serif", color: "var(--crm-faint)" }}>Pick one or more</span></div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {f.statuses.map(s => { const on = d.st.includes(s.label);
                  return <button key={s.label} type="button" aria-pressed={on} onClick={() => setDraft({ ...d, st: tg(d.st, s.label) })} style={pill(on, 38)}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "2px", background: s.dot }} />{s.label}<span style={{ fontVariantNumeric: "tabular-nums", color: s.hot && s.n ? "var(--crm-oxblood)" : "var(--crm-faint)" }}>{s.n}</span>
                    {on && <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="check" size={13} /></span>}</button>; })}
              </div>
            </div>
            <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
              <button type="button" onClick={() => setDraft(null)} style={{ ...BTN, flex: 1, height: "44px", borderRadius: "22px", textAlign: "center", font: "500 14px Inter, sans-serif", border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }}>Cancel</button>
              <button type="button" onClick={() => { f.apply(d.who, d.st); setDraft(null); }} style={{ ...BTN, flex: 1.6, height: "44px", borderRadius: "22px", textAlign: "center", font: "500 14px Inter, sans-serif", background: "var(--crm-rust)", color: "#fff" }}>
                {(() => { const n = f.count(d.who, d.st); return `Show ${n} chat${n === 1 ? "" : "s"}`; })()}</button>
            </div>
          </div>
        </>)}
      </div>
      {f.chips.length > 0 && (
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {f.chips.map(c => (
            <span key={c.key} style={{ flex: "none", height: "28px", padding: "0 6px 0 10px", boxSizing: "border-box", borderRadius: "14px", display: "flex", alignItems: "center", gap: "5px", font: "500 12px Inter, sans-serif", background: "var(--crm-field)", color: "var(--crm-ink)" }}>
              <span style={{ width: "7px", height: "7px", borderRadius: c.round ? "50%" : "2px", background: c.dot }} />{c.label}
              <button type="button" onClick={c.remove} aria-label={`Remove ${c.label}`} style={{ ...BTN, width: "16px", height: "16px", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}><Ic name="x" size={10} /></button>
            </span>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "baseline", gap: "5px", font: "400 12.5px Inter, sans-serif", color: "var(--crm-muted)" }}>
        <b style={{ fontWeight: 600, color: "var(--crm-ink)" }}>{f.shownN} chat{f.shownN === 1 ? "" : "s"}</b>of {f.totalN}
        {(f.chips.length > 0) && <button type="button" onClick={f.clear} style={{ ...BTN, marginLeft: "auto", font: "500 12.5px Inter, sans-serif", color: "var(--crm-rust)" }}>Clear all</button>}
      </div>
    </>
  );
}
