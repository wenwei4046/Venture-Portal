/**
 * ONE audit log per customer (the owner, 2026-11-10, on Team activity's lead drawer showing only one person's part:
 * "同一个客户应该只有一个 audit log，也就是说我们可以看到这个客户原本从谁给到谁，然后回复的状态时间怎么样").
 *
 * The customer's whole story, oldest first (newest at the bottom), in the D4b format (shared/audit-timeline.tsx):
 *   - the lead arriving (its ad);
 *   - each time it was given to somebody — dealt by the CRM ("Given to X · automatically") or handed on
 *     ("Moved to X · from Y · by Z") — and, under each holder, their first reply with how long it took
 *     ("First reply · 8m · Cyrus"), or, for whoever has it now, how long the customer has been waiting;
 *   - shares, visits booked / changed / cancelled, a show-up, status changes, Won / Lost, reminders and notes.
 *
 * Every screen that shows a customer's log draws THIS one: the chat's Audit log, Customer info › Audit log, Team
 * activity's lead drawer (desktop and phone) and Reports' customer log. A holder's stretch follows Team activity's own
 * rule (team-activity.ts › stintsOf): it starts at the `assigned` event and ends at the next one to somebody else;
 * its first reply is our first message that is not an auto-reply inside it.
 */
import type { CrmCustomer, CrmData, CrmEvent } from "@/lib/member/crm-data";
import { auditWhen, type AuditLine, type AuditTone } from "./audit-timeline";

/** An `assigned` row as Team activity reads it (fetchCrmAssignedSince) — the same facts as the event. */
export interface AssignedLike { at: string; actor: string | null; data: { to?: string | null; from?: string | null } | null }

/** 4m · 1h 05m · 1d 3h — the CRM's one time format (v4 notes/14b, team-activity.ts › fmt). */
export function waitWords(min: number): string {
  const m = Math.max(0, Math.round(min));
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
  return `${Math.floor(m / 1440)}d ${Math.floor((m % 1440) / 60)}h`;
}
const minsBetween = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 60_000;

export interface CustomerLogIn {
  data: Pick<CrmData, "events" | "visits"> & Partial<Pick<CrmData, "notes" | "settings">>;
  customer: CrmCustomer;
  nameOf(id: string | null | undefined): string;
  now: Date;
  /** More `assigned` rows than data.events carries (Team activity's own read, on the phone). */
  assigned?: AssignedLike[];
}

