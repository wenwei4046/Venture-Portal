/**
 * A salesperson's notifications (README › Roles): share / move invitations to
 * them (Accept · Decline), the answers to the ones they sent, and — for
 * someone with people below them — Won, Lost and Overdue 9 h+ about THEIR OWN
 * subordinates only. Unread = newer than when they last opened the page.
 */
import { downlineOf } from "../../shared/people";
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { gb, day0, DAY, firstName, ini, money, urgencyOf, type SalesCtx } from "./common";

export interface SalesNotif {
  id: string;
  kind: "share" | "move" | "status";
  from: string;
  ini: string;
  lead: string;
  text: string;
  at: string;
  time: number;
  ok: boolean;
  pending: boolean;
  inviteId?: string;
  /** The customer it is about — tapping the update opens that chat (user 2026-10-13: 點了裡面的未讀訊息要有跳到該功能). */
  customerId?: string;
}

const atLabel = (t: number, now: Date) => {
  const d = new Date(t), days = Math.round((day0(now) - day0(d)) / DAY);
  return days === 0 ? d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : days === 1 ? "Yesterday" : days < 7 ? d.toLocaleDateString("en-GB", { weekday: "short" }) : gb(d, { day: "numeric", month: "short" });
};

export function salesNotifs(ctx: SalesCtx): SalesNotif[] {
  const { data, owner, now, nameOf } = ctx;
  const me = owner.id, out: SalesNotif[] = [];
  const reason = (r: unknown) => CRM_LOST_REASONS.find(x => x.value === r)?.label ?? "No reason";
  for (const i of data.invites) {
    const t = new Date(i.decidedAt ?? i.createdAt).getTime();
    if (i.to === me && i.state === "pending") {
      const from = nameOf(i.from);
      out.push({ id: i.id, customerId: i.customerId, kind: i.kind, from, ini: ini(from), lead: i.customerName, text: i.kind === "share" ? `${from} invited you to a chat` : `${from} wants to move a lead to you`, at: atLabel(t, now), time: t, ok: true, pending: true, inviteId: i.id });
    } else if (i.from === me && i.state !== "pending") {
      const to = nameOf(i.to);
      out.push({ id: i.id, customerId: i.customerId, kind: "status", from: to, ini: ini(to), lead: i.customerName, text: `${to} ${i.state} your ${i.kind === "share" ? "share invite" : "move request"}`, at: atLabel(t, now), time: t, ok: i.state === "accepted", pending: false });
    } else if (i.to === me && i.state !== "pending") {
      const from = nameOf(i.from);
      out.push({ id: i.id, customerId: i.customerId, kind: "status", from, ini: ini(from), lead: i.customerName, text: `You ${i.state} ${from}'s ${i.kind === "share" ? "invitation" : "move request"}`, at: atLabel(t, now), time: t, ok: i.state === "accepted", pending: false });
    }
  }
  // A reminder to reply, from the Control panel on a computer (CRM Desktop rev 1, B2): theirs, in the bell's own row.
  const custOf = (id: string) => data.customers.find(c => c.id === id)?.name ?? "";
  for (const e of data.events) {
    if (e.kind !== "reminded" || e.owner !== me) continue;
    const from = nameOf(e.actor), t = new Date(e.at).getTime();
    out.push({ id: "r" + e.id, customerId: e.customerId, kind: "status", from, ini: ini(from), lead: custOf(e.customerId), text: `${firstName(from)} reminded you to reply`, at: atLabel(t, now), time: t, ok: false, pending: false });
  }
  // Customers given to them (user 2026-10-09): a new enquiry the CRM dealt, or one someone assigned.
  for (const c of data.customers) {
    if (c.assignedTo !== me || !c.assignedAt) continue;
    const t = new Date(c.assignedAt).getTime(), by = c.assignedBy && c.assignedBy !== me ? nameOf(c.assignedBy) : "";
    out.push({ id: "a" + c.id + t, customerId: c.id, kind: "status", from: by || c.name, ini: ini(by || c.name), lead: c.name, at: atLabel(t, now), time: t, ok: true, pending: false,
      text: by ? `${firstName(by)} assigned a customer to you` : c.adId ? `New enquiry for you · ${c.ad}` : "New enquiry for you" });
  }
  // About the people below them, only theirs.
  const below = new Set(downlineOf(me, data.people).filter(id => id !== me));
  if (below.size) {
    const custName = (id: string) => data.customers.find(c => c.id === id)?.name ?? "";
    for (const e of data.events) {
      if (!e.owner || !below.has(e.owner) || (e.kind !== "won" && e.kind !== "lost")) continue;
      const who = firstName(nameOf(e.owner)), t = new Date(e.at).getTime();
      out.push({ id: "e" + e.id, customerId: e.customerId, kind: "status", from: who, ini: ini(nameOf(e.owner)), lead: custName(e.customerId), at: atLabel(t, now), time: t, pending: false,
        ok: e.kind === "won", text: e.kind === "won" ? `${who} marked a customer as Won${typeof e.data.amount === "number" || typeof e.data.amount === "string" ? " · " + money(Number(e.data.amount)) : ""}` : `${who} marked a customer as Lost · ${reason(e.data.reason)}` });
    }
    for (const c of data.customers) {
      if (!c.assignedTo || !below.has(c.assignedTo)) continue;
      const u = urgencyOf(c, now);
      if (u.level !== "overdue") continue;
      const who = firstName(nameOf(c.assignedTo)), t = now.getTime() - u.waitingMinutes * 60_000 + 9 * 3_600_000;
      out.push({ id: "o" + c.id, customerId: c.id, kind: "status", from: who, ini: ini(nameOf(c.assignedTo)), lead: c.name, text: `${who}'s customer has waited ${Math.floor(u.waitingMinutes / 60)} h for a reply`, at: atLabel(t, now), time: t, ok: false, pending: false });
    }
  }
  return out.sort((a, b) => b.time - a.time);
}

/**
 * Read one by one (rev 1010 §6): an update is read once tapped (its id in crm_staff_prefs.notif_read, the newest 500
 * kept) or older than the last Mark all as read (notifs_seen_at). An invitation stays unread until it is answered.
 */
export const isReadNotif = (n: SalesNotif, read: { notifRead: string[]; notifsSeenAt: string | null }) =>
  !n.pending && (read.notifRead.includes(n.id) || (!!read.notifsSeenAt && n.time <= new Date(read.notifsSeenAt).getTime()));
export const unreadNotifs = (list: SalesNotif[], read: { notifRead: string[]; notifsSeenAt: string | null }) => list.filter(n => !isReadNotif(n, read)).length;
