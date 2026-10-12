/** Top bar (back to the Revenue app, the bell), the bottom bar, and the View-my-team banner. */
import { firstName, ini, RUST, SUB, stop, type SalesCtx } from "./common";
import { salesNotifs, unreadNotifs } from "./notifs";
import { teamName, teamOf, titleOf } from "../../shared/people";
import type { SalesTab } from "../ui";

/**
 * Team | Mine (rev 1010 §7.3): the Director and anyone with a downline; Mine is this CRM, Team the Control panel scoped
 * to them. Viewing somebody (View as) shows it as THEY would see it — CrmApp hands their Team (user 2026-10-11). Since
 * round 2 (§8.4) it sits at the right end of its own top row on every page, Inbox included. Never inside a chat.
 */
export function teamMineVM(ctx: SalesCtx) {
  const toTeam = ctx.embedded?.toTeam;
  return {
    hasTM: !!toTeam,
    tmTabs: ([["Team", false], ["Mine", true]] as const).map(([label, on]) => ({ label, bg: on ? "#fff" : "transparent", fg: on ? "#3F2B22" : "#806B60", sh: on ? "0 1px 3px rgba(63,43,34,.14)" : "none",
      pick: on ? undefined : () => toTeam?.(ctx.ui.tab) })),
  };
}

/** The bell (rev 1010 §8.2): opening Notifications reads nothing by itself — each update is read when tapped (§6). */
export function titleBellVM(ctx: SalesCtx) {
  const { set, data } = ctx;
  const unread = unreadNotifs(salesNotifs(ctx), data);
  return {
    open: () => { set(u => ({ ...u, tab: "profile", profSub: "notif", nTab: "unread", hist: [...u.hist, u.tab].slice(-20) })); },
    has: unread > 0, n: unread ? String(unread) : "",
  };
}
export type TitleBellVM = ReturnType<typeof titleBellVM>;
/** What the five pages get beside their own view model (round 2): the bell in their title row, and Profile's way back. */
export type ShellExtras = { tb: TitleBellVM; exitCrm: () => void };

/**
 * The top bar (round 2, §8.2): gone on Inbox, Contacts, Calendar, Insight and Profile — the bell is in each page's title
 * row and Profile's card leads back to the Revenue app. It stays on Profile's sub-pages ("‹ Profile" and the bell) and,
 * for Team | Mine, as its own row holding only the switch at its right end (§8.4).
 */
export function headerVM(ctx: SalesCtx) {
  const { ui, set } = ctx;
  const tm = teamMineVM(ctx), sub = !!ui.profSub, bell = titleBellVM(ctx);
  return {
    showTopBar: sub || tm.hasTM, hasTM: tm.hasTM, tmTabs: tm.tmTabs,
    backLabel: "Profile", backVis: sub ? "visible" as const : "hidden" as const, bellTop: sub,
    crmBack: () => { if (ui.profSub) set(u => ({ ...u, profSub: null })); },
    openNotifTop: bell.open, hasNotifBadge: bell.has, notifBadge: bell.n,
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
  const unread = unreadNotifs(salesNotifs(ctx), data);
  const ids = new Set(mine.map(c => c.id));
  const upcoming = data.visits.filter(v => ids.has(v.customerId) && v.state === "booked" && new Date(v.start) > now).length;
  const badges: Record<SalesTab, number> = { inbox: mine.reduce((n, c) => n + (c.unread || 0), 0), contacts: 0, calendar: upcoming, insight: 0, profile: unread };
  return {
    nav3b: NAV.map(([id, label, icon]) => ({
      label, icon, badge: badges[id], color: ui.tab === id ? RUST : SUB, weight: ui.tab === id ? 600 : 500,
      // Insight opens on Me, with no list or info sheet left open (rev 1010 §5.2).
      go: () => { if (ui.tab !== id) set(u => ({ ...u, tab: id, profSub: null, hist: [...u.hist, u.tab].slice(-20), ...(id === "insight" ? { insList: null, insInfo: null } : {}) })); },
    })),
  };
}
export type NavVM = ReturnType<typeof navVM>;

/** The Revenue Director's Control panel | My CRM toggle, "Viewing Farah's CRM", and the Switch sheet. */
export function shellVM(ctx: SalesCtx) {
  const { ui, set, embedded, owner, viewingOther } = ctx;
  const list = embedded?.switchList ?? [];
  const groupOf = (p: (typeof list)[number]) => (p.role === "boss" ? "Principal" : p.role === "hod" ? "Director" : teamName(teamOf(p.id, ctx.data.people)) || "Others");
  return {
    // The old Control panel | My CRM banner gives way to Team | Mine in the top bar (rev 1010 §7.3).
    rdX: false, toPanelX: () => embedded?.toPanel?.(),
    asOnX: viewingOther, asNameX: firstName(owner.name),
    canSwitchX: viewingOther && list.length > 1,
    swOpenX: ui.swOpen, openSwX: () => set(u => ({ ...u, swOpen: true })), closeSwX: () => set(u => ({ ...u, swOpen: false })),
    stopTeam: stop,
    // Grouped as the list comes (team order): a heading over each group — Director, each team, Others (user 2026-10-09).
    swList: list.map((p, k) => {
      const cur = p.id === owner.id, group = groupOf(p), first = !k || groupOf(list[k - 1]) !== group;
      return { name: p.name, title: titleOf(p), ini: ini(p.name), act: cur ? "Viewing" : "View", fg: cur ? "#387557" : "#BD4A19",
        head: first ? `${group} · ${list.filter(x => groupOf(x) === group).length}` : "", hasHead: first, rule: first ? "0" : "1px solid #F5EEE9",
        go: cur ? () => set(u => ({ ...u, swOpen: false })) : () => { set(u => ({ ...u, swOpen: false, chat: null, filter: null })); embedded?.onSwitch?.(p.id); } };
    }),
    exitAsX: () => { set(u => ({ ...u, chat: null, tab: "inbox", filter: null })); embedded?.exitAs?.(); },
  };
}
export type ShellVM = ReturnType<typeof shellVM>;
