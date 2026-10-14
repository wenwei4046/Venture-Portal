/** The Control panel's bottom bar: Insight · Inbox · Assignment · Calendar · Profile, with what waits on each. */
import { day0 } from "../../sales/vm/common";
import type { PanelTab } from "../ui";
import type { PanelCtx } from "./common";

const NAV: [PanelTab, string, string][] = [
  ["overview", "Insight", "M4 20V11m6 9V5m6 15v-6m4 6H2"],
  ["inbox", "Inbox", "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"],
  ["assign", "Assignment", "M6 3v6a6 6 0 0 0 6 6h6m0 0-3-3m3 3-3 3M6 21v-6"],
  ["calendar", "Calendar", "M5 5h14v16H5V5Zm3-3v6m8-6v6M5 11h14"],
  ["profile", "Profile", "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0"],
];

export function navVM(ctx: PanelCtx) {
  const { ui, set, data, now } = ctx;
  const badge: Record<PanelTab, number> = {
    overview: 0, profile: 0, ads: 0,
    // Unread messages, as Mine's Inbox badge (the owner, 2026-10-14: "team & mine 的 inbox 數字都是未讀消息的數字"; it was the chats
    // waiting 3 h+).
    inbox: data.customers.reduce((n, c) => n + (c.unread || 0), 0),
    assign: data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).length,
    // Today's booked visits (the owner, 2026-10-13: "today appt"; it was every upcoming one).
    calendar: data.visits.filter(v => v.state === "booked" && day0(new Date(v.start)) === day0(now)).length,
  };
  return {
    // Assignment is CRM · Manage's (2026-10-10); the database refuses its writes without it anyway.
    nav: NAV.filter(([id]) => id !== "assign" || data.can.manage).map(([id, label, icon]) => {
      // Ads Performance lives under Profile, so Profile stays lit while it is open.
      const on = ui.tab === id || (id === "profile" && ui.tab === "ads");
      return { label, icon, badge: badge[id] || 0, color: on ? "#BD4A19" : "#806B60", w: on ? 600 : 500,
        // Leaving a tab closes what it had open: Assignment back to its overview, Calendar its list and Customer info (rev 1011).
        go: () => set(u => ({ ...u, tab: id, lead: null, toast: "", pMenu: false, reSheet: false, pick: "", asSec: null, ftx: null, hlOpen: false, calInfo: null, cLs: false, ftsOpen: false, tplOpen: false, tplEd: null })) };
    }),
  };
}
export type NavVM = ReturnType<typeof navVM>;
