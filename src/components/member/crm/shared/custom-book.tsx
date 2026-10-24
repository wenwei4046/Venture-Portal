"use client";
/**
 * Book visit › Showroom and the Control panel's appointment types (the owner, 2026-10-24: Online and Other first — "日期時間是一定
 * 要填寫的" — then "做成類似customer form 一樣的，我可以加任何需要的東西"; set on the desktop's Showrooms › Appointment types,
 * crm_appt_types_read): a type's form is the date and the time (always required) and its own questions; booked through
 * crm_book_typed / changed through crm_move_typed, with no showroom slot, closure or limit. Mine's chat, the Team chat and
 * the desktop's Appointment sheet draw it from one view model.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ApptField, ApptType, CrmVisit } from "@/lib/member/crm-data";
import type { CustomVisit } from "../sales/actions";
import { dayLabel, timeLabel } from "../sales/vm/common";
import { PHONE_TYPE, typePx } from "./type";
import { Ic } from "./icons4a";

const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
const BTN = { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;
const FIELD: CSSProperties = { display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", outline: "none", font: "inherit", fontSize: fs(15), color: "var(--crm-ink)" };
const LBL: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, fontSize: fs(13), fontWeight: 600, color: "var(--crm-ink)" };

/** "showroom", or one of the Control panel's appointment types (its id). */
export type BookMode = string;
/** What the booking sheet keeps for a typed appointment (beside the showroom's room, day and slot). */
export interface CustomFields { mode?: string; cDate?: string; cTime?: string; answers?: Record<string, string> }

const p2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** A visit being changed opens on what it is: its type, day, time and answers (one booked before types, from its link / place / remarks). */
export function customPrefill(v: Pick<CrmVisit, "start" | "kind" | "link" | "place" | "remarks" | "typeId" | "answers">): CustomFields {
  if (!v.kind) return {};
  // The office's day and time (UTC+8), as it was saved.
  const o = new Date(new Date(v.start).getTime() + 8 * 3_600_000);
  const answers = v.answers ?? { ...(v.link ? { link: v.link } : {}), ...(v.place ? { place: v.place } : {}), ...(v.remarks ? { remarks: v.remarks } : {}) };
  return { mode: v.typeId ?? v.kind, cDate: `${o.getUTCFullYear()}-${p2(o.getUTCMonth() + 1)}-${p2(o.getUTCDate())}`, cTime: `${p2(o.getUTCHours())}:${p2(o.getUTCMinutes())}`, answers };
}

export interface CustomBook {
  showroom: boolean;
  tabs: { label: string; on: boolean; pick: () => void }[];
  type: ApptType | null; mode: string; date: string; time: string; answers: Record<string, string>; minDate: string;
  set: (p: Partial<CustomFields>) => void; answer: (id: string, v: string) => void;
  ready: boolean; label: string; confirm?: () => void;
}

/** Asked of every answer, as crm_appt_values() asks it. */
const fieldWhy = (f: ApptField, v: string) => !v ? (f.required || f.kind === "place" ? `Fill in ${f.label}` : "")
  : f.kind === "link" && !/^https?:\/\/\S+$/i.test(v) ? `${f.label}: the link must start with https://` : "";

export function customBookVM(o: { b: CustomFields; put: (p: Partial<CustomFields>) => void; changing: boolean; now: Date; types: ApptType[]; save: (f: CustomVisit) => Promise<boolean>; done: () => void }): CustomBook {
  const { b, put, now } = o, types = o.types.filter(t => t.on);
  const mode = b.mode && types.some(t => t.id === b.mode) ? b.mode : "showroom", type = types.find(t => t.id === mode) ?? null;
  const date = b.cDate ?? "", time = b.cTime ?? "", answers = b.answers ?? {};
  // The office's clock (UTC+8), as every appointment.
  const at = date && time ? new Date(`${date}T${time}:00+08:00`) : null;
  const why = !date || !time ? "Pick a date and a time"
    : (type?.fields.map(f => fieldWhy(f, (answers[f.id] ?? "").trim())).find(Boolean) ?? "") || (at && at.getTime() <= now.getTime() ? "That time has passed" : "");
  const ready = !!type && !why && !!at;
  return {
    showroom: !type,
    tabs: [{ label: "Showroom", on: !type, pick: () => put({ mode: "showroom" }) }, ...types.map(t => ({ label: t.label, on: t.id === mode, pick: () => put({ mode: t.id }) }))],
    type, mode, date, time, answers, minDate: isoDay(now),
    set: put, answer: (id, v) => put({ answers: { ...answers, [id]: v } }), ready,
    label: ready && at ? `${o.changing ? "Change to" : "Book"} ${dayLabel(at)}, ${timeLabel(at)}` : why,
    confirm: ready && at && type ? () => {
      const kept = Object.fromEntries(type.fields.map(f => [f.id, (answers[f.id] ?? "").trim()]).filter(([, v]) => v));
      void o.save({ type, start: at.toISOString(), answers: kept }).then(ok => { if (ok) o.done(); });
    } : undefined,
  };
}

