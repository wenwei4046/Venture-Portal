/**
 * What every salesperson screen shares: the colours and icons the design uses
 * by meaning, time labels, and the rules that decide how a customer shows
 * (urgency, cold, status). Pure — the rules themselves live in lib/member.
 */
import type { CSSProperties, Dispatch, PointerEvent as RPointerEvent, SetStateAction, SyntheticEvent } from "react";
import { replyUrgency, type CrmStatus } from "@/lib/member/crm";
import { asLead, type CrmChatMessage, type CrmCustomer, type CrmData, type CrmPerson } from "@/lib/member/crm-data";
import { windowOpen } from "@/lib/whatsapp/send";
import { messengerWindow } from "@/lib/messenger/send";
import type { SalesRefs, SalesUi } from "../ui";
import { formatIntlDate } from "@/lib/utils";

/** A date in the design's words, months always three letters (DESIGN.md › Date format). */
export const gb = (d: Date, o: Intl.DateTimeFormatOptions) => formatIntlDate(d, o, "en-GB");

export type { CSSProperties };
export const INK = "var(--crm-ink)", SUB = "var(--crm-muted)", RUST = "var(--crm-rust)", BORDER = "rgb(235 221 210)";

/** The design's channel badges: WhatsApp's handset bubble, Messenger's bolt bubble. */
export const CHANNEL = {
  whatsapp: { name: "WhatsApp", fg: "#25D366", bg: "#E5F9EC", // palette:keep — public/sw.js draws the badge on a canvas with these (4a channel colours)
    icon: "M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .2-3.3-.7-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.4.6c-.1.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.8-.1 1.4Z" },
  messenger: { name: "Messenger", fg: "#0A7CFF", bg: "#E2EFFF", // palette:keep
    icon: "M12 2C6.5 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.6 7.2V22l3.3-1.8c1 .3 2 .4 3.1.4 5.5 0 10-4.2 10-9.4S17.5 2 12 2Zm1 12.6-2.5-2.7-4.9 2.7 5.4-5.7 2.6 2.7 4.8-2.7-5.4 5.7Z" },
} as const;

export const STATUS_LABEL: Record<CrmStatus, string> = { new: "New", follow_up: "Follow up", appointment: "Appointment", won: "Won", lost: "Lost" };

export const ini = (name: string) => name.trim().split(/\s+/).map(w => w[0] ?? "").slice(0, 2).join("").toUpperCase() || "?";
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;
export const stop = (e: SyntheticEvent) => e.stopPropagation();
export const day0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
export const DAY = 86_400_000;

/** Last chat time: today → time, within a week → weekday, older → DD/MM/YYYY. */
export function lastChat(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((day0(now) - day0(d)) / DAY);
  if (days === 0) return d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString("en-MY", { weekday: "short" });
  return [d.getDate(), d.getMonth() + 1].map(v => String(v).padStart(2, "0")).join("/") + "/" + d.getFullYear();
}
export const msgTime = (iso: string) => new Date(iso).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
/** WhatsApp-style day pill: Today, Yesterday, the weekday, or "Mon, 5 Oct". */
export function daySep(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((day0(now) - day0(d)) / DAY);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-GB", { weekday: "long" });
  return gb(d, { weekday: "short", day: "numeric", month: "short" }).replace(/^(\w+)/, "$1,");
}
export const dayLabel = (d: Date) => gb(d, { weekday: "short", day: "numeric", month: "short" });
export const timeLabel = (d: Date) => d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
export const money = (n: number) => "RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 2 });

/** The last message that is a conversation (not ours-automatic). */
export const lastReal = (c: CrmCustomer): CrmChatMessage | undefined => [...c.messages].reverse().find(m => !m.auto);

/** Can we write freely? WhatsApp: 24 h since the customer's last message; Messenger: 7 days as a person. */
export function windowShut(c: CrmCustomer, now: Date): boolean {
  return c.channel === "messenger" ? messengerWindow(c.lastCustomerAt, now) === "shut" : !windowOpen(c.lastCustomerAt, now);
}

/**
 * Cold lead: the reply window has closed — only a template can reach the customer now, whoever wrote last. It leaves All
 * for Cold leads, and comes back when the customer writes again (their message reopens the window). Until 2026-10-18 it
 * also needed OUR message to be the last, so a customer left unanswered past 24 h stayed in Attention though nothing but
 * a template could reach them (the owner: "这个客户已经超过30h没被我们回复，他是否也应该在cold lead?").
 */
export function isCold(c: CrmCustomer, now: Date): boolean {
  return !!lastReal(c) && windowShut(c, now);
}

