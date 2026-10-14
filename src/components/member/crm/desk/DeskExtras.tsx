"use client";

/**
 * The desktop's screens the design does not draw (CRM Desktop rev 1, BUILD-NOTES.md) — Appointment, Add note, Edit
 * customer, History — written in the design's own vocabulary: the pane's back bar, its 18 / 20 px padding, its chips,
 * fields and rust buttons, Inter, the same colours. Behaviour: vm/extras.ts.
 */
import { Fragment } from "react";
import DH from "./desk-hover.module.css";
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
          : v.cats.map(c => <button key={c.label} type="button" title={c.label} onClick={c.pick} className={DH.emo} style={ib(c.on)}><Ico d={c.d} /></button>)}
        <span style={{ flex: v.searching ? "0 0 auto" : "1" }} />
        <button type="button" title={v.searching ? "Close search" : "Search emoji"} onClick={v.toggleSearch} className={DH.emo} style={ib(v.searching)}>
          <Ico d={v.searching ? "M6 6l12 12M18 6 6 18" : "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4.35-4.35"} />
        </button>
      </div>
      <span style={{ padding: "4px 8px 0", fontSize: "10.5px", fontWeight: "700", letterSpacing: ".1em", textTransform: "uppercase", color: "#A08E82" }}>{v.label}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "2px", maxHeight: "148px", overflowY: "auto" }}>
        {v.list.map((x, i) => <button key={i} type="button" onClick={x.pick} className={DH.emo}
          style={{ height: "36px", border: "0", borderRadius: "8px", background: "transparent", fontSize: "22px", lineHeight: "1", cursor: "pointer", padding: "0" }}>{x.e}</button>)}
      </div>
    </div>
  </>);
}