/**
 * The booking sheet's body keeps the tallest height it has had while open, so switching Showroom ⇄ a type never makes the
 * sheet shrink and jump (the owner, 2026-10-24: "從showroom 點online / other 不要好像跳的感覺"); what is switched to fades in.
 */
export function Phone4aKeepHeight({ k, children }: { k: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null), [min, setMin] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const take = () => setMin(m => Math.max(m, el.scrollHeight));
    take();
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(take);
    ro?.observe(el);
    return () => ro?.disconnect();
  }, [k]);
  return <div ref={ref} key={k} style={{ display: "flex", flexDirection: "column", gap: "inherit", minHeight: min ? `${min}px` : undefined, animation: "fadeIn 160ms ease-out" }}>{children}</div>;
}

/** Showroom · Online · Other, above the booking sheet. */
export function Phone4aBookMode({ m }: { m: CustomBook | null }) {
  if (!m) return null;
  // flex: none — every sheet it sits in is a scrolling flex column, and this bar scrolls sideways: a scroller may shrink to
  // nothing there, so a sheet taller than the screen left a 6px line under the title (the owner's Android, 2026-10-24).
  return (
    <div style={{ flex: "none", display: "flex", gap: "2px", padding: "3px", borderRadius: "20px", background: "var(--crm-field)", overflowX: "auto", scrollbarWidth: "none" }}>
      {m.tabs.map(t => <button key={t.label} type="button" aria-pressed={t.on} onClick={t.pick} style={{ ...BTN, flex: "1 0 auto", padding: "0 12px", whiteSpace: "nowrap", height: "34px", borderRadius: "17px", fontSize: fs(13.5), fontWeight: 600,
        background: t.on ? "#fff" : "transparent", boxShadow: t.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: t.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{t.label}</button>)}
    </div>
  );
}

/** Online or Other: date, time, the link or the place, remarks, and Book. */
export function Phone4aCustomBook({ m, bare }: { m: CustomBook | null; /** The desktop's sheet books from its own footer. */ bare?: boolean }) {
  if (!m || m.showroom) return null;
  return <CustomForm m={m} bare={bare} />;
}

function CustomForm({ m, bare }: { m: CustomBook; bare?: boolean }) {
  // One picker open at a time, under the row at the sheet's full width (the owner, 2026-10-24, of the phone's own date
  // wheel and its field: "改一下" — the app's own month, as Book visit's showroom calendar; the two fields alike).
  const [open, setOpen] = useState<"date" | "time" | null>(null);
  const tog = (k: "date" | "time") => setOpen(x => (x === k ? null : k));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "10px" }}>
          <span style={LBL}><span>Date <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></span>
            <PickField text={m.date ? dateText(m.date) : "Pick a day"} on={open === "date"} faint={!m.date} icon="calendar" onClick={() => tog("date")} /></span>
          <span style={LBL}><span>Time <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></span>
            <PickField text={m.time ? clock(m.time) : "Pick a time"} on={open === "time"} faint={!m.time} icon="clock" onClick={() => tog("time")} /></span>
        </div>
        {open === "date" && <MonthPick value={m.date} min={m.minDate} pick={d => { m.set({ cDate: d }); setOpen(m.time ? null : "time"); }} />}
        {open === "time" && <TimeGrid value={m.time} pick={(t, done) => { m.set({ cTime: t }); if (done) setOpen(null); }} />}
      </div>
      {/* The type's own questions, as the Control panel set them (Showrooms › Appointment types). */}
      {(m.type?.fields ?? []).map(f => <Question key={f.id} f={f} value={m.answers[f.id] ?? ""} set={v => m.answer(f.id, v)} />)}
      {!bare && <button type="button" disabled={!m.confirm} onClick={m.confirm} style={{ ...BTN, minHeight: "48px", borderRadius: "24px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px",
        background: m.ready ? "var(--crm-rust)" : "var(--crm-line)", color: "#fff", fontSize: fs(16), fontWeight: 650, textAlign: "center", cursor: m.confirm ? "pointer" : "default" }}>{m.label}</button>}
    </div>
  );
}