/** Reply urgency, from the one rule (crm.ts: 3 h · 6 h · 9 h on real time). */
export function urgencyOf(c: CrmCustomer, now: Date) {
  const u = replyUrgency(asLead(c), now);
  // 4a (change list 3): Urgent and Overdue are urgent text in oxblood, Reply soon in ink.
  const color = u.level === "overdue" || u.level === "urgent" ? "var(--crm-oxblood)" : "var(--crm-ink)";
  const label = u.level === "none" ? "" : `${u.level === "overdue" ? "Overdue" : u.level === "urgent" ? "Urgent" : "Reply soon"} · ${Math.floor(u.waitingMinutes / 60)} h`;
  return { ...u, color, label };
}

/** The design's swipe / drag helpers need the pointer position. */
export type PEvent = RPointerEvent<HTMLElement>;

/** Everything a screen's view model is built from. */
export interface SalesCtx {
  data: CrmData;
  /** The signed-in person. */
  me: CrmPerson;
  /** Whose CRM is on screen: the signed-in person, or someone below them (View my team). */
  owner: CrmPerson;
  viewingOther: boolean;
  now: Date;
  live: boolean;
  ui: SalesUi;
  set: Dispatch<SetStateAction<SalesUi>>;
  patch: (p: Partial<SalesUi>) => void;
  act: import("../actions").SalesActions;
  nameOf: (staffId: string | null | undefined) => string;
  /** The customers on screen (the owner's own and those shared with them), newest message first. */
  mine: CrmCustomer[];
  /** Someone above the signed-in person (Control panel › View as) is looking: they may act too. */
  refs: SalesRefs;
  /** Booked counts per slot start (ISO) for the showroom being booked — Book visit greys a full slot. */
  slotCounts: Record<string, number>;
  /** One's recent emoji, shared with the Team side's chat (vm/composer.ts › SharedRecents). */
  recents?: import("./composer").SharedRecents;
  embedded: { rdMode: boolean; toPanel?: () => void; exitAs?: () => void; switchList?: CrmPerson[]; onSwitch?: (id: string) => void;
    /** Team | Mine: to the Control panel scoped to this person (the Director; leaders with a downline), on its first page. */
    toTeam?: () => void;
    /** The Principal / Director give a customer to anyone (crm_send_to) — their chat menu's Assign to. */
    assignTo?: (customerId: string, staffId: string) => Promise<boolean> } | null;
}

/**
 * 4a change list 18 · the chat's status strip, under the header (M04 / M08; the desktop's chat header says the same):
 * the status and how long the customer has waited, and how long the 24-hour reply window has left — oxblood on the
 * pale orange; a cold chat grey ("Cold · no reply for N days" / "Window closed"). From the status and the customer's
 * last message time only.
 */
export function chatStripOf(c: CrmCustomer, now: Date) {
  const H = 3_600_000, last = c.lastCustomerAt ? new Date(c.lastCustomerAt).getTime() : null;
  if (isCold(c, now)) {
    const lr = lastReal(c), since = now.getTime() - new Date(lr?.at ?? now).getTime(), days = Math.max(1, Math.floor(since / (24 * H)));
    // The customer wrote last and nobody answered: how long they have waited (hours under two days).
    const left = lr?.from === "lead"
      ? (since < 48 * H ? `Cold · waited ${Math.floor(since / H)} h for a reply` : `Cold · waited ${days} days for a reply`)
      : `Cold · no reply for ${days} ${days === 1 ? "day" : "days"}`;
    return { cold: true, left, right: "Window closed", dot: "var(--crm-faint-2)" };
  }
  const u = urgencyOf(c, now), attention = u.level !== "none", h = Math.floor(u.waitingMinutes / 60);
  const left = (attention ? "Attention" : STATUS_LABEL[c.status]) + (attention && h >= 1 ? ` · waiting ${h} h` : "");
  const leftMs = last == null ? 0 : last + 24 * H - now.getTime();
  const right = last == null ? "" : leftMs <= 0 ? "Window closed" : leftMs >= H ? `Reply window · ${Math.floor(leftMs / H)} h left` : `Reply window · ${Math.max(1, Math.floor(leftMs / 60_000))} min left`;
  const dot = attention ? "var(--crm-st-attention)" : c.status === "new" ? "var(--crm-st-new)" : c.status === "follow_up" ? "var(--crm-st-follow)" : c.status === "appointment" ? "var(--crm-st-appt)" : c.status === "won" ? "var(--crm-st-won)" : "var(--crm-st-lost)";
  return { cold: false, left, right, dot };
}
