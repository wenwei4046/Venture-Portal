"use client";

/**
 * The desktop's screens the design does not draw (CRM Desktop rev 1, BUILD-NOTES.md) — Appointment, Add note, Edit
 * customer, History — written in the design's own vocabulary: the pane's back bar, its 18 / 20 px padding, its chips,
 * fields and rust buttons, Inter, the same colours. Behaviour: vm/extras.ts.
 */
import { Fragment, useState, type CSSProperties } from "react";

const XBTN: CSSProperties = { border: 0, background: "transparent", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", margin: 0, boxSizing: "border-box", padding: 0 };
const TIGHT_X = "var(--font-display-rv), 'Inter Tight', Inter, sans-serif";
import DX from "./desk-extras.module.css";
import { InfoValue } from "../shared/AdLink";
import SalesCustomerForm from "../sales/SalesCustomerForm";
import type { CustomerFormVM } from "../sales/vm/customer";
import type { bookVM, customerFormVM, historyVM, noteVM } from "./vm/extras";
import type { ActiveVM } from "../shared/locked";
import { Ic, type Icon4a } from "../shared/icons4a";

const BACK = { flex: "0 0 auto", display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", textAlign: "left" } as const;
const BODY = { flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px", background: "#fff" } as const;
const FOOT = { flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid var(--crm-rule)", background: "#fff", display: "flex", gap: "10px" } as const;
const LABEL = { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-muted)" } as const;
const FIELD = { width: "100%", boxSizing: "border-box", height: "42px", padding: "0 14px", borderRadius: "12px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none" } as const;
const PRIMARY = (bg: string, cur: string) => ({ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: bg, color: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", cursor: cur }) as const;
const GHOST = { height: "44px", padding: "0 18px", borderRadius: "22px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", font: "inherit", fontSize: "14px", fontWeight: "650", cursor: "pointer" } as const;
const Chev = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"></path></svg>;

export function DeskBook({ v }: { v: ReturnType<typeof bookVM> }) {
  return (<>
    <button type="button" onClick={v.back} style={BACK}><Chev />{v.name} · chat</button>
    <div style={BODY}>
      {v.has && <div style={{ padding: "12px 14px", borderRadius: "14px", background: "var(--crm-tint-cold)", color: "var(--crm-ink-soft)", fontSize: "13px", fontWeight: "600" }}>Booked · {v.current}</div>}
      <span style={LABEL}>Showroom</span>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", background: "var(--crm-field)", borderRadius: "11px", padding: "3px", gap: "2px", flexWrap: "wrap" }}>
        {v.rooms.map((r, i) => <span key={i} onClick={r.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", background: r.bg, color: r.fg, fontSize: "13px", fontWeight: "650", boxShadow: r.sh, cursor: "pointer", whiteSpace: "nowrap" }}>{r.label}</span>)}
      </div>
      {/* v2 frame 07: the showroom's staff-only remarks, for whoever books (never sent to the customer). */}
      {v.remarks && <div style={{ display: "flex", gap: "8px", padding: "10px 12px", borderRadius: "10px", background: "var(--crm-field)", font: "400 12px/1.5 Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
        <span style={{ display: "flex", flex: "none", paddingTop: "2px", color: "var(--crm-muted)" }}><Ic name="lock" size={12} /></span><span style={{ whiteSpace: "pre-wrap" }}>{v.remarks}</span></div>}
      {/* Day: the month chip and Week | Month, as the salesperson's sheet (the owner, 2026-10-13). */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ ...LABEL, flex: "none" }}>Day</span>
        <span onClick={v.toggleMonth} title="Choose month" style={{ flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "32px", padding: "0 10px 0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid var(--crm-rule)", fontSize: "13px", fontWeight: "600", color: "var(--crm-ink)", cursor: "pointer" }}>
          {v.monthLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
        </span>
        {v.monthOpen && <>
          <div onClick={v.toggleMonth} style={{ position: "fixed", inset: "0", zIndex: 2 }} />
          <div style={{ position: "absolute", top: "38px", left: "0", zIndex: 3, width: "268px", padding: "12px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", boxShadow: "0 8px 24px rgba(42,22,12,.18)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span onClick={v.yPrev} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: v.yPrevFg, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"></path></svg></span>
              <strong style={{ fontSize: "16px", fontWeight: "700", color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums" }}>{v.pickYear}</strong>
              <span onClick={v.yNext} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid var(--crm-rule)", display: "grid", placeItems: "center", color: v.yNextFg, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"></path></svg></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
              {v.ymonths.map(mo => <span key={mo.label} onClick={mo.pick} style={{ height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: mo.weight, background: mo.bg, color: mo.fg, cursor: mo.cur }}>{mo.label}</span>)}
            </div>
          </div>
        </>}
        <span style={{ flex: "1" }} />
        <span style={{ display: "flex", gap: "2px", padding: "2px", borderRadius: "16px", background: "var(--crm-field)" }}>
          <span onClick={v.viewWeek} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.viewWeekBg, boxShadow: v.viewWeekSh, cursor: "pointer" }}>Week</span>
          <span onClick={v.viewMonth} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.viewMonthBg, boxShadow: v.viewMonthSh, cursor: "pointer" }}>Month</span>
        </span>
        {v.isWeek && <>
          <button type="button" onClick={v.prev} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--crm-muted)" }}><Chev /></button>
          <button type="button" onClick={v.next} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-line)", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "var(--crm-muted)", transform: "scaleX(-1)" }}><Chev /></button>
        </>}
      </div>
      {v.isWeek ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
          {v.days.map((d, i) => <span key={i} onClick={d.pick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "8px 0", borderRadius: "12px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, cursor: d.closed ? "not-allowed" : "pointer", textDecoration: d.deco }}>
            <small style={{ fontSize: "11px", fontWeight: "600" }}>{d.wk}</small><strong style={{ fontSize: "16px", fontWeight: "700" }}>{d.dn}</strong></span>)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", padding: "10px", border: "1px solid var(--crm-rule)", borderRadius: "14px" }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={`w${i}`} style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", color: "var(--crm-muted)", paddingBottom: "4px" }}>{w}</span>)}
          {v.mCells.map((c, i) => <span key={i} onClick={c.pick} style={{ height: "34px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>)}
        </div>
      )}
      <span style={LABEL}>Time</span>
      {v.noSlots ? <span style={{ fontSize: "13px", color: "var(--crm-faint)" }}>No visit times on this day</span> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
          {v.slots.map((s, i) => <span key={i} onClick={s.pick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "10px 4px", borderRadius: "12px", border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, cursor: s.cur, textDecoration: s.deco }}>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{s.label}</strong><small style={{ fontSize: "11px", opacity: ".8" }}>{s.sub}</small></span>)}
        </div>)}
    </div>
    <div style={FOOT}>
      {v.has && <button type="button" onClick={v.cancel} style={{ ...GHOST, color: "var(--crm-oxblood)", borderColor: "var(--crm-tint-attention)" }}>Cancel visit</button>}
      <button type="button" onClick={v.save} style={PRIMARY(v.saveBg, v.saveCur)}>{v.saveLabel}</button>
    </div>
  </>);
}

export function DeskNote({ v }: { v: ReturnType<typeof noteVM> }) {
  return (<>
    <button type="button" onClick={v.back} style={BACK}><Chev />{v.name} · chat</button>
    <div style={BODY}>
      <span style={LABEL}>New note</span>
      <textarea value={v.text} onChange={v.setText} rows={4} placeholder="What should the team know about this customer?" style={{ ...FIELD, height: "auto", padding: "12px 14px", resize: "vertical", lineHeight: "1.45" }} />
      <span style={LABEL}>Notes</span>
      {v.none && <span style={{ fontSize: "13px", color: "var(--crm-faint)" }}>No notes yet</span>}
      {v.notes.map((n, i) => <div key={i} style={{ padding: "12px 14px", borderRadius: "14px", background: "var(--crm-cream-nav)", border: "1px solid var(--crm-field)", display: "flex", flexDirection: "column", gap: "4px" }}>
        <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap" }}>{n.text}</p><small style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{n.by} · {n.at}</small></div>)}
    </div>
    <div style={FOOT}><button type="button" onClick={v.save} style={PRIMARY(v.saveBg, v.saveCur)}>Add note</button></div>
  </>);
}

export function DeskCustomerForm({ v }: { v: ReturnType<typeof customerFormVM> }) {
  return (<>
    <button type="button" onClick={v.back} style={BACK}><Chev />Customer info</button>
    <div style={BODY}>
      {v.sections.map((s, si) => <Fragment key={si}>
        <span style={LABEL}>{s.title}</span>
        {s.fields.map(f => <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "var(--crm-ink)" }}>{f.label}
          {f.isChoice ? <span style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{f.opts.map((o, i) => <span key={i} onClick={o.pick} style={{ height: "32px", lineHeight: "30px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>{o.label}</span>)}</span>
            : f.isLong ? <textarea value={f.value} onChange={f.set} placeholder={f.ph} rows={3} style={{ ...FIELD, height: "auto", padding: "12px 14px", resize: "vertical", fontWeight: "400" }} />
              : <input value={f.value} onChange={f.set} placeholder={f.ph} type={f.isDate ? "date" : "text"} inputMode={f.input as "text"} style={{ ...FIELD, fontWeight: "400" }} />}
        </label>)}
      </Fragment>)}
    </div>
    <div style={{ ...FOOT, flexDirection: "column" }}>
      {v.hint && <span style={{ fontSize: "12px", color: "var(--crm-oxblood)" }}>{v.hint}</span>}
      <button type="button" onClick={v.save} style={PRIMARY(v.saveBg, v.saveCur)}>Save</button>
    </div>
  </>);
}

export function DeskHistory({ v }: { v: ReturnType<typeof historyVM> }) {
  return (
    // Settings › History: the page's own head (SETTINGS · History · its line) is the design's, above this.
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {v.chips.map((c, i) => <span key={i} onClick={c.pick} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, fontSize: "12.5px", fontWeight: "650", cursor: "pointer" }}>{c.label}<small style={{ fontSize: "11px", color: c.nfg }}>{c.n}</small></span>)}
      </div>
      <div style={{ border: "1px solid var(--crm-rule)", borderRadius: "16px", overflow: "hidden", background: "#fff" }}>
        {v.loading && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-faint)" }}>Loading the history…</div>}
        {v.empty && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-faint)" }}>No changes yet</div>}
        {v.rows.map((r, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", gap: "12px", padding: "14px 16px", borderTop: i ? "1px solid var(--crm-field)" : "0", alignItems: "flex-start" }}>
          <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.ini}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
            <span style={{ fontSize: "14px" }}><strong style={{ fontWeight: "650" }}>{r.who}</strong> <span style={{ color: "var(--crm-muted)" }}>{r.op.toLowerCase()}</span> <strong style={{ fontWeight: "650" }}>{r.what}</strong> <span style={{ display: "inline-block", marginLeft: "4px", padding: "1px 8px", borderRadius: "9px", background: "var(--crm-field)", color: "var(--crm-ink-soft)", fontSize: "11px", fontWeight: "700" }}>{r.area}</span></span>
            {r.changes.map((x, k) => <span key={k} style={{ fontSize: "12.5px", color: "var(--crm-ink-soft)" }}>{x.field}: <s style={{ color: "var(--crm-faint)" }}>{x.from || "—"}</s> → <strong style={{ fontWeight: "650", color: "var(--crm-ink)" }}>{x.to || "—"}</strong></span>)}
          </span>
          <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{r.at}</span>
        </div>)}
      </div>
    </div>
  );
}

/**
 * Insight › Ads Performance: "+ Metrics · N" (the owner, 2026-10-13) — opens Ads Performance's own Customise metrics
 * pane for the cards: tick, drag into order, Apply. Ads Performance's button, small.
 */
export function DeskCardPicker({ v }: { v: { insCardsToggle?: () => void; insCardsN?: number } }) {
  // The prototype (DeskProto, the pixel comparison) has no such button.
  if (!v.insCardsToggle) return null;
  return (
    <button type="button" onClick={v.insCardsToggle} style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer", whiteSpace: "nowrap" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"></path></svg>Metrics · {v.insCardsN}
    </button>
  );
}

/**
 * The reply box's emoji panel (the design draws the sticker icon and nothing behind it): the phone's Sticker panel's
 * Emoji tab (#425 — its categories, Recents kept on the server, the keyword search) as one of the README's popovers —
 * white, a var(--crm-rule) border, radius 16, padding 6, the popover shadow, rows hovering var(--crm-cream). Behaviour: vm/chat.ts.
 */
export function DeskEmoji({ v }: { v: ReturnType<typeof import("./vm/chat").chatVM>["emoji"] }) {
  const ib = (on: boolean) => ({ width: "34px", height: "34px", flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: "10px", border: "0",
    background: on ? "var(--crm-tint-attention)" : "transparent", color: on ? "var(--crm-rust)" : "var(--crm-muted)", cursor: "pointer", padding: "0" }) as const;
  const Ico = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  return (<>
    <div onClick={e => { e.stopPropagation(); v.close(); }} style={{ position: "fixed", inset: "0", zIndex: 30, cursor: "default" }} />
    <div onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") v.close(); }}
      style={{ position: "absolute", right: "-8px", bottom: "42px", zIndex: 31, width: "336px", boxSizing: "border-box", padding: "6px", borderRadius: "16px", border: "1px solid var(--crm-rule)",
        background: "#fff", boxShadow: "0 10px 28px rgba(42,22,12,.16)", display: "flex", flexDirection: "column", gap: "4px", cursor: "default", color: "var(--crm-ink)", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "2px 2px 4px", borderBottom: "1px solid var(--crm-field)" }}>
        {v.searching
          ? <input autoFocus value={v.q} onChange={v.setQ} placeholder="Search emoji" style={{ flex: "1", minWidth: "0", height: "34px", boxSizing: "border-box", padding: "0 12px", borderRadius: "10px", border: "1px solid var(--crm-line)", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none" }} />
          : v.cats.map(c => <button key={c.label} type="button" title={c.label} onClick={c.pick} className={DX.emo} style={ib(c.on)}><Ico d={c.d} /></button>)}
        <span style={{ flex: v.searching ? "0 0 auto" : "1" }} />
        <button type="button" title={v.searching ? "Close search" : "Search emoji"} onClick={v.toggleSearch} className={DX.emo} style={ib(v.searching)}>
          <Ico d={v.searching ? "M6 6l12 12M18 6 6 18" : "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35"} />
        </button>
      </div>
      <span style={{ padding: "4px 8px 0", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--crm-faint)" }}>{v.label}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "2px", maxHeight: "148px", overflowY: "auto" }}>
        {v.list.map((x, i) => <button key={i} type="button" onClick={x.pick} className={DX.emo}
          style={{ height: "36px", border: "0", borderRadius: "8px", background: "transparent", fontSize: "22px", lineHeight: "1", cursor: "pointer", padding: "0" }}>{x.e}</button>)}
      </div>
    </div>
  </>);
}

/**
 * CRM alerts' pane (frame 1d), drawn as the design draws it — its Unread | Read segment, its rows (the kind's dot, the
 * kind and time, the title, the line under it) — with what the owner asked for on 2026-10-15: the tabs work and count,
 * Mark all read, each row says more (what happened, the customer's channel · ad · status · owner, their last words),
 * a tap opens the chat, and Mark as read. Invitations to answer first (2026-10-23: a Move is a request on the computer too)
 * — the phone's cards, Decline | Accept. Behaviour: vm/inbox.ts › alertsVM.
 */
export function DeskAlerts({ v }: { v: ReturnType<typeof import("./vm/inbox").alertsVM>["alertsP"] }) {
  return (<>
    <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid var(--crm-field)", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "inline-flex", background: "var(--crm-field)", borderRadius: "11px", padding: "3px", gap: "2px" }}>
        {v.tabs.map(t => <span key={t.label} onClick={t.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
          ...(t.on ? { background: "#fff", fontWeight: "650", boxShadow: "rgba(42,22,12,.14) 0 1px 3px", color: "var(--crm-ink)" } : { color: "var(--crm-muted)", fontWeight: "550" }) }}>{t.label}</span>)}
      </div>
      <span style={{ flex: "1" }} />
      {v.markAll && <button type="button" onClick={v.markAll} className={DX.emo} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", whiteSpace: "nowrap" }}>Mark all read</button>}
    </div>
    <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {!!v.invites.length && <>
        <div style={{ padding: "14px 16px 6px", fontSize: "11px", fontWeight: "700", letterSpacing: ".1em", color: "var(--crm-muted)" }}>INVITATIONS</div>
        {v.invites.map(i => (
          <div key={i.key} style={{ display: "flex", gap: "12px", padding: "12px 16px 14px", background: "var(--crm-page)", borderBottom: "1px solid var(--crm-field)" }}>
            <span style={{ flex: "0 0 auto", marginTop: "5px", width: "8px", height: "8px", borderRadius: "50%", background: i.color }}></span>
            <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
              <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
                <b style={{ fontSize: "12px", fontWeight: "700", color: i.color }}>{i.kind}</b>
                <span style={{ flex: "1" }}></span>
                <small style={{ fontSize: "12px", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{i.time}</small>
              </span>
              <strong style={{ fontSize: "14px", fontWeight: "650" }}>{i.title}</strong>
              {i.sub && <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{i.sub}</span>}
              <span style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button type="button" onClick={i.decline} className={DX.emo} style={{ height: "30px", padding: "0 14px", borderRadius: "15px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Decline</button>
                <button type="button" onClick={i.accept} style={{ height: "30px", padding: "0 14px", borderRadius: "15px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Accept</button>
              </span>
            </span>
          </div>
        ))}
      </>}
      {!v.rows.length && !v.invites.length && <div style={{ padding: "40px 24px", textAlign: "center", fontSize: "13.5px", color: "var(--crm-muted)" }}>{v.empty}</div>}
      {v.rows.map(a => (
        <div key={a.key} onClick={a.open} className={DX.alert} style={{ display: "flex", gap: "12px", padding: "14px 16px", background: a.bg, borderBottom: "1px solid var(--crm-field)", cursor: a.canOpen ? "pointer" : "default" }}>
          <span style={{ flex: "0 0 auto", marginTop: "5px", width: "8px", height: "8px", borderRadius: "50%", background: a.dot }}></span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <b style={{ fontSize: "12px", fontWeight: "700", color: a.color }}>{a.kind}</b>
              <span style={{ flex: "1" }}></span>
              <small style={{ fontSize: "12px", color: "var(--crm-faint)", whiteSpace: "nowrap" }}>{a.time}</small>
            </span>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{a.title}</strong>
            {a.line && <span style={{ fontSize: "13px", color: "var(--crm-ink)" }}>{a.line}{a.extra ? <span style={{ color: "var(--crm-muted)" }}> · {a.extra}</span> : null}</span>}
            {a.sub && <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{a.sub}</span>}
            {a.hasQuote && <span style={{ marginTop: "4px", padding: "7px 10px", borderRadius: "10px", background: "var(--crm-cream-nav)", borderLeft: "3px solid var(--crm-line)", fontSize: "12.5px", color: "var(--crm-ink-soft)",
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.quote}</span>}
            {(a.canOpen || a.markRead) && <span style={{ display: "flex", gap: "14px", marginTop: "6px" }}>
              {a.canOpen && <span style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-rust)" }}>Open chat ›</span>}
              {a.markRead && <span onClick={a.markRead} style={{ fontSize: "12.5px", fontWeight: "650", color: "var(--crm-muted)", cursor: "pointer" }}>Mark as read</span>}
            </span>}
          </span>
        </div>
      ))}
    </div>
  </>);
}

/** A pie of a chart's values, each slice's share written inside it (the owner's screenshot, 2026-10-15). */
export function DeskPie({ v, size = 200 }: { v: ReturnType<typeof import("./vm/people").pieSlices>; size?: number }) {
  if (!v.length) return null;
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} style={{ flex: "0 0 auto" }} role="img" aria-label={v.map(s => `${s.label} ${s.pct}`).join(", ")}>
      {v.map(s => <path key={s.label} d={s.d} fill={s.color} stroke="#fff" strokeWidth="1.5"><title>{`${s.label} · ${s.pct}`}</title></path>)}
      {v.filter(s => s.showPct).map(s => <text key={s.label} x={s.x} y={s.y} textAnchor="middle" dominantBaseline="central" fill="#fff" style={{ fontSize: "13px", fontWeight: 650, fontFamily: "inherit" }}>{s.pct}</text>)}
    </svg>
  );
}

/**
 * Contacts' side panel (the owner, 2026-10-15: the empty right side → option 1): the customer picked in the table — who
 * they are, Customer info, their last messages, Open chat and Edit — or, with nobody picked, the contacts still missing
 * property info, each with Fill in. Drawn in the Inbox's Customer info vocabulary. Behaviour: vm/people.ts › sideVM.
 */
export function DeskContactSide({ v }: { v: ReturnType<typeof import("./vm/people").peopleVM>["ppSide"] }) {
  const CARD = { border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" } as const;
  const LAB = { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-muted)" } as const;
  const Av = ({ ini, big }: { ini: string; big?: boolean }) => <span style={{ flex: "0 0 auto", width: big ? "44px" : "30px", height: big ? "44px" : "30px", borderRadius: "50%", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", fontSize: big ? "14px" : "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{ini}</span>;
  if (!v.has) return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px 10px" }}>
        <div style={LAB}>To fill in</div>
        <strong style={{ display: "block", marginTop: "4px", fontSize: "15px", fontWeight: "650" }}>{v.todoTitle}</strong>
        <span style={{ display: "block", marginTop: "2px", fontSize: "12.5px", color: "var(--crm-muted)" }}>Pick a contact in the table to see them here.</span>
      </div>
      {v.todo.map(t => (
        <div key={t.id} onClick={t.pick} className={DX.alert} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderTop: "1px solid var(--crm-field)", cursor: "pointer" }}>
          <Av ini={t.ini} />
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
            <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</span>
          </span>
          <button type="button" onClick={t.fill} className={DX.emo} style={{ height: "28px", padding: "0 11px", borderRadius: "14px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer", whiteSpace: "nowrap" }}>Fill in</button>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 18px", borderBottom: "1px solid var(--crm-field)" }}>
        <Av ini={v.ini} big />
        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.name}</strong>
          <span style={{ fontSize: "12.5px", color: "var(--crm-muted)" }}>{v.phone} · {v.ch}</span>
        </span>
        <button type="button" onClick={v.close} title="Close" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", padding: "14px 18px", borderBottom: "1px solid var(--crm-field)" }}>
        {([["Status", v.status, null], ["Owner", v.owner, null], ["Ad", v.ad, v.adUrl], ["Last chat", v.lastAt, null]] as const).map(([k, x, href]) => (
          <span key={k} style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{k}</span><strong style={{ fontSize: "13.5px", fontWeight: "650", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><InfoValue v={x} href={href} /></strong></span>))}
        {v.visit && <span style={{ gridColumn: "1 / -1", padding: "8px 10px", borderRadius: "10px", background: "var(--crm-tint-cold)", color: "var(--crm-ink-soft)", fontSize: "12.5px", fontWeight: "600" }}>Next visit · {v.visit}</span>}
      </div>
      {v.groups.map(g => (
        <div key={g.label} style={{ padding: "12px 18px", borderBottom: "1px solid var(--crm-field)", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={LAB}>{g.label}</span>
          {g.rows.map(r => <span key={r.k} style={{ display: "flex", gap: "10px", fontSize: "13px" }}><span style={{ flex: "0 0 110px", color: "var(--crm-muted)" }}>{r.k}</span><strong style={{ flex: "1", minWidth: "0", fontWeight: "600", color: r.v === "—" ? "var(--crm-faint)" : "var(--crm-ink)", overflowWrap: "anywhere" }}>{r.v}</strong></span>)}
        </div>
      ))}
      {v.hasMsgs && <div style={{ padding: "12px 18px", borderBottom: "1px solid var(--crm-field)", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={LAB}>Latest messages</span>
        {v.msgs.map((m, i) => <span key={i} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "90%", padding: "6px 10px", borderRadius: "12px", background: m.mine ? "var(--crm-tint-attention)" : "var(--crm-field)", fontSize: "12.5px" }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.text}</span><small style={{ display: "block", textAlign: "right", fontSize: "11px", color: "var(--crm-muted)" }}>{m.at}</small></span>)}
      </div>}
      <div style={{ display: "flex", gap: "10px", padding: "14px 18px" }}>
        <button type="button" onClick={v.edit} className={DX.emo} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }}>Edit</button>
        <button type="button" onClick={v.openChat} style={{ flex: "1", height: "40px", borderRadius: "20px", border: "0", background: "var(--crm-rust)", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Open chat</button>
      </div>
    </div>
  );
}

/**
 * An analysis card in Contacts' chart card's look (title, fold, groupings, stacked bar, pie beside its rows) — the
 * Calendar's (vm/analysis.ts), folded until opened.
 */
export function DeskAnalysis({ v }: { v: ReturnType<typeof import("./vm/analysis").calendarAnalysisVM> }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: "1px solid var(--crm-rule)", borderRadius: "14px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <strong onClick={v.toggle} style={{ flex: "1", minWidth: "160px", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-muted)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px", verticalAlign: "-1px", transform: v.chev, transition: "transform .18s" }}><path d="m6 9 6 6 6-6"></path></svg>
          {v.title}<span style={{ marginLeft: "10px", fontSize: "12.5px", fontWeight: "500", color: "var(--crm-muted)" }}>{v.sum}</span><span style={{ marginLeft: "12px", display: "inline-flex", alignItems: "center", gap: "5px", height: "26px", padding: "0 11px", borderRadius: "13px", border: "1px solid var(--crm-line)", background: "#fff", fontSize: "12px", fontWeight: "650", color: "var(--crm-rust)", verticalAlign: "1px" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9h9Z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"></path></svg>{v.btn}</span>
        </strong>
        <div style={{ display: "flex", flexWrap: "wrap", background: "var(--crm-field)", borderRadius: "10px", padding: "3px", gap: "2px" }}>
          {v.bys.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 10px", borderRadius: "8px", font: "inherit", fontSize: "12.5px", cursor: "pointer",
            ...(o.on ? { background: "#fff", color: "var(--crm-ink)", fontWeight: "650", boxShadow: "0 1px 2px rgba(42,22,12,.12)" } : { background: "transparent", color: "var(--crm-muted)", fontWeight: "550" }) }}>{o.label}</button>)}
        </div>
      </div>
      {v.open && (v.empty
        ? <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "var(--crm-muted)" }}>No visits in this range</div>
        : <div className={DX.ppChartBody}>
          <DeskPie v={v.pie} />
          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", gap: "2px", height: "10px", borderRadius: "5px", overflow: "hidden", background: "var(--crm-field)" }}>
              {v.stack.map((g, i) => <span key={i} style={{ flex: `${g.n} 0 0`, background: g.color }}></span>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {v.rows.map(b => (
                <div key={b.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 200px) minmax(0, 1fr) 36px 48px", gap: "14px", alignItems: "center", padding: "7px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: b.color }}></span>{b.label}</span>
                  <span style={{ display: "block", height: "8px", borderRadius: "4px", background: "var(--crm-field)" }}><span style={{ display: "block", height: "8px", width: `${b.w}%`, borderRadius: "4px", background: b.color }}></span></span>
                  <span style={{ textAlign: "right", fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                  <span style={{ textAlign: "right", fontSize: "12.5px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{b.pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>)}
    </div>
  );
}

/** The Customer form's phone preview: the phone's own form (SalesCustomerForm) at a 375px phone's size, scaled to the frame. */
export function DeskPhoneForm({ v, scale }: { v: CustomerFormVM; scale: number }) {
  // Drawn as a phone page (frame 08: "‹ Customer info"), not a sheet over a dimmed screen — desk-extras › pvForm.
  return (
    <div style={{ flex: "1", minHeight: "0", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "6px", height: "44px", padding: "14px 12px 0", boxSizing: "content-box", borderBottom: "1px solid var(--crm-rule)", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"></path></svg>Customer info
      </div>
      <div style={{ position: "relative", flex: "1", minHeight: "0", overflow: "hidden" }}>
        <div className={DX.pvForm} style={{ position: "absolute", top: 0, left: 0, width: "375px", height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
          <SalesCustomerForm v={v} />
        </div>
      </div>
    </div>
  );
}

/**
 * Contacts' and the Calendar's right rail (vm/rail.ts), drawn as Inbox's Chat progress rail: folded, a 44 px column on
 * var(--crm-cream-nav) with « at its top (60 px, a rule under it) and a pie under that; open, a 360 px column with its title and »,
 * the chart (groupings, pie, rows) and — on Contacts — the customer picked in the table or who still lacks property info.
 */
export function DeskRail({ v }: { v: ReturnType<typeof import("./vm/rail").railVM>["rail"] }) {
  const ICO = (d: string, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  const PIE = "M21 12A9 9 0 1 1 12 3v9h9ZM15 3.5A9 9 0 0 1 20.5 9H15V3.5Z";
  if (!v.open) return (
    <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} className={DX.emo} style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
        {ICO("m11 17-5-5 5-5M18 17l-5-5 5-5")}</button>
      <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} style={{ marginTop: "16px", width: "32px", height: "32px", borderRadius: "50%", border: "0", background: "var(--crm-tint-attention)", color: "var(--crm-rust)", display: "grid", placeItems: "center", cursor: "pointer" }}>
        {ICO(PIE, 16)}</button>
    </aside>
  );
  const c = v.chart;
  return (
    <aside style={{ flex: "0 0 360px", width: "360px", minWidth: "0", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "0 0 60px", display: "flex", alignItems: "center", gap: "10px", padding: "0 0 0 18px", borderBottom: "1px solid var(--crm-rule)" }}>
        <strong style={{ flex: "1", fontSize: "15px", fontWeight: "650" }}>{v.title}</strong>
        <button type="button" onClick={v.toggle} title="Close" className={DX.emo} style={{ width: "44px", height: "59px", border: "0", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
          {ICO("m13 17 5-5-5-5M6 17l5-5-5-5")}</button>
      </div>
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px", padding: "16px" }}>
        {v.stats && <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px", padding: "14px", borderRadius: "16px", background: "linear-gradient(135deg, var(--crm-ink), var(--crm-deep))", color: "#fff" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px" }}>
            {v.stats.figures.map(k => <button key={k.label} type="button" onClick={k.open} className={DX.emo} style={{ display: "flex", flexDirection: "column", gap: "2px", padding: "8px 10px", border: "0", borderRadius: "12px", background: "transparent", font: "inherit", color: "#fff", textAlign: "left", cursor: "pointer" }}>
              <b style={{ fontSize: "22px", fontWeight: "700", color: k.color, fontVariantNumeric: "tabular-nums" }}>{k.value}</b>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "12.5px", opacity: ".85" }}>{k.label}{ICO("m9 6 6 6-6 6", 12)}</span>
            </button>)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <span style={{ display: "flex", gap: "4px", marginBottom: "2px" }}>
              {v.stats.by.map(o => <button key={o.l} type="button" onClick={o.pick} style={{ height: "22px", padding: "0 9px", border: "0", borderRadius: "11px", background: o.bg, opacity: o.op, font: "inherit", fontSize: "11.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>{o.l}</button>)}
            </span>
            {v.stats.bars.map(t => <span key={t.name} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
              <span style={{ flex: "0 0 90px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
              <span style={{ flex: "1", height: "6px", borderRadius: "3px", background: "rgba(255,255,255,.15)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${t.pct}%`, background: t.color }}></span></span>
              <span style={{ flex: "0 0 auto", opacity: ".85", fontVariantNumeric: "tabular-nums" }}>{t.label}</span>
            </span>)}
          </div>
        </div>}
        {/* The customer first, the chart under it (the owner, 2026-10-16: "倒翻位子"). */}
        {v.side && <DeskContactSide v={v.side} />}
        {c && <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", border: "1px solid var(--crm-rule)", borderRadius: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{c.title}</strong>
            <span style={{ fontSize: "12px", color: "var(--crm-muted)" }}>{c.sum}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {c.bys.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ height: "26px", padding: "0 9px", borderRadius: "13px", font: "inherit", fontSize: "12px", cursor: "pointer",
              ...(o.on ? { border: "1px solid var(--crm-ink)", background: "var(--crm-ink)", color: "#fff", fontWeight: "650" } : { border: "1px solid var(--crm-rule)", background: "#fff", color: "var(--crm-ink-soft)", fontWeight: "550" }) }}>{o.label}</button>)}
          </div>
          {c.empty ? <div style={{ padding: "18px 0", textAlign: "center", fontSize: "13px", color: "var(--crm-muted)" }}>Nothing to chart in this range</div> : <>
            <div style={{ display: "flex", justifyContent: "center" }}><DeskPie v={c.pie} size={180} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {c.rows.map(b => (
                <div key={b.label} onClick={b.pick} title={b.pick ? "Click to filter" : undefined} className={b.pick ? DX.alert : undefined}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 28px 40px", gap: "8px", alignItems: "center", padding: "6px 6px", margin: "0 -6px", borderRadius: "8px", background: b.on ? "var(--crm-sel)" : "transparent", cursor: b.pick ? "pointer" : "default" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: b.on ? "700" : "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: b.color }}></span>{b.label}</span>
                  <span style={{ display: "block", height: "6px", borderRadius: "3px", background: "var(--crm-field)" }}><span style={{ display: "block", height: "6px", width: `${b.w}%`, borderRadius: "3px", background: b.color }}></span></span>
                  <span style={{ textAlign: "right", fontSize: "13px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                  <span style={{ textAlign: "right", fontSize: "12px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{b.pct}</span>
                </div>
              ))}
            </div>
          </>}
        </div>}
      </div>
    </aside>
  );
}

/**
 * Under Contacts' table: how many a page (10 · 20 · 50, as the design's segmented chips) on the left, the range and
 * ‹ › on the right (vm/people.ts › ppPager; the owner, 2026-10-15).
 */
export function DeskPager({ v }: { v: ReturnType<typeof import("./vm/people").peopleVM>["ppPager"] }) {
  // 4a (frame 03): "1–12 of 486", how many a page — still a dropdown (the owner, 2026-10-16: "數字用下拉式的"),
  // opening upward — and the numbered pages on the right, the one on in ink.
  const [open, setOpen] = useState(false);
  const cur = v.sizes.find(o => o.on)?.n ?? 10;
  const BTN = { border: 0, background: "transparent", font: "inherit", cursor: "pointer", padding: 0, margin: 0, boxSizing: "border-box" } as const;
  const nums: (number | "…")[] = [];
  for (let i = 0; i < v.pages; i++) {
    if (i < 3 || i === v.pages - 1 || i === v.cur || v.pages <= 6) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }
  const ICO = (d: string) => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  const cell = (on: boolean) => ({ ...BTN, minWidth: "30px", height: "30px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", font: "500 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums",
    background: on ? "var(--crm-ink)" : "transparent", color: on ? "var(--crm-on-light)" : "var(--crm-ink-soft)" } as const);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{v.range}</span>
      {/* v2 (frame 03): "Show 20 · 10 · 50" written out, underlined in ink — the page size in use first, each one a click
          (supersedes 2026-10-16's dropdown: the owner, 2026-10-23, "全部根据新设计"). */}
      <span style={{ marginLeft: "20px", display: "flex", alignItems: "center", gap: "4px", position: "relative", whiteSpace: "nowrap" }}>Show
        <span style={{ display: "inline-flex", alignItems: "center", fontWeight: 500, color: "var(--crm-ink)", borderBottom: "1px solid var(--crm-ink)" }}>
          {[cur, ...v.sizes.map(o => o.n).filter(n => n !== cur)].map((n, i) => (
            <span key={n} style={{ display: "inline-flex" }}>{i > 0 && <span>&nbsp;·&nbsp;</span>}
              <button type="button" onClick={() => v.sizes.find(o => o.n === n)?.pick()} aria-pressed={n === cur} style={{ ...BTN, font: "inherit", color: "inherit" }}>{n}</button></span>
          ))}
        </span>
        {open && <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: "0", zIndex: 7 }}></div>
          <div role="listbox" style={{ position: "absolute", bottom: "28px", left: "36px", zIndex: 8, minWidth: "140px", padding: "6px", background: "#fff", borderRadius: "10px", boxShadow: "0 14px 36px rgba(42,22,12,.18)", display: "flex", flexDirection: "column" }}>
            {v.sizes.map(o => <button key={o.n} type="button" role="option" aria-selected={o.on} onClick={() => { o.pick(); setOpen(false); }}
              style={{ ...BTN, display: "flex", alignItems: "center", gap: "10px", height: "32px", padding: "0 10px", borderRadius: "7px", background: o.on ? "var(--crm-sel)" : "transparent", font: `${o.on ? 500 : 400} 13px Inter, sans-serif`, color: "var(--crm-ink)" }}>
              <span style={{ flex: 1, textAlign: "left" }}>{o.n} per page</span>{o.on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--crm-rust)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 5 5 9-10"></path></svg>}
            </button>)}
          </div>
        </>}
      </span>
      <div style={{ marginLeft: "auto", display: "flex", gap: "4px" }}>
        <button type="button" onClick={v.prevOff ? undefined : v.prev} disabled={v.prevOff} title="Previous page" style={{ ...cell(false), color: v.prevOff ? "var(--crm-faint-2)" : "var(--crm-ink-soft)" }}>‹</button>
        {nums.map((n, i) => n === "…" ? <span key={`d${i}`} style={{ ...cell(false), cursor: "default" }}>…</span>
          : <button key={n} type="button" onClick={() => v.go(n)} aria-current={n === v.cur ? "page" : undefined} style={cell(n === v.cur)}>{n + 1}</button>)}
        <button type="button" onClick={v.nextOff ? undefined : v.next} disabled={v.nextOff} title="Next page" style={{ ...cell(false), color: v.nextOff ? "var(--crm-faint-2)" : "var(--crm-ink-soft)" }}>›</button>
      </div>
    </div>
  );
}

/**
 * A panel folded to its 44 px strip, as the Audit log's and the rails' (Assignment's Ad performance — the owner,
 * 2026-10-15): « at the top under a rule, the panel's name running down, the sand of the panel open; a tap opens it.
 */
export function DeskFoldRail({ v }: { v: { title: string; open: () => void } }) {
  return (
    <aside className={DX.slideIn} style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "var(--crm-cream-nav)", borderLeft: "1px solid var(--crm-rule)", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button type="button" onClick={v.open} title={`Open ${v.title}`} className={DX.emo} style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid var(--crm-rule)", background: "transparent", color: "var(--crm-muted)", display: "grid", placeItems: "center", cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"></path></svg></button>
      <button type="button" onClick={v.open} title={`Open ${v.title}`} style={{ marginTop: "16px", padding: "8px 0", border: "0", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "var(--crm-muted)", writingMode: "vertical-rl", cursor: "pointer", whiteSpace: "nowrap" }}>{v.title}</button>
    </aside>
  );
}

/**
 * The Customer form's pages (the owner, 2026-10-16: "變成可以換 page，新增 page，並且每個都可以拖動" — vm/formpage.ts
 * › cfPages): a tab a page — its number, name and how many questions — with + Add page after them; a section or a field
 * dragged onto a tab moves there (the tab lights). Under them the open page's name to type, + Add section and Delete page
 * (only a page of added sections; the four the CRM needs move first).
 */
export function DeskFormPages({ v }: { v: ReturnType<typeof import("./vm/formpage").formPageVM>["cfPages"] }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", borderBottom: "1px solid var(--crm-rule)", flexWrap: "wrap" }}>
        {v.tabs.map(t => (
          <button key={t.num} type="button" onClick={t.pick} onDragOver={t.over} onDrop={t.drop}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px", marginBottom: "-1px", border: "0",
              borderBottom: `2px solid ${t.on ? "var(--crm-rust)" : "transparent"}`, borderRadius: "10px 10px 0 0", background: t.lit ? "var(--crm-tint-attention)" : "transparent",
              outline: t.lit ? "2px dashed var(--crm-rust)" : "none", outlineOffset: "-4px", font: "inherit", fontSize: "14px", fontWeight: t.on ? "650" : "550",
              color: t.on ? "var(--crm-ink)" : "var(--crm-muted)", cursor: "pointer", transition: "background .15s" }} className={t.on ? undefined : DX.emo}>
            {t.label}
            <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: t.on ? "var(--crm-tint-attention)" : "var(--crm-field)", color: t.on ? "var(--crm-rust)" : "var(--crm-muted)", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{t.count}</span>
          </button>
        ))}
        <button type="button" onClick={v.addPage} className={DX.emo} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 12px", marginBottom: "2px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "var(--crm-rust)", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add page</button>
        {v.dragging && <span style={{ marginLeft: "auto", marginBottom: "10px", fontSize: "12px", color: "var(--crm-muted)" }}>Drop on a tab to move it to that page</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--crm-muted)" }}>Page name</span>
        <input type="text" value={v.title} onChange={v.setTitle} placeholder="Page name" style={{ height: "34px", width: "220px", boxSizing: "border-box", padding: "0 12px", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "var(--crm-ink)", outline: "none" }} />
        <span style={{ flex: "1" }}></span>
        <button type="button" onClick={v.addSection} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "var(--crm-ink)", cursor: "pointer" }} className={DX.emo}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add section</button>
        {v.many && <button type="button" onClick={v.remove} disabled={!v.canDelete} title={v.deleteTip} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: v.canDelete ? "var(--crm-oxblood)" : "var(--crm-faint-2)", cursor: v.canDelete ? "pointer" : "not-allowed" }}>Delete page</button>}
      </div>
    </div>
  );
}

/**
 * Assignment › Active members (2026-10-22, the owner: a member not active for now but still in the company — its own
 * section after Ads to teams; v2 frame 06c, note 03 / 04): one table card as Approvals — the title, the counts, a search,
 * All · Active · Locked; Name · Title · Status · Leads this month · New leads, grouped by team (the Revenue Director first),
 * each group folding at its chevron. A switch changes the draft; Save writes it (crm_set_locked; shared/locked.ts › activeVM)
 * — the owner's Save (2026-10-22), which the frame does not draw, sits at the card head's right.
 */
const ACT_GRID = "minmax(0, 1.8fr) minmax(0, 1.3fr) 120px 130px 80px";
export function DeskActive({ v }: { v: ActiveVM & { leads?: Record<string, number> } }) {
  const [shut, setShut] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState(""), [f, setF] = useState<"all" | "active" | "locked">("all");
  const all = v.groups.flatMap(g => g.people), nOn = all.filter(p => p.active).length;
  const ql = q.trim().toLowerCase();
  const groups = v.groups.map(g => ({ ...g, rows: g.people.filter(p => (f === "all" || (f === "active") === p.active) && (!ql || p.name.toLowerCase().includes(ql) || g.name.toLowerCase().includes(ql))) })).filter(g => g.rows.length);
  return (
    <div style={{ flex: "1 1 auto", minHeight: 0, height: "100%", display: "flex", marginTop: "1px", marginBottom: "-12px", boxSizing: "border-box" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px" }}>
          <span style={{ font: `500 16px ${TIGHT_X}`, color: "var(--crm-ink)", whiteSpace: "nowrap" }}>Active members</span>
          <span style={{ font: "400 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{nOn} active · {all.length - nOn} locked</span>
          <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>Locked members keep their chats</span>
          <label style={{ marginLeft: "auto", flex: "none", width: "210px", height: "32px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-faint)" }}>
            <Ic name="search" size={13} />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name or team" aria-label="Search name or team" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)" }} />
          </label>
          <div style={{ ...SEG, flex: "none" }}>{([["all", "All"], ["active", "Active"], ["locked", "Locked"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF(k)} aria-pressed={f === k} style={{ ...segOpt(f === k), padding: "0 10px", gap: "6px" }}>{l}</button>))}</div>
          {v.dirty && <button type="button" onClick={v.cancel} style={{ ...XBTN, flex: "none", height: "32px", padding: "0 12px", borderRadius: "7px", border: "1px solid var(--crm-line)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-outline">Cancel</button>}
          <button type="button" onClick={v.save} disabled={!v.dirty} style={{ ...XBTN, flex: "none", height: "32px", padding: "0 14px", borderRadius: "7px", font: "500 12px Inter, sans-serif", color: "#fff", background: v.dirty ? "var(--crm-rust)" : "var(--crm-line)", cursor: v.dirty ? "pointer" : "default" }} className={v.dirty ? "crm4a-primary" : undefined}>{v.dirty ? v.saveLabel : "Save"}</button>
        </div>
        <div style={{ flex: "none", display: "grid", gridTemplateColumns: ACT_GRID, gap: "16px", alignItems: "center", height: "36px", padding: "0 16px", background: "var(--crm-cream-nav)", borderTop: "1px solid var(--crm-nav-line)",
          font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
          <span>Name</span><span>Title</span><span>Status</span><span style={{ textAlign: "right" }}>Leads this month</span><span style={{ textAlign: "right" }}>New leads</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--crm-line) transparent" }}>
          {groups.map(g => (
            <Fragment key={g.name}>
              <button type="button" onClick={() => setShut(s => ({ ...s, [g.name]: !s[g.name] }))} aria-expanded={!shut[g.name]} style={{ ...XBTN, width: "100%", display: "flex", alignItems: "center", gap: "8px", height: "34px", padding: "0 16px",
                background: "var(--crm-hover)", borderTop: "1px solid var(--crm-nav-line)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>
                <span style={{ display: "flex", color: "var(--crm-muted)", transform: shut[g.name] ? "rotate(-90deg)" : "none", transition: "transform .16s" }}><Ic name="chevron-down" size={12} /></span>
                <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: g.color }} />
                <span style={{ color: "var(--crm-ink)" }}>{g.name}</span>
                <span style={{ color: "var(--crm-faint)", fontVariantNumeric: "tabular-nums" }}>{g.count}</span>
              </button>
              {!shut[g.name] && g.rows.map(p => {
                const n = v.leads?.[p.id];
                return (
                  <div key={p.id} style={{ display: "grid", gridTemplateColumns: ACT_GRID, gap: "16px", alignItems: "center", height: "46px", padding: "0 16px", borderTop: "1px solid var(--crm-rule-soft)", font: "400 14px Inter, sans-serif" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                      <span style={{ flex: "none", width: "28px", height: "28px", borderRadius: "50%", display: "grid", placeItems: "center", font: `500 11px ${TIGHT_X}`, background: p.active ? "var(--crm-cream)" : "var(--crm-tint-lost)", color: p.active ? "var(--crm-ink)" : "var(--crm-faint)" }}>{p.ini}</span>
                      <span style={{ fontWeight: 500, color: p.active ? "var(--crm-ink)" : "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</span>
                    </span>
                    <span style={{ color: "var(--crm-ink-soft)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.role}</span>
                    <span>{p.active
                      ? <span style={{ ...STPILL, background: "var(--crm-tint-new)", color: "var(--crm-ink)" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentcolor" }} />Active</span>
                      : <span style={{ ...STPILL, background: "var(--crm-tint-lost)", color: "var(--crm-muted)" }}><Ic name="lock" size={10} />Locked</span>}</span>
                    <span style={{ textAlign: "right", font: `500 14px ${TIGHT_X}`, fontVariantNumeric: "tabular-nums", color: p.active ? "var(--crm-ink)" : "var(--crm-faint-2)" }}>{p.active ? n ?? 0 : "—"}</span>
                    <span style={{ textAlign: "right" }}>
                      <button type="button" role="switch" aria-checked={p.active} aria-label={`${p.name} takes new leads`} onClick={p.toggle} style={{ ...XBTN, width: "36px", height: "20px", borderRadius: "10px", position: "relative", display: "inline-block", verticalAlign: "middle", background: p.active ? "var(--crm-rust)" : "var(--crm-line)", transition: "background .16s" }}>
                        <span style={{ position: "absolute", top: "2px", left: p.active ? "18px" : "2px", width: "16px", height: "16px", borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(42,22,12,.2)", transition: "left .16s" }} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </Fragment>
          ))}
          {!groups.length && <div style={{ padding: "28px 16px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>Nobody matches</div>}
        </div>
      </div>
    </div>
  );
}

/**
 * Ads to teams' "+" (2026-10-22, the owner: "director 能提前先把广告加进来先做分配"): Meta's ads in the connected ad accounts —
 * running and about-to-run first, each with its run — or an ad id typed from Ads Manager. Picking one adds it
 * (crm_add_ad) and opens its split.
 */
export function DeskAddAd({ v }: { v: { close: () => void; q: string; onQ: (e: { target: { value: string } }) => void; loading: boolean; failed: boolean;
  rows: { id: string; name: string; account: string; run: string; have: boolean; pick: () => void }[]; typed: string; onTyped: (e: { target: { value: string } }) => void; addTyped: () => void } }) {
  const field = { height: "38px", boxSizing: "border-box" as const, padding: "0 12px", borderRadius: "10px", border: "1px solid var(--crm-line)", background: "#fff", font: "inherit", fontSize: "14px", color: "var(--crm-ink)", outline: "none" };
  return (
    <div onClick={v.close} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(42,22,12,.28)", display: "grid", placeItems: "center" }}>
      <div onClick={e => e.stopPropagation()} role="dialog" aria-label="Add an ad" style={{ width: "min(620px, calc(100vw - 48px))", maxHeight: "min(680px, calc(100vh - 80px))", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "16px", boxShadow: "0 20px 50px rgba(42,22,12,.25)", overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "16px 20px", borderBottom: "1px solid var(--crm-rule)" }}>
          <strong style={{ flex: 1, fontSize: "17px", fontWeight: 600, color: "var(--crm-ink)" }}>Add an ad</strong>
          <button type="button" onClick={v.close} aria-label="Close" style={{ width: "32px", height: "32px", border: 0, borderRadius: "16px", background: "var(--crm-field)", color: "var(--crm-ink)", cursor: "pointer", fontSize: "16px" }}>×</button>
        </div>
        <div style={{ padding: "12px 20px", display: "flex", gap: "8px", borderBottom: "1px solid var(--crm-field)" }}>
          <input value={v.q} onChange={v.onQ} placeholder="Search Meta's ads by name or account" autoFocus style={{ ...field, flex: 1 }} />
        </div>
        <div style={{ flex: 1, minHeight: "120px", overflowY: "auto" }}>
          {v.loading && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-muted)" }}>Reading Meta&apos;s ads…</div>}
          {v.failed && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-oxblood)" }}>Meta&apos;s ads could not be read. Type the ad id below instead.</div>}
          {!v.loading && !v.failed && !v.rows.length && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "var(--crm-muted)" }}>No ad matches.</div>}
          {v.rows.map(r => (
            <button key={r.id} type="button" onClick={r.pick} style={{ width: "100%", display: "flex", alignItems: "center", gap: "12px", padding: "10px 20px", border: 0, borderBottom: "1px solid var(--crm-field)", background: "#fff", font: "inherit", textAlign: "left", cursor: "pointer" }} className="crm4a-row">
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
                <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                <span style={{ fontSize: "12px", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.account} · {r.run}</span>
              </span>
              <span style={{ flex: "none", fontSize: "12.5px", fontWeight: 600, color: r.have ? "var(--crm-faint)" : "var(--crm-rust)" }}>{r.have ? "In the list · Edit" : "Add"}</span>
            </button>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px 20px", borderTop: "1px solid var(--crm-rule)", background: "var(--crm-page)" }}>
          <span style={{ fontSize: "13px", color: "var(--crm-muted)" }}>Or an ad id</span>
          <input value={v.typed} onChange={v.onTyped} inputMode="numeric" placeholder="e.g. 120254841448710368" style={{ ...field, flex: 1 }} />
          <button type="button" onClick={v.addTyped} disabled={!/^\d{5,32}$/.test(v.typed)} style={{ height: "38px", padding: "0 18px", borderRadius: "19px", border: 0, background: /^\d{5,32}$/.test(v.typed) ? "var(--crm-rust)" : "var(--crm-line)", color: "#fff", font: "inherit", fontSize: "14px", fontWeight: 600, cursor: "pointer" }}>Add</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Assignment › Leads by ad (2026-10-22, the owner: "我想要有一个独立的功能，可以看到每个广告谁拿到多少个名单"; v2 frames 06b /
 * 06b·2 / 06b·3, notes 04 / 06 / 08): one table card — the title, its counts and a search; the period (This month · Last
 * month · All time · Custom) and the status (All · Running · Paused · Ended); Ad · Team · Status · Members · Leads with resize
 * handles (each column's minimum, widths kept per browser as crm.lba.cols) — an ad opens to who got its leads; a member opens
 * the panel of those leads (a lead opens to its details with Open chat and Customer info), which folds to the 44 px rail.
 */
type LbaSortK = "ad" | "status" | "members" | "leads";
interface LbaV {
  title: string; count: string; q: string; setQ: (e: { target: { value: string } }) => void;
  periods: { label: string; on: boolean; pick: () => void }[];
  custom: { label: string; from: string; to: string; setFrom: (e: { target: { value: string } }) => void; setTo: (e: { target: { value: string } }) => void } | null;
  statuses: { label: string; on: boolean; dot: string | null; pick: () => void }[];
  sort: Record<LbaSortK, { on: boolean; dir: "asc" | "desc"; pick: () => void }>;
  ads: { id: string; name: string; wa: boolean; total: number; open: boolean; toggle: () => void; teamDots: string[]; teamsLabel: string; status: string; stBg: string; stFg: string; first: string; more: string;
    rows: { who: string; name: string; ini: string; team: string; teamDot: string; n: number; pct: string; barW: string; on: boolean; none: boolean; pick: () => void }[] }[];
  empty: boolean;
  panel: null | { name: string; ini: string; team: string; teamDot: string; n: number; line: string; shut: boolean; fold: () => void; unfold: () => void; close: () => void; rail: string;
    leads: { id: string; name: string; sub: string; status: string; stBg: string; stFg: string; open: boolean; toggle: () => void; facts: [string, string][]; openChat: () => void; openInfo: () => void }[] };
}
const LBA_COLS = ["ad", "team", "status", "members"] as const;
const LBA_MIN: Record<(typeof LBA_COLS)[number], number> = { ad: 180, team: 110, status: 80, members: 110 };
const LBA_DEF: Record<(typeof LBA_COLS)[number], string> = { ad: "2.2fr", team: "1.1fr", status: "84px", members: "1.1fr" };
const SEG: CSSProperties = { height: "32px", padding: "3px", boxSizing: "border-box", borderRadius: "8px", background: "var(--crm-field)", display: "flex", gap: "2px", font: "500 12px Inter, sans-serif", whiteSpace: "nowrap" };
const segOpt = (on: boolean): CSSProperties => ({ ...XBTN, padding: "0 8px", display: "flex", alignItems: "center", gap: "5px", borderRadius: "6px", font: "inherit",
  background: on ? "#fff" : "transparent", boxShadow: on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: on ? "var(--crm-ink)" : "var(--crm-muted)" });
const STPILL: CSSProperties = { height: "22px", padding: "0 9px", borderRadius: "11px", display: "inline-flex", alignItems: "center", gap: "5px", font: "500 11px Inter, sans-serif", whiteSpace: "nowrap" };

function useLbaCols() {
  const [w, setW] = useState<Partial<Record<(typeof LBA_COLS)[number], number>>>(() => { try { return JSON.parse(localStorage.getItem("crm.lba.cols") ?? "{}"); } catch { return {}; } });
  const save = (n: typeof w) => { setW(n); try { localStorage.setItem("crm.lba.cols", JSON.stringify(n)); } catch { /* private window */ } };
  const grid = `24px ${LBA_COLS.map(k => (w[k] ? `${w[k]}px` : k === "status" ? LBA_DEF[k] : `minmax(${LBA_MIN[k]}px, ${LBA_DEF[k]})`)).join(" ")} 52px`;
  const minW = 28 + 24 + LBA_COLS.reduce((s, k) => s + (w[k] ?? LBA_MIN[k]), 0) + 52 + 12 * 5;
  const drag = (k: (typeof LBA_COLS)[number]) => (e: React.PointerEvent<HTMLSpanElement>) => {
    e.preventDefault(); e.stopPropagation();
    const cell = e.currentTarget.parentElement as HTMLElement, start = cell.getBoundingClientRect().width, x0 = e.clientX;
    const body = document.body, prev = body.style.cursor; body.style.cursor = "col-resize"; body.style.userSelect = "none";
    const el = e.currentTarget; el.style.background = "var(--crm-rust)";
    const move = (ev: PointerEvent) => save({ ...w, [k]: Math.max(LBA_MIN[k], Math.round(start + ev.clientX - x0)) });
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); body.style.cursor = prev; body.style.userSelect = ""; el.style.background = ""; };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
  };
  const reset = (k: (typeof LBA_COLS)[number]) => () => { const n = { ...w }; delete n[k]; save(n); };
  return { grid, minW, drag, reset };
}

/** The member's leads panel (v2 06b·2 / 06b·3 / 12c·2): 300 px, folding to the 44 px rail; shared by Leads by ad and Salespeople. */
export type LeadsPanelV = NonNullable<LbaV["panel"]>;
export function LeadsPanel({ P }: { P: LeadsPanelV }) {
  return (<>
    {P && P.shut && (
      <button type="button" onClick={P.unfold} title="Open" style={{ ...XBTN, width: "44px", flex: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: "14px", paddingTop: "16px", boxSizing: "border-box",
        border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "var(--crm-cream-nav)" }}>
        <span style={{ width: "24px", height: "24px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 9px ${TIGHT_X}`, color: "var(--crm-ink)" }}>{P.ini}</span>
        <span style={{ writingMode: "vertical-rl", font: "500 12px Inter, sans-serif", letterSpacing: "0.04em", color: "var(--crm-ink-soft)" }}>{P.rail}</span>
        <span style={{ display: "flex", color: "var(--crm-faint)" }}><Ic name="chevron-left" size={13} /></span>
      </button>
    )}
    {P && !P.shut && (
      <div className={DX.slideIn} style={{ width: "300px", flex: "none", display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "8px", padding: "14px 16px", borderBottom: "1px solid var(--crm-rule)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ flex: "none", width: "36px", height: "36px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 13px ${TIGHT_X}`, color: "var(--crm-ink)" }}>{P.ini}</span>
            <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
              <span style={{ font: `500 15px ${TIGHT_X}`, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{P.name}</span>
              {P.team && <span style={{ display: "flex", alignItems: "center", gap: "5px", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: P.teamDot }} />{P.team}</span>}
            </span>
            <button type="button" onClick={P.fold} title="Collapse" aria-label="Collapse" style={{ ...XBTN, flex: "none", width: "24px", height: "24px", borderRadius: "6px", display: "grid", placeItems: "center", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-muted)" }}><Ic name="chevron-right" size={11} /></button>
            <button type="button" onClick={P.close} title="Close" aria-label="Close" style={{ ...XBTN, display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>
          </div>
          <div style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}><b style={{ font: `600 13px ${TIGHT_X}`, color: "var(--crm-ink)" }}>{P.n} lead{P.n === 1 ? "" : "s"}</b> {P.line}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--crm-line) transparent" }}>
          {P.leads.map((l, i) => l.open ? (
            <div key={l.id} style={{ display: "flex", flexDirection: "column", background: "var(--crm-sel)", boxShadow: "inset 3px 0 0 var(--crm-rust)", borderTop: i ? "1px solid var(--crm-rule-soft)" : undefined }}>
              <button type="button" onClick={l.toggle} aria-expanded style={{ ...XBTN, display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px" }}>
                <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                  <span style={{ font: "600 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{l.name}</span>
                  <span style={{ font: "400 11px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)" }}>{l.sub}</span>
                </span>
                {l.status && <span style={{ ...STPILL, background: l.stBg, color: l.stFg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentcolor" }} />{l.status}</span>}
                <span style={{ display: "flex", color: "var(--crm-muted)" }}><Ic name="chevron-down" size={12} /></span>
              </button>
              <div style={{ display: "flex", flexDirection: "column", gap: "7px", padding: "2px 16px 12px" }}>
                {l.facts.map(([k, val]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: "10px", font: "400 12px Inter, sans-serif" }}><span style={{ color: "var(--crm-muted)" }}>{k}</span><span style={{ color: "var(--crm-ink)", textAlign: "right" }}>{val}</span></div>)}
                <div style={{ display: "flex", gap: "8px", paddingTop: "4px" }}>
                  <button type="button" onClick={l.openChat} style={{ ...XBTN, flex: 1, height: "34px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", background: "var(--crm-rust)", color: "#fff", font: "500 12px Inter, sans-serif" }} className="crm4a-primary"><Ic name="message-circle" size={13} />Open chat</button>
                  <button type="button" onClick={l.openInfo} style={{ ...XBTN, flex: 1, height: "34px", borderRadius: "7px", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", boxSizing: "border-box", border: "1px solid var(--crm-line)", background: "#fff", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-outline"><Ic name="user-round" size={13} />Customer info</button>
                </div>
              </div>
            </div>
          ) : (
            <button key={l.id} type="button" onClick={l.toggle} style={{ ...XBTN, width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "10px 16px", borderTop: i ? "1px solid var(--crm-rule-soft)" : undefined }} className="crm4a-row">
              <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "1px" }}>
                <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{l.name}</span>
                <span style={{ font: "400 11px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-faint)" }}>{l.sub}</span>
              </span>
              {l.status && <span style={{ ...STPILL, background: l.stBg, color: l.stFg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentcolor" }} />{l.status}</span>}
            </button>
          ))}
        </div>
      </div>
    )}
  </>);
}

export function DeskLeadsByAd({ v }: { v: LbaV }) {
  const C = useLbaCols(), P = v.panel;
  const head = (label: string, k: LbaSortK | null, col: (typeof LBA_COLS)[number] | null, right?: boolean) => (
    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "5px", height: "100%", justifyContent: right ? "flex-end" : undefined, minWidth: 0 }}>
      <button type="button" onClick={k ? v.sort[k].pick : undefined} style={{ ...XBTN, display: "flex", alignItems: "center", gap: "5px", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: "inherit", cursor: k ? "pointer" : "default" }}>
        {label}{k && <span style={{ display: "flex", color: "var(--crm-faint)", opacity: v.sort[k].on ? 1 : 0.45, transform: v.sort[k].on && v.sort[k].dir === "asc" ? "rotate(180deg)" : "none" }}><Ic name="arrow-down" size={10} /></span>}
      </button>
      {col && <span title="Drag to resize" onPointerDown={C.drag(col)} onDoubleClick={C.reset(col)} style={{ position: "absolute", top: "8px", bottom: "8px", right: "-8px", width: "3px", borderRadius: "2px", background: "var(--crm-audit-line)", cursor: "col-resize", touchAction: "none" }} />}
    </div>
  );
  const ROW: CSSProperties = { display: "grid", gridTemplateColumns: C.grid, gap: "12px", alignItems: "center", padding: "0 14px", borderTop: "1px solid var(--crm-rule-soft)" };
  const ell: CSSProperties = { whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 };
  return (
    <div style={{ flex: "1 1 auto", minHeight: 0, height: "100%", display: "flex", gap: "14px", marginTop: "1px", marginBottom: "-12px", boxSizing: "border-box" }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", border: "1px solid var(--crm-rule)", borderRadius: "10px", background: "#fff", overflow: "hidden" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "12px 14px 8px" }}>
          <span style={{ font: `500 16px ${TIGHT_X}`, whiteSpace: "nowrap", color: "var(--crm-ink)" }}>{v.title}</span>
          <span style={{ font: "400 12px Inter, sans-serif", fontVariantNumeric: "tabular-nums", color: "var(--crm-muted)", whiteSpace: "nowrap" }}>{v.count}</span>
          <label style={{ marginLeft: "auto", width: "200px", height: "32px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "8px", boxSizing: "border-box", border: "1px solid var(--crm-line)", color: "var(--crm-faint)" }}>
            <Ic name="search" size={13} />
            <input value={v.q} onChange={v.setQ} placeholder="Search ad or member" aria-label="Search ad or member" style={{ flex: 1, minWidth: 0, border: 0, outline: "none", padding: 0, background: "transparent", font: "400 12px Inter, sans-serif", color: "var(--crm-ink)" }} />
          </label>
        </div>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "0 14px 12px" }}>
          <div style={SEG}>{v.periods.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={segOpt(o.on)}>{o.label}</button>)}</div>
          {v.custom && (
            <label style={{ position: "relative", height: "32px", padding: "0 10px", borderRadius: "7px", display: "flex", alignItems: "center", gap: "7px", boxSizing: "border-box", border: "1px solid var(--crm-rust)", font: "500 12px Inter, sans-serif", whiteSpace: "nowrap", color: "var(--crm-ink)" }}>
              <span style={{ display: "flex", color: "var(--crm-rust)" }}><Ic name="calendar" size={13} /></span>{v.custom.label}
              <input type="date" value={v.custom.from} onChange={v.custom.setFrom} aria-label="From" style={{ position: "absolute", left: 0, top: 0, width: "50%", height: "100%", opacity: 0, cursor: "pointer" }} />
              <input type="date" value={v.custom.to} onChange={v.custom.setTo} aria-label="To" style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", opacity: 0, cursor: "pointer" }} />
            </label>
          )}
          <span style={{ flexBasis: "100%", height: 0 }} />
          <div style={SEG}>{v.statuses.map(o => <button key={o.label} type="button" onClick={o.pick} aria-pressed={o.on} style={segOpt(o.on)}>
            {o.dot && <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: o.dot }} />}{o.label}</button>)}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowX: "auto" }}>
          <div style={{ minWidth: `${C.minW}px`, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
            <div style={{ ...ROW, flex: "none", height: "36px", borderTop: "1px solid var(--crm-nav-line)", borderBottom: "1px solid var(--crm-nav-line)", background: "var(--crm-cream-nav)",
              font: "600 11px Inter, sans-serif", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--crm-brown)" }}>
              <span />{head("Ad", "ad", "ad")}{head("Team", null, "team")}{head("Status", "status", "status")}{head("Members", "members", "members")}{head("Leads", "leads", null, true)}
            </div>
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--crm-line) transparent", marginTop: "-1px" }}>
              {v.ads.map(a => (
                <Fragment key={a.id}>
                  <button type="button" onClick={a.toggle} aria-expanded={a.open} style={{ ...XBTN, ...ROW, width: "100%", height: "50px", background: a.open ? "var(--crm-hover)" : "transparent", font: "400 14px Inter, sans-serif", color: "var(--crm-ink)" }} className={a.open ? undefined : "crm4a-row"}>
                    <span style={{ display: "flex", color: "var(--crm-muted)" }}><Ic name={a.open ? "chevron-down" : "chevron-right"} size={12} /></span>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
                      <span style={{ display: "flex", flex: "none", color: a.wa ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name="message-circle" size={14} /></span>
                      <span style={{ ...ell, fontWeight: 500 }}>{a.name}</span>
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px", font: "400 12px Inter, sans-serif", color: "var(--crm-muted)", ...ell }}>
                      <span style={{ display: "flex", gap: "2px", flex: "none" }}>{a.teamDots.map((d, i) => <span key={i} style={{ width: "8px", height: "8px", borderRadius: "50%", background: d, boxShadow: "0 0 0 2px #fff" }} />)}</span>{a.teamsLabel}
                    </span>
                    <span><span style={{ ...STPILL, background: a.stBg, color: a.stFg }}><span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "currentcolor" }} />{a.status}</span></span>
                    <span style={{ ...ell, color: "var(--crm-ink-soft)" }}>{a.first}{a.more && <span style={{ color: "var(--crm-faint)" }}> {a.more}</span>}</span>
                    <span style={{ textAlign: "right", font: `600 14px ${TIGHT_X}`, fontVariantNumeric: "tabular-nums" }}>{a.total}</span>
                  </button>
                  {a.open && a.rows.map(r => (
                    <button key={r.who || "none"} type="button" onClick={r.none ? undefined : r.pick} style={{ ...XBTN, ...ROW, width: "100%", height: "44px", font: "400 13px Inter, sans-serif", color: r.none ? "var(--crm-oxblood)" : "var(--crm-ink)",
                      background: r.on ? "var(--crm-sel)" : "var(--crm-hover-2)", boxShadow: r.on ? "inset 3px 0 0 var(--crm-rust)" : "none", cursor: r.none ? "default" : "pointer" }}>
                      <span />
                      <span style={{ display: "flex", alignItems: "center", gap: "10px", paddingLeft: "22px", minWidth: 0 }}>
                        <span style={{ flex: "none", width: "26px", height: "26px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-cream)", font: `500 10px ${TIGHT_X}`, color: "var(--crm-ink)" }}>{r.ini}</span>
                        <span style={{ ...ell, fontWeight: 500 }}>{r.name}</span>
                      </span>
                      <span style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "12px", color: "var(--crm-muted)", ...ell }}>{r.team && <span style={{ width: "6px", height: "6px", flex: "none", borderRadius: "50%", background: r.teamDot }} />}{r.team}</span>
                      <span />
                      <span style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                        <span style={{ flex: 1, height: "5px", borderRadius: "3px", background: "var(--crm-rule-soft)", position: "relative", overflow: "hidden" }}><span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: r.barW, background: "var(--crm-rust)" }} /></span>
                        <span style={{ width: "34px", textAlign: "right", fontSize: "12px", color: "var(--crm-muted)", fontVariantNumeric: "tabular-nums" }}>{r.pct}</span>
                      </span>
                      <span style={{ textAlign: "right", font: `500 13px ${TIGHT_X}`, fontVariantNumeric: "tabular-nums" }}>{r.n}</span>
                    </button>
                  ))}
                </Fragment>
              ))}
              {v.empty && <div style={{ padding: "28px 14px", textAlign: "center", font: "400 13px Inter, sans-serif", color: "var(--crm-muted)" }}>No ad matches</div>}
            </div>
          </div>
        </div>
      </div>
      {P && <LeadsPanel P={P} />}
    </div>
  );
}

/**
 * v2 frame 09b · Channels › a number's Business profile (note 07): Update on WhatsApp and / or its Facebook Page (both
 * ticked when there is a Page), the photo, display name, about, description, address, email, website and category, Save —
 * sent to Meta from the server (saveCrmBusinessProfile), each channel answered on its own, a failed one with Retry. A new
 * WhatsApp name is a request Meta reviews; the Page's photo, name, category and address are Facebook's to change.
 */
type ProfileInit = { name: string; about: string; description: string; address: string; email: string; website: string; vertical: string };
type ProfileRes = { wa?: { ok: true; nameInReview: boolean; photo: boolean } | { ok: false; error: string }; page?: { ok: true } | { ok: false; error: string } };
export interface ProfileDrawerV {
  key: string; title: string; waId: string; waLabel: string; waName: string; pageId: string; pageLabel: string; photo: string | null; nameStatus: string; can: boolean;
  init: ProfileInit; synced: string; close: () => void; save: (form: FormData) => Promise<ProfileRes | null>;
}
const PF_BOX: CSSProperties = { height: "34px", padding: "0 10px", borderRadius: "7px", boxSizing: "border-box", border: "1px solid var(--crm-line)", font: "400 13px/1.45 Inter, sans-serif", color: "var(--crm-ink)", background: "#fff", outline: "none", width: "100%" };
const PF_LABEL: CSSProperties = { display: "flex", alignItems: "center", gap: "6px", font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" };
export function DeskProfileDrawer({ v, verticals }: { v: ProfileDrawerV; verticals: readonly (readonly [string, string])[] }) {
  const [f, setF] = useState<ProfileInit>(v.init);
  const [toWa, setToWa] = useState(true), [toPage, setToPage] = useState(!!v.pageId);
  const [photo, setPhoto] = useState<File | null>(null), [busy, setBusy] = useState(false), [res, setRes] = useState<ProfileRes | null>(null);
  const preview = photo ? URL.createObjectURL(photo) : v.photo;
  const set = (k: keyof ProfileInit) => (e: { target: { value: string } }) => setF(x => ({ ...x, [k]: k === "about" ? e.target.value.slice(0, 139) : e.target.value }));
  const label = toWa && toPage ? "Save to WhatsApp & Facebook" : toPage ? "Save to Facebook" : "Save to WhatsApp";
  const send = async (only?: "wa" | "page") => {
    const wa = only ? only === "wa" : toWa, pg = only ? only === "page" : toPage;
    if (!wa && !pg) return;
    const fd = new FormData();
    Object.entries(f).forEach(([k, val]) => fd.set(k, val));
    fd.set("curName", v.init.name); fd.set("wa", v.waId); fd.set("waName", v.waName); fd.set("page", v.pageId); fd.set("pageName", v.pageLabel);
    fd.set("toWa", wa ? "1" : ""); fd.set("toPage", pg ? "1" : "");
    if (wa && photo) fd.set("photo", photo);
    setBusy(true);
    const r = await v.save(fd);
    setBusy(false);
    if (r) setRes(x => ({ ...x, ...r }));
  };
  const chip = (on: boolean, toggle: () => void, icon: Icon4a, color: string, name: string, sub: string, off?: boolean) => (
    <button type="button" onClick={off ? undefined : toggle} aria-pressed={on} disabled={off} style={{ ...XBTN, flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: "10px", padding: "10px 12px", borderRadius: "8px", boxSizing: "border-box",
      border: `1.5px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, background: on ? "#fff" : "var(--crm-hover)", cursor: off ? "not-allowed" : "pointer", opacity: off ? 0.6 : 1 }}>
      <span style={{ flex: "none", width: "18px", height: "18px", borderRadius: "4px", boxSizing: "border-box", display: "grid", placeItems: "center", color: "#fff",
        background: on ? "var(--crm-rust)" : "#fff", border: on ? "0" : "1.5px solid var(--crm-faint-2)" }}>{on && <Ic name="check" size={12} />}</span>
      <span style={{ display: "flex", flex: "none", color }}><Ic name={icon} size={16} /></span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>{name}</span>
        <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
    </button>
  );
  const outcome = (k: "wa" | "page", name: string) => { const r = res?.[k]; if (!r) return null;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "8px 10px", borderRadius: "7px", font: "400 12px Inter, sans-serif",
        background: r.ok ? "var(--crm-tint-new)" : "var(--crm-tint-attention)", color: r.ok ? "var(--crm-ink)" : "var(--crm-oxblood)" }}>
        <Ic name={r.ok ? "circle-check" : "triangle-alert"} size={13} />
        <span style={{ flex: 1, minWidth: 0 }}>{r.ok ? `${name} updated${"nameInReview" in r && r.nameInReview ? " · new name in review (1–2 days)" : ""}` : `${name}: ${r.error}`}</span>
        {!r.ok && <button type="button" onClick={() => void send(k)} disabled={busy} style={{ ...XBTN, font: "500 12px Inter, sans-serif", color: "var(--crm-rust)" }}>Retry</button>}
      </div>
    ); };
  const ini = (v.waName || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div onClick={v.close} style={{ position: "fixed", inset: 0, zIndex: 40, background: "rgba(42,22,12,.2)", display: "flex", justifyContent: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} className={DX.slideIn} style={{ width: "460px", height: "100%", display: "flex", flexDirection: "column", background: "#fff", boxShadow: "-12px 0 32px rgba(42,22,12,.18)" }}>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "16px 22px", borderBottom: "1px solid var(--crm-rule)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 }}>
            <span style={{ font: `500 17px ${TIGHT_X}`, color: "var(--crm-ink)" }}>Business profile</span>
            <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{v.title}</span>
          </div>
          <button type="button" onClick={v.close} aria-label="Close" style={{ ...XBTN, marginLeft: "auto", display: "flex", color: "var(--crm-faint)" }}><Ic name="x" size={14} /></button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--crm-line) transparent", display: "flex", flexDirection: "column", gap: "14px", padding: "18px 22px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            <div style={{ font: "500 12px Inter, sans-serif", color: "var(--crm-ink-soft)" }}>Update on <span style={{ fontWeight: 400, color: "var(--crm-faint)" }}>· tick one or both</span></div>
            <div style={{ display: "flex", gap: "8px" }}>
              {chip(toWa, () => setToWa(x => !x), "phone", "var(--crm-whatsapp)", "WhatsApp", v.waLabel)}
              {chip(toPage, () => setToPage(x => !x), "message-circle", "var(--crm-messenger)", "Facebook Page", v.pageLabel || "No Page linked to this number", !v.pageId)}
            </div>
            <div style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-muted)" }}>Saved here and sent to Meta for you. Fields a channel doesn’t have are skipped.</div>
          </div>
          {outcome("wa", "WhatsApp")}{outcome("page", "Facebook Page")}
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            {preview
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={preview} alt="" style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", objectFit: "cover" }} />
              : <span style={{ flex: "none", width: "64px", height: "64px", borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--crm-ink)", color: "var(--crm-cream)", font: `500 20px ${TIGHT_X}` }}>{ini}</span>}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              <span style={{ font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }}>Profile photo</span>
              <div style={{ display: "flex", gap: "8px" }}>
                <label style={{ ...XBTN, height: "30px", padding: "0 12px", borderRadius: "6px", display: "flex", alignItems: "center", boxSizing: "border-box", border: "1px solid var(--crm-line)", font: "500 12px Inter, sans-serif", color: "var(--crm-ink)" }}>
                  Upload<input type="file" accept="image/jpeg,image/png" onChange={e => setPhoto(e.target.files?.[0] ?? null)} style={{ display: "none" }} /></label>
                {photo && <button type="button" onClick={() => setPhoto(null)} style={{ ...XBTN, height: "30px", padding: "0 4px", font: "500 12px Inter, sans-serif", color: "var(--crm-oxblood)" }}>Remove</button>}
              </div>
              <span style={{ font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>Square JPG or PNG, at least 640 px{toPage ? " · Facebook’s photo is changed on Facebook" : ""}</span>
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={PF_LABEL}>Display name<span style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>{/PENDING|REVIEW/i.test(v.nameStatus) ? "In review" : "WhatsApp reviews name changes · 1–2 days"}</span></span>
            <input value={f.name} onChange={set("name")} style={PF_BOX} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={PF_LABEL}>About<span style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>139 characters max</span></span>
            <input value={f.about} onChange={set("about")} style={PF_BOX} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={PF_LABEL}>Description</span>
            <textarea value={f.description} onChange={set("description")} rows={2} style={{ ...PF_BOX, height: "auto", minHeight: "56px", padding: "8px 10px", resize: "vertical" }} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={PF_LABEL}>Address{toPage && <span style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>WhatsApp only</span>}</span>
            <input value={f.address} onChange={set("address")} style={PF_BOX} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}><span style={PF_LABEL}>Email</span><input value={f.email} onChange={set("email")} style={PF_BOX} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}><span style={PF_LABEL}>Website</span><input value={f.website} onChange={set("website")} style={PF_BOX} /></label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
            <span style={PF_LABEL}>Category{toPage && <span style={{ marginLeft: "auto", font: "400 11px Inter, sans-serif", color: "var(--crm-faint)" }}>WhatsApp only</span>}</span>
            <select value={f.vertical || "OTHER"} onChange={set("vertical")} style={PF_BOX}>{verticals.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <div style={{ flex: "none", display: "flex", alignItems: "center", gap: "10px", padding: "14px 22px", borderTop: "1px solid var(--crm-rule)" }}>
          <span style={{ font: "400 12px Inter, sans-serif", color: "var(--crm-muted)" }}>{v.synced}</span>
          <button type="button" onClick={v.close} style={{ ...XBTN, marginLeft: "auto", height: "36px", padding: "0 14px", borderRadius: "7px", display: "flex", alignItems: "center", border: "1px solid var(--crm-line)", font: "500 13px Inter, sans-serif", color: "var(--crm-ink)" }} className="crm4a-outline">Cancel</button>
          <button type="button" onClick={() => void send()} disabled={busy || !v.can || (!toWa && !toPage)} title={v.can ? "" : "Only CRM · Manage may change the profile"} style={{ ...XBTN, height: "36px", padding: "0 16px", borderRadius: "7px", display: "flex", alignItems: "center",
            background: busy || !v.can || (!toWa && !toPage) ? "var(--crm-line)" : "var(--crm-rust)", color: "#fff", font: "500 13px Inter, sans-serif" }} className="crm4a-primary">{busy ? "Sending…" : label}</button>
        </div>
      </div>
    </div>
  );
}