/** One question of a type: short or long text, a link, a number, a choice (chips) or the place. */
function Question({ f, value, set }: { f: ApptField; value: string; set: (v: string) => void }) {
  const star = f.required || f.kind === "place";
  const head = <span>{f.label}{star && <> <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></>}</span>;
  if (f.kind === "long") return <label style={LBL}>{head}<textarea value={value} onChange={e => set(e.target.value)} rows={3} style={{ ...FIELD, height: "auto", padding: "10px 12px", lineHeight: 1.5, resize: "none" }} /></label>;
  if (f.kind === "choice") return (
    <div style={LBL}>{head}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
        {(f.options ?? []).map(o => <button key={o} type="button" aria-pressed={value === o} onClick={() => set(value === o ? "" : o)} style={{ ...BTN, height: "34px", padding: "0 14px", borderRadius: "17px", fontSize: fs(13.5), fontWeight: 500,
          border: `1px solid ${value === o ? "var(--crm-rust)" : "var(--crm-line)"}`, background: value === o ? "var(--crm-rust)" : "#fff", color: value === o ? "#fff" : "var(--crm-ink)" }}>{o}</button>)}
      </div>
    </div>
  );
  return <label style={LBL}>{head}<input type={f.kind === "link" ? "url" : "text"} inputMode={f.kind === "link" ? "url" : f.kind === "number" ? "decimal" : undefined} value={value} onChange={e => set(e.target.value)}
    placeholder={f.kind === "link" ? "https://…" : f.kind === "place" ? "Where, e.g. the customer's unit" : ""} style={FIELD} /></label>;
}

const WK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-24" → "Sat, 24 Oct 2026". */
function dateText(iso: string) {
  const [y, mo, d] = iso.split("-").map(Number), dt = new Date(y, mo - 1, d);
  return `${WK[(dt.getDay() + 6) % 7]}, ${d} ${MON[mo - 1]} ${y}`;
}
/** "15:30" → "3:30 pm". */
function clock(t: string) { const [h, mi] = t.split(":").map(Number); return `${h % 12 || 12}:${p2(mi)} ${h < 12 ? "am" : "pm"}`; }

/** A field that opens a picker: its words left, its icon right; both fields the same height and type. */
function PickField({ text, on, faint, icon, onClick }: { text: string; on: boolean; faint: boolean; icon: "calendar" | "clock"; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={on} style={{ ...BTN, display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", width: "100%", minWidth: 0, boxSizing: "border-box", height: "44px", padding: "0 12px",
      border: `1px solid ${on ? "var(--crm-rust)" : "var(--crm-line)"}`, borderRadius: "12px", background: "#fff", fontSize: fs(14.5), fontWeight: 500, color: faint ? "var(--crm-faint)" : "var(--crm-ink)", textAlign: "left" }}>
      <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{text}</span>
      <span style={{ flex: "none", display: "flex", color: on ? "var(--crm-rust)" : "var(--crm-faint)" }}><Ic name={icon} size={15} /></span>
    </button>
  );
}

const PANEL: CSSProperties = { display: "flex", flexDirection: "column", gap: "8px", padding: "12px", border: "1px solid var(--crm-rule)", borderRadius: "16px", background: "#fff", boxShadow: "0 4px 14px rgba(42,22,12,.08)" };
const ROUND: CSSProperties = { ...BTN, width: "32px", height: "32px", borderRadius: "50%", display: "grid", placeItems: "center", border: "1px solid var(--crm-rule)", color: "var(--crm-ink)" };

