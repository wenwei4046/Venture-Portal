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
import { teamMineSwap } from "../../shared/team-mine";
import { customerForm } from "../../sales/vm/customer";
import { DAY, day0 } from "../../sales/vm/common";
import type { KeyboardEvent } from "react";
import type { PanelCtx } from "./common";

/** The ad editor's numbers (rev 1011 §8): Enter moves to the next visible number box and selects it; on the last one the
 * keyboard closes. Never a submit. The prototype's own handler, over the page (the app has no screen-label root). */
export function enterNext(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const list = [...document.querySelectorAll<HTMLInputElement>("input[data-num-step]")].filter(x => x.offsetParent !== null);
  const nx = list[list.indexOf(e.currentTarget) + 1];
  if (nx) { nx.focus(); nx.select(); } else e.currentTarget.blur();
}

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
  const as = as0 ? { ...as0, adRows: x.adRows, ae: { ...as0.ae, ...x.aeApply, ...(x.aeSave ?? {}) } } : undefined;
  const cal = show.cal ? calendarVM(ctx) : undefined;
  // The top bar shows only for a back link ("‹ Profile" on Ads Performance, "‹ Assignment" in a section). The bell — the
  // prototype's bellIn / bellTop — with the house and Team | Mine left of it, sits on Insight alone, the first page of the
  // bottom bar, as the Revenue app keeps its header to Today (2026-10-14, the owner: "principal view … 只存在于 Insight 界面";
  // it was in every page's title row, and the top bar beside a back link). Team | Mine (rev 1011: the Director, and leaders
  // with a downline) goes to Mine's first page, the Inbox (shared/team-mine.ts); it had a top row of its own on every page
  // (round 2, §8). Never in a chat.
  const toMine = ctx.toMyCrm;
  return {
    show, hd, bl, cf,
    topBar: !!hd.showHead,
    tm: teamMineSwap("team", lead || !toMine ? undefined : () => toMine("inbox")),
    // On the Inbox since 2026-10-16 (the owner: "換到 Inbox 那頁"), beside Contacts; Insight's title row keeps only the avatar.
    bellIn: !!bl.showBell && show.ib, bellTop: false,
    // The house left of the bell (switch-back.cjs, 2026-10-14); Profile's card is gone.
    exitCrm: () => ctx.exitApp(), enterNext,
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
    // A chat open has no bottom bar, as Mine's (the owner, 2026-10-14).
    navOn: !lead,
  };
}
export type PanelAppVM = ReturnType<typeof panelAppVM>;
