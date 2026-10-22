"use client";
/**
 * The phone CRM's 4a parts (2026-10-18, docs/design_handoff_crm_redesign — change list 16–20, frames M01–M14, T01–T07),
 * drawn by hand from CRM Phone.dc.html and placed into the generated screens by tools/crm-design/phone-4a.cjs. Behaviour
 * stays in the screens' view models; these only draw.
 *
 * Sizes: the handoff's phone sizes are final on-screen px. The app scales type by --rv-type (.92 on a phone), so a size
 * here is the frame's px scaled up by the phone's type step through typePx (`fs`) — on a phone it lands on the frame's px exactly.
 */
import type { ChangeEvent as RChangeEvent, CSSProperties, MouseEvent as RMouseEvent, PointerEvent as RPointerEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Ic, type Icon4a } from "./icons4a";
import { PHONE_TYPE, typePx } from "./type";
import type { ActiveVM } from "./locked";

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
export function Phone4aHero({ items, cols }: { items: { label: string; value: string; delta: string; good: boolean }[]; cols?: number }) {
  const n = cols ?? items.length;
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

const OUT: CSSProperties = { ...BTN, height: "32px", padding: "0 11px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff", color: "var(--crm-ink)", fontSize: fs(13), fontWeight: 500, display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" };
const MAIN: CSSProperties = { ...OUT, border: "1px solid var(--crm-rust)", background: "var(--crm-rust)", color: "#fff" };

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
              background: c.isT ? "var(--crm-rust)" : c.isS ? "var(--crm-cream)" : "transparent", color: c.isT ? "#fff" : "var(--crm-ink)" }}>{c.n}</span>
            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: c.has ? c.evC : "transparent" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

type CalItem = { name: string; room: string; open: unknown; t: string; ap: string; kick: string };
/** M10 · Today, Did they come? and Upcoming on the pale cream, a white card each — every button production's. */
export function Phone4aCalLists({ v }: { v: {
  hasToday: boolean; todayCount: string; noUpcoming: boolean; upTitle: string; upCount: string;
  todayList: (CalItem & { due: boolean; change: unknown; came: () => void; noShow: () => void })[];
  upList: (CalItem & { done: boolean; remind: () => void; rLabel: string })[]; cal4: { today: string } } }) {
  const Kick = ({ children }: { children: ReactNode }) => <span style={{ fontSize: fs(12), fontWeight: 500, letterSpacing: "0.12em", color: "var(--crm-faint)", padding: "4px 4px 0" }}>{children}</span>;
  const Card = ({ a, children }: { a: CalItem; children: ReactNode }) => (
    <div style={{ display: "flex", gap: "12px", padding: "16px 14px", borderRadius: "16px", border: "1px solid var(--crm-line)", background: "#fff" }}>
      <button type="button" onClick={a.open as () => void} style={{ ...BTN, width: "50px", flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
        <span style={{ fontFamily: TIGHT, fontWeight: 500, fontSize: fs(18), fontVariantNumeric: "tabular-nums", color: "var(--crm-ink)" }}>{a.t}</span>
        <span style={{ fontSize: fs(12), color: "var(--crm-muted)" }}>{a.ap}</span>
      </button>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "10px" }}>
        <button type="button" onClick={a.open as () => void} style={{ ...BTN, display: "flex", flexDirection: "column", gap: "2px", textAlign: "left" }}>
          <span style={{ fontSize: fs(17), fontWeight: 500, color: "var(--crm-ink)" }}>{a.name}</span>
          <span style={{ fontSize: fs(14), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.room}</span>
        </button>
        <div style={{ display: "flex", flexWrap: "nowrap", gap: "6px" }}>{children}</div>
      </div>
    </div>
  );
  const today = v.todayList.filter(a => !a.due), due = v.todayList.filter(a => a.due);
  const marks = (a: (typeof v.todayList)[number]) => (<>
    <button type="button" onClick={a.came} style={MAIN}>Show up</button>
    <button type="button" onClick={a.noShow} style={OUT}>No show</button>
    <button type="button" onClick={a.change as () => void} style={OUT}><Ic name="pencil" size={13} />Change</button>
  </>);
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: "10px", margin: "4px 0 -24px", padding: "18px 16px 28px", background: "var(--crm-hover)", flex: "1 0 auto" }}>
      {v.hasToday && today.length > 0 && (<><Kick>TODAY · {v.cal4.today}</Kick>{today.map((a, i) => <Card key={"t" + i} a={a}>{marks(a)}</Card>)}</>)}
      {v.hasToday && due.length > 0 && (<><Kick>DID THEY COME?</Kick>{due.map((a, i) => <Card key={"d" + i} a={{ ...a, room: `${a.kick} · ${a.room}` }}>{marks(a)}</Card>)}</>)}
      <Kick>{v.upTitle.toUpperCase()}{v.upCount ? ` · ${v.upCount.toUpperCase()}` : ""}</Kick>
      {v.noUpcoming && <span style={{ padding: "6px 4px", fontSize: fs(14), color: "var(--crm-muted)" }}>No upcoming appointments.</span>}
      {v.upList.map((a, i) => (
        <Card key={"u" + i} a={{ ...a, room: `${a.kick} · ${a.room}` }}>
          <button type="button" onClick={a.remind} style={a.done ? OUT : MAIN}>{a.done ? "Reminder sent · Send again" : a.rLabel}</button>
        </Card>
      ))}
    </section>
  );
}