/** The app's own month (as Book visit's showroom calendar): days before today faint, the day picked in rust. */
function MonthPick({ value, min, pick }: { value: string; min: string; pick: (iso: string) => void }) {
  const start = value || min, [y0, m0] = start.split("-").map(Number);
  const [ym, setYm] = useState<[number, number]>([y0, m0 - 1]);
  const [y, mo] = ym, lead = (new Date(y, mo, 1).getDay() + 6) % 7, dim = new Date(y, mo + 1, 0).getDate();
  const minYm = Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7)) - 1, canBack = y * 12 + mo > minYm;
  const iso = (d: number) => `${y}-${p2(mo + 1)}-${p2(d)}`;
  return (
    <div style={PANEL}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ flex: 1, fontSize: fs(15), fontWeight: 650, color: "var(--crm-ink)" }}>{MON[mo]} {y}</span>
        <button type="button" aria-label="Previous month" disabled={!canBack} onClick={() => setYm(mo ? [y, mo - 1] : [y - 1, 11])} style={{ ...ROUND, opacity: canBack ? 1 : 0.35 }}><Ic name="chevron-left" size={14} /></button>
        <button type="button" aria-label="Next month" onClick={() => setYm(mo === 11 ? [y + 1, 0] : [y, mo + 1])} style={ROUND}><Ic name="chevron-right" size={14} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", rowGap: "4px" }}>
        {WK.map(w => <span key={w} style={{ textAlign: "center", fontSize: fs(11), fontWeight: 600, color: "var(--crm-faint)", padding: "2px 0 4px" }}>{w.slice(0, 1)}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={"b" + i} />)}
        {Array.from({ length: dim }, (_, k) => {
          const d = iso(k + 1), past = d < min, on = d === value, today = d === min;
          return (
            <button key={d} type="button" disabled={past} onClick={() => pick(d)} style={{ ...BTN, justifySelf: "center", width: "36px", height: "36px", borderRadius: "50%", fontSize: fs(14), fontWeight: on || today ? 650 : 500, fontVariantNumeric: "tabular-nums",
              background: on ? "var(--crm-rust)" : "transparent", color: on ? "#fff" : past ? "var(--crm-faint-2)" : "var(--crm-ink)", border: today && !on ? "1px solid var(--crm-line)" : "1px solid transparent", cursor: past ? "default" : "pointer" }}>{k + 1}</button>
          );
        })}
      </div>
    </div>
  );
}

/** The time: the hour (12 am – 11 pm), then :00 · :15 · :30 · :45; a minute closes it. */
function TimeGrid({ value, pick }: { value: string; pick: (t: string, done: boolean) => void }) {
  const [h, m] = /^\d{2}:\d{2}$/.test(value) ? value.split(":") : ["", ""];
  const mins = ["00", "15", "30", "45"]; if (m && !mins.includes(m)) mins.push(m);
  const chip = (on: boolean): CSSProperties => ({ ...BTN, height: "34px", borderRadius: "10px", fontSize: fs(13), fontWeight: on ? 650 : 500, fontVariantNumeric: "tabular-nums",
    background: on ? "var(--crm-rust)" : "var(--crm-field)", color: on ? "#fff" : "var(--crm-ink)" });
  const hourLabel = (i: number) => `${i % 12 || 12} ${i < 12 ? "am" : "pm"}`;
  return (
    <div style={PANEL}>
      <span style={{ fontSize: fs(12), fontWeight: 600, color: "var(--crm-muted)" }}>Hour</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: "5px" }}>
        {Array.from({ length: 24 }, (_, i) => <button key={i} type="button" onClick={() => pick(`${p2(i)}:${m || "00"}`, false)} style={chip(p2(i) === h)}>{hourLabel(i)}</button>)}
      </div>
      <span style={{ fontSize: fs(12), fontWeight: 600, color: "var(--crm-muted)" }}>Minute</span>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${mins.length}, minmax(0, 1fr))`, gap: "5px" }}>
        {mins.map(x => <button key={x} type="button" onClick={() => pick(`${h || "09"}:${x}`, true)} style={chip(x === m)}>:{x}</button>)}
      </div>
    </div>
  );
}
