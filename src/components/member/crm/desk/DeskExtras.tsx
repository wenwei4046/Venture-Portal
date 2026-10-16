"use client";

/**
 * The desktop's screens the design does not draw (CRM Desktop rev 1, BUILD-NOTES.md) — Appointment, Add note, Edit
 * customer, History — written in the design's own vocabulary: the pane's back bar, its 18 / 20 px padding, its chips,
 * fields and rust buttons, Inter, the same colours. Behaviour: vm/extras.ts.
 */
import { Fragment } from "react";
import DX from "./desk-extras.module.css";
import { InfoValue } from "../shared/AdLink";
import SalesCustomerForm from "../sales/SalesCustomerForm";
import type { CustomerFormVM } from "../sales/vm/customer";
import type { bookVM, customerFormVM, historyVM, noteVM } from "./vm/extras";

const BACK = { flex: "0 0 auto", display: "flex", alignItems: "center", gap: "6px", padding: "10px 16px", border: "0", borderBottom: "1px solid #EBDDD2", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", textAlign: "left" } as const;
const BODY = { flex: "1", minHeight: "0", overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: "16px", background: "#fff" } as const;
const FOOT = { flex: "0 0 auto", padding: "14px 20px", borderTop: "1px solid #EBDDD2", background: "#fff", display: "flex", gap: "10px" } as const;
const LABEL = { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" } as const;
const FIELD = { width: "100%", boxSizing: "border-box", height: "42px", padding: "0 14px", borderRadius: "12px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "14px", color: "#3F2B22", outline: "none" } as const;
const PRIMARY = (bg: string, cur: string) => ({ flex: "1", height: "44px", borderRadius: "22px", border: "0", background: bg, color: "#fff", font: "inherit", fontSize: "14px", fontWeight: "650", cursor: cur }) as const;
const GHOST = { height: "44px", padding: "0 18px", borderRadius: "22px", border: "1px solid #E2CFC1", background: "#fff", color: "#3F2B22", font: "inherit", fontSize: "14px", fontWeight: "650", cursor: "pointer" } as const;
const Chev = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"></path></svg>;

export function DeskBook({ v }: { v: ReturnType<typeof bookVM> }) {
  return (<>
    <button type="button" onClick={v.back} style={BACK}><Chev />{v.name} · chat</button>
    <div style={BODY}>
      {v.has && <div style={{ padding: "12px 14px", borderRadius: "14px", background: "#E4EDF8", color: "#2F5E8C", fontSize: "13px", fontWeight: "600" }}>Booked · {v.current}</div>}
      <span style={LABEL}>Showroom</span>
      <div style={{ display: "inline-flex", alignSelf: "flex-start", background: "#F5EBE3", borderRadius: "11px", padding: "3px", gap: "2px", flexWrap: "wrap" }}>
        {v.rooms.map((r, i) => <span key={i} onClick={r.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", background: r.bg, color: r.fg, fontSize: "13px", fontWeight: "650", boxShadow: r.sh, cursor: "pointer", whiteSpace: "nowrap" }}>{r.label}</span>)}
      </div>
      {/* Day: the month chip and Week | Month, as the salesperson's sheet (the owner, 2026-10-13). */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ ...LABEL, flex: "none" }}>Day</span>
        <span onClick={v.toggleMonth} title="Choose month" style={{ flex: "none", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "4px", minHeight: "32px", padding: "0 10px 0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid #EBDDD2", fontSize: "13px", fontWeight: "600", color: "#3F2B22", cursor: "pointer" }}>
          {v.monthLabel}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"></path></svg>
        </span>
        {v.monthOpen && <>
          <div onClick={v.toggleMonth} style={{ position: "fixed", inset: "0", zIndex: 2 }} />
          <div style={{ position: "absolute", top: "38px", left: "0", zIndex: 3, width: "268px", padding: "12px", boxSizing: "border-box", borderRadius: "16px", background: "#fff", boxShadow: "0 8px 24px rgba(63,43,34,.18)", display: "flex", flexDirection: "column", gap: "10px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span onClick={v.yPrev} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: v.yPrevFg, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 6-6 6 6 6"></path></svg></span>
              <strong style={{ fontSize: "16px", fontWeight: "700", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{v.pickYear}</strong>
              <span onClick={v.yNext} style={{ width: "36px", height: "36px", boxSizing: "border-box", borderRadius: "50%", border: "1px solid #EBDDD2", display: "grid", placeItems: "center", color: v.yNextFg, cursor: "pointer" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6"></path></svg></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "6px" }}>
              {v.ymonths.map(mo => <span key={mo.label} onClick={mo.pick} style={{ height: "40px", borderRadius: "12px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: mo.weight, background: mo.bg, color: mo.fg, cursor: mo.cur }}>{mo.label}</span>)}
            </div>
          </div>
        </>}
        <span style={{ flex: "1" }} />
        <span style={{ display: "flex", gap: "2px", padding: "2px", borderRadius: "16px", background: "#F5EBE3" }}>
          <span onClick={v.viewWeek} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.viewWeekBg, boxShadow: v.viewWeekSh, cursor: "pointer" }}>Week</span>
          <span onClick={v.viewMonth} style={{ height: "28px", padding: "0 10px", whiteSpace: "nowrap", boxSizing: "border-box", borderRadius: "14px", display: "grid", placeItems: "center", fontSize: "13px", fontWeight: "600", background: v.viewMonthBg, boxShadow: v.viewMonthSh, cursor: "pointer" }}>Month</span>
        </span>
        {v.isWeek && <>
          <button type="button" onClick={v.prev} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #E2CFC1", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#806B60" }}><Chev /></button>
          <button type="button" onClick={v.next} style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #E2CFC1", background: "#fff", cursor: "pointer", display: "grid", placeItems: "center", color: "#806B60", transform: "scaleX(-1)" }}><Chev /></button>
        </>}
      </div>
      {v.isWeek ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "6px" }}>
          {v.days.map((d, i) => <span key={i} onClick={d.pick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "8px 0", borderRadius: "12px", border: `1px solid ${d.bd}`, background: d.bg, color: d.fg, cursor: d.closed ? "not-allowed" : "pointer", textDecoration: d.deco }}>
            <small style={{ fontSize: "11px", fontWeight: "600" }}>{d.wk}</small><strong style={{ fontSize: "16px", fontWeight: "700" }}>{d.dn}</strong></span>)}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", padding: "10px", border: "1px solid #EBDDD2", borderRadius: "14px" }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((w, i) => <span key={`w${i}`} style={{ textAlign: "center", fontSize: "11px", fontWeight: "700", color: "#806B60", paddingBottom: "4px" }}>{w}</span>)}
          {v.mCells.map((c, i) => <span key={i} onClick={c.pick} style={{ height: "34px", borderRadius: "10px", display: "grid", placeItems: "center", fontSize: "14px", fontWeight: "600", background: c.bg, color: c.fg, textDecoration: c.deco, cursor: c.cur, fontVariantNumeric: "tabular-nums" }}>{c.n}</span>)}
        </div>
      )}
      <span style={LABEL}>Time</span>
      {v.noSlots ? <span style={{ fontSize: "13px", color: "#A08E82" }}>No visit times on this day</span> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "8px" }}>
          {v.slots.map((s, i) => <span key={i} onClick={s.pick} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", padding: "10px 4px", borderRadius: "12px", border: `1px solid ${s.bd}`, background: s.bg, color: s.fg, cursor: s.cur, textDecoration: s.deco }}>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{s.label}</strong><small style={{ fontSize: "11px", opacity: ".8" }}>{s.sub}</small></span>)}
        </div>)}
    </div>
    <div style={FOOT}>
      {v.has && <button type="button" onClick={v.cancel} style={{ ...GHOST, color: "#A3371A", borderColor: "#F0C9BC" }}>Cancel visit</button>}
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
      {v.none && <span style={{ fontSize: "13px", color: "#A08E82" }}>No notes yet</span>}
      {v.notes.map((n, i) => <div key={i} style={{ padding: "12px 14px", borderRadius: "14px", background: "#FBF6F2", border: "1px solid #F1E7DF", display: "flex", flexDirection: "column", gap: "4px" }}>
        <p style={{ margin: "0", fontSize: "14px", lineHeight: "1.45", whiteSpace: "pre-wrap" }}>{n.text}</p><small style={{ fontSize: "12px", color: "#806B60" }}>{n.by} · {n.at}</small></div>)}
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
        {s.fields.map(f => <label key={f.id} style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", fontWeight: "600", color: "#4E2F20" }}>{f.label}
          {f.isChoice ? <span style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>{f.opts.map((o, i) => <span key={i} onClick={o.pick} style={{ height: "32px", lineHeight: "30px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: `1px solid ${o.bd}`, background: o.bg, color: o.fg, fontSize: "13px", fontWeight: "600", cursor: "pointer" }}>{o.label}</span>)}</span>
            : f.isLong ? <textarea value={f.value} onChange={f.set} placeholder={f.ph} rows={3} style={{ ...FIELD, height: "auto", padding: "12px 14px", resize: "vertical", fontWeight: "400" }} />
              : <input value={f.value} onChange={f.set} placeholder={f.ph} type={f.isDate ? "date" : "text"} inputMode={f.input as "text"} style={{ ...FIELD, fontWeight: "400" }} />}
        </label>)}
      </Fragment>)}
    </div>
    <div style={{ ...FOOT, flexDirection: "column" }}>
      {v.hint && <span style={{ fontSize: "12px", color: "#A3371A" }}>{v.hint}</span>}
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
      <div style={{ border: "1px solid #EBDDD2", borderRadius: "16px", overflow: "hidden", background: "#fff" }}>
        {v.loading && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "#A08E82" }}>Loading the history…</div>}
        {v.empty && <div style={{ padding: "28px", textAlign: "center", fontSize: "14px", color: "#A08E82" }}>No changes yet</div>}
        {v.rows.map((r, i) => <div key={i} style={{ display: "grid", gridTemplateColumns: "40px minmax(0, 1fr) auto", gap: "12px", padding: "14px 16px", borderTop: i ? "1px solid #F1E7DF" : "0", alignItems: "flex-start" }}>
          <span style={{ width: "34px", height: "34px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: "12px", fontWeight: "700", display: "grid", placeItems: "center" }}>{r.ini}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: "4px", minWidth: "0" }}>
            <span style={{ fontSize: "14px" }}><strong style={{ fontWeight: "650" }}>{r.who}</strong> <span style={{ color: "#806B60" }}>{r.op.toLowerCase()}</span> <strong style={{ fontWeight: "650" }}>{r.what}</strong> <span style={{ display: "inline-block", marginLeft: "4px", padding: "1px 8px", borderRadius: "9px", background: "#F5EBE3", color: "#6B574C", fontSize: "11px", fontWeight: "700" }}>{r.area}</span></span>
            {r.changes.map((x, k) => <span key={k} style={{ fontSize: "12.5px", color: "#6B574C" }}>{x.field}: <s style={{ color: "#A08E82" }}>{x.from || "—"}</s> → <strong style={{ fontWeight: "650", color: "#3F2B22" }}>{x.to || "—"}</strong></span>)}
          </span>
          <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap" }}>{r.at}</span>
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
    <button type="button" onClick={v.insCardsToggle} style={{ alignSelf: "center", display: "inline-flex", alignItems: "center", gap: "6px", height: "32px", padding: "0 12px", boxSizing: "border-box", borderRadius: "16px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer", whiteSpace: "nowrap" }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#BD4A19" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"></path></svg>Metrics · {v.insCardsN}
    </button>
  );
}

/**
 * The reply box's emoji panel (the design draws the sticker icon and nothing behind it): the phone's Sticker panel's
 * Emoji tab (#425 — its categories, Recents kept on the server, the keyword search) as one of the README's popovers —
 * white, a #EBDDD2 border, radius 16, padding 6, the popover shadow, rows hovering #FFF5EC. Behaviour: vm/chat.ts.
 */
export function DeskEmoji({ v }: { v: ReturnType<typeof import("./vm/chat").chatVM>["emoji"] }) {
  const ib = (on: boolean) => ({ width: "34px", height: "34px", flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: "10px", border: "0",
    background: on ? "#FFF0E4" : "transparent", color: on ? "#BD4A19" : "#806B60", cursor: "pointer", padding: "0" }) as const;
  const Ico = ({ d }: { d: string }) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  return (<>
    <div onClick={e => { e.stopPropagation(); v.close(); }} style={{ position: "fixed", inset: "0", zIndex: 30, cursor: "default" }} />
    <div onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === "Escape") v.close(); }}
      style={{ position: "absolute", right: "-8px", bottom: "42px", zIndex: 31, width: "336px", boxSizing: "border-box", padding: "6px", borderRadius: "16px", border: "1px solid #EBDDD2",
        background: "#fff", boxShadow: "0 10px 28px rgba(40,25,18,.16)", display: "flex", flexDirection: "column", gap: "4px", cursor: "default", color: "#3F2B22", textAlign: "left" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "2px", padding: "2px 2px 4px", borderBottom: "1px solid #F1E7DF" }}>
        {v.searching
          ? <input autoFocus value={v.q} onChange={v.setQ} placeholder="Search emoji" style={{ flex: "1", minWidth: "0", height: "34px", boxSizing: "border-box", padding: "0 12px", borderRadius: "10px", border: "1px solid #E2CFC1", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} />
          : v.cats.map(c => <button key={c.label} type="button" title={c.label} onClick={c.pick} className={DX.emo} style={ib(c.on)}><Ico d={c.d} /></button>)}
        <span style={{ flex: v.searching ? "0 0 auto" : "1" }} />
        <button type="button" title={v.searching ? "Close search" : "Search emoji"} onClick={v.toggleSearch} className={DX.emo} style={ib(v.searching)}>
          <Ico d={v.searching ? "M6 6l12 12M18 6 6 18" : "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35"} />
        </button>
      </div>
      <span style={{ padding: "4px 8px 0", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "#A08E82" }}>{v.label}</span>
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
 * a tap opens the chat, and Mark as read. Behaviour: vm/inbox.ts › alertsVM.
 */
export function DeskAlerts({ v }: { v: ReturnType<typeof import("./vm/inbox").alertsVM>["alertsP"] }) {
  return (<>
    <div style={{ padding: "12px 16px", background: "#fff", borderBottom: "1px solid #F1E7DF", display: "flex", alignItems: "center", gap: "10px" }}>
      <div style={{ display: "inline-flex", background: "#F5EBE3", borderRadius: "11px", padding: "3px", gap: "2px" }}>
        {v.tabs.map(t => <span key={t.label} onClick={t.pick} style={{ height: "28px", lineHeight: "28px", padding: "0 12px", borderRadius: "8px", fontSize: "13px", cursor: "pointer",
          ...(t.on ? { background: "#fff", fontWeight: "650", boxShadow: "rgba(63,43,34,.14) 0 1px 3px", color: "#3F2B22" } : { color: "#806B60", fontWeight: "550" }) }}>{t.label}</span>)}
      </div>
      <span style={{ flex: "1" }} />
      {v.markAll && <button type="button" onClick={v.markAll} className={DX.emo} style={{ height: "30px", padding: "0 12px", borderRadius: "15px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }}>Mark all read</button>}
    </div>
    <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column" }}>
      {!v.rows.length && <div style={{ padding: "40px 24px", textAlign: "center", fontSize: "13.5px", color: "#806B60" }}>{v.empty}</div>}
      {v.rows.map(a => (
        <div key={a.key} onClick={a.open} className={DX.alert} style={{ display: "flex", gap: "12px", padding: "14px 16px", background: a.bg, borderBottom: "1px solid #F1E7DF", cursor: a.canOpen ? "pointer" : "default" }}>
          <span style={{ flex: "0 0 auto", marginTop: "5px", width: "8px", height: "8px", borderRadius: "50%", background: a.dot }}></span>
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "3px" }}>
            <span style={{ display: "flex", gap: "8px", alignItems: "baseline" }}>
              <b style={{ fontSize: "12px", fontWeight: "700", color: a.color }}>{a.kind}</b>
              <span style={{ flex: "1" }}></span>
              <small style={{ fontSize: "12px", color: "#A8968B", whiteSpace: "nowrap" }}>{a.time}</small>
            </span>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{a.title}</strong>
            {a.line && <span style={{ fontSize: "13px", color: "#3F2B22" }}>{a.line}{a.extra ? <span style={{ color: "#806B60" }}> · {a.extra}</span> : null}</span>}
            {a.sub && <span style={{ fontSize: "12.5px", color: "#806B60" }}>{a.sub}</span>}
            {a.hasQuote && <span style={{ marginTop: "4px", padding: "7px 10px", borderRadius: "10px", background: "#FBF6F2", borderLeft: "3px solid #E2CFC1", fontSize: "12.5px", color: "#6B574C",
              overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{a.quote}</span>}
            {(a.canOpen || a.markRead) && <span style={{ display: "flex", gap: "14px", marginTop: "6px" }}>
              {a.canOpen && <span style={{ fontSize: "12.5px", fontWeight: "650", color: "#BD4A19" }}>Open chat ›</span>}
              {a.markRead && <span onClick={a.markRead} style={{ fontSize: "12.5px", fontWeight: "650", color: "#806B60", cursor: "pointer" }}>Mark as read</span>}
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
  const CARD = { border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" } as const;
  const LAB = { fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" } as const;
  const Av = ({ ini, big }: { ini: string; big?: boolean }) => <span style={{ flex: "0 0 auto", width: big ? "44px" : "30px", height: big ? "44px" : "30px", borderRadius: "50%", background: "#FFF0E4", color: "#BD4A19", fontSize: big ? "14px" : "11px", fontWeight: "700", display: "grid", placeItems: "center" }}>{ini}</span>;
  if (!v.has) return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 18px 10px" }}>
        <div style={LAB}>To fill in</div>
        <strong style={{ display: "block", marginTop: "4px", fontSize: "15px", fontWeight: "650" }}>{v.todoTitle}</strong>
        <span style={{ display: "block", marginTop: "2px", fontSize: "12.5px", color: "#806B60" }}>Pick a contact in the table to see them here.</span>
      </div>
      {v.todo.map(t => (
        <div key={t.id} onClick={t.pick} className={DX.alert} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px 18px", borderTop: "1px solid #F5EEE8", cursor: "pointer" }}>
          <Av ini={t.ini} />
          <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column" }}>
            <span style={{ fontSize: "13.5px", fontWeight: "650", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</span>
            <span style={{ fontSize: "12px", color: "#806B60", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.sub}</span>
          </span>
          <button type="button" onClick={t.fill} className={DX.emo} style={{ height: "28px", padding: "0 11px", borderRadius: "14px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "12px", fontWeight: "650", color: "#BD4A19", cursor: "pointer", whiteSpace: "nowrap" }}>Fill in</button>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ ...CARD, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "16px 18px", borderBottom: "1px solid #F1E7DF" }}>
        <Av ini={v.ini} big />
        <span style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "2px" }}>
          <strong style={{ fontSize: "16px", fontWeight: "700" }}>{v.name}</strong>
          <span style={{ fontSize: "12.5px", color: "#806B60" }}>{v.phone} · {v.ch}</span>
        </span>
        <button type="button" onClick={v.close} title="Close" style={{ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #EBDDD2", background: "#fff", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18"></path></svg></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px", padding: "14px 18px", borderBottom: "1px solid #F1E7DF" }}>
        {([["Status", v.status, null], ["Owner", v.owner, null], ["Ad", v.ad, v.adUrl], ["Last chat", v.lastAt, null]] as const).map(([k, x, href]) => (
          <span key={k} style={{ display: "flex", flexDirection: "column", gap: "2px", minWidth: "0" }}>
            <span style={{ fontSize: "12px", color: "#806B60" }}>{k}</span><strong style={{ fontSize: "13.5px", fontWeight: "650", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><InfoValue v={x} href={href} /></strong></span>))}
        {v.visit && <span style={{ gridColumn: "1 / -1", padding: "8px 10px", borderRadius: "10px", background: "#E4EDF8", color: "#2F5E8C", fontSize: "12.5px", fontWeight: "600" }}>Next visit · {v.visit}</span>}
      </div>
      {v.groups.map(g => (
        <div key={g.label} style={{ padding: "12px 18px", borderBottom: "1px solid #F1E7DF", display: "flex", flexDirection: "column", gap: "6px" }}>
          <span style={LAB}>{g.label}</span>
          {g.rows.map(r => <span key={r.k} style={{ display: "flex", gap: "10px", fontSize: "13px" }}><span style={{ flex: "0 0 110px", color: "#806B60" }}>{r.k}</span><strong style={{ flex: "1", minWidth: "0", fontWeight: "600", color: r.v === "—" ? "#A08E82" : "#3F2B22", overflowWrap: "anywhere" }}>{r.v}</strong></span>)}
        </div>
      ))}
      {v.hasMsgs && <div style={{ padding: "12px 18px", borderBottom: "1px solid #F1E7DF", display: "flex", flexDirection: "column", gap: "6px" }}>
        <span style={LAB}>Latest messages</span>
        {v.msgs.map((m, i) => <span key={i} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "90%", padding: "6px 10px", borderRadius: "12px", background: m.mine ? "#F9D5B8" : "#F5EEE8", fontSize: "12.5px" }}>
          <span style={{ display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{m.text}</span><small style={{ display: "block", textAlign: "right", fontSize: "11px", color: "#806B60" }}>{m.at}</small></span>)}
      </div>}
      <div style={{ display: "flex", gap: "10px", padding: "14px 18px" }}>
        <button type="button" onClick={v.edit} className={DX.emo} style={{ height: "40px", padding: "0 16px", borderRadius: "20px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }}>Edit</button>
        <button type="button" onClick={v.openChat} style={{ flex: "1", height: "40px", borderRadius: "20px", border: "0", background: "#BD4A19", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#fff", cursor: "pointer" }}>Open chat</button>
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
    <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "18px 20px", border: "1px solid #EBDDD2", borderRadius: "14px", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
        <strong onClick={v.toggle} style={{ flex: "1", minWidth: "160px", fontSize: "15px", fontWeight: "650", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#806B60" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: "8px", verticalAlign: "-1px", transform: v.chev, transition: "transform .18s" }}><path d="m6 9 6 6 6-6"></path></svg>
          {v.title}<span style={{ marginLeft: "10px", fontSize: "12.5px", fontWeight: "500", color: "#806B60" }}>{v.sum}</span><span style={{ marginLeft: "12px", display: "inline-flex", alignItems: "center", gap: "5px", height: "26px", padding: "0 11px", borderRadius: "13px", border: "1px solid #E2CFC1", background: "#fff", fontSize: "12px", fontWeight: "650", color: "#BD4A19", verticalAlign: "1px" }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12A9 9 0 1 1 12 3v9h9Z"></path><path d="M15 3.5A9 9 0 0 1 20.5 9H15V3.5Z"></path></svg>{v.btn}</span>
        </strong>
        <div style={{ display: "flex", flexWrap: "wrap", background: "#F5EEE8", borderRadius: "10px", padding: "3px", gap: "2px" }}>
          {v.bys.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ border: "0", height: "28px", padding: "0 10px", borderRadius: "8px", font: "inherit", fontSize: "12.5px", cursor: "pointer",
            ...(o.on ? { background: "#fff", color: "#3F2B22", fontWeight: "650", boxShadow: "0 1px 2px rgba(63,43,34,.12)" } : { background: "transparent", color: "#806B60", fontWeight: "550" }) }}>{o.label}</button>)}
        </div>
      </div>
      {v.open && (v.empty
        ? <div style={{ padding: "20px", textAlign: "center", fontSize: "13px", color: "#806B60" }}>No visits in this range</div>
        : <div className={DX.ppChartBody}>
          <DeskPie v={v.pie} />
          <div style={{ flex: "1", minWidth: "0", display: "flex", flexDirection: "column", gap: "14px" }}>
            <div style={{ display: "flex", gap: "2px", height: "10px", borderRadius: "5px", overflow: "hidden", background: "#F5EEE8" }}>
              {v.stack.map((g, i) => <span key={i} style={{ flex: `${g.n} 0 0`, background: g.color }}></span>)}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {v.rows.map(b => (
                <div key={b.label} style={{ display: "grid", gridTemplateColumns: "minmax(120px, 200px) minmax(0, 1fr) 36px 48px", gap: "14px", alignItems: "center", padding: "7px 0" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", fontWeight: "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: b.color }}></span>{b.label}</span>
                  <span style={{ display: "block", height: "8px", borderRadius: "4px", background: "#F5EEE8" }}><span style={{ display: "block", height: "8px", width: `${b.w}%`, borderRadius: "4px", background: b.color }}></span></span>
                  <span style={{ textAlign: "right", fontSize: "13.5px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                  <span style={{ textAlign: "right", fontSize: "12.5px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{b.pct}</span>
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
  return (
    <div style={{ position: "relative", flex: "1", minHeight: "0", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, width: "375px", height: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <SalesCustomerForm v={v} />
      </div>
    </div>
  );
}

/**
 * Contacts' and the Calendar's right rail (vm/rail.ts), drawn as Inbox's Chat progress rail: folded, a 44 px column on
 * #FBF6F2 with « at its top (60 px, a rule under it) and a pie under that; open, a 360 px column with its title and »,
 * the chart (groupings, pie, rows) and — on Contacts — the customer picked in the table or who still lacks property info.
 */
export function DeskRail({ v }: { v: ReturnType<typeof import("./vm/rail").railVM>["rail"] }) {
  const ICO = (d: string, size = 18) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  const PIE = "M21 12A9 9 0 1 1 12 3v9h9ZM15 3.5A9 9 0 0 1 20.5 9H15V3.5Z";
  if (!v.open) return (
    <aside style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} className={DX.emo} style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid #EBDDD2", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
        {ICO("m11 17-5-5 5-5M18 17l-5-5 5-5")}</button>
      <button type="button" onClick={v.toggle} title={`Open ${v.title.toLowerCase()}`} style={{ marginTop: "16px", width: "32px", height: "32px", borderRadius: "50%", border: "0", background: "#FFF0E4", color: "#BD4A19", display: "grid", placeItems: "center", cursor: "pointer" }}>
        {ICO(PIE, 16)}</button>
    </aside>
  );
  const c = v.chart;
  return (
    <aside style={{ flex: "0 0 360px", width: "360px", minWidth: "0", boxSizing: "border-box", background: "#fff", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: "0 0 60px", display: "flex", alignItems: "center", gap: "10px", padding: "0 0 0 18px", borderBottom: "1px solid #EBDDD2" }}>
        <strong style={{ flex: "1", fontSize: "15px", fontWeight: "650" }}>{v.title}</strong>
        <button type="button" onClick={v.toggle} title="Close" className={DX.emo} style={{ width: "44px", height: "59px", border: "0", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
          {ICO("m13 17 5-5-5-5M6 17l5-5-5-5")}</button>
      </div>
      <div style={{ flex: "1", minHeight: "0", overflowY: "auto", display: "flex", flexDirection: "column", gap: "14px", padding: "16px" }}>
        {v.stats && <div style={{ flex: "none", display: "flex", flexDirection: "column", gap: "14px", padding: "14px", borderRadius: "16px", background: "linear-gradient(135deg, #5A3826, #3A2218)", color: "#fff" }}>
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
        {c && <div style={{ display: "flex", flexDirection: "column", gap: "12px", padding: "14px", border: "1px solid #EBDDD2", borderRadius: "14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
            <strong style={{ fontSize: "14px", fontWeight: "650" }}>{c.title}</strong>
            <span style={{ fontSize: "12px", color: "#806B60" }}>{c.sum}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
            {c.bys.map(o => <button key={o.label} type="button" onClick={o.pick} style={{ height: "26px", padding: "0 9px", borderRadius: "13px", font: "inherit", fontSize: "12px", cursor: "pointer",
              ...(o.on ? { border: "1px solid #3F2B22", background: "#3F2B22", color: "#fff", fontWeight: "650" } : { border: "1px solid #EBDDD2", background: "#fff", color: "#6B574C", fontWeight: "550" }) }}>{o.label}</button>)}
          </div>
          {c.empty ? <div style={{ padding: "18px 0", textAlign: "center", fontSize: "13px", color: "#806B60" }}>Nothing to chart in this range</div> : <>
            <div style={{ display: "flex", justifyContent: "center" }}><DeskPie v={c.pie} size={180} /></div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {c.rows.map(b => (
                <div key={b.label} onClick={b.pick} title={b.pick ? "Click to filter" : undefined} className={b.pick ? DX.alert : undefined}
                  style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 70px 28px 40px", gap: "8px", alignItems: "center", padding: "6px 6px", margin: "0 -6px", borderRadius: "8px", background: b.on ? "#FFF5EC" : "transparent", cursor: b.pick ? "pointer" : "default" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: "7px", fontSize: "12.5px", fontWeight: b.on ? "700" : "600", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    <span style={{ flex: "0 0 8px", width: "8px", height: "8px", borderRadius: "50%", background: b.color }}></span>{b.label}</span>
                  <span style={{ display: "block", height: "6px", borderRadius: "3px", background: "#F5EEE8" }}><span style={{ display: "block", height: "6px", width: `${b.w}%`, borderRadius: "3px", background: b.color }}></span></span>
                  <span style={{ textAlign: "right", fontSize: "13px", fontWeight: "650", fontVariantNumeric: "tabular-nums" }}>{b.n}</span>
                  <span style={{ textAlign: "right", fontSize: "12px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{b.pct}</span>
                </div>
              ))}
            </div>
          </>}
        </div>}
        {v.side && <DeskContactSide v={v.side} />}
      </div>
    </aside>
  );
}

/**
 * Under Contacts' table: how many a page (10 · 20 · 50, as the design's segmented chips) on the left, the range and
 * ‹ › on the right (vm/people.ts › ppPager; the owner, 2026-10-15).
 */
export function DeskPager({ v }: { v: ReturnType<typeof import("./vm/people").peopleVM>["ppPager"] }) {
  const ARROW = (off: boolean) => ({ width: "32px", height: "32px", borderRadius: "50%", border: "1px solid #E2CFC1", background: "#fff", color: off ? "#D9C9BD" : "#3F2B22", display: "grid", placeItems: "center", cursor: off ? "default" : "pointer", padding: "0" }) as const;
  const ICO = (d: string) => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={d}></path></svg>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", padding: "2px 4px" }}>
      <span style={{ fontSize: "13px", color: "#806B60" }}>Show</span>
      <div style={{ display: "inline-flex", background: "#F5EBE3", borderRadius: "11px", padding: "3px", gap: "2px" }}>
        {v.sizes.map(o => <button key={o.n} type="button" onClick={o.pick} style={{ height: "28px", padding: "0 12px", borderRadius: "8px", border: "0", font: "inherit", fontSize: "13px", fontWeight: "650", cursor: "pointer",
          ...(o.on ? { background: "#fff", color: "#3F2B22", boxShadow: "0 1px 3px rgba(40,25,18,.12)" } : { background: "transparent", color: "#806B60" }) }}>{o.n}</button>)}
      </div>
      <span style={{ flex: "1" }}></span>
      <span style={{ fontSize: "13px", color: "#806B60", fontVariantNumeric: "tabular-nums" }}>{v.range}</span>
      <button type="button" onClick={v.prevOff ? undefined : v.prev} disabled={v.prevOff} title="Previous page" style={ARROW(v.prevOff)}>{ICO("m15 6-6 6 6 6")}</button>
      <span style={{ fontSize: "13px", fontWeight: "600", color: "#3F2B22", fontVariantNumeric: "tabular-nums" }}>{v.page}</span>
      <button type="button" onClick={v.nextOff ? undefined : v.next} disabled={v.nextOff} title="Next page" style={ARROW(v.nextOff)}>{ICO("m9 6 6 6-6 6")}</button>
    </div>
  );
}

/**
 * A panel folded to its 44 px strip, as the Audit log's and the rails' (Assignment's Ad performance — the owner,
 * 2026-10-15): « at the top under a rule, the panel's name running down, the sand of the panel open; a tap opens it.
 */
export function DeskFoldRail({ v }: { v: { title: string; open: () => void } }) {
  return (
    <aside className={DX.slideIn} style={{ flex: "0 0 44px", width: "44px", boxSizing: "border-box", background: "#FBF6F2", borderLeft: "1px solid #EBDDD2", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <button type="button" onClick={v.open} title={`Open ${v.title}`} className={DX.emo} style={{ flex: "0 0 60px", width: "44px", height: "60px", border: "0", borderBottom: "1px solid #EBDDD2", background: "transparent", color: "#806B60", display: "grid", placeItems: "center", cursor: "pointer" }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5M18 17l-5-5 5-5"></path></svg></button>
      <button type="button" onClick={v.open} title={`Open ${v.title}`} style={{ marginTop: "16px", padding: "8px 0", border: "0", background: "transparent", font: "inherit", fontSize: "12.5px", fontWeight: "650", color: "#806B60", writingMode: "vertical-rl", cursor: "pointer", whiteSpace: "nowrap" }}>{v.title}</button>
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
      <div style={{ display: "flex", alignItems: "flex-end", gap: "4px", borderBottom: "1px solid #EBDDD2", flexWrap: "wrap" }}>
        {v.tabs.map(t => (
          <button key={t.num} type="button" onClick={t.pick} onDragOver={t.over} onDrop={t.drop}
            style={{ display: "inline-flex", alignItems: "center", gap: "8px", height: "40px", padding: "0 14px", marginBottom: "-1px", border: "0",
              borderBottom: `2px solid ${t.on ? "#BD4A19" : "transparent"}`, borderRadius: "10px 10px 0 0", background: t.lit ? "#FFF0E4" : "transparent",
              outline: t.lit ? "2px dashed #BD4A19" : "none", outlineOffset: "-4px", font: "inherit", fontSize: "14px", fontWeight: t.on ? "650" : "550",
              color: t.on ? "#3F2B22" : "#806B60", cursor: "pointer", transition: "background .15s" }} className={t.on ? undefined : DX.emo}>
            {t.label}
            <span style={{ minWidth: "20px", height: "20px", padding: "0 6px", boxSizing: "border-box", borderRadius: "10px", background: t.on ? "#FFF0E4" : "#F5EEE8", color: t.on ? "#BD4A19" : "#806B60", fontSize: "11.5px", fontWeight: "700", display: "grid", placeItems: "center" }}>{t.count}</span>
          </button>
        ))}
        <button type="button" onClick={v.addPage} className={DX.emo} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "36px", padding: "0 12px", marginBottom: "2px", border: "0", borderRadius: "10px", background: "transparent", font: "inherit", fontSize: "13.5px", fontWeight: "650", color: "#BD4A19", cursor: "pointer" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add page</button>
        {v.dragging && <span style={{ marginLeft: "auto", marginBottom: "10px", fontSize: "12px", color: "#806B60" }}>Drop on a tab to move it to that page</span>}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: "11px", fontWeight: "700", letterSpacing: ".08em", textTransform: "uppercase", color: "#806B60" }}>Page name</span>
        <input type="text" value={v.title} onChange={v.setTitle} placeholder="Page name" style={{ height: "34px", width: "220px", boxSizing: "border-box", padding: "0 12px", border: "1px solid #EBDDD2", borderRadius: "10px", background: "#fff", font: "inherit", fontSize: "13.5px", color: "#3F2B22", outline: "none" }} />
        <span style={{ flex: "1" }}></span>
        <button type="button" onClick={v.addSection} style={{ display: "inline-flex", alignItems: "center", gap: "6px", height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: "#3F2B22", cursor: "pointer" }} className={DX.emo}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14"></path></svg>Add section</button>
        {v.many && <button type="button" onClick={v.remove} disabled={!v.canDelete} title={v.deleteTip} style={{ height: "34px", padding: "0 14px", borderRadius: "17px", border: "1px solid #E2CFC1", background: "#fff", font: "inherit", fontSize: "13px", fontWeight: "650", color: v.canDelete ? "#A3371A" : "#C9B8AB", cursor: v.canDelete ? "pointer" : "not-allowed" }}>Delete page</button>}
      </div>
    </div>
  );
}
