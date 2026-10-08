/** Top bar (back to the Revenue app, the bell), the bottom bar, and the View-my-team banner. */
import { firstName, ini, RUST, SUB, stop, type SalesCtx } from "./common";
import { salesNotifs, unreadNotifs } from "./notifs";
import { titleOf } from "../../shared/people";
import type { SalesTab } from "../ui";

export function headerVM(ctx: SalesCtx, onExit: () => void) {
  const { ui, set, data } = ctx;
  const unread = unreadNotifs(salesNotifs(ctx), data.notifsSeenAt);
  return {
    backLabel: "Back to Revenue app", backVis: "visible" as const,
    crmBack: () => { if (ui.profSub) { set(u => ({ ...u, profSub: null })); return; } onExit(); },
    openNotifTop: () => { set(u => ({ ...u, tab: "profile", profSub: "notif", hist: [...u.hist, u.tab].slice(-20) })); ctx.act.seenNotifs(); },
    hasNotifBadge: unread > 0, notifBadge: unread ? String(unread) : "",
  };
}
export type HeaderVM = ReturnType<typeof headerVM>;

const NAV: [SalesTab, string, string][] = [
  ["inbox", "Inbox", "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12ZM8 10h8M8 14h5"],
  ["contacts", "Contacts", "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M16 4a4 4 0 0 1 0 8m6 9v-2a4 4 0 0 0-3-3.87M12 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
  ["calendar", "Calendar", "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14"],
  ["insight", "Insight", "M4 20V11m6 9V5m6 15v-6m4 6H2"],
  ["profile", "Profile", "M20 21a8 8 0 0 0-16 0M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"],
];

export function navVM(ctx: SalesCtx) {
  const { ui, set, data, mine, now } = ctx;
  const unread = unreadNotifs(salesNotifs(ctx), data.notifsSeenAt);
  const ids = new Set(mine.map(c => c.id));
  const upcoming = data.visits.filter(v => ids.has(v.customerId) && v.state === "booked" && new Date(v.start) > now).length;
  const badges: Record<SalesTab, number> = { inbox: mine.reduce((n, c) => n + (c.unread || 0), 0), contacts: 0, calendar: upcoming, insight: 0, profile: unread };
  return {
    nav3b: NAV.map(([id, label, icon]) => ({
      label, icon, badge: badges[id], color: ui.tab === id ? RUST : SUB, weight: ui.tab === id ? 600 : 500,
      go: () => { if (ui.tab !== id) set(u => ({ ...u, tab: id, profSub: null, hist: [...u.hist, u.tab].slice(-20) })); },
    })),
  };
}
export type NavVM = ReturnType<typeof navVM>;

/** The Revenue Director's Control panel | My CRM toggle, "Viewing Farah's CRM", and the Switch sheet. */
export function shellVM(ctx: SalesCtx) {
  const { ui, set, embedded, owner, viewingOther } = ctx;
  const list = embedded?.switchList ?? [];
  return {
    rdX: !!embedded?.rdMode && !viewingOther, toPanelX: () => embedded?.toPanel?.(),
    asOnX: viewingOther, asNameX: firstName(owner.name),
    canSwitchX: viewingOther && list.length > 1,
    swOpenX: ui.swOpen, openSwX: () => set(u => ({ ...u, swOpen: true })), closeSwX: () => set(u => ({ ...u, swOpen: false })),
    stopTeam: stop,
    swList: list.map(p => {
      const cur = p.id === owner.id;
      return { name: p.name, title: titleOf(p), ini: ini(p.name), act: cur ? "Viewing" : "View", fg: cur ? "#387557" : "#BD4A19",
        go: cur ? () => set(u => ({ ...u, swOpen: false })) : () => { set(u => ({ ...u, swOpen: false, chat: null, filter: null })); embedded?.onSwitch?.(p.id); } };
    }),
    exitAsX: () => { set(u => ({ ...u, chat: null, tab: "inbox", filter: null })); embedded?.exitAs?.(); },
  };
}
export type ShellVM = ReturnType<typeof shellVM>;
