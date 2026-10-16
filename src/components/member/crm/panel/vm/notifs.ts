/**
 * The Control panel's notifications (design 1a › Notifications): what moved,
 * who shared a chat, what was won or lost — from the CRM's own event log —
 * and every customer waiting 9 h or more (Overdue). Read one by one (tap) or
 * all at once; the read keys are kept per person (crm_read_notifs).
 */
import { CRM_LOST_REASONS } from "@/lib/member/crm";
import { urgencyOf, money } from "../../sales/vm/common";
import { day0, DAY, gb, type PanelCtx } from "./common";
import { openSummary } from "../../shared/notif-summary";
import { summaryFor } from "../../shared/notif-summary-data";

type Kind = "move" | "share" | "won" | "lost" | "overdue";
const K: Record<Kind, [string, string, string, string]> = {
  move: ["Move", "#2F6FB5", "#E4EDF8", "M5 12h14m-5-5 5 5-5 5"],
  share: ["Share", "#8E4B6E", "#F3E8EF", "M16 11a4 4 0 1 0-8 0M4 20a8 8 0 0 1 16 0M19 8v6M16 11h6"],
  won: ["Won", "#387557", "#E4F1E8", "M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0V4ZM17 6h3a3 3 0 0 1-3 4M7 6H4a3 3 0 0 0 3 4"],
  lost: ["Lost", "#806B60", "#F2EDE9", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM15 9l-6 6M9 9l6 6"],
  overdue: ["Overdue", "#A3371A", "#FBE4DE", "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2"],
};

export interface PanelNotif { key: string; kind: Kind; at: string; who: string; text: string; lead: string; tail: string; extra: string; /** The customer it is about: a tap opens that chat. */ customerId?: string }

/** The last 14 days of it, newest first. */
export function panelNotifs(ctx: PanelCtx): PanelNotif[] {
  const { data, now, nameOf } = ctx, since = now.getTime() - 14 * DAY;
  const cust = (id: string) => data.customers.find(c => c.id === id)?.name ?? "A customer";
  const out: PanelNotif[] = [];
  for (const e of data.events) {
    if (new Date(e.at).getTime() < since) continue;
    const to = String(e.data.to ?? e.owner ?? "");
    const base = { key: `e${e.id}`, at: e.at, who: nameOf(e.actor), lead: cust(e.customerId), customerId: e.customerId };
    if (e.kind === "moved") out.push({ ...base, kind: "move", text: "moved", tail: ` to ${nameOf(to)}`, extra: e.data.by_manager ? "" : `Accepted by ${nameOf(to)}` });
    if (e.kind === "move_declined") out.push({ ...base, kind: "move", text: "asked to move", tail: ` to ${nameOf(to)}`, extra: `Declined by ${nameOf(to)}` });
    if (e.kind === "shared") out.push({ ...base, kind: "share", text: `shared a chat with ${nameOf(to)} ·`, tail: "", extra: `Accepted by ${nameOf(to)}` });
    if (e.kind === "share_declined") out.push({ ...base, kind: "share", text: `invited ${nameOf(to)} to`, tail: "", extra: `Declined by ${nameOf(to)}` });
    if (e.kind === "won") out.push({ ...base, kind: "won", text: "marked", tail: " as Won", extra: e.data.amount != null ? money(Number(e.data.amount)) : "" });
    if (e.kind === "lost") {
      const why = e.data.reason === "other" && e.data.note ? String(e.data.note) : CRM_LOST_REASONS.find(r => r.value === e.data.reason)?.label ?? "";
      out.push({ ...base, kind: "lost", text: "marked", tail: " as Lost", extra: why ? `Reason: ${why}` : "" });
    }
  }
  // Overdue: the moment a customer's wait passed 9 h, until someone answers.
  for (const c of data.customers) {
    const u = urgencyOf(c, now);
    if (u.level !== "overdue" || !c.lastCustomerAt) continue;
    const last = new Date(c.lastCustomerAt), at = new Date(last.getTime() + 9 * 3_600_000);
    out.push({ key: `o${c.id}@${c.lastCustomerAt}`, customerId: c.id, kind: "overdue", at: at.toISOString(), who: c.name, text: `has waited ${Math.floor(u.waitingMinutes / 60)} h for`, lead: nameOf(c.assignedTo) === "—" ? "a reply" : nameOf(c.assignedTo), tail: "",
      extra: `Last message ${last.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}` });
  }
  // Deleted on the computer (CRM Desktop rev 1, B3): gone from their phone too — they are the same person's.
  const gone = new Set(data.notifDeleted ?? []);
  return out.filter(n => !gone.has(n.key)).sort((a, b) => b.at.localeCompare(a.at));
}

export function notifsVM(ctx: PanelCtx) {
  const { ui, patch, data, act, now } = ctx;
  const all = panelNotifs(ctx), f = ui.nfF;
  const isRead = (n: PanelNotif) => data.notifRead.includes(n.key) || (!!data.notifsSeenAt && n.at <= data.notifsSeenAt);
  const unread = all.filter(n => !isRead(n));
  // Unread | Read (rev 1011, as RS rev 1010 §6): the kind chips filter inside the chosen tab and count only that tab.
  // All · Unread · Read, on All (the owner, 2026-10-16: "Notification 要有一個 all，看過的要能看回去").
  const rt = ui.nfR ?? "all", inTab = (n: PanelNotif) => rt === "all" || (rt === "read" ? isRead(n) : !isRead(n));
  const list = all.filter(n => inTab(n) && (!f || n.kind === f));
  const T = day0(now);
  const dayOf = (iso: string) => { const d = day0(new Date(iso)); return d === T ? "Today" : d === T - DAY ? "Yesterday" : gb(new Date(iso), { weekday: "short", day: "numeric", month: "short" }); };
  const row = (n: PanelNotif, k: number) => {
    const c = K[n.kind], read = isRead(n);
    return { who: n.who, text: n.text, lead: n.lead, tail: n.tail, extra: n.extra, at: new Date(n.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }),
      tag: c[0], iFg: c[1], iBg: c[2], icon: c[3], rule: k ? "1px solid #F5EEE9" : "0", dot: read ? "transparent" : "#BD4A19", rowBg: read ? "#fff" : "#FFFAF6",
      // Tapped: read, and its summary opens — the customer, the latest messages, the next visit — with Open chat for the
      // chat it is about (the owner, 2026-10-14: "我點進去看到更多才去 chat"; until then a tap opened the chat at once).
      tap: () => {
        if (!read) act.readNotifs([n.key]);
        const go = n.customerId && data.customers.some(c => c.id === n.customerId)
          ? () => patch({ nfOpen: false, lead: n.customerId!, pick: "", toast: "", ...(["overview", "calendar", "assign", "inbox"].includes(ui.tab) ? {} : { tab: "inbox" as const }) })
          : undefined;
        const title = [n.who, n.text, n.lead, n.tail].filter(Boolean).join(" ");
        openSummary(summaryFor({ data, nameOf: ctx.nameOf, me: ctx.me.id }, { title, when: `${dayOf(n.at)}, ${new Date(n.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}`, customerId: n.customerId, lead: n.lead }, go));
      } };
  };
  const groups: { day: string; items: ReturnType<typeof row>[] }[] = [];
  for (const n of list) { const day = dayOf(n.at); let g = groups.find(x => x.day === day); if (!g) groups.push(g = { day, items: [] }); g.items.push(row(n, g.items.length)); }
  return {
    notifUnread: unread.length ? String(unread.length) : "", notifOpen: ui.nfOpen,
    openNotifs: () => patch({ nfOpen: true }), closeNotifs: () => patch({ nfOpen: false }),
    readAll: () => { if (unread.length) act.readNotifs(unread.map(n => n.key), true); }, readAllFg: unread.length ? "#BD4A19" : "#C9B5A8",
    nfChips: ([["", "All", "#3F2B22"], ["move", "Move", K.move[1]], ["share", "Share", K.share[1]], ["won", "Won", K.won[1]], ["lost", "Lost", K.lost[1]], ["overdue", "Overdue 9 h+", K.overdue[1]]] as const).map(([k, label, dot]) => {
      const on = f === k;
      return { label, dot: on ? "#fff" : dot, n: all.filter(n => inTab(n) && (!k || n.kind === k)).length, bg: on ? "#3F2B22" : "#fff", fg: on ? "#fff" : "#3F2B22", bd: on ? "#3F2B22" : "#EBDDD2", pick: () => patch({ nfF: k }) };
    }),
    nfGroups: groups, nfEmpty: !list.length,
    nfEmptyText: rt === "unread" ? "You're all caught up." : rt === "read" ? "Nothing read yet." : "No notifications yet.",
    nfTabs: ([["all", "All", 0], ["unread", "Unread", unread.length], ["read", "Read", 0]] as const).map(([k, label, n]) => ({
      label, n: n ? String(n) : "", pick: () => patch({ nfR: k }),
      bg: rt === k ? "#fff" : "transparent", fg: rt === k ? "#3F2B22" : "#806B60", w: rt === k ? 650 : 500, sh: rt === k ? "0 1px 3px rgba(63,43,34,.12)" : "none" })),
    // Mark all read on Unread only.
    readAllShow: rt !== "read",
  };
}
