/**
 * The Control panel's one view model (rev 1011): the groups PanelApp.tsx — the prototype's markup, generated — binds
 * to, each the vm/*.ts of that screen, plus the rev 1011 additions grouped as the prototype groups them. A group is
 * worked out only while its screen is on (show.*), as the prototype does; the always-mounted ones (rooms, overlays,
 * the bottom bar, the customer form) every time.
 */
import { headVM } from "./head";
import { bellVM } from "./bell";
import { overviewVM } from "./overview";
import { inboxVM } from "./inbox";
import { leadVM } from "./lead";
import { adsVM } from "./ads";
import { assignVM } from "./assign";
import { calendarVM } from "./calendar";
import { profileVM } from "./profile";
import { roomsVM } from "./rooms";
import { overlaysVM } from "./overlays";
import { navVM } from "./nav";
import { calendarInfoVM, calendarListVM } from "./calendar-list";
import { assignExtraVM } from "./assign-1011";
import { memberWorkTypeVM, templatesVM } from "./profile-1011";
import { teamName, teamOf } from "../../shared/people";
import { customerForm } from "../../sales/vm/customer";
import { DAY, day0 } from "../../sales/vm/common";
import type { PanelCtx } from "./common";

/** A group whose screen is off: never read by the markup (it sits behind show.*), typed as the group. */
const off = <T,>() => undefined as unknown as T;

export function panelAppVM(ctx: PanelCtx) {
  const { ui, set, now } = ctx, tab = ui.tab, lead = !!ui.lead;
  const show = { ov: tab === "overview" && !lead, ib: tab === "inbox" && !lead, ld: lead, ad: tab === "ads", as: tab === "assign" && !lead, cal: tab === "calendar" && !lead, pf: tab === "profile" };
  const ld = show.ld ? leadVM(ctx) : off<ReturnType<typeof leadVM>>();
  const cf = customerForm({
    form: ui.pForm, data: ctx.data, saveDetails: ctx.act.saveDetails,
    setForm: f => set(u => ({ ...u, pForm: typeof f === "function" ? (u.pForm ? f(u.pForm) : null) : f })),
    onSaved: (c, edit) => set(u => ({ ...u, pForm: null, pBook: edit ? u.pBook : { customerId: c.id, room: 0, day: day0(now) + DAY, slot: null, view: "month" } })),
  });
  const hd0 = headVM(ctx), bl = bellVM(ctx);
  // Assignment: a section open → the top back link reads "‹ Assignment" and returns to the overview (rev 1011 §6.1).
  const hd = tab === "assign" && ui.asSec && !lead ? { ...hd0, showHead: true, backLabel: "Assignment", back: () => ctx.patch({ asSec: null }) } : hd0;
  const as0 = show.as ? assignVM(ctx) : undefined;
  const x = assignExtraVM(ctx, as0);
  const as = as0 ? { ...as0, adRows: x.adRows, ae: x.aeSave ? { ...as0.ae, ...x.aeSave } : as0.ae } : undefined;
  const cal = show.cal ? calendarVM(ctx) : undefined;
  // Team | Mine (rev 1011: the Director, and leaders with a downline), never in a chat: on Inbox in the title row left of
  // Contacts, as the salesperson's Inbox has it left of All ads (user 2026-10-11); on the other pages in the top bar.
  const tm = !!ctx.toMyCrm && !lead, dirTop = tm && !show.ib, ibTM = tm && show.ib;
  return {
    show, hd, bl, cf,
    topBar: !!(bl.showBell || hd.showHead || dirTop), dirTop, ibTM, dirMine: () => ctx.toMyCrm?.(),
    // The Insight line: "All access" for whoever sees everybody, else their team (a leader on the Team side).
    accessLbl: ctx.data.can.viewAll ? "All access" : teamName(teamOf(ctx.me.id, ctx.data.people)) || "My team",
    // Member work type, Showrooms, Cold lead templates, Ads Performance: CRM · Manage only.
    pfAdmin: ctx.data.can.manage,
    chromeBg: "#FFFFFF",
    cl: calendarListVM(ctx, cal), ci: calendarInfoVM(ctx),
    ov: show.ov ? overviewVM(ctx) : off<ReturnType<typeof overviewVM>>(),
    ib: show.ib ? inboxVM(ctx) : off<ReturnType<typeof inboxVM>>(),
    ld,
    ad: show.ad ? adsVM(ctx) : off<ReturnType<typeof adsVM>>(),
    as: as ?? off<NonNullable<typeof as>>(),
    asx: x.asx, ftx: x.ftx, bp: x.bp, hl: x.hl,
    fts: memberWorkTypeVM(ctx), tp: templatesVM(ctx),
    cal: cal ?? off<ReturnType<typeof calendarVM>>(),
    pf: show.pf ? profileVM(ctx) : off<ReturnType<typeof profileVM>>(),
    rm: roomsVM(ctx), ol: overlaysVM(ctx), nv: navVM(ctx),
    // In the prototype the chat keeps a toast of its own (ld.toast); here both read ui.toast, so with a chat open only the
    // chat's shows — not the same words twice (user 2026-10-11).
    toast: show.ld && ld?.onLead ? "" : ui.toast, toastBottom: lead ? "92px" : "78px",
  };
}
export type PanelAppVM = ReturnType<typeof panelAppVM>;
