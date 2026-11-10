"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Ic } from "../shared/icons4a";
import { fs, TIGHT } from "../shared/phone4a";
import type { ShowroomsPageVM } from "./vm/rooms";

/**
 * Profile › Showrooms on the phone's Control panel — v4 frames 3a, 4a, 4a·2, 4a·3 (docs/design_handoff_crm_redesign_v4,
 * `CRM Optimized Phone.dc.html`), every size, colour and radius lifted from the frames: the header (back, title, the rust
 * +), a tab a showroom (the saver's initials on one with a draft), the draft's banner, Details, Opening hours (a row a
 * weekday — tapped, its hours open under it; Copy Mon to all; the slot grid behind *Fine-tune on the slot grid*), Bookings,
 * Closures, Remarks, Delete this showroom; the bar (unsaved changes: Save draft · Publish; a draft: Discard · Publish) and,
 * on Back with unsaved changes, the leave sheet. Behaviour: vm/rooms.ts › showroomsPageVM. Hand-written (it replaces the
 * generated page's in-place showroom — panel-1011-patches.cjs mounts it); the full editor (Add closure) stays generated.
 */
const BTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", padding: 0, margin: 0, boxSizing: "border-box" };
const HEAD: CSSProperties = { fontFamily: "Inter, sans-serif", fontSize: fs(11), fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--crm-muted)" };
const LABEL: CSSProperties = { fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" };
const LINK: CSSProperties = { ...BTN, marginLeft: "auto", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)" };
const HOURS = Array.from({ length: 25 }, (_, h) => `${String(h).padStart(2, "0")}:00`);

function Section({ gap = 10, children }: { gap?: number; children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: `${gap}px` }}>{children}</div>;
}

