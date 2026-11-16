/**
 * A visit booked, moved or cancelled whose card never reached the customer (the owner, 2026-11-16, of Steven Yee — booked
 * on Messenger while its window was shut, so only a passing toast said the customer was not told: "要做，在聊天里留记录").
 * Worked out from what the CRM already keeps — the journey's appt_* events and the chat's visit cards — so it shows in
 * every chat that has one, the ones before this change too: an event with no card of ours from a minute before it to ten
 * minutes after it was not told. Lines like these are ours only; nothing is sent.
 */
import type { CrmCard, CrmEvent } from "@/lib/member/crm-data";

const KINDS: Partial<Record<CrmEvent["kind"], string>> = { appt_booked: "Visit booked", appt_changed: "Visit moved", appt_cancelled: "Visit cancelled" };
const BEFORE = 60_000, AFTER = 10 * 60_000;

export interface UntoldVisit { at: string; label: string; start: string | null }

export function untoldVisits(customerId: string, messages: { from: string; at: string; card?: CrmCard | null }[], events: CrmEvent[]): UntoldVisit[] {
  const cards = messages.filter(m => m.from === "me" && m.card).map(m => new Date(m.at).getTime());
  return events.filter(e => e.customerId === customerId && KINDS[e.kind]).flatMap(e => {
    const t = new Date(e.at).getTime();
    if (cards.some(c => c >= t - BEFORE && c <= t + AFTER)) return [];
    return [{ at: e.at, label: KINDS[e.kind]!, start: typeof e.data?.start === "string" ? e.data.start : null }];
  });
}

/** "Visit booked for Sun 22 Nov, 12:00 pm · the customer was not sent the visit card" (the office's clock). */
export function untoldText(u: UntoldVisit): string {
  const when = u.start ? new Date(u.start).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kuala_Lumpur" })
    .replace("Sept", "Sep") : "";
  return `${u.label}${when ? ` for ${when}` : ""} · the customer was not sent the visit card`;
}
