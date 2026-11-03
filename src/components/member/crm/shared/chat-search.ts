/**
 * An inbox search finds a chat by what was said in it, not only by its name and last message
 * (the owner, 2026-10-28: "输入某些字，聊天记录有聊到的也能被筛选出来").
 */
import type { CrmCustomer } from "@/lib/member/crm-data";

/** The newest message of the chat whose words hold `q` (already trimmed and lower-cased), else null. */
export function saidInChat(c: Pick<CrmCustomer, "messages">, q: string): CrmCustomer["messages"][number] | null {
  if (!q) return null;
  for (let i = c.messages.length - 1; i >= 0; i--) {
    const m = c.messages[i];
    if (m.text && m.text.toLowerCase().includes(q)) return m;
  }
  return null;
}

/** A line of the message around the words found, for the row's preview: "…words found here…". */
export function snippetAround(text: string, q: string, room = 48): string {
  const flat = text.replace(/\s+/g, " ").trim(), at = flat.toLowerCase().indexOf(q);
  if (at < 0) return flat;
  const from = Math.max(0, at - Math.floor((room - q.length) / 2)), to = Math.min(flat.length, from + room);
  return `${from > 0 ? "…" : ""}${flat.slice(from, to)}${to < flat.length ? "…" : ""}`;
}
