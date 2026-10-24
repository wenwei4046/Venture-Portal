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
import { notifsVM } from "./notifs";
import { assignExtraVM } from "./assign-1011";
import { memberWorkTypeVM, templatesVM } from "./profile-1011";
import { jobTitle, teamName, teamOf } from "../../shared/people";
import { teamMineSwap } from "../../shared/team-mine";
import { customerForm } from "../../sales/vm/customer";
import { DAY, day0 } from "../../sales/vm/common";
import type { KeyboardEvent } from "react";
import { first, ini, periodRange, type PanelCtx } from "./common";

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

/** v3 T06 · the Team side's Profile: the avatar centred, View as, MANAGE (CRM · Manage) and ME. */
function profile6(ctx: PanelCtx, house: boolean) {
  const { me, patch, data } = ctx, boss = me.role === "boss";
  const n = (k: number) => (k ? String(k) : "");
  const notifs = notifsVM(ctx).notifUnread;
  return {
    ini: ini(me.name), name: boss ? "Principal" : me.name,
    sub: `${boss ? "Principal" : jobTitle(me)} · ${data.can.viewAll ? "everyone" : teamName(teamOf(me.id, data.people)) || "my team"}`,
    house, exit: () => ctx.exitApp(), viewAs: () => patch({ viewAs: true }),
    // ME first, then MANAGE; no Auto-reply on the Team side (the owner, 2026-10-23: "principal 在team的時候不會有auto reply
    // 就不用；然後me 和manage 調換，me在上面"). Member work type lives on Assignment alone ("Member work type 只需要在assignment").
    groups: [{ title: "Me", rows: [
      { label: "Notifications", icon: "bell" as const, open: () => patch({ nfOpen: true }), n: notifs ? String(notifs) : "", badge: true },
    ] }, { title: "Manage", rows: data.can.manage ? [
      { label: "Showrooms", icon: "map-pin" as const, open: () => patch({ roomsOpen: true }), n: n(data.rooms.filter(r => r.active).length), badge: false },
      { label: "Cold lead templates", icon: "message-square-text" as const, open: () => { patch({ tplOpen: true }); void ctx.act.refreshTemplates(); }, n: n((data.templates ?? []).length), badge: false },
      { label: "Ads Performance", icon: "arrow-up-right" as const, open: () => patch({ tab: "ads", lead: null }), n: "", badge: false },
    ] : [] }],
  };
}

/** v3 T01 · Insight's head, on both of its sides. */
function insightHead(ctx: PanelCtx, house: boolean, ads: boolean) {
  const { me, patch } = ctx, boss = me.role === "boss";
  return {
    greet: `Hello, ${boss ? "Principal" : first(me.name)}`, // the owner, 2026-10-18: "改成 hello"
    sub: `${boss ? "Principal" : jobTitle(me)} · ${ctx.data.can.viewAll ? "All access" : teamName(teamOf(me.id, ctx.data.people)) || "My team"}`,
    ini: ini(me.name), house, exit: () => ctx.exitApp(),
    sw: ctx.data.can.manage ? { ads, team: () => patch({ ovAds: false }), adsPick: () => patch({ ovAds: true }) } : null,
  };
}

