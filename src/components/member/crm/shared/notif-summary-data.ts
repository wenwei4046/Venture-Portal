import type { CrmData } from "@/lib/member/crm-data";
import { CHANNEL, dayLabel, ini, STATUS_LABEL, timeLabel } from "../sales/vm/common";
import { mediaWord } from "./chat-media";
import type { NotifSummary } from "./notif-summary";

/**
 * What a notification's summary card says about its customer (shared/notif-summary.tsx, 2026-10-14) — the same in
 * Mine's notifications and the Team panel's: their channel and ad, status, whose they are, phone, unread, the next
 * visit and their latest three messages. `openChat` is handed in by the screen (each opens its own chat).
 */
type Msg = CrmData["customers"][number]["messages"][number];
const said = (m: Msg) => m.text?.trim() || (m.media ? mediaWord(m) : "");
const when = (iso: string) => { const d = new Date(iso); return `${dayLabel(d)}, ${timeLabel(d)}`; };

/** The customer's latest words, quoted, for a notification's row. */
export function lastWordsOf(data: CrmData, customerId?: string): string {
  const c = customerId ? data.customers.find(x => x.id === customerId) : undefined;
  const m = c ? [...c.messages].reverse().find(x => x.from !== "me" && said(x)) : undefined;
  return m ? `“${said(m).replace(/\s+/g, " ").slice(0, 120)}”` : "";
}

export function summaryFor(
  { data, nameOf, me }: { data: CrmData; nameOf: (id: string | null | undefined) => string; me: string },
  n: { title: string; when: string; customerId?: string; lead?: string },
  openChat?: () => void,
): NotifSummary {
  const c = n.customerId ? data.customers.find(x => x.id === n.customerId) : undefined;
  const next = c ? data.visits.filter(v => v.customerId === c.id && v.state === "booked").sort((a, b) => a.start.localeCompare(b.start))[0] : undefined;
  const room = next ? data.rooms.find(r => r.id === next.showroomId)?.name ?? "" : "";
  const ch = c ? CHANNEL[c.channel] : null;
  const name = c?.name ?? n.lead ?? "";
  return {
    title: n.title, when: n.when,
    name, ini: ini(name || "?"),
    chan: c ? [ch?.name, c.ad].filter(Boolean).join(" · ") : "", chanFg: ch?.fg ?? "#806B60",
    facts: c ? ([
      ["Status", STATUS_LABEL[c.status] ?? c.status],
      ["Owner", c.assignedTo ? nameOf(c.assignedTo) : "No one yet"],
      ...(c.phone ? [["Phone", c.phone]] : []),
      ...(c.unread ? [["Unread", `${c.unread} message${c.unread === 1 ? "" : "s"}`]] : []),
    ] as [string, string][]) : [],
    visit: next ? `Visit · ${when(next.start)}${room ? " · " + room : ""}` : "",
    lines: c ? c.messages.filter(m => said(m)).slice(-3).map(m => ({
      who: m.from === "me" ? (m.by && m.by !== me ? nameOf(m.by) : "You") : c.name, text: said(m), at: when(m.at), mine: m.from === "me",
    })) : [],
    openChat: c ? openChat : undefined,
  };
}
