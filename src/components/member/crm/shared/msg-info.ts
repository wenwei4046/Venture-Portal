import type { CrmChatMessage, CrmCustomer } from "@/lib/member/crm-data";
import type { ForwardChat } from "./msg-menu";

/**
 * The message menu's Info and Forward (2026-10-14, the owner: "Forward、Info、Star 也加上去"), the same for Mine's chat and
 * the Team chat. Info says what the CRM knows of a message: when it was sent or received, by whom, how far it got (the
 * channel's sent / delivered / read; WhatsApp gives no time for each, so only the furthest is shown) and what it is.
 */
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true }).replace("Sept", "Sep");
const CH: Record<string, string> = { whatsapp: "WhatsApp", messenger: "Messenger" };
const KIND: Record<string, string> = { image: "Photo", video: "Video", audio: "Voice message", file: "Document" };

export function messageInfo(m: CrmChatMessage, c: Pick<CrmCustomer, "name" | "channel" | "assignedTo">, nameOf: (id: string) => string): [string, string][] {
  const rows: [string, string][] = [];
  const kind = m.media ? (m.media.kind === "file" ? `Document · ${m.media.name ?? ""}`.trim() : KIND[m.media.kind]) : m.card ? "Visit card" : "Text";
  if (m.from === "me") {
    rows.push(["Sent", when(m.at)]);
    rows.push(["Sent by", m.auto ? "Auto-reply" : m.by ? nameOf(m.by) : "—"]);
    const st = m.status === "read" ? "Read ✓✓" : m.status === "delivered" ? "Delivered ✓✓" : m.status === "sent" ? "Sent ✓" : m.status === "sending" ? "Sending…" : m.status === "failed" ? `Not delivered${m.error ? ` · ${m.error}` : ""}` : "Sent";
    rows.push(["Status", st]);
    rows.push(["To", c.name]);
  } else {
    rows.push(["Received", when(m.at)]);
    rows.push(["From", c.name]);
  }
  rows.push(["Type", kind], ["Channel", CH[c.channel] ?? c.channel]);
  return rows;
}

/** The chats a message may be forwarded to: every other customer on screen, newest chat first. The server asks again. */
export function forwardChats(customers: CrmCustomer[], fromId: string, nameOf: (id: string) => string): ForwardChat[] {
  const last = (c: CrmCustomer) => c.messages[c.messages.length - 1]?.at ?? c.createdAt;
  return customers.filter(c => c.id !== fromId).sort((a, b) => last(b).localeCompare(last(a)))
    .map(c => ({ id: c.id, name: c.name, sub: `${CH[c.channel] ?? c.channel}${c.assignedTo ? ` · ${nameOf(c.assignedTo)}` : ""}` }));
}
