/**
 * The desktop CRM's frame (CRM Desktop rev 1, dev changes A1–A6): the Revenue app's sidebar with the CRM's pages under
 * Profile (folding, and the 72 px rail), its top bar, the CRM's head, the right menu (Assignment, Showrooms, Settings),
 * the side pane (docked / overlay / wide) and the toast. Ported from the prototype's renderVals; the numbers are the
 * phone's (Organic Leads, Awaiting reply, notifications).
 */
import type { CSSProperties } from "react";
import { notifsVM } from "../../panel/vm/notifs";
import { urgencyOf } from "../../sales/vm/common";
import type { DeskCtx, DeskTab, PaneKind, PaneMode } from "./ctx";
import { first, initials } from "./data";
import { ICON, LI, MANAGE_TABS, NAV, PANE_MODE, PANEL_TABS, PHONE_IC, SECTION_PICK, SHEET_COPY, SOLID, TINTS } from "./tokens";
import { jobTitle } from "../../shared/people";

const SHEET_TABS: DeskTab[] = ["assignment", "settings", "showrooms"];
export const sheetOn = (tab: DeskTab) => SHEET_TABS.includes(tab);

/** Each right menu's rows: [title, sub, icon] (the prototype's LISTS), with the live counts. */
export function lists(ctx: DeskCtx): Record<string, [string, string, string][]> {
  const { data, now } = ctx;
  const organic = data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).length;
  const waits = data.customers.filter(c => urgencyOf(c, now).level !== "none");
  const overdue = waits.filter(c => urgencyOf(c, now).level === "overdue").length;
  const adIds = [...new Set(data.customers.map(c => c.adId).filter((x): x is string => !!x))];
  const unset = adIds.filter(a => !data.adRules.some(r => r.adId === a)).length;
  const held = data.customers.filter(c => c.held && !c.assignedTo).length;
  const ftTeams = ctx.teams.filter(t => data.ftRules.some(r => r.tlId === t.id && r.days.length)).length;
  return {
    // No Organic Leads (the owner, 2026-10-13: an enquiry from no ad goes straight to the Revenue Director).
    assignment: [
      ["Ads to teams", `${adIds.length} ads · ` + (held ? `${held} ${held === 1 ? "lead" : "leads"} over the limit` : unset ? `${unset} on the default (evenly)` : "all set"), "megaphone"],
      ["Awaiting reply", waits.length ? `${waits.length} need a reply${overdue ? ` · ${overdue} overdue` : ""}` : "Everyone is answered", "clock"],
      ["Full time lead allocation", ftTeams ? `On for ${ftTeams} of ${ctx.teams.length} teams` : "Not set for any team", "users"],
      ["Chat progress", "Every chat by time, person and status", "clock"],
    ],
    settings: [["Member work type", "", "briefcase"], ["Cold lead templates", "", "file"], ["Forms", "", "file"], ["Notifications", "", "bell"],
      // History (the owner, 2026-10-13: in Settings, not the sidebar) — not in the design; drawn as its siblings.
      ["History", "Who changed which setting, and when", "clock"]],
    showrooms: [["Showrooms", "", "store"]],
  };
}

/** Counts on the right menu's rows (the prototype's BADGE). */
function badges(ctx: DeskCtx): Record<string, number> {
  const { data, now } = ctx;
  return {
    "Organic Leads": data.customers.filter(c => !c.assignedTo && !c.teamId && !c.held).length,
    "Awaiting reply": data.customers.filter(c => urgencyOf(c, now).level !== "none").length,
    Notifications: Number(notifsVM(panelLike(ctx)).notifUnread) || 0,
  };
}

/** The phone panel's view models take a PanelCtx: the same data and writes, with the phone's own screen state. */
import { initialPanelUi } from "../../panel/ui";
import type { PanelCtx } from "../../panel/vm/common";
export function panelLike(ctx: DeskCtx): PanelCtx {
  return {
    data: ctx.data, me: ctx.me, now: ctx.now, live: ctx.live, ui: initialPanelUi(), set: () => {}, patch: () => {}, act: ctx.act,
    nameOf: ctx.nameOf, teams: ctx.teams, directors: ctx.directors,
    teamOfStaff: id => (id ? ctx.teams.find(t => t.id === id || t.people.some(p => p.id === id)) : undefined),
    openCrmOf: () => {}, exitApp: ctx.exit, slotCounts: {},
  };
}

