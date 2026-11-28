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