export function panelAppVM(ctx: PanelCtx) {
  const { ui, set, now } = ctx, tab = ui.tab, lead = !!ui.lead;
  // v3 T01: Insight's Ads performance side is the Ads Performance page under Insight's head (CRM · Manage, as that page).
  const ovAds = tab === "overview" && !lead && ui.ovAds && ctx.data.can.manage;
  const show = { ov: tab === "overview" && !lead && !ovAds, ib: tab === "inbox" && !lead, ld: lead, ad: tab === "ads" || ovAds, as: tab === "assign" && !lead, cal: tab === "calendar" && !lead, pf: tab === "profile" };
  const ld = show.ld ? leadVM(ctx) : off<ReturnType<typeof leadVM>>();
  const cf = customerForm({
    form: ui.pForm, data: ctx.data, saveDetails: ctx.act.saveDetails,
    setForm: f => set(u => ({ ...u, pForm: typeof f === "function" ? (u.pForm ? f(u.pForm) : null) : f })),
    onSaved: (c, edit) => set(u => ({ ...u, pForm: null, pBook: edit ? u.pBook : { customerId: c.id, room: 0, day: day0(now) + DAY, slot: null, view: "month" } })),
  });
  const hd0 = headVM(ctx), bl = bellVM(ctx);
  // Assignment: a section open → the top back link reads "‹ Assignment" and returns to the overview (rev 1011 §6.1).
  // 4a (T03): Assignment's sections are tabs under its title, so no "‹ Assignment" bar.
  const hd = hd0;
  const as0 = show.as ? assignVM(ctx) : undefined;
  const x = assignExtraVM(ctx, as0);
  const as = as0 ? { ...as0, adRows: x.adRows, ae: { ...as0.ae, ...x.aeApply, ...(x.aeSave ?? {}) } } : undefined;
  const cal = show.cal ? calendarVM(ctx) : undefined;
  const ov0 = show.ov ? overviewVM(ctx) : undefined;
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
    // The house on Insight too, the page Team opens on (2026-10-16, the owner) — left of the avatar.
    houseOv: !!bl.showBell && show.ov,
    // Insight's head (v3 T01): the avatar left, the greeting, the house right, then Team performance | Ads performance.
    th: insightHead(ctx, !!bl.showBell, ovAds),
    // v3 T06 · Profile as the prototype draws it (the owner, 2026-10-23: "我的profile 應該長這樣才對").
    pf6: show.pf ? profile6(ctx, !!bl.showBell) : null,
    // Ads performance on the phone, as the desktop's, simpler (shared/phone-ads-perf.tsx; the owner, 2026-10-24).
    adp: { customers: ctx.data.customers, visits: ctx.data.visits, adNames: ctx.data.adNames ?? {}, now, live: ctx.live, manage: ctx.data.can.manage,
      hide: ctx.data.can.manage ? (ad: string, on: boolean) => { void ctx.act.hideAd(ad, on).then(ok => { if (ok) ctx.act.toast(on ? "Ad hidden from Ads performance" : "Ad shown again"); }); } : undefined,
      // Insight's period and its sheet (the owner, 2026-10-24: "日曆顏色有點突兀，換成跟insight 一樣的 … 無法自定義要對比的時間段").
      range: periodRange(ui.period, ui.ovRange, now), cmp: ui.cmp,
      chips: (([["day", "Today"], ["week", "This week"], ["month", "This month"]] as const).map(([k, label]) => ({ label, on: ui.period === k, pick: () => set(u => ({ ...u, period: k, ovRange: null })) }))),
      custom: ui.period === "custom",
      openDates: () => set(u => ({ ...u, ovSheet: { a: periodRange(u.period, u.ovRange, now).a, b: periodRange(u.period, u.ovRange, now).b, per: u.period === "custom" ? null : (u.period as "day" | "week" | "month"), ca: u.cmp?.a ?? null, cb: u.cmp?.b ?? null, tab: "a", only: false, cm: [new Date(periodRange(u.period, u.ovRange, now).a).getFullYear(), new Date(periodRange(u.period, u.ovRange, now).a).getMonth()], step: 0 } })),
      openCompare: () => set(u => { const r = periodRange(u.period, u.ovRange, now), c = u.cmp; return { ...u, ovSheet: { a: r.a, b: r.b, per: u.period === "custom" ? null : (u.period as "day" | "week" | "month"), ca: c?.a ?? null, cb: c?.b ?? null, tab: "b", only: true, cm: c ? [new Date(c.a).getFullYear(), new Date(c.a).getMonth()] : [new Date(r.a).getMonth() ? new Date(r.a).getFullYear() : new Date(r.a).getFullYear() - 1, (new Date(r.a).getMonth() + 11) % 12], step: 0 } }; }),
      clearCompare: () => set(u => ({ ...u, cmp: null })) },
    // The house left of the bell (switch-back.cjs, 2026-10-14); Profile's card is gone.
    exitCrm: () => ctx.exitApp(), enterNext,
    // The Insight line: "All access" for whoever sees everybody, else their team (a leader on the Team side).
    accessLbl: ctx.data.can.viewAll ? "All access" : teamName(teamOf(ctx.me.id, ctx.data.people)) || "My team",
    // Member work type, Showrooms, Cold lead templates, Ads Performance: CRM · Manage only.
    pfAdmin: ctx.data.can.manage,
    chromeBg: "var(--crm-page)",
    cl: calendarListVM(ctx, cal ?? (ov0 && ui.cLs === "leads" ? { cLeadIds: ui.cLsWho ? ov0.leadIds.filter(id => { const w = ctx.data.customers.find(c => c.id === id)?.assignedTo; return !!w && ui.cLsWho!.includes(w); }) : ov0.leadIds, cUpV: [], cCameV: [], cRangeBtn: ov0.heroLabel } : undefined)), ci: calendarInfoVM(ctx),
    ov: ov0 ?? off<ReturnType<typeof overviewVM>>(),
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