export function frameVM(ctx: DeskCtx) {
  const { ui, set, patch, W, H, me, data } = ctx;
  const tab = ui.tab, pane = ui.pane, kind = ui.kind;
  const collapsed = ui.collapsed;
  const sbW = collapsed ? 72 : 240;
  const crmW = W - sbW;
  const role = me.role === "boss" ? "principal" : "director";
  const teamMine = role === "director";
  const dockW = W >= 1440 ? 440 : 400;
  const manage = data.can.manage;
  const tabList = PANEL_TABS.filter(([id]) => manage || !MANAGE_TABS.has(id));
  const go = (id: DeskTab) => set(u => ({ ...u, tab: id, pane: PANE_MODE[id], toast: "", pick: null, stage: id === "showrooms" ? "op" : "menu",
    chat: null, sendFor: null, awChat: null, ad: null, ftEdit: null, srEdit: null, srDraft: null, cpSel: null, frmOpen: false, cltEdit: null, menu: false }));
  const scopeOpts = ([["Team", false], ["Mine", true]] as const).map(([label, isMine]) => ({ label, on: !isMine, off: isMine,
    pick: () => { if (isMine) ctx.toMine?.(); } }));
  const periodOpts = ["Today", "This week", "This month", "Custom"].map((label, i) => ({ label, on: i === 2, off: i !== 2 }));

  const sheetMode = sheetOn(tab);
  const stage = ui.stage;
  const isWide = !sheetMode && pane === "wide";
  const isCenter = !sheetMode && pane === "wideEmpty";
  const isOverlay = pane === "overlay";
  const paneShown = !sheetMode && pane !== "closed" && pane !== "wideEmpty";
  const paneW = isWide ? crmW - 380 : dockW;
  const base: CSSProperties = { width: paneW, display: "flex", flexDirection: "column", background: "#FFFFFF", boxSizing: "border-box", overflow: "hidden" };
  const paneStyle: CSSProperties = isOverlay
    ? { ...base, position: "absolute", top: 0, right: 0, bottom: 0, borderLeft: "1px solid #EBDDD2", boxShadow: "-16px 0 40px rgba(40,25,18,.16)", zIndex: 4 }
    : { ...base, flex: `0 0 ${paneW}px`, minWidth: 0, borderLeft: isWide ? 0 : "1px solid #EBDDD2" };

  const L = lists(ctx), B = badges(ctx);
  const empties: Record<string, [string, string, string]> = {
    inbox: ["Pick a chat to read and reply", "It opens here; the list stays where it is", "M21 12a8 8 0 0 1-11.6 7.1L3 21l1.9-6.4A8 8 0 1 1 21 12Z"],
    assignment: ["Pick a section", "Its editors open here", "M6 3v6a6 6 0 0 0 6 6h6m0 0-3-3m3 3-3 3M6 21v-6"],
    settings: ["Pick a setting", "It opens here", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  };
  const em = empties[tab] ?? empties.inbox;
  const pickIdx = pane === "wide" ? (ui.pick ?? SECTION_PICK[tab] ?? 0) : -1;
  const listCards = (L[tab] ?? []).map(([title, sub, ic], i) => ({
    title, sub, d: LI[ic], bg: TINTS[i % 4][0], fg: TINTS[i % 4][1],
    rowBg: i === pickIdx ? "#FFF1E6" : "transparent", titleColor: i === pickIdx ? "#BD4A19" : "#3F2B22",
    pick: () => patch({ pane: "wide", kind: "section", pick: i }),
  }));

  const fold = ui.fold;
  const mkSec = <T,>(id: string, items: T[]) => ({ num: "", label: "", scope: false, items, open: !fold[id], rot: fold[id] ? -90 : 0,
    toggle: () => set(u => ({ ...u, fold: { ...u.fold, [id]: !u.fold[id] } })) });
  // History (the owner, 2026-10-13): the last of the CRM's items — who changed which setting, when. Not in the design; drawn as its items.
  const crmItems = tabList.map(([id, label]) => ({ label, d: ICON[id], count: null as number | null, on: id === tab, off: id !== tab, pick: () => go(id) }));
  const appGo: Record<string, () => void> = {
    Today: () => ctx.app.go("today"), Insight: () => ctx.app.go("insight"), Quote: () => ctx.app.go("quote"), Arena: () => ctx.app.go("arena"),
  };
  const appTop = NAV.filter(n => n[0] !== "Notifications" && n[0] !== "Profile").map(([label, d]) => ({ label, d, count: null as number | null, on: false, off: true, pick: appGo[label] }));
  const appBottom = NAV.filter(n => n[0] === "Notifications").map(([label, d]) => ({ label, d, count: ctx.app.notifCount || null, on: false, off: true, pick: ctx.app.openNotifications }));
  const profIcon = { label: "Profile", d: NAV[4][1], count: null as number | null, on: false, off: true, pick: () => patch({ collapsed: false }) };
  const sections = [mkSec("app", appTop), mkSec("crm", [profIcon, ...crmItems]), mkSec("acct", appBottom)];
  const curTab = tabList.find(t => t[0] === tab) ?? PANEL_TABS[0];
  const opIdx = ui.pick ?? SECTION_PICK[tab] ?? 0;
  const opItem = (L[tab] ?? [])[opIdx] ?? ["", "", ""];
  const sc = SHEET_COPY[tab] ?? ["", "", ""];
  const sheetRows = (L[tab] ?? []).map(([title, sub, ic], i) => ({ title, sub, d: PHONE_IC[title] ?? LI[ic], badge: B[title] || null, bg: SOLID[i % 5], fg: "#FFFFFF",
    pick: () => patch({ pick: i, stage: "op", ...(title === "History" ? { history: null } : {}), sendFor: null, awChat: null, ad: null, ftEdit: null, cpSel: null, frmOpen: false, cltEdit: null }) }));

  const closePane = () => {
    if (sheetMode) {
      set(u => u.sendFor ? { ...u, sendFor: null } : u.awChat ? { ...u, awChat: null } : u.srEdit ? { ...u, srEdit: null, srDraft: null }
        : u.ftEdit ? { ...u, ftEdit: null } : u.ad != null ? { ...u, ad: null } : u.cpSel ? { ...u, cpSel: null } : { ...u, stage: "op" });
      return;
    }
    if (pane === "closed" || pane === "empty" || pane === "wideEmpty") return;
    set(u => ({ ...u, pane: PANE_MODE[tab] as PaneMode, kind: "chat" as PaneKind, chat: null, pick: null, fromTeam: false, fromList: false, fromInfo: false }));
  };
  const meCard = me.role === "boss"
    ? { ini: "PR", name: "Principal", first: "Principal", sub: "Principal · All access" }
    : { ini: initials(me.name), name: me.name, first: first(me.name), sub: `${jobTitle(me)} · ${ctx.app.subName.replace(/ view$/, "")}` };
  const undo = ui.undo;
  return {
    W, H, sbW, sbOpen: !collapsed, sbClosed: collapsed, sections, appTop, appBottom, crmItems,
    me: meCard, profileOpen: !fold.profile, profileRot: fold.profile ? -90 : 0, showScope: teamMine && !!ctx.toMine,
    toggleProfile: () => set(u => ({ ...u, fold: { ...u.fold, profile: !u.fold.profile } })), toggleSb: () => patch({ collapsed: !collapsed }),
    pageTitle: curTab[1], pageBadge: null as number | null, scopeOpts,
    showPeriod: tab === "insight" && W >= 1440 && !teamMine, showPeriodCompact: tab === "insight" && (W < 1440 || teamMine),
    periodNow: "This month", alertsLabel: W >= 1440, periodOpts, openAlerts: () => patch({ pane: "overlay", kind: "alerts" }),
    isWide, isCenter, notWide: !isWide && !isCenter && !sheetMode, listCards,
    showScrim: isOverlay, paneShown, paneStyle, paneEmpty: pane === "empty" || pane === "wideEmpty", paneFull: pane === "docked" || pane === "overlay" || pane === "wide",
    emptyText: em[0], emptyHint: em[1], emptyIcon: em[2],
    kChat: kind === "chat", kAlerts: kind === "alerts", kSection: kind === "section", kInfo: kind === "info", kClist: kind === "clist", kMetrics: kind === "metrics", kTeam: kind === "team", kAssign: kind === "assign",
    closePane,
    sheetMode, sheetOpen: sheetMode && stage === "menu", sheetW: W >= 1440 ? 520 : 440, sheetTitle: sc[0], sheetSub: sc[1], sheetRows,
    opKicker: sc[0].toUpperCase(), opTitle: opItem[0], opChip: sc[2], opSub: opItem[1], openSheet: () => patch({ stage: "menu" }),
    showKicker: tab !== "showrooms", // The section pill ("All assignment ⌄") is gone (the owner, 2026-10-13): the right menu already switches sections.
    showOpChip: false,
    isAdsOp: opItem[0] === "Ads to teams", notAdsOp: opItem[0] !== "Ads to teams" && opItem[0] !== "Full time lead allocation",
    isFtOp: opItem[0] === "Full time lead allocation", isMwtOp: opItem[0] === "Member work type", isHistOp: tab === "settings" && opItem[0] === "History", isSrOp: opItem[0] === "Showrooms", isCltOp: opItem[0] === "Cold lead templates",
    isCpOp: opItem[0] === "Chat progress", isFrmOp: opItem[0] === "Forms", isNtfOp: tab === "settings" && opItem[0] === "Notifications",
    plainOp: !["Ads to teams", "Full time lead allocation", "Member work type", "Cold lead templates", "Showrooms", "Forms"].includes(opItem[0]) && !(tab === "settings" && opItem[0] === "Notifications"),
    opItem: opItem[0],
    showToast: !!ui.toast, toastText: ui.toast, canUndo: !!undo && undo.until > ctx.now.getTime(),
    // The Revenue app's own top bar (desk-patches.cjs).
    frameRadius: "0", frameShadow: "none", greetWord: ctx.app.greeting, subLabel: ctx.app.subName ? `${ctx.app.subName} view` : "", subCur: "pointer", dateLine: ctx.app.dateLine,
    appBellDot: ctx.app.bellUnread, openSubDept: ctx.app.openSubDept, openAppBell: ctx.app.openBell, signOut: ctx.app.signOut,
    role,
  };
}
export type FrameVM = ReturnType<typeof frameVM>;