export function PhoneShowrooms({ v }: { v: ShowroomsPageVM }) {
  const [focus, setFocus] = useState<"" | "name" | "addr" | "rem">("");
  const [day, setDay] = useState<number | null>(null);
  const [grid, setGrid] = useState(false);
  const field = (k: typeof focus): CSSProperties => ({
    boxSizing: "border-box", width: "100%", borderRadius: "12px", outline: "none", background: "#fff", margin: 0,
    border: `1px solid ${focus === k ? "var(--crm-rust)" : "var(--crm-line)"}`,
    // The frame's focused field is a 1.5px rust line; the half pixel is a shadow so nothing moves as it takes the focus.
    boxShadow: focus === k ? "inset 0 0 0 0.5px var(--crm-rust)" : "none",
  });
  return (
    <div data-showrooms4="" style={{ position: "absolute", inset: 0, zIndex: 8, display: "flex", flexDirection: "column", background: "#fff", color: "var(--crm-ink)", fontFamily: "Inter, sans-serif", animation: "fadeIn 160ms ease-out" }}>
      {/* Header: back, the title, + */}
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "4px", padding: "6px 16px 10px" }}>
        <button type="button" onClick={v.back} aria-label="Back to Profile" style={{ ...BTN, width: "44px", height: "44px", display: "flex", alignItems: "center", justifyContent: "center" }}><Ic name="chevron-left" size={24} /></button>
        <h1 style={{ margin: "0 auto 0 0", fontFamily: TIGHT, fontSize: fs(24), fontWeight: 500, letterSpacing: "-0.02em", lineHeight: 1.2 }}>Showrooms</h1>
        <button type="button" onClick={v.add} aria-label="Add showroom" title="Add showroom" style={{ ...BTN, width: "44px", height: "44px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--crm-rust)", color: "#fff" }}><Ic name="plus" size={18} /></button>
      </div>
      {/* A tab a showroom */}
      <div data-drag-scroll="" style={{ flex: "none", display: "flex", gap: "6px", padding: "0 20px 12px", borderBottom: "1px solid var(--crm-rule)", overflowX: "auto", scrollbarWidth: "none" }}>
        {v.tabs.map((t, i) => (
          <button key={i} type="button" onClick={t.pick} aria-pressed={t.on} style={{ ...BTN, flex: "none", height: "36px", padding: "0 14px", borderRadius: "18px", display: "flex", alignItems: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, whiteSpace: "nowrap",
            ...(t.on ? { background: "var(--crm-ink)", color: "#fff" } : { border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }) }}>
            {t.label}
            {t.tag && <span style={{ height: "20px", padding: "0 6px", borderRadius: "10px", display: "inline-flex", alignItems: "center", fontFamily: TIGHT, fontSize: fs(10), fontWeight: 600, background: "var(--crm-amber)", color: "var(--crm-ink)" }}>{t.tag}</span>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "none", display: "flex", flexDirection: "column", gap: "26px", padding: "18px 20px 120px" }}>
        {v.banner && (
          <div data-room-draft="" style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px", borderRadius: "14px", background: "var(--crm-tint-appt)", color: "var(--crm-text-appt)" }}>
            <span style={{ flex: "none", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: TIGHT, fontSize: fs(12), fontWeight: 600, background: "var(--crm-amber)", color: "var(--crm-ink)" }}>{v.banner.ini || <Ic name="pencil" size={14} />}</span>
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
              <div style={{ fontSize: fs(14), fontWeight: 500 }}>{v.banner.title}</div>
              <div style={{ fontSize: fs(13), lineHeight: 1.45 }}>{v.banner.sub}</div>
            </div>
          </div>
        )}
        <Section>
          <div style={HEAD}>Details</div>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={LABEL}>Name</span>
            <input value={v.name} onChange={v.setName} onFocus={() => setFocus("name")} onBlur={() => setFocus("")} placeholder="Showroom name"
              style={{ ...field("name"), height: "46px", padding: "0 14px", fontFamily: TIGHT, fontSize: fs(16), fontWeight: 500, color: "var(--crm-ink)" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={LABEL}>Address</span>
            <textarea value={v.addr} onChange={v.setAddr} onFocus={() => setFocus("addr")} onBlur={() => setFocus("")} rows={1} placeholder="Street, postcode, city, state"
              style={{ ...field("addr"), display: "block", padding: "12px 14px", resize: "none", fieldSizing: "content", fontFamily: "Inter, sans-serif", fontSize: fs(14), fontWeight: 400, lineHeight: 1.45, color: "var(--crm-ink-soft)" } as CSSProperties} />
          </label>
          <div style={{ display: "flex", gap: "8px", opacity: v.hasAddr ? 1 : 0.45 }}>
            {([["Google Maps", v.gmaps, "map-pin"], ["Waze", v.waze, "external-link"]] as const).map(([l, href, icon]) => (
              <a key={l} href={href} target="_blank" rel="noopener" style={{ flex: 1, height: "40px", borderRadius: "20px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", fontSize: fs(13), fontWeight: 500, background: "var(--crm-sel)", color: "var(--crm-ink)", textDecoration: "none" }}><Ic name={icon} size={14} />{l}</a>
            ))}
          </div>
        </Section>
        <Section>
          <div style={{ display: "flex", alignItems: "baseline" }}><div style={HEAD}>Opening hours</div><button type="button" onClick={v.copyMon} style={LINK}>Copy Mon to all</button></div>
          <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--crm-nav-line)", borderRadius: "14px", overflow: "hidden" }}>
            {v.days.map((d, k) => {
              const fg = d.open ? "var(--crm-ink)" : "var(--crm-faint)";
              return (
                <div key={d.l} style={{ borderTop: `1px solid ${k ? "var(--crm-rule-soft)" : "transparent"}` }}>
                  <button type="button" onClick={() => setDay(day === k ? null : k)} aria-expanded={day === k} style={{ ...BTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", height: "44px", padding: "0 14px", textAlign: "left" }}>
                    <span style={{ width: "40px", fontSize: fs(14), fontWeight: 500, color: fg }}>{d.l}</span>
                    <span style={{ flex: 1, fontFamily: TIGHT, fontSize: fs(14), fontWeight: 500, fontVariantNumeric: "tabular-nums", color: fg }}>{d.hours}</span>
                    <span style={{ display: "flex", color: "var(--crm-faint-2)", transform: day === k ? "rotate(90deg)" : "none", transition: "transform 150ms" }}><Ic name="chevron-right" size={12} /></span>
                  </button>
                  {day === k && (
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "0 14px 10px 64px" }}>
                      {d.open ? <>
                        <select aria-label={`${d.l} opens`} value={d.f} onChange={e => d.set(e.target.value, d.t)} style={SELECT}>{HOURS.slice(0, 24).map(h => <option key={h} value={h}>{h}</option>)}</select>
                        <span style={{ color: "var(--crm-faint)" }}>–</span>
                        <select aria-label={`${d.l} closes`} value={d.t} onChange={e => d.set(d.f, e.target.value)} style={SELECT}>{HOURS.slice(1).map(h => <option key={h} value={h}>{h}</option>)}</select>
                      </> : <span style={{ flex: 1, fontSize: fs(13), color: "var(--crm-faint)" }}>Closed all day</span>}
                      <button type="button" onClick={d.toggle} style={{ ...BTN, flex: "none", marginLeft: "auto", fontSize: fs(13), fontWeight: 500, color: "var(--crm-rust)" }}>{d.open ? "Close" : "Open"}</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => setGrid(!grid)} aria-expanded={grid} style={{ ...BTN, display: "flex", alignItems: "center", gap: "12px", height: "52px", padding: "0 14px", borderRadius: "14px", background: "var(--crm-sel)", textAlign: "left" }}>
            <span style={{ display: "flex", color: "var(--crm-brown)" }}><Ic name="layout-grid" size={16} /></span>
            <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ fontSize: fs(14), fontWeight: 500 }}>Fine-tune on the slot grid</span>
              <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>Close single hours, e.g. lunch</span>
            </span>
            <span style={{ display: "flex", color: "var(--crm-faint)", transform: grid ? "rotate(90deg)" : "none", transition: "transform 150ms" }}><Ic name="chevron-right" size={14} /></span>
          </button>
          {grid && <div data-slot-grid="" style={{ display: "grid", gridTemplateColumns: "42px repeat(7, minmax(0,1fr))", columnGap: "5px", rowGap: "5px" }}>
            <span />
            {v.gridDays.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}>{d}</span>)}
            {v.grid.map((row, h) => [
              <span key={"l" + h} style={{ fontSize: fs(11), color: "var(--crm-faint)", lineHeight: "14px" }}>{row.label}</span>,
              ...row.cells.map((c, k) => <button key={h + ":" + k} type="button" onClick={c.pick} aria-label={`${h}:00 day ${k + 1} ${c.on ? "open" : "closed"}`} style={{ ...BTN, height: "14px", borderRadius: "3px", background: c.on ? "var(--crm-brown)" : "var(--crm-field)" }} />),
            ])}
          </div>}
          {v.odd.length > 0 && <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>Also off the hour: {v.odd.join(", ")}</span>}
        </Section>
        <Section>
          <div style={HEAD}>Bookings</div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "12px 14px", borderRadius: "14px", border: "1px solid var(--crm-nav-line)" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1px" }}>
              <div style={{ fontSize: fs(14), fontWeight: 500 }}>Visits per slot</div>
              <div style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>Each slot is one hour</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", height: "44px", borderRadius: "22px", boxSizing: "border-box", border: "1px solid var(--crm-line)" }}>
              <button type="button" onClick={v.capMinus} disabled={!v.capMinus} aria-label="Fewer" style={{ ...BTN, width: "44px", height: "42px", textAlign: "center", fontSize: fs(20), color: v.capMinus ? "var(--crm-muted)" : "var(--crm-line)" }}>−</button>
              <span style={{ width: "24px", textAlign: "center", fontFamily: TIGHT, fontSize: fs(17), fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>{v.cap}</span>
              <button type="button" onClick={v.capPlus} disabled={!v.capPlus} aria-label="More" style={{ ...BTN, width: "44px", height: "42px", textAlign: "center", fontSize: fs(20), color: v.capPlus ? "var(--crm-muted)" : "var(--crm-line)" }}>+</button>
            </div>
          </div>
        </Section>
        <Section gap={6}>
          <div style={{ display: "flex", alignItems: "baseline" }}><div style={HEAD}>Closures</div><button type="button" onClick={v.addClosure} style={LINK}>Add</button></div>
          {!v.closures.length && <div style={{ display: "flex", alignItems: "center", minHeight: "48px", borderBottom: "1px solid var(--crm-rule-soft)", fontSize: fs(14), color: "var(--crm-faint)" }}>No closures</div>}
          {v.closures.map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "12px", minHeight: "48px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
              <span style={{ display: "flex", color: "var(--crm-oxblood)" }}><Ic name="calendar-x" size={16} /></span>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                <div style={{ fontSize: fs(14), fontWeight: 500 }}>{c.date}</div>
                <div style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{c.sub}</div>
              </div>
              <button type="button" onClick={c.rm} aria-label="Remove closure" style={{ ...BTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>
            </div>
          ))}
        </Section>
        <Section gap={8}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <div style={HEAD}>Remarks</div>
            <span style={{ height: "22px", padding: "0 8px", borderRadius: "11px", display: "inline-flex", alignItems: "center", gap: "4px", background: "var(--crm-tint-lost)", color: "var(--crm-muted)", fontSize: fs(11), fontWeight: 500 }}><Ic name="lock" size={10} />Staff only</span>
          </div>
          <textarea value={v.remarks} onChange={v.setRemarks} onFocus={() => setFocus("rem")} onBlur={() => setFocus("")} rows={2} aria-label="Remarks" placeholder="Notes for the team — parking, where to meet the customer…"
            style={{ ...field("rem"), display: "block", minHeight: "72px", padding: "12px 14px", resize: "none", fieldSizing: "content", fontFamily: "Inter, sans-serif", fontSize: fs(14), lineHeight: 1.5, color: "var(--crm-ink-soft)" } as CSSProperties} />
        </Section>
        {v.canDel && (
          <button type="button" onClick={v.del} style={{ ...BTN, flex: "none", height: "48px", borderRadius: "24px", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", border: "1px solid var(--crm-v4-danger-line)", color: "var(--crm-oxblood)", fontSize: fs(14), fontWeight: 500 }}><Ic name="trash-2" size={15} />Delete this showroom</button>
        )}
      </div>
      {v.bar && (
        <div data-room-bar="" style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 4, display: "flex", alignItems: "center", gap: "10px", padding: "12px 20px calc(12px + var(--safe-bottom, 0px))", background: "#fff", borderTop: "1px solid var(--crm-rule)", boxShadow: "0 -8px 24px rgba(42,22,12,.08)" }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
            <div style={{ fontSize: fs(14), fontWeight: 500 }}>{v.bar.title}</div>
            <div style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{v.bar.sub}</div>
          </div>
          {v.bar.kind === "dirty"
            ? (v.canDraft && <button type="button" onClick={v.saveDraft} style={{ ...BTN, flex: "none", height: "44px", padding: "0 14px", borderRadius: "22px", border: "1px solid var(--crm-line)", fontSize: fs(14), fontWeight: 500, whiteSpace: "nowrap" }}>Save draft</button>)
            : <button type="button" onClick={v.discardDraft} style={{ ...BTN, flex: "none", height: "44px", padding: "0 14px", borderRadius: "22px", border: "1px solid var(--crm-v4-danger-line)", color: "var(--crm-oxblood)", fontSize: fs(14), fontWeight: 500 }}>Discard</button>}
          <button type="button" onClick={v.publish} style={{ ...BTN, flex: "none", height: "44px", padding: "0 18px", borderRadius: "22px", background: "var(--crm-rust)", color: "#fff", fontSize: fs(14), fontWeight: 500 }}>Publish</button>
        </div>
      )}
      {v.leaveOpen && (<>
        <div onClick={v.leaveKeep} style={{ position: "absolute", inset: 0, zIndex: 6, background: "rgba(42,22,12,.4)", animation: "fadeIn 200ms ease-out" }} />
        <div role="dialog" aria-modal="true" aria-label="Leave without publishing?" style={{ position: "absolute", left: "10px", right: "10px", bottom: "10px", zIndex: 7, display: "flex", flexDirection: "column", gap: "8px", padding: "22px 18px 26px", borderRadius: "30px 30px 42px 42px", background: "#fff", animation: "sheetUp 320ms cubic-bezier(.2,.8,.2,1)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 4px 10px" }}>
            <div style={{ fontFamily: TIGHT, fontSize: fs(20), fontWeight: 500, letterSpacing: "-0.01em" }}>Leave without publishing?</div>
            <div style={{ fontSize: fs(14), lineHeight: 1.45, color: "var(--crm-muted)", textWrap: "pretty" } as CSSProperties}>{v.leaveSub}</div>
          </div>
          {v.canDraft && <button type="button" onClick={v.leaveSave} style={{ ...BTN, height: "50px", borderRadius: "25px", background: "var(--crm-rust)", color: "#fff", fontSize: fs(15), fontWeight: 500 }}>Save draft</button>}
          <button type="button" onClick={v.leaveDiscard} style={{ ...BTN, height: "50px", borderRadius: "25px", border: "1px solid var(--crm-v4-danger-line)", color: "var(--crm-oxblood)", fontSize: fs(15), fontWeight: 500 }}>Discard changes</button>
          <button type="button" onClick={v.leaveKeep} style={{ ...BTN, height: "50px", borderRadius: "25px", fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)" }}>Keep editing</button>
        </div>
      </>)}
    </div>
  );
}

const SELECT: CSSProperties = { flex: 1, minWidth: 0, height: "36px", padding: "0 10px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", color: "var(--crm-ink)", fontFamily: TIGHT, fontSize: fs(14), fontVariantNumeric: "tabular-nums" };
