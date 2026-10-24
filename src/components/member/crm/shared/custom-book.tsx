"use client";
/**
 * Book visit › Showroom · Online · Other (the owner, 2026-10-24: "主要讓業務可以custom預約，有些客戶想要Online，有些想約在其他地方
 * … 1. Online（要有時間，日期，Meeting Link, remarks) 2. Other (让他们自己填地点，有日期，时间，remarks） 日期時間是一定要填寫的"):
 * the mode above the booking sheet; Online and Other are this form — date and time (both required), the meeting link or
 * the place (required for Other), remarks — booked through crm_book_custom / changed through crm_move_custom, with no
 * showroom slot, closure or limit. Both phone chats (Mine's and the Team side's) draw it from one view model.
 */
import { useState, type CSSProperties } from "react";
import type { CrmVisit } from "@/lib/member/crm-data";
import type { CustomVisit } from "../sales/actions";
import { dayLabel, timeLabel } from "../sales/vm/common";
import { PHONE_TYPE, typePx } from "./type";
import { TimePick } from "./auto-reply-pages";

const fs = (px: number) => typePx(Math.round((px / PHONE_TYPE) * 100) / 100);
const BTN = { border: 0, background: "transparent", padding: 0, font: "inherit", color: "inherit", cursor: "pointer" } as const;
const FIELD: CSSProperties = { display: "block", width: "100%", minWidth: 0, boxSizing: "border-box", height: "40px", padding: "0 12px", border: "1px solid var(--crm-line)", borderRadius: "12px", background: "#fff", outline: "none", font: "inherit", fontSize: fs(15), color: "var(--crm-ink)" };
const LBL: CSSProperties = { display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, fontSize: fs(13), fontWeight: 600, color: "var(--crm-ink)" };

export type BookMode = "showroom" | "online" | "other";
/** What the booking sheet keeps for an online / elsewhere appointment (beside the showroom's room, day and slot). */
export interface CustomFields { mode?: BookMode; cDate?: string; cTime?: string; link?: string; place?: string; remarks?: string }

const p2 = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** A visit being changed opens on what it is: its kind, day, time, link, place and remarks. */
export function customPrefill(v: Pick<CrmVisit, "start" | "kind" | "link" | "place" | "remarks">): CustomFields {
  if (!v.kind) return {};
  // The office's day and time (UTC+8), as it was saved.
  const o = new Date(new Date(v.start).getTime() + 8 * 3_600_000);
  return { mode: v.kind, cDate: `${o.getUTCFullYear()}-${p2(o.getUTCMonth() + 1)}-${p2(o.getUTCDate())}`, cTime: `${p2(o.getUTCHours())}:${p2(o.getUTCMinutes())}`, link: v.link ?? "", place: v.place ?? "", remarks: v.remarks ?? "" };
}

export interface CustomBook {
  showroom: boolean;
  tabs: { label: string; on: boolean; pick: () => void }[];
  mode: BookMode; date: string; time: string; link: string; place: string; remarks: string; minDate: string;
  set: (p: Partial<CustomFields>) => void;
  ready: boolean; label: string; confirm?: () => void;
}

