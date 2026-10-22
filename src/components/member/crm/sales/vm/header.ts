/** Top bar (Profile's sub-pages), the bottom bar, and the View-my-team banner. */
import { day0, firstName, ini, RUST, SUB, stop, type SalesCtx } from "./common";
import { salesNotifs, unreadNotifs } from "./notifs";
import { teamName, teamOf, titleOf } from "../../shared/people";
import { teamMineSwap, type TeamMineSwap } from "../../shared/team-mine";
import type { SalesTab } from "../ui";

/**
 * Team | Mine (rev 1010 §7.3): the Director and anyone with a downline; Mine is this CRM, Team the Control panel scoped
 * to them. Viewing somebody (View as) shows it as THEY would see it — CrmApp hands their Team (user 2026-10-11). Since
 * 2026-10-14 one round button left of the house on the Inbox — the first page — going to Team's first page, Insight
 * (shared/team-mine.ts); it had a top row of its own on every page (round 2, §8.4). Never inside a chat.
 */
export function teamMineVM(ctx: SalesCtx): TeamMineSwap {
  return teamMineSwap("mine", ctx.embedded?.toTeam);
}

/** The bell (rev 1010 §8.2): opening Notifications reads nothing by itself — each update is read when tapped (§6). */
export function titleBellVM(ctx: SalesCtx) {
  const { set, data } = ctx;
  const unread = unreadNotifs(salesNotifs(ctx), data);
  return {
    open: () => { set(u => ({ ...u, tab: "profile", profSub: "notif", nTab: "all", hist: [...u.hist, u.tab].slice(-20) })); },
    has: unread > 0, n: unread ? String(unread) : "",
  };
}
export type TitleBellVM = ReturnType<typeof titleBellVM>;
/** What the Inbox — the first page — gets beside its own view model (2026-10-14, the owner: the three round buttons on the
 * first page alone): the bell in its title row, the house left of it (the way back to the Revenue app) and, for whoever has
 * a Team side, Team | Mine left of the house. */
export type ShellExtras = { tb: TitleBellVM; exitCrm: () => void; tm: TeamMineSwap };

/**
 * The top bar (round 2, §8.2): gone on Inbox, Contacts, Calendar, Insight and Profile. It stays on Profile's sub-pages with
 * "‹ Profile" alone — its bell went with the other round buttons to the Inbox (2026-10-14).
 */
export function headerVM(ctx: SalesCtx) {
  const { ui, set } = ctx;
  const sub = !!ui.profSub;
  return {
    showTopBar: sub,
    backLabel: "Profile", backVis: sub ? "visible" as const : "hidden" as const,
    crmBack: () => { if (ui.profSub) set(u => ({ ...u, profSub: null })); },
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
  // Calendar's badge: today's booked visits (the owner, 2026-10-13: "日曆圖示上的改成 today appt"; it was every upcoming one).
  const today = day0(now), todayAppts = data.visits.filter(v => ids.has(v.customerId) && v.state === "booked" && day0(new Date(v.start)) === today).length;
  const badges: Record<SalesTab, number> = { inbox: mine.reduce((n, c) => n + (c.unread || 0), 0), contacts: 0, calendar: todayAppts, insight: 0, profile: unread };
  return {
    nav3b: NAV.map(([id, label, icon]) => ({
      label, icon, badge: badges[id], on: ui.tab === id, color: ui.tab === id ? RUST : SUB, weight: ui.tab === id ? 600 : 500,
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
      return { name: p.name, title: titleOf(p), ini: ini(p.name), act: cur ? "Viewing" : "View", fg: cur ? "var(--crm-brown)" : "var(--crm-rust)",
        head: first ? `${group} · ${list.filter(x => groupOf(x) === group).length}` : "", hasHead: first, rule: first ? "0" : "1px solid var(--crm-field)",
        go: cur ? () => set(u => ({ ...u, swOpen: false })) : () => { set(u => ({ ...u, swOpen: false, chat: null, filter: null })); embedded?.onSwitch?.(p.id); } };
    }),
    exitAsX: () => { set(u => ({ ...u, chat: null, tab: "inbox", filter: null })); embedded?.exitAs?.(); },
  };
}
export type ShellVM = ReturnType<typeof shellVM>;
