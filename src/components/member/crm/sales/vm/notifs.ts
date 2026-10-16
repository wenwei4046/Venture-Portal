/**
 * A salesperson's notifications (README › Roles): share / move invitations to
 * them (Accept · Decline), the answers to the ones they sent, and their own
 * customers' news — never another person's, a subordinate's included (2026-10-16).
 * Unread = newer than when they last opened the page.
 */
import { gb, day0, DAY, firstName, ini, isCold, urgencyOf, type SalesCtx } from "./common";

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
  /** A visit tomorrow (2026-10-14): its summary offers Send reminder. */
  visitId?: string;
  /** How the row is drawn: a visit tomorrow (calendar), a chat waiting for a reply (clock); else by `ok`. */
  tone?: "appt" | "wait";
}

const atLabel = (t: number, now: Date) => {
  const d = new Date(t), days = Math.round((day0(now) - day0(d)) / DAY);
  return days === 0 ? d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : days === 1 ? "Yesterday" : days < 7 ? d.toLocaleDateString("en-GB", { weekday: "short" }) : gb(d, { day: "numeric", month: "short" });
};

export function salesNotifs(ctx: SalesCtx): SalesNotif[] {
  const { data, owner, now, nameOf } = ctx;
  const me = owner.id, out: SalesNotif[] = [];
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
  // Their own customers' visits TOMORROW (the owner, 2026-10-14: "notification 要包含 upcoming appt 可以提前 1 天，就是通知
  // 業務去 send reminder 給客戶"): from the start of the day before, until the visit; "reminder sent" once it went.
  const tomorrow = day0(now) + DAY;
  for (const v of data.visits) {
    if (v.state !== "booked") continue;
    const c = data.customers.find(x => x.id === v.customerId);
    if (!c || c.assignedTo !== me) continue;
    const s = new Date(v.start);
    if (day0(s) !== tomorrow) continue;
    const at = s.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }), t = tomorrow - DAY;
    out.push({ id: "t" + v.id, customerId: c.id, visitId: v.id, tone: "appt", kind: "status", from: c.name, ini: ini(c.name), lead: c.name, at: atLabel(t, now), time: t, pending: false,
      ok: !!v.remindedAt, text: v.remindedAt ? `Visit tomorrow, ${at} · reminder sent` : `Visit tomorrow, ${at} · send the customer a reminder` });
  }
  // Their own chats waiting for their reply past 3 h · 6 h · 9 h (the owner, 2026-10-14: "有 3h, 6h, 9h 未回復的也有
  // notification 提醒，要儘快回復"): the line it crossed, one notice a line — each new line is unread again.
  for (const c of data.customers) {
    if (c.assignedTo !== me || !c.lastCustomerAt || isCold(c, now)) continue;
    const u = urgencyOf(c, now);
    if (u.level === "none") continue;
    const h = u.level === "overdue" ? 9 : u.level === "urgent" ? 6 : 3, t = new Date(c.lastCustomerAt).getTime() + h * 3_600_000;
    out.push({ id: `w${c.id}@${c.lastCustomerAt}:${h}`, customerId: c.id, tone: "wait", kind: "status", from: c.name, ini: ini(c.name), lead: c.name, at: atLabel(t, now), time: t, ok: false, pending: false,
      text: u.level === "overdue" ? `Overdue · waiting ${Math.floor(u.waitingMinutes / 60)} h for your reply` : u.level === "urgent" ? "Urgent · waiting 6 h for your reply" : "Waiting for your reply · 3 h" });
  }
  // Everything else about their own customers (the owner, 2026-10-15: "只要是關於到業務員本身的（appt, upcoming, chat）都要通知"):
  // a visit TODAY still to come, a visit gone by and not yet marked, a chat whose 24-hour window is about to shut, and a
  // visit somebody else booked, moved or cancelled for them. notify_crm_due() pushes the first three to the phone.
  const today = day0(now), hm = (d: Date) => d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  for (const v of data.visits) {
    if (v.state !== "booked") continue;
    const c = data.customers.find(x => x.id === v.customerId);
    if (!c || c.assignedTo !== me) continue;
    const s0 = new Date(v.start), st = s0.getTime();
    if (day0(s0) === today && st > now.getTime())
      out.push({ id: "d" + v.id, customerId: c.id, visitId: v.id, tone: "appt", kind: "status", from: c.name, ini: ini(c.name), lead: c.name, at: atLabel(today, now), time: today, pending: false,
        ok: !!v.remindedAt, text: `Visit today, ${hm(s0)}${v.remindedAt ? "" : " · send the customer a reminder"}` });
    else if (st < now.getTime() - 3_600_000 && st > now.getTime() - 3 * DAY)
      out.push({ id: "k" + v.id, customerId: c.id, visitId: v.id, tone: "appt", kind: "status", from: c.name, ini: ini(c.name), lead: c.name, at: atLabel(st, now), time: st + 3_600_000, pending: false,
        ok: false, text: `Visit at ${hm(s0)} has passed · mark whether they came` });
  }
  for (const c of data.customers) {
    if (c.assignedTo !== me || !c.lastCustomerAt || isCold(c, now) || c.status === "won" || c.status === "lost") continue;
    const left = new Date(c.lastCustomerAt).getTime() + DAY - now.getTime();
    if (left <= 0 || left > 3 * 3_600_000) continue;
    const t = new Date(c.lastCustomerAt).getTime() + 21 * 3_600_000;
    out.push({ id: `x${c.id}@${c.lastCustomerAt}`, customerId: c.id, tone: "wait", kind: "status", from: c.name, ini: ini(c.name), lead: c.name, at: atLabel(t, now), time: t, ok: false, pending: false,
      text: `Chat closes in ${Math.max(1, Math.ceil(left / 3_600_000))} h · reply before the 24-hour window shuts` });
  }
  for (const e of data.events) {
    if (e.owner !== me || !e.actor || e.actor === me || (e.kind !== "appt_booked" && e.kind !== "appt_changed" && e.kind !== "appt_cancelled")) continue;
    const by = nameOf(e.actor), t = new Date(e.at).getTime(), cn = custOf(e.customerId);
    out.push({ id: "v" + e.id, customerId: e.customerId, tone: "appt", kind: "status", from: by, ini: ini(by), lead: cn, at: atLabel(t, now), time: t, ok: e.kind !== "appt_cancelled", pending: false,
      text: `${firstName(by)} ${e.kind === "appt_booked" ? "booked a visit" : e.kind === "appt_changed" ? "moved the visit" : "cancelled the visit"}` });
  }
  // Nothing about the people below them (the owner, 2026-10-16: "notification 只跳關於自己的" — a leader was told of their
  // downline's Won / Lost and overdue chats; the Team side shows those, nothing tells of them).
  return out.sort((a, b) => b.time - a.time);
}

/**
 * Read one by one (rev 1010 §6): an update is read once tapped (its id in crm_staff_prefs.notif_read, the newest 500
 * kept) or older than the last Mark all as read (notifs_seen_at). An invitation stays unread until it is answered.
 */
export const isReadNotif = (n: SalesNotif, read: { notifRead: string[]; notifsSeenAt: string | null }) =>
  !n.pending && (read.notifRead.includes(n.id) || (!!read.notifsSeenAt && n.time <= new Date(read.notifsSeenAt).getTime()));
export const unreadNotifs = (list: SalesNotif[], read: { notifRead: string[]; notifsSeenAt: string | null }) => list.filter(n => !isReadNotif(n, read)).length;