export function customBookVM(o: { b: CustomFields; put: (p: Partial<CustomFields>) => void; changing: boolean; now: Date; save: (f: CustomVisit) => Promise<boolean>; done: () => void }): CustomBook {
  const { b, put, now } = o, mode = b.mode ?? "showroom";
  const date = b.cDate ?? "", time = b.cTime ?? "", link = b.link ?? "", place = b.place ?? "", remarks = b.remarks ?? "";
  // The office's clock (UTC+8), as every appointment.
  const at = date && time ? new Date(`${date}T${time}:00+08:00`) : null;
  const why = !date || !time ? "Pick a date and a time"
    : mode === "other" && !place.trim() ? "Add the place"
      : mode === "online" && link.trim() && !/^https?:\/\/\S+$/i.test(link.trim()) ? "The link must start with https://"
        : at && at.getTime() <= now.getTime() ? "That time has passed" : "";
  const ready = mode !== "showroom" && !why && !!at;
  return {
    showroom: mode === "showroom",
    tabs: (([["showroom", "Showroom"], ["online", "Online"], ["other", "Other"]] as const)).map(([k, label]) => ({ label, on: mode === k, pick: () => put({ mode: k }) })),
    mode, date, time, link, place, remarks, minDate: isoDay(now),
    set: put, ready,
    label: ready && at ? `${o.changing ? "Change to" : "Book"} ${dayLabel(at)}, ${timeLabel(at)}` : why,
    confirm: ready && at ? () => {
      const f: CustomVisit = { kind: mode as "online" | "other", start: at.toISOString(), link: mode === "online" ? link.trim() : undefined, place: mode === "other" ? place.trim() : undefined, remarks: remarks.trim() || undefined };
      void o.save(f).then(ok => { if (ok) o.done(); });
    } : undefined,
  };
}

/** Showroom · Online · Other, above the booking sheet. */
export function Phone4aBookMode({ m }: { m: CustomBook | null }) {
  if (!m) return null;
  return (
    <div style={{ display: "flex", gap: "2px", padding: "3px", borderRadius: "20px", background: "var(--crm-field)" }}>
      {m.tabs.map(t => <button key={t.label} type="button" aria-pressed={t.on} onClick={t.pick} style={{ ...BTN, flex: 1, height: "34px", borderRadius: "17px", fontSize: fs(13.5), fontWeight: 600,
        background: t.on ? "#fff" : "transparent", boxShadow: t.on ? "0 1px 2px rgba(42,22,12,.12)" : "none", color: t.on ? "var(--crm-ink)" : "var(--crm-muted)" }}>{t.label}</button>)}
    </div>
  );
}

/** Online or Other: date, time, the link or the place, remarks, and Book. */
export function Phone4aCustomBook({ m }: { m: CustomBook | null }) {
  if (!m || m.showroom) return null;
  return <CustomForm m={m} />;
}

function CustomForm({ m }: { m: CustomBook }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)", gap: "10px", alignItems: "start" }}>
        <label style={LBL}><span>Date <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></span>
          <input type="date" required min={m.minDate} value={m.date} onChange={e => m.set({ cDate: e.target.value })} style={{ ...FIELD, WebkitAppearance: "none", appearance: "none", textAlign: "left" }} /></label>
        <TimeField m={m} />
      </div>
      {m.mode === "online" && (
        <label style={LBL}>Meeting link
          <input type="url" inputMode="url" value={m.link} onChange={e => m.set({ link: e.target.value })} placeholder="https://meet.google.com/…" style={FIELD} /></label>
      )}
      {m.mode === "other" && (
        <label style={LBL}><span>Place <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></span>
          <input value={m.place} onChange={e => m.set({ place: e.target.value })} placeholder="e.g. Starbucks Mid Valley, or the customer's unit" style={FIELD} /></label>
      )}
      <label style={LBL}>Remarks
        <textarea value={m.remarks} onChange={e => m.set({ remarks: e.target.value })} rows={3} placeholder="Anything to remember for this appointment" style={{ ...FIELD, height: "auto", padding: "10px 12px", lineHeight: 1.5, resize: "none" }} /></label>
      <button type="button" disabled={!m.confirm} onClick={m.confirm} style={{ ...BTN, minHeight: "48px", borderRadius: "24px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px",
        background: m.ready ? "var(--crm-rust)" : "var(--crm-line)", color: "#fff", fontSize: fs(16), fontWeight: 650, textAlign: "center", cursor: m.confirm ? "pointer" : "default" }}>{m.label}</button>
    </div>
  );
}

function TimeField({ m }: { m: CustomBook }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={LBL}><span>Time <span style={{ color: "var(--crm-oxblood)" }} aria-hidden>*</span></span>
      <TimePick value={m.time} off={false} open={open} toggle={() => setOpen(x => !x)} set={v => m.set({ cTime: v })} />
    </span>
  );
}