/** T03 · an ad on Assignment: its channel, name and headline, the leads, the split bar in team colours, Edit split / Set up. */
export function Phone4aAdCard({ a }: { a: { name: string; head: string; wa: boolean; leads: number; setUp: boolean; held?: boolean; heldTxt?: string; bar: { w: string; c: string; op?: number }[]; edit: () => void } }) {
  return (
    <div onClick={a.edit} style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 14px", borderRadius: "14px", border: `1px solid ${a.setUp ? "var(--crm-tint-attention)" : "var(--crm-line)"}`, background: "#fff", cursor: "pointer" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{ display: "flex", paddingTop: "2px", color: a.wa ? "var(--crm-whatsapp)" : "var(--crm-messenger)" }}><Ic name={a.wa ? "phone" : "message-circle"} size={16} /></span>
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: fs(15), fontWeight: 500, color: "var(--crm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</span>
          {a.head && <span style={{ fontSize: fs(12.5), color: "var(--crm-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.head}</span>}
        </span>
        <span style={{ flex: "none", fontSize: fs(13), color: "var(--crm-ink)", fontVariantNumeric: "tabular-nums", paddingTop: "2px" }}>{a.leads} leads</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", paddingLeft: "0" }}>
        <span style={{ flex: 1, display: "flex", gap: "2px", height: "6px", borderRadius: "3px", overflow: "hidden", background: "var(--crm-track)" }}>
          {!a.setUp && a.bar.map((b, i) => <span key={i} style={{ width: b.w, background: b.c, opacity: b.op ?? 1 }} />)}
        </span>
        {a.held && <span style={{ flex: "none", padding: "3px 8px", borderRadius: "10px", background: "var(--crm-oxblood)", color: "#fff", fontSize: fs(11), fontWeight: 600 }}>{a.heldTxt}</span>}
        <span style={{ flex: "none", height: "30px", padding: "0 12px", borderRadius: "15px", display: "grid", placeItems: "center", fontSize: fs(12.5), fontWeight: 500,
          ...(a.setUp ? { background: "var(--crm-rust)", color: "#fff" } : { border: "1px solid var(--crm-line)", color: "var(--crm-ink)" }) }}>{a.setUp ? "Set up" : "Edit split"}</span>
      </div>
    </div>
  );
}

type Room4 = {
  name: string; addr: string; setName: (e: RChangeEvent<HTMLInputElement>) => void; setAddr: (e: RChangeEvent<HTMLInputElement>) => void;
  gmaps: string; waze: string; hasAddr: boolean; cap: number; capMinus?: () => void; capPlus?: () => void;
  days: string[]; grid: { label: string; cells: { on: boolean; pick: () => void }[] }[]; odd: string[];
  closures: { day: string; what: string; rm: () => void }[]; addClosure: () => void; dirty: boolean; cancel: () => void; save: () => void; del: () => void; canDel: boolean;
};
/** T07 · a showroom as one page: name and address in place, map chips, Visits per slot, the 24 × 7 weekly slots, Closures. */
export function Phone4aRoom({ r }: { r: { q4: Room4 } }) {
  const q = r.q4;
  const [editName, setEditName] = useState(false);
  const chip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: "8px", height: "36px", padding: "0 14px", borderRadius: "18px", background: "var(--crm-tint-attention)", color: "var(--crm-ink)", fontSize: fs(15), textDecoration: "none" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "18px", paddingBottom: q.dirty ? "70px" : "0" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        {/* A phone field is 16 px (the app's rule, so iOS does not zoom): the name is the title until tapped, then a field. */}
        {editName || !q.name
          ? <input autoFocus={editName} value={q.name} onChange={q.setName} onBlur={() => setEditName(false)} placeholder="Showroom name" aria-label="Showroom name" style={{ height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "10px", background: "#fff", outline: "none", fontWeight: 500, color: "var(--crm-ink)" }} />
          : <button type="button" onClick={() => setEditName(true)} title="Rename" style={{ ...BTN, textAlign: "left", fontFamily: TIGHT, fontWeight: 500, fontSize: fs(26), letterSpacing: "-0.02em", lineHeight: 1.15, color: "var(--crm-ink)" }}>{q.name}</button>}
        <input value={q.addr} onChange={q.setAddr} placeholder="Add the address" aria-label="Address" style={{ border: 0, padding: 0, background: "transparent", outline: "none", fontSize: fs(15), color: q.addr ? "var(--crm-ink-soft)" : "var(--crm-faint)" }} />
      </div>
      <div style={{ display: "flex", gap: "8px", opacity: q.hasAddr ? 1 : 0.45 }}>
        <a href={q.gmaps} target="_blank" rel="noopener" style={chip}><Ic name="map-pin" size={15} />Google Maps</a>
        <a href={q.waze} target="_blank" rel="noopener" style={chip}><Ic name="map-pin" size={15} />Waze</a>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px 14px 14px 16px", border: "1px solid var(--crm-line)", borderRadius: "16px" }}>
        <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ fontSize: fs(16), fontWeight: 500, color: "var(--crm-ink)" }}>Visits per slot</span>
          <span style={{ fontSize: fs(14), color: "var(--crm-muted)" }}>Each slot is one hour</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", height: "40px", border: "1px solid var(--crm-line)", borderRadius: "20px" }}>
          <button type="button" onClick={q.capMinus} aria-label="Fewer" style={{ ...BTN, width: "40px", height: "40px", fontSize: fs(18), color: q.capMinus ? "var(--crm-ink)" : "var(--crm-line)" }}>−</button>
          <span style={{ minWidth: "26px", textAlign: "center", fontFamily: TIGHT, fontWeight: 500, fontSize: fs(18), fontVariantNumeric: "tabular-nums" }}>{q.cap}</span>
          <button type="button" onClick={q.capPlus} aria-label="More" style={{ ...BTN, width: "40px", height: "40px", fontSize: fs(18), color: q.capPlus ? "var(--crm-ink)" : "var(--crm-line)" }}>+</button>
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
          <span style={{ flex: 1, fontFamily: TIGHT, fontWeight: 500, fontSize: fs(17) }}>Weekly slots</span>
          <span style={{ fontSize: fs(13), color: "var(--crm-muted)" }}>12 am – 11 pm · tap to open or close</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "42px repeat(7, minmax(0,1fr))", columnGap: "5px", rowGap: "5px" }}>
          <span />
          {q.days.map((d, i) => <span key={i} style={{ textAlign: "center", fontSize: fs(12), fontWeight: 500, color: "var(--crm-muted)" }}>{d}</span>)}
          {q.grid.map((row, h) => [
            <span key={"l" + h} style={{ fontSize: fs(11), color: "var(--crm-faint)", lineHeight: "14px" }}>{row.label}</span>,
            ...row.cells.map((c, k) => <button key={h + ":" + k} type="button" onClick={c.pick} aria-label={`${h}:00 day ${k + 1} ${c.on ? "open" : "closed"}`} style={{ ...BTN, height: "14px", borderRadius: "3px", background: c.on ? "var(--crm-brown)" : "var(--crm-field)" }} />),
          ])}
        </div>
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
      {q.canDel && <button type="button" onClick={q.del} style={{ ...BTN, alignSelf: "flex-start", fontSize: fs(14), fontWeight: 500, color: "var(--crm-oxblood)" }}>Delete showroom</button>}
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
  return (
    <section style={{ flex: "none", display: "flex", flexDirection: "column", gap: "12px" }}>
      {groups.map(g => (
        <div key={g.name} style={{ borderRadius: "16px", background: "#fff", border: "1px solid var(--crm-rule)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: "1px solid var(--crm-rule-soft)" }}>
            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: g.color }} />
            <strong style={{ flex: "1", fontSize: fs(13.5), fontWeight: 600, color: g.color }}>{g.name}</strong>
            <small style={{ fontSize: fs(11.5), color: "var(--crm-muted)" }}>{g.count}</small>
          </div>
          {g.people.map((p, k) => (
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
      ))}
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
