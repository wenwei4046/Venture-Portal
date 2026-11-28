/**
 * The reply colours (2026-11-28): of the leads sent a template, who replied after it, who has not, who booked a visit
 * and who was won — Insight › Overview, Ads Performance and the Inbox read the same groups. No imports of the screens.
 */
import type { CrmCustomer, CrmVisit } from "@/lib/member/crm-data";

/**
 * After our template (the owner, 2026-11-28: a lead form's customer writes first, but the chat stays shut until they
 * answer the template the team sends): of the customers sent one, those who wrote again after the first template, and
 * those who have not. A customer never sent a template is in neither.
 */
export function templateReplies(cs: CrmCustomer[]): { replied: string[]; noReply: string[] } {
  const replied: string[] = [], noReply: string[] = [];
  for (const c of cs) {
    const t = c.messages.filter(m => m.from === "me" && m.kind === "template").map(m => new Date(m.at).getTime()).sort((a, b) => a - b)[0];
    if (t == null) continue;
    (c.messages.some(m => m.from === "lead" && new Date(m.at).getTime() > t) ? replied : noReply).push(c.id);
  }
  return { replied, noReply };
}
/**
 * The four reply colours of some leads (Overview and Ads Performance, 2026-11-28): of those sent a template, who replied
 * after it, who has not, who booked a visit (not cancelled) and who was won — newest first as given.
 */
export function replyGroups(leads: CrmCustomer[], visits: CrmVisit[]): { replied: string[]; noReply: string[]; appt: string[]; won: string[] } {
  const rep = templateReplies(leads), sent = new Set([...rep.replied, ...rep.noReply]);
  const booked = new Set(visits.filter(v => v.state !== "cancelled").map(v => v.customerId));
  return { ...rep, appt: leads.filter(c => sent.has(c.id) && booked.has(c.id)).map(c => c.id), won: leads.filter(c => sent.has(c.id) && c.status === "won").map(c => c.id) };
}

/**
 * One customer's mark in the chats (the owner, 2026-11-28: "同时能不能直接在聊天室做这个记号" — the Inbox rows, the top of
 * the chat and a filter): of a customer sent a template, Won, else a booked visit (not cancelled), else replied after the
 * first template, else not yet; never sent one — no mark. The same order as the bar's (reply-bar.tsx).
 */
export type ReplyState = "won" | "appt" | "replied" | "noreply";
export const REPLY_MARK: Record<ReplyState, { label: string; color: string }> = {
  won: { label: "Won", color: "var(--crm-rust)" },
  appt: { label: "Appt", color: "var(--crm-v4-green)" },
  replied: { label: "Replied", color: "var(--crm-replied)" },
  noreply: { label: "No reply", color: "var(--crm-noreply)" },
};
/** The customers with a visit not cancelled — read once for a list, then asked per customer. */
export function bookedIds(visits: CrmVisit[]): Set<string> {
  return new Set(visits.filter(v => v.state !== "cancelled").map(v => v.customerId));
}
/** Sent a template? Then did they write after the first one (true / false); never sent one — null. */
export function repliedAfter(c: CrmCustomer): boolean | null {
  const t = c.messages.filter(m => m.from === "me" && m.kind === "template").map(m => new Date(m.at).getTime()).sort((a, b) => a - b)[0];
  return t == null ? null : c.messages.some(m => m.from === "lead" && new Date(m.at).getTime() > t);
}
export function replyStateOf(c: CrmCustomer, booked: Set<string>): ReplyState | null {
  const r = repliedAfter(c);
  if (r == null) return null;
  if (c.status === "won") return "won";
  if (booked.has(c.id)) return "appt";
  return r ? "replied" : "noreply";
}
/** The tag an Inbox row carries for it (drawn as the labels are: a dot and the word). */
export function replyTag(c: CrmCustomer, booked: Set<string>): { t: string; c: string }[] {
  const s = replyStateOf(c, booked);
  return s ? [{ t: REPLY_MARK[s].label, c: REPLY_MARK[s].color }] : [];
}
/**
 * The Inbox filter's two picks (desktop Status, Team's Filter chats, Mine's chips): who replied after the template and who
 * has not (as Overview counts them: Won and Appt customers are in whichever they are).
 */
export const REPLIED_PICK = "Replied", NOREPLY_PICK = "No reply";
export function replyPickOk(pick: string, c: CrmCustomer): boolean {
  const r = repliedAfter(c);
  return r != null && (pick === NOREPLY_PICK ? !r : r);
}