export function customerLog(x: CustomerLogIn): AuditLine[] {
  const { data, customer: c, nameOf, now } = x;
  const evs = data.events.filter(e => e.customerId === c.id);
  // Every hand-over, once: the events' and Team activity's rows, by their moment and whom it went to.
  const seen = new Set<string>(), given: AssignedLike[] = [];
  for (const r of [...evs.filter(e => e.kind === "assigned").map(e => ({ at: e.at, actor: e.actor, data: { to: String(e.data.to ?? e.owner ?? "") || null, from: e.data.from != null ? String(e.data.from) : null } })), ...(x.assigned ?? [])]) {
    const to = r.data?.to; if (!to) continue;
    const k = `${r.at.slice(0, 19)}|${to}`; if (seen.has(k)) continue;
    seen.add(k); given.push(r);
  }
  given.sort((a, b) => a.at.localeCompare(b.at));

  const out: (AuditLine & { at: string; ord: number })[] = [];
  const line = (at: string, title: string, detail: string, tone: AuditTone, ord = 0) =>
    out.push({ key: `${at}|${title}|${out.length}`, ...auditWhen(at), at, ord, title, detail: detail || undefined, tone });

  line(c.createdAt, "Lead arrived", [c.ad || "No ad", c.channel === "messenger" ? "Messenger" : "WhatsApp"].join(" · "), "ink", -1);

  let prev: string | null = null;
  given.forEach((r, i) => {
    const to = r.data!.to!;
    if (to === prev) return; // the same holder again (a re-deal to the same person) is no hand-over
    const from = r.data?.from ?? prev;
    const next = given.slice(i + 1).find(n => n.data?.to && n.data.to !== to) ?? null;
    if (!r.actor && !prev) line(r.at, `Given to ${nameOf(to)}`, "automatically", "ink");
    else line(r.at, `${prev || from ? "Moved" : "Given"} to ${nameOf(to)}`, [from ? `from ${nameOf(from)}` : "", r.actor ? `by ${nameOf(r.actor)}` : "automatically"].filter(Boolean).join(" · "), "ink");
    const end = next?.at ?? null;
    const first = c.messages.find(m => m.from === "me" && !m.auto && m.status !== "sending" && m.at >= r.at && (!end || m.at < end));
    if (first) line(first.at, `First reply · ${waitWords(minsBetween(r.at, first.at))}`, nameOf(to), "green", 1);
    else if (!end && c.status !== "won" && c.status !== "lost") {
      // Whoever has it now and has not answered yet: how long the customer has waited since it reached them.
      const w = minsBetween(r.at, now.toISOString());
      line(now.toISOString(), `No reply yet · waiting ${waitWords(w)}`, nameOf(to), w >= 3 * 60 ? "oxblood" : "ink", 2);
    }
    prev = to;
  });

  for (const e of evs) {
    const k = e.kind as string, who = e.actor ? `by ${nameOf(e.actor)}` : "";
    const when = String(e.data.when ?? ""), room = e.data.room ? String(e.data.room) : "";
    if (k === "shared") line(e.at, `Shared with ${nameOf(String(e.data.to ?? ""))}`, who, "ink");
    else if (k === "appt_booked") line(e.at, "Visit booked", [when, room, who].filter(Boolean).join(" · "), "green");
    else if (k === "appt_changed") line(e.at, "Visit changed", [when ? `to ${when}` : "", who].filter(Boolean).join(" · "), "ink");
    else if (k === "appt_cancelled") line(e.at, "Visit cancelled", who, "oxblood");
    else if (k === "visit") line(e.at, "Showed up", room, "green");
    else if (k === "status") line(e.at, "Status changed", [String(e.data.from_status ?? "") && `${label(String(e.data.from_status))} → ${label(String(e.data.to_status ?? ""))}`, who].filter(Boolean).join(" · "), "ink");
    else if (k === "won") line(e.at, "Won", [e.data.amount != null ? `RM ${Number(e.data.amount).toLocaleString("en-MY")}` : "", who].filter(Boolean).join(" · "), "green");
    else if (k === "lost") line(e.at, "Lost", [e.data.note ? String(e.data.note) : e.data.reason ? String(e.data.reason) : "", who].filter(Boolean).join(" · "), "oxblood");
    else if (k === "reminded") line(e.at, `Reminded ${nameOf(String(e.data.to ?? e.owner ?? ""))} to reply`, who, "ink");
  }
  // A show-up the visit itself records (no `visit` event on the phone's read).
  if (!evs.some(e => e.kind === "visit")) for (const v of data.visits.filter(v => v.customerId === c.id && v.state === "attended")) line(v.start, "Showed up", "", "green");
  for (const n of data.notes?.filter(n => n.customerId === c.id) ?? []) line(n.at, "Note added", [n.text, n.by ? `by ${nameOf(n.by)}` : ""].filter(Boolean).join(" · "), "ink");

  return out.sort((a, b) => a.at.localeCompare(b.at) || a.ord - b.ord).map(l => ({ key: l.key, date: l.date, time: l.time, title: l.title, detail: l.detail, tone: l.tone }));
}

const STATUS: Record<string, string> = { new: "New", follow_up: "Follow up", appointment: "Appointment", won: "Won", lost: "Lost" };
const label = (s: string) => STATUS[s] ?? s.replace(/_/g, " ");

export type { CrmEvent };
