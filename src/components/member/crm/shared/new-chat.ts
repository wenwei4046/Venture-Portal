import type { CrmCustomer } from "@/lib/member/crm-data";

/**
 * New (the owner, 2026-10-13: "新進，新被分配，尚未回復的咨詢都放在這裡"; then "所有人的 Mine Inbox 都加 … 就算是被
 * assign，只要是第一次接手都是 new"): an enquiry nobody of ours has answered since it was given to its present person
 * (or since it came, while it waits in a team) — a fresh one, or one just handed on, whose earlier chat still shows.
 * An auto-reply is not an answer. The Team inbox's column and everybody's Mine inbox chip ask this one rule.
 */
export function isNewChat(c: CrmCustomer): boolean {
  const since = c.assignedAt && c.assignedAt > c.createdAt ? c.assignedAt : c.createdAt;
  return !c.messages.some(m => m.from === "me" && !m.auto && m.at >= since);
}
